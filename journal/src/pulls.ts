import type { Database } from "bun:sqlite";
import {
	cleanTexts,
	dropComments,
	type HostText,
	storeComments,
	type TextDone,
	withheldCount,
} from "./cache-text";
import { EXIT, Fail, inTransaction, isConstraint, now, withDb } from "./db";
import { inputRejected, isRecord, loginList, text, timeOf } from "./form";
import { linkOrNull } from "./link";
import { asciiLower, extractMarkers, stripCr } from "./markers";

export type Vote = "none" | "waiting" | "up" | "down";
export type Work = "todo" | "ready" | "returned";
export type PullRow = {
	number: number;
	issues: string;
	spec: Vote;
	work: Work;
	spec_id: string;
};

type Obj = Record<string, unknown>;
type Comment = {
	id: string;
	url: string | null;
	author: string;
	createdAt: string;
	body: string;
	approvedBy: string[];
	rejectedBy: string[];
};
type Pull = {
	number: number;
	url: string | null;
	body: string;
	closes: number[];
	comments: Comment[];
	changesRequested: { login: string; at: string }[];
};

const FINGERPRINT =
	/^<!-- pipeline-work-fingerprint: [a-z0-9-]+ sources=(#[0-9]+(?:,#[0-9]+)*) -->$/;
const SPEC = { role: "spec-writer", stage: "spec" };
const READY = { role: "executor", stage: "ready" };
// the last line of a body the clerk writes; with a fingerprint line, the trace of a role
export const CLERK_TRACE = "<!-- pull request of the Lawman clerk -->";
const NO_SPEC_ID = "-";

const reject = (why: string) =>
	inputRejected("pulls", `sync input rejected, cache untouched: ${why}`);
const ascending = (a: number, b: number) => a - b;
const logins = (v: unknown, what: string) => loginList(v, what, reject);

function list(v: unknown, what: string): unknown[] {
	if (!Array.isArray(v)) throw reject(`${what} is not a list`);
	return v;
}

const timeField = (v: unknown, what: string) => timeOf(v, what, reject);

function readComment(raw: unknown): Comment {
	if (!isRecord(raw)) throw reject("a comment is not an object");
	if (text(raw.id) === "") throw reject("a comment has no id");
	return {
		id: text(raw.id),
		url: linkOrNull(raw.url),
		author: text(raw.author),
		createdAt: timeField(raw.createdAt, "a comment createdAt"),
		body: text(raw.body),
		approvedBy: logins(raw.approvedBy, "a comment approvedBy"),
		rejectedBy: logins(raw.rejectedBy, "a comment rejectedBy"),
	};
}

function readReview(raw: unknown): Pull["changesRequested"][number] {
	if (!isRecord(raw) || typeof raw.login !== "string")
		throw reject("a changesRequested login is not text");
	return {
		login: asciiLower(raw.login),
		at: timeField(raw.at, "a changesRequested at"),
	};
}

function readPull(raw: Obj): Pull {
	return {
		number: raw.number as number,
		url: linkOrNull(raw.url),
		body: text(raw.body),
		closes: list(raw.closes, "closes").map((n) => {
			if (!Number.isInteger(n)) throw reject("closes holds a non-integer");
			return n as number;
		}),
		comments: list(raw.comments, "comments").map(readComment),
		changesRequested: list(raw.changesRequested, "changesRequested").map(
			readReview,
		),
	};
}

function readForm(input: string): { writers: Set<string>; pulls: unknown[] } {
	let data: unknown;
	try {
		data = JSON.parse(input);
	} catch {
		throw reject("stdin is not valid JSON");
	}
	if (!isRecord(data)) throw reject("stdin is not a JSON object");
	return {
		writers: new Set(logins(data.writers, "writers")),
		pulls: list(data.pulls, "pulls"),
	};
}

function sourceNumbers(pull: Pull): string {
	const named = pull.body
		.split("\n")
		.flatMap((line) => stripCr(line).match(FINGERPRINT)?.[1]?.split(",") ?? [])
		.map((source) => Number(source.slice(1)));
	return [...new Set([...pull.closes, ...named])].sort(ascending).join(",");
}

type Counted = { ord: string; comment: Comment };

// the comment that carries the newest counted marker of a role and stage
function newestMarker(
	pull: Pull,
	login: string,
	want: { role: string; stage: string },
): Counted | null {
	let newest: Counted | null = null;
	pull.comments.forEach((comment, rank) => {
		const found = extractMarkers(
			{
				text: comment.body,
				createdAt: comment.createdAt,
				rank,
				author: comment.author,
			},
			login,
		);
		for (const { ord, marker } of found)
			if (
				marker.role === want.role &&
				marker.stage === want.stage &&
				(newest === null || ord > newest.ord)
			)
				newest = { ord, comment };
	});
	return newest;
}

const anyOf = (named: string[], writers: Set<string>) =>
	named.some((login) => writers.has(login));

function specVote(spec: Counted | null, writers: Set<string>): Vote {
	if (spec === null) return "none";
	if (anyOf(spec.comment.rejectedBy, writers)) return "down";
	return anyOf(spec.comment.approvedBy, writers) ? "up" : "waiting";
}

function workOf(
	pull: Pull,
	login: string,
	writers: Set<string>,
	spec: Counted | null,
): Work {
	const done = newestMarker(pull, login, READY);
	if (done === null || spec === null || done.ord <= spec.ord) return "todo";
	const sentBack = pull.changesRequested.some(
		(review) => writers.has(review.login) && review.at > done.comment.createdAt,
	);
	return sentBack || anyOf(done.comment.rejectedBy, writers)
		? "returned"
		: "ready";
}

export type ReadPull = {
	row: PullRow;
	traced: boolean;
	text: HostText;
	url: string | null;
};
type StoredPull = Omit<ReadPull, "text"> & { text: TextDone };

const pullText = (pull: Pull): HostText => ({
	body: pull.body,
	comments: pull.comments.map((c) => ({
		id: c.id,
		author: c.author === "" ? null : c.author,
		url: c.url,
		at: c.createdAt,
		body: c.body,
	})),
});

export function readPulls(input: string, login: string): ReadPull[] {
	const { writers, pulls } = readForm(input);
	const read: ReadPull[] = [];
	for (const raw of pulls) {
		if (!isRecord(raw) || !Number.isInteger(raw.number))
			throw reject("every pull request needs an integer number");
		if (asciiLower(text(raw.author)) !== asciiLower(login)) continue;
		const pull = readPull(raw);
		const spec = newestMarker(pull, login, SPEC);
		read.push({
			row: {
				number: pull.number,
				issues: sourceNumbers(pull),
				spec: specVote(spec, writers),
				work: workOf(pull, login, writers, spec),
				spec_id: spec?.comment.id ?? NO_SPEC_ID,
			},
			traced: pull.body
				.split("\n")
				.map(stripCr)
				.some((line) => line === CLERK_TRACE || FINGERPRINT.test(line)),
			text: pullText(pull),
			url: pull.url,
		});
	}
	return read;
}

function replacePulls(db: Database, name: string, read: StoredPull[]): void {
	db.run("DELETE FROM pulls WHERE precinct = ?", [name]);
	dropComments(db, name, "pull");
	for (const { row, traced, text, url } of read) {
		db.run(
			"INSERT INTO pulls (precinct, number, issues, spec, work, spec_id, traced, body, url, raw_sha, withheld) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[
				name,
				row.number,
				row.issues,
				row.spec,
				row.work,
				row.spec_id,
				Number(traced),
				text.body.text,
				url,
				text.body.sha,
				Number(text.body.withheld),
			],
		);
		storeComments(db, name, "pull", row.number, text.comments, reject);
	}
}

// Each text is cleaned before the transaction, alone, and only when it changed. A text that fails is stored withheld.
export async function syncPulls(
	name: string,
	login: string,
	input: string,
): Promise<string> {
	withDb((db) => {
		if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(name))
			throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
	});
	const parsed = readPulls(input, login);
	const cleaned = await cleanTexts(
		name,
		parsed.map((p) => ({ item: p, text: p.text })),
	);
	const read = cleaned.map(({ item, done }) => ({ ...item, text: done }));
	return withDb((db) => {
		try {
			inTransaction(db, () => {
				replacePulls(db, name, read);
				db.run("UPDATE precincts SET pulls_synced_at = ? WHERE name = ?", [
					now(),
					name,
				]);
			});
		} catch (e) {
			if (!isConstraint(e)) throw e;
			throw reject("a pull request number repeats");
		}
		const held = withheldCount(cleaned);
		return `pulls=${read.length}${held > 0 ? ` withheld=${held}` : ""}`;
	});
}

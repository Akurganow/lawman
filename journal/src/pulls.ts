import type { Database } from "bun:sqlite";
import {
	EXIT,
	Fail,
	inTransaction,
	isConstraint,
	normalizeTime,
	out,
	withDb,
} from "./db";
import { inputRejected, loginList } from "./form";
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
	author: string;
	createdAt: string;
	body: string;
	approvedBy: string[];
	rejectedBy: string[];
};
type Pull = {
	number: number;
	body: string;
	closes: number[];
	comments: Comment[];
	changesRequested: { login: string; at: string }[];
};

const FINGERPRINT =
	/^<!-- pipeline-work-fingerprint: [a-z0-9-]+ sources=(#[0-9]+(?:,#[0-9]+)*) -->$/;
const SPEC = { role: "spec-writer", stage: "spec" };
const READY = { role: "executor", stage: "ready" };
const NO_SPEC_ID = "-";

const reject = (why: string) =>
	inputRejected("pulls", `sync input rejected, cache untouched: ${why}`);
const isRecord = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const ascending = (a: number, b: number) => a - b;
const logins = (v: unknown, what: string) => loginList(v, what, reject);

function list(v: unknown, what: string): unknown[] {
	if (!Array.isArray(v)) throw reject(`${what} is not a list`);
	return v;
}

function timeOf(v: unknown, what: string): string {
	const time = normalizeTime(text(v));
	if (time === null) throw reject(`${what} is not a time`);
	return time;
}

function readComment(raw: unknown): Comment {
	if (!isRecord(raw)) throw reject("a comment is not an object");
	if (text(raw.id) === "") throw reject("a comment has no id");
	return {
		id: text(raw.id),
		author: text(raw.author),
		createdAt: timeOf(raw.createdAt, "a comment createdAt"),
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
		at: timeOf(raw.at, "a changesRequested at"),
	};
}

function readPull(raw: Obj): Pull {
	return {
		number: raw.number as number,
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

export function readPulls(input: string, login: string): PullRow[] {
	const { writers, pulls } = readForm(input);
	const rows: PullRow[] = [];
	for (const raw of pulls) {
		if (!isRecord(raw) || !Number.isInteger(raw.number))
			throw reject("every pull request needs an integer number");
		if (asciiLower(text(raw.author)) !== asciiLower(login)) continue;
		const pull = readPull(raw);
		const spec = newestMarker(pull, login, SPEC);
		rows.push({
			number: pull.number,
			issues: sourceNumbers(pull),
			spec: specVote(spec, writers),
			work: workOf(pull, login, writers, spec),
			spec_id: spec?.comment.id ?? NO_SPEC_ID,
		});
	}
	return rows;
}

function replacePulls(db: Database, name: string, rows: PullRow[]): void {
	db.run("DELETE FROM pulls WHERE precinct = ?", [name]);
	for (const row of rows)
		db.run(
			"INSERT INTO pulls (precinct, number, issues, spec, work, spec_id) VALUES (?, ?, ?, ?, ?, ?)",
			[name, row.number, row.issues, row.spec, row.work, row.spec_id],
		);
}

export function syncPulls(name: string, login: string, input: string): void {
	withDb((db) => {
		if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(name))
			throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
		const rows = readPulls(input, login);
		try {
			inTransaction(db, () => replacePulls(db, name, rows));
		} catch (e) {
			if (!isConstraint(e)) throw e;
			throw reject("a pull request number repeats");
		}
		out(`pulls=${rows.length}`);
	});
}

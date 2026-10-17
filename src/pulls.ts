import type { Database } from "bun:sqlite";
import { EXIT, Fail, inTransaction, isConstraint, out, withDb } from "./db";
import { DECIDING } from "./decider";
import { asciiLower, extractMarkers, stripCr } from "./markers";

export type Vote = "none" | "waiting" | "up" | "down";
export type PullRow = { number: number; issues: string; spec: Vote };

type Obj = Record<string, unknown>;

const FINGERPRINT =
	/^<!-- pipeline-work-fingerprint: [a-z0-9-]+ sources=(#[0-9]+(?:,#[0-9]+)*) -->$/;
const SPEC_ROLE = "spec-writer";
const SPEC_STAGE = "spec";

const reject = (why: string) =>
	new Fail(EXIT.SYNC_INPUT, `sync input rejected, cache untouched: ${why}`);
const isRecord = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const dig = (v: unknown, path: string[]): unknown =>
	path.reduce<unknown>((at, key) => (isRecord(at) ? at[key] : undefined), v);
const records = (v: unknown): Obj[] =>
	Array.isArray(v) ? v.filter(isRecord) : [];
const loginOf = (v: unknown) => asciiLower(text(dig(v, ["login"])));
const ascending = (a: number, b: number) => a - b;

const REPOSITORY = ["data", "repository"];
const PULL_NODES = [...REPOSITORY, "pullRequests", "nodes"];
const PULL_NEXT = [...REPOSITORY, "pullRequests", "pageInfo", "hasNextPage"];
const COLLAB_NEXT = [...REPOSITORY, "collaborators", "pageInfo", "hasNextPage"];
const COLLAB_EDGES = [...REPOSITORY, "collaborators", "edges"];

function readPages(input: string): unknown[] {
	let data: unknown;
	try {
		data = JSON.parse(input);
	} catch {
		throw reject("stdin is not valid JSON");
	}
	if (!Array.isArray(data)) throw reject("stdin is not a JSON array");
	if (data.length === 0) throw reject("stdin holds no page");
	for (const page of data) {
		if (isRecord(page) && "errors" in page)
			throw reject("a page carries errors");
		if (!Array.isArray(dig(page, PULL_NODES)))
			throw reject("a page has no data.repository.pullRequests.nodes list");
		if (dig(page, COLLAB_NEXT) !== false)
			throw reject("collaborators.pageInfo.hasNextPage is not false");
	}
	if (dig(data.at(-1), PULL_NEXT) !== false)
		throw reject(
			"pullRequests.pageInfo.hasNextPage of the last page is not false",
		);
	return data;
}

function deciders(pages: unknown[]): Set<string> {
	const logins = new Set<string>();
	for (const page of pages)
		for (const edge of records(dig(page, COLLAB_EDGES)))
			if (DECIDING.has(text(edge.permission))) logins.add(loginOf(edge.node));
	return logins;
}

function sourceNumbers(pull: Obj, repo: string): string {
	const linked = records(dig(pull, ["closingIssuesReferences", "nodes"]))
		.filter(
			(ref) =>
				asciiLower(text(dig(ref, ["repository", "nameWithOwner"]))) === repo,
		)
		.map((ref) => ref.number);
	const named = text(pull.body)
		.split("\n")
		.flatMap((line) => stripCr(line).match(FINGERPRINT)?.[1]?.split(",") ?? [])
		.map((source) => Number(source.slice(1)));
	const all = [...linked, ...named].filter(Number.isInteger) as number[];
	return [...new Set(all)].sort(ascending).join(",");
}

// the comment that carries the newest counted spec marker
function specComment(pull: Obj, login: string): Obj | null {
	let newest: { ord: string; comment: Obj } | null = null;
	records(dig(pull, ["comments", "nodes"])).forEach((comment, rank) => {
		const found = extractMarkers(
			{
				text: text(comment.body),
				createdAt: text(comment.createdAt),
				rank,
				author: text(dig(comment, ["author", "login"])),
			},
			login,
		);
		for (const { ord, marker } of found)
			if (
				marker.role === SPEC_ROLE &&
				marker.stage === SPEC_STAGE &&
				(newest === null || ord > newest.ord)
			)
				newest = { ord, comment };
	});
	return (newest as { comment: Obj } | null)?.comment ?? null;
}

function specVote(pull: Obj, login: string, allowed: Set<string>): Vote {
	const comment = specComment(pull, login);
	if (comment === null) return "none";
	const decided = (reaction: string) =>
		records(dig(comment, [reaction, "nodes"])).some((r) =>
			allowed.has(loginOf(r.user)),
		);
	if (decided("down")) return "down";
	return decided("up") ? "up" : "waiting";
}

export function readPulls(
	input: string,
	login: string,
	repo: string,
): PullRow[] {
	const pages = readPages(input);
	const allowed = deciders(pages);
	const rows: PullRow[] = [];
	for (const pull of pages.flatMap((p) => records(dig(p, PULL_NODES)))) {
		if (!Number.isInteger(pull.number))
			throw reject("every pull request needs an integer number");
		if (loginOf(pull.author) !== asciiLower(login)) continue;
		rows.push({
			number: pull.number as number,
			issues: sourceNumbers(pull, asciiLower(repo)),
			spec: specVote(pull, login, allowed),
		});
	}
	return rows;
}

function replacePulls(db: Database, name: string, rows: PullRow[]): void {
	db.run("DELETE FROM pulls WHERE precinct = ?", [name]);
	for (const row of rows)
		db.run(
			"INSERT INTO pulls (precinct, number, issues, spec) VALUES (?, ?, ?, ?)",
			[name, row.number, row.issues, row.spec],
		);
}

export function syncPulls(name: string, login: string, input: string): void {
	withDb((db) => {
		const precinct = db
			.query("SELECT repo FROM precincts WHERE name = ?")
			.get(name) as { repo: string } | null;
		if (precinct === null)
			throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
		const rows = readPulls(input, login, precinct.repo);
		try {
			inTransaction(db, () => replacePulls(db, name, rows));
		} catch (e) {
			if (!isConstraint(e)) throw e;
			throw reject("a pull request number repeats");
		}
		out(`pulls=${rows.length}`);
	});
}

import type { Database } from "bun:sqlite";
import pkg from "../package.json";
import { fits } from "./args";
import { cleanCharacters, countSecretMarks } from "./clean";
import { cleanEach } from "./clean-run";
import { type Fail, isConstraint, withDb } from "./db";
import {
	type Block,
	cutToFit,
	type FencedBlock,
	fencedBlock,
} from "./input-parts";

export type TextKind = "issue" | "pull";
export type CommentText = {
	id: string;
	author: string | null;
	at: string;
	body: string;
	url?: string | null | undefined;
};
export type HostText = { body: string; comments: CommentText[] };

// A cleaned text with the hash of the raw text it came from, so the same raw text is cleaned once.
type Done = { text: string; sha: string; withheld: boolean };
type CommentDone = Omit<CommentText, "body"> & { done: Done };
export type TextDone = { body: Done; comments: CommentDone[] };

// a library error can quote the input, so each caller prints its own message
export class CleanFailed extends Error {}

// the hash covers the journal version, so a new cleaning cleans again what the old one cleaned
const shaOf = (raw: string) =>
	new Bun.CryptoHasher("sha256").update(`${pkg.version}\n${raw}`).digest("hex");

// what the cache of the precinct holds, by the hash of the raw text each cleaned text came from
function priorTexts(db: Database, precinct: string): Map<string, Done> {
	const prior = new Map<string, Done>();
	for (const table of ["issues", "pulls", "comments"])
		for (const r of db
			.query(
				`SELECT raw_sha AS sha, body AS text, withheld FROM ${table} WHERE precinct = ? AND raw_sha IS NOT NULL`,
			)
			.all(precinct) as { sha: string; text: string; withheld: number }[])
			prior.set(r.sha, {
				text: r.text,
				sha: r.sha,
				withheld: r.withheld === 1,
			});
	return prior;
}

// The texts of one sync, each cleaned alone and only when the cache holds no cleaning of the same raw text.
// A text that cannot be cleaned, or does not finish in time, comes back withheld.
export async function cleanTexts<I>(
	precinct: string,
	items: { item: I; text: HostText }[],
): Promise<{ item: I; done: TextDone }[]> {
	const prior = withDb((db) => priorTexts(db, precinct));
	const raws = items.flatMap(({ text }) => [
		text.body,
		...text.comments.map((c) => c.body),
	]);
	const cleaned = await cleanEach(raws.filter((r) => !prior.has(shaOf(r))));
	const doneOf = (raw: string): Done => {
		const sha = shaOf(raw);
		const c = cleaned.get(raw);
		return c === undefined
			? (prior.get(sha) as Done)
			: { text: c.text, sha, withheld: c.withheld };
	};
	return items.map(({ item, text }) => ({
		item,
		done: {
			body: doneOf(text.body),
			comments: text.comments.map(({ id, author, at, body, url }) => ({
				id,
				author,
				at,
				url,
				done: doneOf(body),
			})),
		},
	}));
}

export const withheldCount = (cleaned: { done: TextDone }[]) =>
	cleaned.reduce(
		(n, { done }) =>
			n +
			Number(done.body.withheld) +
			done.comments.filter((c) => c.done.withheld).length,
		0,
	);

export async function cleaning<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch {
		throw new CleanFailed();
	}
}

export function dropComments(db: Database, precinct: string, kind: TextKind) {
	db.run("DELETE FROM comments WHERE precinct = ? AND kind = ?", [
		precinct,
		kind,
	]);
}

export function storeComments(
	db: Database,
	precinct: string,
	kind: TextKind,
	number: number,
	comments: CommentDone[],
	reject: (why: string) => Fail,
): void {
	for (const c of comments) {
		try {
			db.run(
				"INSERT INTO comments (precinct, kind, number, id, author, at, body, raw_sha, withheld, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				[
					precinct,
					kind,
					number,
					c.id,
					c.author,
					c.at,
					c.done.text,
					c.done.sha,
					Number(c.done.withheld),
					c.url ?? null,
				],
			);
		} catch (e) {
			if (!isConstraint(e)) throw e;
			throw reject(`a comment id repeats on #${number}`);
		}
	}
}

const BODY: Record<TextKind, string> = {
	issue: "SELECT body FROM issues WHERE precinct = ? AND issue = ?",
	pull: "SELECT body FROM pulls WHERE precinct = ? AND number = ?",
};

// id and author come from the host, so they stay inside the fence as JSON strings
async function header(c: CommentText): Promise<string> {
	const author =
		c.author === null
			? "null"
			: JSON.stringify(await cleanCharacters(c.author));
	return `id=${JSON.stringify(await cleanCharacters(c.id))} author=${author}`;
}

// The text of a case: the body of an issue or pull request, or one comment by
// its time and its number among the comments of that time, counted from 1 in id order.
export type TextKey = {
	precinct: string;
	kind: TextKind;
	number: number;
	part: "body" | { at: string; j: number };
};

const textWords = (k: TextKey): string[] => [
	k.precinct,
	k.kind,
	String(k.number),
	...(k.part === "body" ? ["body"] : ["comment", k.part.at, String(k.part.j)]),
];

// the line of a cut text that names the whole text, in the words `text` takes
export const fullLine = (k: TextKey) => `full text ${textWords(k).join(" ")}`;

// the words of a `full` line after `full text`, null when they name no text
export function parseTextWords(words: string[]): TextKey | null {
	const [precinct = "", kind, number = "", what, at = "", j = ""] = words;
	if (!fits("precinct", precinct) || !fits("number", number)) return null;
	if (kind !== "issue" && kind !== "pull") return null;
	const key: Omit<TextKey, "part"> = {
		precinct,
		kind,
		number: Number(number),
	};
	if (what === "body" && words.length === 4) return { ...key, part: "body" };
	if (
		what === "comment" &&
		words.length === 6 &&
		/^\S+$/.test(at) &&
		fits("number", j)
	)
		return { ...key, part: { at, j: Number(j) } };
	return null;
}

type CommentRow = {
	id: string;
	author: string | null;
	at: string;
	body: string;
};

const COMMENTS =
	"SELECT id, author, at, body FROM comments WHERE precinct = ? AND kind = ? AND number = ?";

const bodyOf = (db: Database, k: Omit<TextKey, "part">) =>
	(
		db.query(BODY[k.kind]).get(k.precinct, k.number) as {
			body: string;
		} | null
	)?.body ?? null;

// A comment's block carries its `comment at=` line.
async function commentBlock(c: CommentRow): Promise<FencedBlock> {
	return fencedBlock(
		"comment",
		`${await header(c)}\n${c.body}`,
		`comment at=${c.at}`,
	);
}

// A text above `size` is cut to one block of that size.
const fit = (block: FencedBlock, k: TextKey, size: number) =>
	cutToFit(block, size, fullLine(k), countSecretMarks);

// A cached text was cleaned when the sync stored it, so it prints as stored.
// Null when the cache holds no such issue or pull request.
export async function printCached(
	db: Database,
	precinct: string,
	kind: TextKind,
	number: number,
	size = Number.POSITIVE_INFINITY,
): Promise<Block[] | null> {
	const key = { precinct, kind, number };
	const body = bodyOf(db, key);
	if (body === null) return null;
	const comments = db
		.query(`${COMMENTS} ORDER BY at, id`)
		.all(precinct, kind, number) as CommentRow[];
	return cleaning(async () => {
		const blocks = [
			fit(fencedBlock(kind, body), { ...key, part: "body" }, size),
		];
		let j = 0;
		let at: string | null = null;
		for (const c of comments) {
			j = c.at === at ? j + 1 : 1;
			at = c.at;
			blocks.push(
				fit(await commentBlock(c), { ...key, part: { at, j } }, size),
			);
		}
		return blocks;
	});
}

// One text of a case, cleaned alone. Null when the cache holds no such text.
export async function printText(
	db: Database,
	key: TextKey,
): Promise<FencedBlock | null> {
	const body = bodyOf(db, key);
	if (body === null) return null;
	if (key.part === "body") return fencedBlock(key.kind, body);
	const row = db
		.query(`${COMMENTS} AND at = ? ORDER BY id LIMIT 1 OFFSET ?`)
		.get(
			key.precinct,
			key.kind,
			key.number,
			key.part.at,
			key.part.j - 1,
		) as CommentRow | null;
	if (row === null) return null;
	return cleaning(() => commentBlock(row));
}

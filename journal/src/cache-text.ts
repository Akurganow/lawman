import type { Database } from "bun:sqlite";
import { fits } from "./args";
import { cleanCharacters, countSecretMarks } from "./clean";
import { cleanHostText } from "./clean-host";
import { type Fail, isConstraint } from "./db";
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
};
export type HostText = { body: string; comments: CommentText[] };

// a library error can quote the input, so each caller prints its own message
export class CleanFailed extends Error {}

// what a role reads in place of a text that could not be cleaned
export const WITHHELD = "This text could not be cleaned and is withheld.";

export type Part = "body" | "comment";
// a text held back: which of its parts failed, as the sync line names them
export type Cleaned = { text: HostText; failed: Part[] };

// A text that the cleaning cannot process is replaced whole, never kept raw or part cleaned.
async function cleanPart(text: string): Promise<string | null> {
	try {
		return await cleanHostText(text);
	} catch {
		return null;
	}
}

async function cleanText(text: HostText): Promise<Cleaned> {
	const failed = new Set<Part>();
	const one = async (body: string, part: Part) => {
		const cleaned = await cleanPart(body);
		if (cleaned !== null) return cleaned;
		failed.add(part);
		return WITHHELD;
	};
	const body = await one(text.body, "body");
	const comments: CommentText[] = [];
	for (const c of text.comments)
		comments.push({ ...c, body: await one(c.body, "comment") });
	return { text: { body, comments }, failed: [...failed] };
}

// the sync line's field for the texts held back, empty when none failed
export const uncleanedField = (
	kind: TextKind,
	held: { number: number; failed: Part[] }[],
) => {
	const names = held.flatMap((h) =>
		h.failed.map((part) => `${kind}:${h.number}:${part}`),
	);
	return names.length === 0 ? "" : ` uncleaned=${names.join(",")}`;
};

export async function cleaning<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch {
		throw new CleanFailed();
	}
}

// each text is cleaned alone, so one that fails stops nothing else
export const cleanTexts = (texts: HostText[]) =>
	Promise.all(texts.map(cleanText));

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
	comments: CommentText[],
	reject: (why: string) => Fail,
): void {
	for (const c of comments) {
		try {
			db.run(
				"INSERT INTO comments (precinct, kind, number, id, author, at, body) VALUES (?, ?, ?, ?, ?, ?, ?)",
				[precinct, kind, number, c.id, c.author, c.at, c.body],
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
		`${await header(c)}\n${await cleanHostText(c.body)}`,
		`comment at=${c.at}`,
	);
}

// A text above `size` is cut to one block of that size.
const fit = (block: FencedBlock, k: TextKey, size: number) =>
	cutToFit(block, size, fullLine(k), countSecretMarks);

// Every cached text is cleaned again, so a text an older cleaning stored prints clean.
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
			fit(
				fencedBlock(kind, await cleanHostText(body)),
				{ ...key, part: "body" },
				size,
			),
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
	if (key.part === "body")
		return cleaning(async () =>
			fencedBlock(key.kind, await cleanHostText(body)),
		);
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

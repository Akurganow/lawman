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

async function cleanText(text: HostText): Promise<HostText> {
	const [body = "", ...bodies] = await Promise.all(
		[text.body, ...text.comments.map((c) => c.body)].map(cleanHostText),
	);
	return {
		body,
		comments: text.comments.map((c, i) => ({ ...c, body: bodies[i] ?? "" })),
	};
}

export async function cleaning<T>(work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} catch {
		throw new CleanFailed();
	}
}

export const cleanTexts = (texts: HostText[]) =>
	cleaning(() => Promise.all(texts.map(cleanText)));

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

// Every cached text is cleaned again, so a text an older cleaning stored prints clean.
// A comment's block carries its `comment at=` line. Null when the cache holds no
// such issue or pull request. A text above `size` is cut to one block of that size.
export async function printCached(
	db: Database,
	precinct: string,
	kind: TextKind,
	number: number,
	size = Number.POSITIVE_INFINITY,
): Promise<Block[] | null> {
	const row = db.query(BODY[kind]).get(precinct, number) as {
		body: string;
	} | null;
	if (row === null) return null;
	const comments = db
		.query(
			"SELECT id, author, at, body FROM comments WHERE precinct = ? AND kind = ? AND number = ? ORDER BY at, id",
		)
		.all(precinct, kind, number) as CommentText[];
	const key = { precinct, kind, number };
	const fit = (block: FencedBlock, k: TextKey) =>
		cutToFit(block, size, fullLine(k), countSecretMarks);
	return cleaning(async () => {
		const blocks = [
			fit(fencedBlock(kind, await cleanHostText(row.body)), {
				...key,
				part: "body",
			}),
		];
		let j = 0;
		let at: string | null = null;
		for (const c of comments) {
			j = c.at === at ? j + 1 : 1;
			at = c.at;
			blocks.push(
				fit(
					fencedBlock(
						"comment",
						`${await header(c)}\n${await cleanHostText(c.body)}`,
						`comment at=${c.at}`,
					),
					{ ...key, part: { at: c.at, j } },
				),
			);
		}
		return blocks;
	});
}

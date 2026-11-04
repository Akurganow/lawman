import type { Database } from "bun:sqlite";
import { cleanCharacters } from "./clean";
import { cleanHostText } from "./clean-host";
import { type Fail, isConstraint } from "./db";
import { fenced } from "./fence";

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

export async function cleanTexts(texts: HostText[]): Promise<HostText[]> {
	try {
		return await Promise.all(texts.map(cleanText));
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

// Every cached text is cleaned again, so a text an older cleaning stored prints clean.
// Null when the cache holds no such issue or pull request.
export async function printCached(
	db: Database,
	precinct: string,
	kind: TextKind,
	number: number,
): Promise<string | null> {
	const row = db.query(BODY[kind]).get(precinct, number) as {
		body: string;
	} | null;
	if (row === null) return null;
	const comments = db
		.query(
			"SELECT id, author, at, body FROM comments WHERE precinct = ? AND kind = ? AND number = ? ORDER BY at, id",
		)
		.all(precinct, kind, number) as CommentText[];
	try {
		const blocks = [fenced(kind, await cleanHostText(row.body))];
		for (const c of comments)
			blocks.push(
				`comment at=${c.at}`,
				fenced("comment", `${await header(c)}\n${await cleanHostText(c.body)}`),
			);
		return blocks.join("\n");
	} catch {
		throw new CleanFailed();
	}
}

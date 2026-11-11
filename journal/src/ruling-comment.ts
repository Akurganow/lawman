import type { Database } from "bun:sqlite";
import { fits } from "./args";
import { EXIT, Fail } from "./db";
import { readConfig } from "./input-files";
import { configValue } from "./law-sync";
import { extractMarkers, stripCr } from "./markers";

// the counted marker on the last non-empty line of the text, if any
function markerAtEnd(text: string, author: string | null, login: string) {
	const at = text
		.split("\n")
		.map(stripCr)
		.findLastIndex((l) => l.trim() !== "");
	return extractMarkers(
		{ text, createdAt: "", rank: 1, author: author ?? "" },
		login,
	).find((f) => f.line === at + 1)?.marker;
}

// The cached comment of a ruling: a comment of the trusted login whose last
// line is the ruling marker. The newest one wins.
export function rulingComment(
	db: Database,
	precinct: string,
	issue: number,
	raw: string,
	login: string,
): string | undefined {
	const comments = db
		.query(
			"SELECT author, body FROM comments WHERE precinct = ? AND kind = 'issue' AND number = ? ORDER BY at DESC, rowid DESC",
		)
		.all(precinct, issue) as { author: string | null; body: string }[];
	return comments.find((c) => markerAtEnd(c.body, c.author, login)?.raw === raw)
		?.body;
}

export function trustedLogin(): string {
	const login = configValue(readConfig() ?? "", "trusted_login");
	if (login === undefined || !fits("login", login))
		throw new Fail(EXIT.USAGE, "config.yaml has no valid trusted_login");
	return login;
}

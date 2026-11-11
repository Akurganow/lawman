import type { Database } from "bun:sqlite";

// The address that opens an issue or a pull request, as the host reports it. A value that
// is no plain address is no link: only http and https, no credentials, a safe character set
// and a length that a host's own address fits in.
const SAFE = /^[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+$/;
export const LINK_MAX = 500;

export function linkOrNull(v: unknown): string | null {
	if (typeof v !== "string" || v.length > LINK_MAX || !SAFE.test(v))
		return null;
	try {
		const u = new URL(v);
		const plain = u.protocol === "http:" || u.protocol === "https:";
		return plain && u.username === "" && u.password === "" && u.href === v
			? v
			: null;
	} catch {
		return null;
	}
}

export type Subject = "issue" | "pull";

// The one place that finds the address of a subject, for an alarm and for a role's input.
export function urlOf(
	db: Database,
	precinct: string,
	kind: Subject,
	number: number,
): string | null {
	const row = db
		.query(
			kind === "pull"
				? "SELECT url FROM pulls WHERE precinct = ? AND number = ?"
				: "SELECT url FROM issues WHERE precinct = ? AND issue = ?",
		)
		.get(precinct, number) as { url: string | null } | null;
	return row?.url ?? null;
}

export function linkLine(
	db: Database,
	precinct: string,
	kind: Subject,
	number: number,
): string | null {
	const url = urlOf(db, precinct, kind, number);
	return url === null ? null : `link ${precinct}#${number} ${url}`;
}

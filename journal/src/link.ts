import type { Database } from "bun:sqlite";

// The address that opens an issue or a pull request, as the host reports it. A value that
// is no plain address is no link: only http and https, no credentials, a length that a
// host's own address fits in, and the form the URL parser serializes. The last check drops
// every space, line break, control, non-ASCII and other character the parser would escape.
const LINK_MAX = 500;

export function linkOrNull(v: unknown): string | null {
	if (typeof v !== "string" || v.length > LINK_MAX) return null;
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

export type Subject = "issue" | "pull" | "spec";

const URL_OF: Record<Subject, string> = {
	issue: "SELECT url FROM issues WHERE precinct = ? AND issue = ?",
	pull: "SELECT url FROM pulls WHERE precinct = ? AND number = ?",
	// the newest spec comment of a pull request
	spec: "SELECT c.url FROM pulls p JOIN comments c ON c.precinct = p.precinct AND c.kind = 'pull' AND c.number = p.number AND c.id = p.spec_id WHERE p.precinct = ? AND p.number = ?",
};

// The one place that finds the address of a subject, for an alarm and for a role's input.
// It is null when the cache has none.
export function urlOf(
	db: Database,
	precinct: string,
	subject: Subject,
	number: number,
): string | null {
	const row = db.query(URL_OF[subject]).get(precinct, number) as {
		url: string | null;
	} | null;
	return row?.url ?? null;
}

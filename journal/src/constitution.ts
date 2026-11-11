import type { Database } from "bun:sqlite";
import { ROLES } from "./input-roles";

// What a precinct lacks when its constitution cannot be used. This module owns the fact:
// the duty desk records it, the alarm names it, and the roles end their orders with its slug.
export type Lack = "missing" | "bad" | "contract";

export const SLUG: Record<Lack, string> = {
	missing: "skipped-no-constitution",
	bad: "skipped-bad-constitution",
	contract: "skipped-contract-version",
};

// the lines of a failed page check say which of the two it was
export const lackOf = (reasons: string[]): Lack =>
	reasons.some((r) => r.includes("contract_version")) ? "contract" : "bad";

// The column holds the lack, and after a colon the first reason of a failed check.
const REASON_MAX = 100;
export function recorded(lack: Lack, reasons: string[]): string {
	const first = (reasons[0] ?? "")
		.replace(/[^\x20-\x7e]/g, "")
		.slice(0, REASON_MAX);
	return lack === "bad" && first !== "" ? `bad:${first}` : lack;
}

const NO_ORDERS =
	"The duty desk writes no new orders for the roles that read it, and the clerk goes on.";

// what the alarm says: the cause, what stops, and what the owner does next
export function lackText(cause: string): string {
	const [code, ...rest] = cause.split(":");
	const reason = rest.join(":");
	if (code === "missing")
		return `no constitution on the main branch. ${NO_ORDERS} Merge LAWMAN.md on the main branch.`;
	if (code === "contract")
		return `the constitution declares a contract version the law does not support. ${NO_ORDERS} Run the assembly to amend it.`;
	return `the constitution fails its check${reason === "" ? "" : ` (${reason})`}. ${NO_ORDERS} Fix the file, then run the assembly job "re-check a precinct".`;
}

// the precincts whose constitution is recorded as unusable
export const lackingPrecincts = (db: Database): Set<string> =>
	new Set(
		(
			db
				.query(
					"SELECT name FROM precincts WHERE weight > 0 AND constitution_cause IS NOT NULL",
				)
				.all() as { name: string }[]
		).map((r) => r.name),
	);

// a role whose input needs the constitution cannot work on a precinct that lacks one
export const needsConstitution = (role: string) =>
	ROLES[role]?.constitution === true;

import type { Database } from "bun:sqlite";
import { capOf, lastVisits } from "./leads";

export type Turn = { department: string; at: string | null; cap: number };

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The departments in rotation order: never visited first, then the oldest visit, then the name.
export function rotationOrder(
	db: Database,
	precinct: string,
	role: string,
	names: string[],
): Turn[] {
	const visits = new Map(
		lastVisits(db, precinct, role).map((v) => [v.department, v.at]),
	);
	const at = (department: string) => visits.get(department) ?? "";
	return [...new Set(names)]
		.sort((a, b) => compare(at(a), at(b)) || compare(a, b))
		.map((department) => ({
			department,
			at: visits.get(department) ?? null,
			cap: capOf(db, precinct, department).cap,
		}));
}

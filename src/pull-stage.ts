import type { Database } from "bun:sqlite";
import { check, count, usage } from "./args";
import { markersOf } from "./cases";
import { DEFAULT_PRIORITY, pairOf, priorityOf } from "./clerk-jobs";
import { out, withDb } from "./db";

const PULL_USAGE = "pull <precinct> <pull request>";
const OPEN_VOTES = ["none", "down"];
const NONE = "-";

export type PullStage = {
	need: "spec-writer" | "none";
	spec: string;
	sources: string;
	priority: string;
};

const MISSING: PullStage = {
	need: "none",
	spec: NONE,
	sources: NONE,
	priority: DEFAULT_PRIORITY,
};

type Cached = { issues: string; spec: string; weighted: number };

// The spec writer's need for one cached pull request, without the open-order check.
export function stageOf(
	db: Database,
	precinct: string,
	number: number,
): PullStage {
	const row = db
		.query(
			`SELECT p.issues, p.spec,
         EXISTS (SELECT 1 FROM precincts r WHERE r.name = p.precinct AND r.weight > 0) AS weighted
         FROM pulls p WHERE p.precinct = ? AND p.number = ?`,
		)
		.get(precinct, number) as Cached | null;
	if (row === null) return MISSING;
	const marked = row.issues
		.split(",")
		.filter(Boolean)
		.map((issue) => markersOf(db, precinct, Number(issue)));
	const handed = marked.some((markers) => {
		const pair = pairOf(markers);
		return pair.base === "handed" && pair.pull === String(number);
	});
	const open = row.weighted === 1 && OPEN_VOTES.includes(row.spec) && handed;
	return {
		need: open ? "spec-writer" : "none",
		spec: row.spec,
		sources: row.issues || NONE,
		priority: marked.map(priorityOf).sort()[0] ?? DEFAULT_PRIORITY,
	};
}

export function pullCommand(args: string[]): void {
	if (args.length !== 2) throw usage(PULL_USAGE);
	const [name, number] = args as [string, string];
	check("precinct", name);
	const m = count(number, "pull request", 1);
	withDb((db) => {
		const s = stageOf(db, name, m);
		out(
			`need=${s.need} spec=${s.spec} sources=${s.sources} priority=${s.priority}`,
		);
	});
}

import type { Database } from "bun:sqlite";
import { check, parseArgs, usage } from "./args";
import { caseOf, markersOf } from "./cases";
import { DEFAULT_PRIORITY } from "./clerk-jobs";
import { LEAD_ORIGIN_FROM, out, withDb } from "./db";
import { stageOf } from "./pull-stage";

const DUE_USAGE = "due --role <role> [--exclude <precinct>]…";
const EXCLUDE_FLAG = "--exclude";
const CLERK = "clerk";
const SPEC_WRITER = "spec-writer";
// the clerk also works closed issues and issues that never had a lead
const ALL_ISSUES = "FROM issues i WHERE true";

type Entry = { precinct: string; number: number; priority: string };
type IssueRow = { precinct: string; issue: number; state: string; led: number };
type PullRow = { precinct: string; number: number };

// --exclude repeats, which parseArgs does not allow
function splitExcluded(args: string[]): { excluded: string[]; rest: string[] } {
	const excluded: string[] = [];
	const rest: string[] = [];
	for (let i = 0; i < args.length; i += 2) {
		const [flag, value] = [args[i], args[i + 1]];
		if (flag !== EXCLUDE_FLAG) rest.push(...args.slice(i, i + 2));
		else if (value === undefined) throw usage(DUE_USAGE);
		else excluded.push(check("precinct", value));
	}
	return { excluded, rest };
}

const lastOrder = (precinct: string, issue: string) =>
	`(SELECT max(d.at) FROM dispatches d
      WHERE d.role = ? AND d.precinct = ${precinct} AND d.issue = ${issue})`;

function issueEntries(db: Database, role: string, excluded: string[]) {
	const rows = db
		.query(
			`SELECT i.precinct, i.issue, i.state,
           EXISTS (SELECT 1 FROM markers m WHERE m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead') AS led,
           ${lastOrder("i.precinct", "i.issue")} AS last
         ${role === CLERK ? ALL_ISSUES : `${LEAD_ORIGIN_FROM} AND i.state = 'OPEN'`}
           AND EXISTS (SELECT 1 FROM precincts p WHERE p.name = i.precinct AND p.weight > 0)
         ORDER BY last IS NOT NULL, last, i.created_at, i.precinct, i.issue`,
		)
		.all(role) as IssueRow[];
	return rows
		.filter((r) => !excluded.includes(r.precinct))
		.flatMap((r): Entry[] => {
			const view = caseOf(
				db,
				r.precinct,
				r.issue,
				r.state,
				markersOf(db, r.precinct, r.issue),
				r.led === 1,
			);
			if (view.need !== role) return [];
			const priority = role === CLERK ? view.clerk.priority : DEFAULT_PRIORITY;
			return [{ precinct: r.precinct, number: r.issue, priority }];
		});
}

function pullEntries(db: Database, excluded: string[]) {
	const rows = db
		.query(
			`SELECT p.precinct, p.number FROM pulls p
         ORDER BY ${lastOrder("p.precinct", "p.number")} IS NOT NULL, ${lastOrder("p.precinct", "p.number")}, p.precinct, p.number`,
		)
		.all(SPEC_WRITER, SPEC_WRITER) as PullRow[];
	return rows
		.filter((r) => !excluded.includes(r.precinct))
		.flatMap((r): Entry[] => {
			const stage = stageOf(db, r.precinct, r.number);
			return stage.need === SPEC_WRITER
				? [{ precinct: r.precinct, number: r.number, priority: stage.priority }]
				: [];
		});
}

export function dueCommand(args: string[]): void {
	const { excluded, rest } = splitExcluded(args);
	const { opt } = parseArgs(rest, 0, ["role"], DUE_USAGE);
	const role = check("role", opt.role);
	withDb((db) => {
		if (
			db
				.query("SELECT 1 FROM dispatches WHERE role = ? AND outcome IS NULL")
				.get(role)
		)
			return;
		const entries =
			role === SPEC_WRITER
				? pullEntries(db, excluded)
				: issueEntries(db, role, excluded);
		// Array.sort is stable, so rotation order survives inside a priority
		const first = entries.sort((a, b) =>
			a.priority.localeCompare(b.priority),
		)[0];
		if (first !== undefined) out(first.precinct, first.number);
	});
}

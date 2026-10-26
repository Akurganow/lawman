import type { Database } from "bun:sqlite";
import { check, parseArgs, splitExcluded } from "./args";
import { caseOf, markersOf } from "./cases";
import { DEFAULT_PRIORITY } from "./clerk-jobs";
import { LEAD_ORIGIN_FROM, out, withDb } from "./db";
import { stageOf } from "./pull-stage";

const DUE_USAGE = "due --role <role> [--exclude <precinct>]…";
const CLERK = "clerk";
const SPEC_WRITER = "spec-writer";
const EXECUTOR = "executor";
const PULL_ROLES = [SPEC_WRITER, EXECUTOR];
// the clerk also works closed issues and issues that never had a lead
const ALL_ISSUES = "FROM issues i WHERE true";

type Entry = { precinct: string; number: number; priority: string };
type IssueRow = {
	precinct: string;
	issue: number;
	state: string;
	answer: string | null;
	led: number;
};
type PullRow = { precinct: string; number: number };

const lastOrder = (precinct: string, issue: string) =>
	`(SELECT max(d.at) FROM dispatches d
      WHERE d.role = ? AND d.precinct = ${precinct} AND d.issue = ${issue})`;

function issueEntries(db: Database, role: string, excluded: string[]) {
	const rows = db
		.query(
			`SELECT i.precinct, i.issue, i.state, i.answer,
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
				r.answer,
				r.led === 1,
			);
			if (view.need !== role) return [];
			const priority = role === CLERK ? view.clerk.priority : DEFAULT_PRIORITY;
			return [{ precinct: r.precinct, number: r.issue, priority }];
		});
}

function pullEntries(db: Database, role: string, excluded: string[]) {
	const rows = db
		.query(
			`SELECT p.precinct, p.number FROM pulls p
         ORDER BY ${lastOrder("p.precinct", "p.number")} IS NOT NULL, ${lastOrder("p.precinct", "p.number")}, p.precinct, p.number`,
		)
		.all(role, role) as PullRow[];
	return rows
		.filter((r) => !excluded.includes(r.precinct))
		.flatMap((r): Entry[] => {
			const stage = stageOf(db, r.precinct, r.number);
			return stage.need === role
				? [{ precinct: r.precinct, number: r.number, priority: stage.priority }]
				: [];
		});
}

export function dueCommand(args: string[]): void {
	const { excluded, rest } = splitExcluded(args, DUE_USAGE);
	const { opt } = parseArgs(rest, 0, ["role"], DUE_USAGE);
	const role = check("role", opt.role);
	withDb((db) => {
		if (
			db
				.query("SELECT 1 FROM dispatches WHERE role = ? AND outcome IS NULL")
				.get(role)
		)
			return;
		const entries = PULL_ROLES.includes(role)
			? pullEntries(db, role, excluded)
			: issueEntries(db, role, excluded);
		// Array.sort is stable, so rotation order survives inside a priority
		const first = entries.sort((a, b) =>
			a.priority.localeCompare(b.priority),
		)[0];
		if (first !== undefined) out(first.precinct, first.number);
	});
}

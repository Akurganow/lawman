import type { Database } from "bun:sqlite";
import { caseOf, markersOf } from "./cases";
import { DEFAULT_PRIORITY } from "./clerk-jobs";
import { LEAD_ORIGIN_FROM } from "./db";
import { dismissalsSince } from "./dismissal";
import { readConfig } from "./input-files";
import { stageOf } from "./pull-stage";

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

function issueEntries(db: Database, role: string) {
	const since = dismissalsSince(readConfig());
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
	return rows.flatMap((r): Entry[] => {
		const view = caseOf(
			db,
			r.precinct,
			r.issue,
			r.state,
			markersOf(db, r.precinct, r.issue),
			r.answer,
			since,
			r.led === 1,
		);
		if (view.need !== role) return [];
		const priority = role === CLERK ? view.clerk.priority : DEFAULT_PRIORITY;
		return [{ precinct: r.precinct, number: r.issue, priority }];
	});
}

function pullEntries(db: Database, role: string) {
	const rows = db
		.query(
			`SELECT p.precinct, p.number FROM pulls p
         ORDER BY ${lastOrder("p.precinct", "p.number")} IS NOT NULL, ${lastOrder("p.precinct", "p.number")}, p.precinct, p.number`,
		)
		.all(role, role) as PullRow[];
	return rows.flatMap((r): Entry[] => {
		const stage = stageOf(db, r.precinct, r.number);
		return stage.need === role
			? [{ precinct: r.precinct, number: r.number, priority: stage.priority }]
			: [];
	});
}

// Every case or pull request the role is due on, in the order the role should
// take them: by priority, then by the last order, oldest first.
export function dueEntries(db: Database, role: string): Entry[] {
	const entries = PULL_ROLES.includes(role)
		? pullEntries(db, role)
		: issueEntries(db, role);
	// Array.sort is stable, so rotation order survives inside a priority
	return entries.sort((a, b) => a.priority.localeCompare(b.priority));
}

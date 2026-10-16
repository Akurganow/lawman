import type { Database } from "bun:sqlite";
import { check, count, parseArgs } from "./args";
import { type CaseMarker, markersOf } from "./cases";
import { EXIT, Fail, out, withDb } from "./db";

const INTAKE_USAGE = "intake <precinct> [--issue <n>]";
const RESPONSE_UNIT = "response-unit";
const ORD_SEPARATOR = "|";

type Row = {
	issue: number;
	state: string;
	replied_at: string | null;
	led: number;
};

// an ord starts with the creation time of the comment that carries the marker
const carrierTime = (ord: string) => ord.split(ORD_SEPARATOR)[0] ?? "";

function waitsForReply(markers: CaseMarker[], repliedAt: string | null) {
	const unit = markers
		.filter((m) => m.role === RESPONSE_UNIT)
		.sort((a, b) => (a.ord < b.ord ? -1 : 1))
		.at(-1);
	if (unit === undefined) return true;
	return (
		unit.stage === "await" &&
		repliedAt !== null &&
		repliedAt > carrierTime(unit.ord)
	);
}

const waits = (db: Database, precinct: string, r: Row) =>
	r.state === "OPEN" &&
	r.led === 0 &&
	waitsForReply(markersOf(db, precinct, r.issue), r.replied_at);

function candidates(db: Database, precinct: string, issue: number | null) {
	return db
		.query(
			`SELECT i.issue, i.state, i.replied_at,
           EXISTS (SELECT 1 FROM markers m WHERE m.precinct = i.precinct
             AND m.issue = i.issue AND m.stage = 'lead') AS led,
           (SELECT max(d.at) FROM dispatches d
             WHERE d.role = ? AND d.precinct = i.precinct AND d.issue = i.issue) AS last
         FROM issues i WHERE i.precinct = ? AND (? IS NULL OR i.issue = ?)
         ORDER BY last IS NOT NULL, last, i.created_at, i.issue`,
		)
		.all(RESPONSE_UNIT, precinct, issue, issue) as Row[];
}

const orderIsOpen = (db: Database, precinct: string) =>
	db
		.query(
			"SELECT 1 FROM dispatches WHERE role = ? AND precinct = ? AND outcome IS NULL",
		)
		.get(RESPONSE_UNIT, precinct) !== null;

export function intakeCommand(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, [], INTAKE_USAGE, ["issue"]);
	const precinct = check("precinct", pos[0]);
	const issue = opt.issue === undefined ? null : count(opt.issue, "issue", 1);
	withDb((db) => {
		const rows = candidates(db, precinct, issue);
		if (issue === null) {
			const next = orderIsOpen(db, precinct)
				? undefined
				: rows.find((r) => waits(db, precinct, r));
			if (next !== undefined) out(next.issue);
			return;
		}
		const row = rows[0];
		if (row === undefined)
			throw new Fail(EXIT.USAGE, `unknown issue ${precinct} #${issue}`);
		out(
			`need=${waits(db, precinct, row) ? "intake" : "none"} state=${row.state}`,
		);
	});
}

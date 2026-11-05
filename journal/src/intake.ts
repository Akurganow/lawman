import type { Database } from "bun:sqlite";
import { check, count, parseArgs } from "./args";
import { type CaseMarker, markersOf } from "./cases";
import { hasPair } from "./clerk-jobs";
import { EXIT, Fail, out, withDb } from "./db";

const INTAKE_USAGE = "intake <precinct> --issue <n>";
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
	if (hasPair(markers)) return false;
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

type IntakeStage = {
	need: "intake" | "none";
	state: string;
	line: string;
};

// The intake need of one cached issue. An issue missing from the cache fails with code 1.
export function intakeStage(
	db: Database,
	precinct: string,
	issue: number,
): IntakeStage {
	const row = candidates(db, precinct, issue)[0];
	if (row === undefined)
		throw new Fail(EXIT.USAGE, `unknown issue ${precinct} #${issue}`);
	const need = waits(db, precinct, row) ? "intake" : "none";
	return { need, state: row.state, line: `need=${need} state=${row.state}` };
}

// The issues of a precinct that wait for intake, the one ordered longest ago first.
export const intakeWaiting = (db: Database, precinct: string): number[] =>
	candidates(db, precinct, null)
		.filter((r) => waits(db, precinct, r))
		.map((r) => r.issue);

export function intakeCommand(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["issue"], INTAKE_USAGE);
	const precinct = check("precinct", pos[0]);
	const issue = count(opt.issue, "issue", 1);
	withDb((db) => out(intakeStage(db, precinct, issue).line));
}

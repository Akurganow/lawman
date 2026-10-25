import type { Database } from "bun:sqlite";
import { check, parseArgs } from "./args";
import { EXIT, Fail, LEAD_ORIGIN_FROM, LEAD_PREFIX, out, withDb } from "./db";
import { canonicalId } from "./markers";

export const CAP_TABLE: { upTo: number | null; cap: number }[] = [
	{ upTo: 2, cap: 3 },
	{ upTo: 4, cap: 1 },
	{ upTo: null, cap: 0 },
];

const LEADS_USAGE = "leads <precinct> [--department <d>]";
const SEEN_USAGE = "seen <precinct> --id <path::symbol::kind>";
const CAP_USAGE = "cap <precinct> --department <d>";
const LAST_USAGE = "last <precinct> --role <role>";
const COMPLETED = "COMPLETED";

type Origin = {
	issue: number;
	state: string;
	state_reason: string | null;
	department: string | null;
	lead_id: string | null;
	title: string;
};

export function leadOrigins(db: Database, name: string): Origin[] {
	return db
		.query(
			`SELECT i.issue, i.state, i.state_reason, m.department, m.lead_id, i.title ${LEAD_ORIGIN_FROM} AND i.precinct = ?
       ORDER BY i.issue`,
		)
		.all(name) as Origin[];
}

export function leads(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, [], LEADS_USAGE, ["department"]);
	const name = check("precinct", pos[0]);
	const department =
		opt.department === undefined ? null : check("department", opt.department);
	withDb((db) => {
		for (const o of leadOrigins(db, name)) {
			if (
				o.state !== "OPEN" ||
				(department !== null && o.department !== department)
			)
				continue;
			out(
				o.issue,
				o.state,
				o.state_reason ?? "",
				o.department ?? "",
				o.lead_id ?? "",
				o.title,
			);
		}
	});
}

export const symbolOf = (id: string) => id.slice(0, id.lastIndexOf("::"));

export function seenLine(origins: Origin[], id: string): string {
	const same = origins.filter(
		(o) => symbolOf(o.lead_id ?? "") === symbolOf(id),
	);
	const classes: [string, Origin | undefined][] = [
		["open", same.find((o) => o.state === "OPEN")],
		[
			"declined",
			same.find((o) => o.state === "CLOSED" && o.state_reason !== COMPLETED),
		],
		[
			"fixed",
			origins.find(
				(o) =>
					o.state === "CLOSED" &&
					o.state_reason === COMPLETED &&
					o.lead_id === id,
			),
		],
	];
	for (const [label, o] of classes) if (o) return `${label} #${o.issue}`;
	return "none";
}

export function seen(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["id"], SEEN_USAGE);
	const name = check("precinct", pos[0]);
	if (!canonicalId(opt.id))
		throw new Fail(EXIT.USAGE, `invalid id: ${JSON.stringify(opt.id)}`);
	withDb((db) => out(seenLine(leadOrigins(db, name), opt.id)));
}

function capFor(open: number): number {
	const row = CAP_TABLE.find((r) => r.upTo === null || open <= r.upTo);
	if (row === undefined) throw new Error("CAP_TABLE has no open-ended row");
	return row.cap;
}

// a broken lead has the title prefix but no lead marker, so it has no origin department
function brokenCount(db: Database, name: string, department: string): number {
	const prefix = `${LEAD_PREFIX} ${department}:`;
	const row = db
		.query(
			`SELECT count(*) AS n FROM issues i
       WHERE precinct = ? AND state = 'OPEN' AND substr(title, 1, length(?)) = ?
         AND NOT EXISTS (SELECT 1 FROM markers m WHERE m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead')`,
		)
		.get(name, prefix, prefix) as { n: number };
	return row.n;
}

export function capOf(
	db: Database,
	name: string,
	department: string,
): { cap: number; open: number } {
	const origins = leadOrigins(db, name).filter(
		(o) => o.state === "OPEN" && o.department === department,
	);
	const open = origins.length + brokenCount(db, name, department);
	return { cap: capFor(open), open };
}

export function cap(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["department"], CAP_USAGE);
	const name = check("precinct", pos[0]);
	const department = check("department", opt.department);
	withDb((db) => {
		const { cap, open } = capOf(db, name, department);
		out(`cap=${cap} open=${open}`);
	});
}

export type Visit = { department: string; at: string };

export function lastVisits(
	db: Database,
	name: string,
	roleName: string,
): Visit[] {
	return db
		.query(
			`SELECT department, max(at) AS at FROM dispatches
       WHERE precinct = ? AND role = ? AND department IS NOT NULL
       GROUP BY department ORDER BY max(at), department`,
		)
		.all(name, roleName) as Visit[];
}

export function last(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["role"], LAST_USAGE);
	const name = check("precinct", pos[0]);
	const roleName = check("role", opt.role);
	withDb((db) => {
		for (const r of lastVisits(db, name, roleName)) out(r.department, r.at);
	});
}

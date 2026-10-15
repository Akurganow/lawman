import type { Database } from "bun:sqlite";
import { check, parseArgs, usage } from "./args";
import { EXIT, Fail, LEAD_ORIGIN_FROM, out, withDb } from "./db";

const CASE_USAGE = "case <precinct> <issue>";
const DUE_USAGE = "due --role <role>";

export type CaseMarker = {
	role: string;
	stage: string;
	fields: Record<string, string>;
	ord: string;
};
export type Need = "investigation" | "prosecutor" | "defender" | "none";

const RETURNING_ROLES = ["prosecutor", "defender"];

const newest = (markers: CaseMarker[]) =>
	markers.reduce<CaseMarker | undefined>(
		(a, b) => (a === undefined || b.ord > a.ord ? b : a),
		undefined,
	);

const backToInvestigation = (m: CaseMarker) =>
	RETURNING_ROLES.includes(m.role) &&
	m.stage === "return" &&
	m.fields.to === "investigation";

const newestOf = (markers: CaseMarker[], role: string, stage?: string) =>
	newest(
		markers.filter(
			(m) => m.role === role && (stage === undefined || m.stage === stage),
		),
	);

export function needOf(state: string, markers: CaseMarker[]): Need {
	if (state === "CLOSED") return "none";
	const c = newestOf(markers, "investigation", "case");
	if (c === undefined) return "investigation";
	const p = newestOf(markers, "prosecutor");
	if (p !== undefined && p.ord > c.ord && backToInvestigation(p))
		return "investigation";
	if (p === undefined || p.ord < c.ord) return "prosecutor";
	if (p.stage !== "charge") return "none";
	const d = newestOf(markers, "defender");
	if (d === undefined || d.ord < p.ord) return "defender";
	return backToInvestigation(d) ? "investigation" : "none";
}

function markersOf(db: Database, precinct: string, issue: number) {
	return (
		db
			.query(
				"SELECT role, stage, fields, ord FROM markers WHERE precinct = ? AND issue = ?",
			)
			.all(precinct, issue) as (Omit<CaseMarker, "fields"> & {
			fields: string;
		})[]
	).map((m) => ({
		...m,
		fields: JSON.parse(m.fields) as Record<string, string>,
	}));
}

export function caseCommand(args: string[]): void {
	if (args.length !== 2) throw usage(CASE_USAGE);
	const [name, issue] = args as [string, string];
	withDb((db) => {
		const origin = db
			.query(
				`SELECT i.state, m.department ${LEAD_ORIGIN_FROM} AND i.precinct = ? AND i.issue = ?`,
			)
			.get(name, issue) as { state: string; department: string | null } | null;
		if (origin === null)
			throw new Fail(EXIT.USAGE, `no lead origin for ${name} #${issue}`);
		const markers = markersOf(db, name, Number(issue));
		const sha = newestOf(markers, "investigation", "case")?.fields.sha;
		const returns = markers.filter(backToInvestigation);
		const returned = RETURNING_ROLES.filter((r) =>
			returns.some((m) => m.role === r),
		);
		out(
			`need=${needOf(origin.state, markers)} round=${returns.length + 1} returned=${returned.join(",") || "-"} department=${origin.department ?? "-"} sha=${sha ?? "-"} state=${origin.state}`,
		);
	});
}

type Candidate = { precinct: string; issue: number; state: string };

export function dueCommand(args: string[]): void {
	const { opt } = parseArgs(args, 0, ["role"], DUE_USAGE);
	const roleName = check("role", opt.role);
	withDb((db) => {
		if (
			db
				.query("SELECT 1 FROM dispatches WHERE role = ? AND outcome IS NULL")
				.get(roleName)
		)
			return;
		const candidates = db
			.query(
				`SELECT i.precinct, i.issue, i.state,
           (SELECT max(d.at) FROM dispatches d
             WHERE d.role = ? AND d.precinct = i.precinct AND d.issue = i.issue) AS last
         ${LEAD_ORIGIN_FROM} AND i.state = 'OPEN'
           AND EXISTS (SELECT 1 FROM precincts p WHERE p.name = i.precinct AND p.weight > 0)
         ORDER BY last IS NOT NULL, last, i.created_at, i.precinct, i.issue`,
			)
			.all(roleName) as Candidate[];
		const due = candidates.find(
			(c) => needOf(c.state, markersOf(db, c.precinct, c.issue)) === roleName,
		);
		if (due !== undefined) out(due.precinct, due.issue);
	});
}

import { usage } from "./args";
import { EXIT, Fail, LEAD_ORIGIN_FROM, out, withDb } from "./db";

const CASE_USAGE = "case <precinct> <issue>";

export type CaseMarker = {
	role: string;
	stage: string;
	fields: Record<string, string>;
	ord: string;
};
export type Need = "investigation" | "prosecutor" | "none";

const newest = (markers: CaseMarker[]) =>
	markers.reduce<CaseMarker | undefined>(
		(a, b) => (a === undefined || b.ord > a.ord ? b : a),
		undefined,
	);

const backToInvestigation = (m: CaseMarker) =>
	m.role === "prosecutor" &&
	m.stage === "return" &&
	m.fields.to === "investigation";

export function needOf(state: string, markers: CaseMarker[]): Need {
	if (state === "CLOSED") return "none";
	const c = newest(
		markers.filter((m) => m.role === "investigation" && m.stage === "case"),
	);
	const p = newest(markers.filter((m) => m.role === "prosecutor"));
	if (
		c === undefined ||
		(p !== undefined && p.ord > c.ord && backToInvestigation(p))
	)
		return "investigation";
	return p === undefined || p.ord < c.ord ? "prosecutor" : "none";
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
		const markers = (
			db
				.query(
					"SELECT role, stage, fields, ord FROM markers WHERE precinct = ? AND issue = ?",
				)
				.all(name, issue) as (Omit<CaseMarker, "fields"> & { fields: string })[]
		).map((m) => ({
			...m,
			fields: JSON.parse(m.fields) as Record<string, string>,
		}));
		const sha = newest(
			markers.filter((m) => m.role === "investigation" && m.stage === "case"),
		)?.fields.sha;
		const round = markers.filter(backToInvestigation).length + 1;
		out(
			`need=${needOf(origin.state, markers)} round=${round} department=${origin.department ?? "-"} sha=${sha ?? "-"} state=${origin.state}`,
		);
	});
}

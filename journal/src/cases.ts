import type { Database } from "bun:sqlite";
import { usage } from "./args";
import {
	type ClerkCase,
	clerkCase,
	clerkMarkersOf,
	closedIn,
	hasPair,
	pullsOf,
} from "./clerk-jobs";
import { EXIT, Fail, LEAD_ORIGIN_FROM, out, withDb } from "./db";
import { leadOrigins, symbolOf } from "./leads";

const CASE_USAGE = "case <precinct> <issue>";

export type CaseMarker = {
	role: string;
	stage: string;
	fields: Record<string, string>;
	ord: string;
};
export type Need =
	| "investigation"
	| "prosecutor"
	| "defender"
	| "court"
	| "clerk"
	| "none";

const RETURNING_ROLES = ["prosecutor", "defender"];
const BODY_RANK = 0;
const ORD_RANK_PART = 1;

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

type Funnel = { need: Exclude<Need, "clerk">; ruling?: CaseMarker };

function funnelOf(markers: CaseMarker[]): Funnel {
	const c = newestOf(markers, "investigation", "case");
	if (c === undefined) return { need: "investigation" };
	const p = newestOf(markers, "prosecutor");
	if (p !== undefined && p.ord > c.ord && backToInvestigation(p))
		return { need: "investigation" };
	if (p === undefined || p.ord < c.ord) return { need: "prosecutor" };
	if (p.stage !== "charge") return { need: "none" };
	const d = newestOf(markers, "defender");
	if (d === undefined || d.ord < p.ord) return { need: "defender" };
	if (backToInvestigation(d)) return { need: "investigation" };
	if (d.stage !== "defence") return { need: "none" };
	const r = newestOf(markers, "court");
	if (r === undefined || r.ord < d.ord) return { need: "court" };
	const ruled = r.stage === "conviction" || r.stage === "acquittal";
	return { need: "none", ...(ruled ? { ruling: r } : {}) };
}

export type CaseView = { need: Need; clerk: ClerkCase };

// A pair marker means the case left the funnel. Only the clerk is left to act.
export function caseOf(
	db: Database,
	precinct: string,
	issue: number,
	state: string,
	markers: CaseMarker[],
	led = true,
): CaseView {
	const funnel = led ? funnelOf(markers) : { need: "none" as const };
	const clerk = clerkCase({
		issue,
		state,
		markers,
		pulls: pullsOf(db, precinct),
		isClosed: closedIn(db, precinct),
		ruling: funnel.ruling,
		others: () => clerkMarkersOf(db, precinct),
	});
	if (clerk.job !== "-") return { need: "clerk", clerk };
	const left = state === "CLOSED" || hasPair(markers);
	return { need: left ? "none" : funnel.need, clerk };
}

export function markersOf(db: Database, precinct: string, issue: number) {
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

const leadPlace = (ord: string) =>
	Number(ord.split("|")[ORD_RANK_PART]) === BODY_RANK ? "body" : "comment";

function relatedOf(db: Database, precinct: string, issue: number, id: string) {
	if (id === "") return "-";
	const numbers = leadOrigins(db, precinct)
		.filter(
			(o) =>
				o.issue !== issue &&
				(o.lead_id ?? "") !== "" &&
				symbolOf(o.lead_id ?? "") === symbolOf(id),
		)
		.map((o) => o.issue);
	return numbers.join(",") || "-";
}

type Origin = {
	department: string | null;
	lead_id: string | null;
	ord: string;
};

function leadFields(
	db: Database,
	name: string,
	issue: number,
	markers: CaseMarker[],
) {
	const origin = db
		.query(
			`SELECT m.department, m.lead_id, m.ord ${LEAD_ORIGIN_FROM} AND i.precinct = ? AND i.issue = ?`,
		)
		.get(name, issue) as Origin | null;
	if (origin === null) return null;
	const sha = newestOf(markers, "investigation", "case")?.fields.sha;
	const returns = markers.filter(backToInvestigation);
	const returned = RETURNING_ROLES.filter((r) =>
		returns.some((m) => m.role === r),
	);
	return {
		round: returns.length + 1,
		returned: returned.join(",") || "-",
		department: origin.department ?? "-",
		sha: sha ?? "-",
		lead: leadPlace(origin.ord),
		related: relatedOf(db, name, issue, origin.lead_id ?? ""),
	};
}

const NO_LEAD = {
	round: "-",
	returned: "-",
	department: "-",
	sha: "-",
	lead: "-",
	related: "-",
};

export function caseCommand(args: string[]): void {
	if (args.length !== 2) throw usage(CASE_USAGE);
	const [name, issue] = args as [string, string];
	withDb((db) => {
		const row = db
			.query("SELECT state FROM issues WHERE precinct = ? AND issue = ?")
			.get(name, issue) as { state: string } | null;
		if (row === null)
			throw new Fail(EXIT.USAGE, `unknown issue ${name} #${issue}`);
		const markers = markersOf(db, name, Number(issue));
		const lead = leadFields(db, name, Number(issue), markers);
		const { need, clerk } = caseOf(
			db,
			name,
			Number(issue),
			row.state,
			markers,
			lead !== null,
		);
		const l = lead ?? NO_LEAD;
		out(
			`need=${need} round=${l.round} returned=${l.returned} department=${l.department} sha=${l.sha} state=${row.state} lead=${l.lead} related=${l.related} priority=${clerk.priority} job=${clerk.job} action=${clerk.action} pull=${clerk.pull} sources=${clerk.sources} branch=${clerk.branch}`,
		);
	});
}

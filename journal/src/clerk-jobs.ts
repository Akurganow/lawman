import type { Database } from "bun:sqlite";
import type { CaseMarker } from "./cases";

export type CachedPull = { number: number; issues: number[] };
export type Job =
	| "state"
	| "reopen-issue"
	| "adopt"
	| "settle"
	| "open"
	| "precedent"
	| "decision"
	| "-";
export type Action = "close-pull" | "reopen" | "open" | "kept" | "-";
export type ClerkCase = {
	priority: string;
	job: Job;
	action: Action;
	pull: string;
	sources: string;
	branch: string;
};
export type ClerkInput = {
	issue: number;
	state: string;
	markers: CaseMarker[];
	pulls: CachedPull[];
	isClosed: (issue: number) => boolean;
	ruling: CaseMarker | undefined;
	// whether the ruling has a Precedent section with a line, read only when needed
	holdsPrecedent: () => boolean;
	// the clerk markers of the other issues of the precinct, read only when needed
	others: () => Map<number, CaseMarker[]>;
};

const PAIR_STAGES = ["handed", "shut", "settled", "kept"];
const ISSUE_STATES = ["open", "closed"];
const ANSWERS = ["entry", "no-entry"];
const DECISION_STAGES = ["entry", "final", "kept"];
const POSITIVE = /^[1-9][0-9]*$/;
const PRIORITY = /^P[0-3]$/;
export const DEFAULT_PRIORITY = "P2";
const NONE = "-";

const byOrd = (a: CaseMarker, b: CaseMarker) => (a.ord < b.ord ? -1 : 1);

const isPairMarker = (m: CaseMarker) =>
	m.role === "clerk" &&
	PAIR_STAGES.includes(m.stage) &&
	POSITIVE.test(m.fields.pull ?? "") &&
	ISSUE_STATES.includes(m.fields.issue ?? "");

// the pair markers of an issue, oldest first
const pairMarkers = (markers: CaseMarker[]) =>
	markers.filter(isPairMarker).sort(byOrd);

export const hasPair = (markers: CaseMarker[]) => markers.some(isPairMarker);

// The adopt recipe writes this field on the `handed` marker of a pull request
// that is no draft of the clerk.
const ADOPTED_FIELD = "adopted";

// A clerk marker newer than the ruling that answers it: the entry of a precedent
// pull request, or the comment that says there is none.
export const answers = (m: CaseMarker, rulingOrd: string) =>
	m.role === "clerk" && ANSWERS.includes(m.stage) && m.ord > rulingOrd;

// the precedent pull requests of an issue whose newest entry, final or kept marker is entry, ascending
export function awaitingDecision(markers: CaseMarker[]): number[] {
	const newest = new Map<string, CaseMarker>();
	for (const m of [...markers].sort(byOrd))
		if (
			m.role === "clerk" &&
			DECISION_STAGES.includes(m.stage) &&
			m.fields.issue === undefined &&
			POSITIVE.test(m.fields.pull ?? "")
		)
			newest.set(m.fields.pull ?? "", m);
	return [...newest]
		.filter(([, m]) => m.stage === "entry")
		.map(([pull]) => Number(pull))
		.sort((a, b) => a - b);
}

export function priorityOf(markers: CaseMarker[]): string {
	const newest = markers
		.filter((m) => m.role === "court" && m.stage === "conviction")
		.sort(byOrd)
		.at(-1);
	const value = newest?.fields.priority ?? "";
	return PRIORITY.test(value) ? value : DEFAULT_PRIORITY;
}

// a kept marker leaves the pair as it was: its base is the stage before it
function baseOf(pairs: CaseMarker[]): string | undefined {
	const k = pairs.at(-1);
	if (k === undefined || k.stage !== "kept") return k?.stage;
	return (
		pairs.filter((m) => m.stage !== "kept" && m.ord < k.ord).at(-1)?.stage ??
		"kept"
	);
}

// the pull request and the base of an issue's newest pair marker
export function pairOf(markers: CaseMarker[]) {
	const pairs = pairMarkers(markers);
	return { pull: pairs.at(-1)?.fields.pull, base: baseOf(pairs) };
}

function stateAction(
	base: string | undefined,
	closed: boolean,
	closePull: boolean,
): Action {
	if (base === "handed" && closed) return closePull ? "close-pull" : "kept";
	if (base === "shut" && !closed) return "reopen";
	if (base === "settled" && !closed) return "open";
	return "kept";
}

type Row = { job: Job; action: Action; pull?: string };
const job = (j: Job, action: Action = NONE): Row => ({ job: j, action });
const NO_JOB = job(NONE);

function tableRow(
	i: ClerkInput,
	pairs: CaseMarker[],
	base: string | undefined,
	pull: CachedPull | undefined,
): Row {
	const k = pairs.at(-1);
	const open = i.state === "OPEN";
	const points = pull !== undefined && Number(k?.fields.pull) === pull.number;
	if (pull !== undefined && base === "shut" && points)
		return job("reopen-issue");
	if (pull !== undefined && !points && open) return job("adopt");
	const decided = awaitingDecision(i.markers).find(
		(m) => !i.pulls.some((p) => p.number === m),
	);
	if (decided !== undefined)
		return { ...job("decision"), pull: String(decided) };
	const ruling = i.ruling;
	if (ruling === undefined) return NO_JOB;
	const conviction = ruling.stage === "conviction";
	if (conviction && k === undefined && open) return job("open");
	// a draft of the clerk, as the first pair, holds the files of a conviction
	const [first] = pairs;
	const draft = first !== undefined && first.fields[ADOPTED_FIELD] !== "yes";
	if (conviction && draft) return NO_JOB;
	if (i.markers.some((m) => answers(m, ruling.ord))) return NO_JOB;
	// only the paths that once recorded nothing wait for a ruling that has a line
	if ((conviction || k !== undefined) && !i.holdsPrecedent()) return NO_JOB;
	return { ...job("precedent"), pull: NONE };
}

function rowOf(
	i: ClerkInput,
	pairs: CaseMarker[],
	pull: CachedPull | undefined,
): Row {
	const k = pairs.at(-1);
	const base = baseOf(pairs);
	const closed = i.state === "CLOSED";
	// a pull request that left the cache is settled before a close of the issue is recorded
	if (pull === undefined && base === "handed") return job("settle");
	if (k !== undefined && k.fields.issue !== i.state.toLowerCase()) {
		const closePull =
			pull?.issues.includes(i.issue) === true && pull.issues.every(i.isClosed);
		return job("state", stateAction(base, closed, closePull));
	}
	return tableRow(i, pairs, base, pull);
}

function branchOf(i: ClerkInput, pairs: CaseMarker[], row: Row) {
	if (row.job === "precedent") {
		const entries = i.markers.filter(
			(m) => m.role === "clerk" && m.stage === "entry",
		).length;
		return `lawman/precedent-${i.issue}-${entries + 1}`;
	}
	const opens =
		row.job === "open" || row.action === "open" || row.action === "reopen";
	if (!opens) return NONE;
	const used = new Set(pairs.map((m) => m.fields.pull)).size;
	return `lawman/execute-${i.issue}-${used + 1}`;
}

// issues whose newest pair marker names the pull request with the given base
function peersOf(i: ClerkInput, pull: string | undefined, base: string) {
	const all = new Map(i.others()).set(i.issue, i.markers);
	const peers = [...all]
		.filter(([, markers]) => {
			const pair = pairOf(markers);
			return pair.pull === pull && pair.base === base;
		})
		.map(([n]) => n)
		.sort((a, b) => a - b);
	return peers.join(",") || NONE;
}

// a pull request that left the cache still has sources: the issues marked with it
function sourcesOf(
	i: ClerkInput,
	row: Row,
	pull: CachedPull | undefined,
	k: CaseMarker | undefined,
) {
	if (row.job === "precedent" || row.job === "decision") return NONE;
	if (pull !== undefined) return pull.issues.join(",") || NONE;
	if (row.job === "settle") return peersOf(i, k?.fields.pull, "handed");
	if (row.action === "reopen") return peersOf(i, k?.fields.pull, "shut");
	return NONE;
}

export function clerkCase(i: ClerkInput): ClerkCase {
	const pairs = pairMarkers(i.markers);
	const k = pairs.at(-1);
	const named = i.pulls.find((p) => p.number === Number(k?.fields.pull));
	const pull =
		named ??
		i.pulls
			.filter((p) => p.issues.includes(i.issue))
			.sort((a, b) => a.number - b.number)[0];
	const row = rowOf(i, pairs, pull);
	const found = pull === undefined ? NONE : String(pull.number);
	return {
		priority: priorityOf(i.markers),
		...row,
		pull: row.pull ?? (row.job === "adopt" ? found : (k?.fields.pull ?? found)),
		sources: sourcesOf(i, row, pull, k),
		branch: branchOf(i, pairs, row),
	};
}

export function pullsOf(db: Database, precinct: string): CachedPull[] {
	return (
		db
			.query("SELECT number, issues FROM pulls WHERE precinct = ?")
			.all(precinct) as { number: number; issues: string }[]
	).map((p) => ({
		number: p.number,
		issues: p.issues.split(",").filter(Boolean).map(Number),
	}));
}

export const closedIn = (db: Database, precinct: string) => (issue: number) =>
	(
		db
			.query("SELECT state FROM issues WHERE precinct = ? AND issue = ?")
			.get(precinct, issue) as { state: string } | null
	)?.state === "CLOSED";

export function clerkMarkersOf(db: Database, precinct: string) {
	const rows = db
		.query(
			"SELECT issue, role, stage, fields, ord FROM markers WHERE precinct = ? AND role = 'clerk'",
		)
		.all(precinct) as (CaseMarker & { issue: number; fields: string })[];
	const byIssue = new Map<number, CaseMarker[]>();
	for (const { issue, fields, ...m } of rows)
		byIssue.set(issue, [
			...(byIssue.get(issue) ?? []),
			{ ...m, fields: JSON.parse(fields) as Record<string, string> },
		]);
	return byIssue;
}

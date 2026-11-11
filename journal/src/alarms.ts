import type { Database } from "bun:sqlite";
import { usage } from "./args";
import { awaitingDecision, clerkMarkersOf } from "./clerk-jobs";
import { type Lack, lackText } from "./constitution";
import { LEAD_ORIGIN_FROM, MINUTE_MS, out, withDb } from "./db";
import { readConfig } from "./input-files";
import { configValue } from "./law-sync";
import { type Subject, urlOf } from "./link";
import { byText } from "./markers";
import { isHanded, sourceMarkers } from "./pull-stage";
import { progressChecks } from "./settings";

const ROLE_SILENT_INTERVALS = 3;
const TICK_FAILING_RUN = 3;
const NO_PROGRESS = "checks found a takeable order and the role took none";

type Candidate = { kind: string; ref: string; detail: string };
function ageMs(nowMs: number, since: string): number {
	return nowMs - Date.parse(since);
}

function noProgress(db: Database): Candidate[] {
	const n = progressChecks(configValue(readConfig() ?? "", "progress_checks"));
	const stuck = db
		.query("SELECT name FROM roles WHERE checks >= ? ORDER BY name")
		.all(n) as { name: string }[];
	return stuck.map((r) => ({
		kind: "no-progress",
		ref: r.name,
		detail: NO_PROGRESS,
	}));
}

// a tick is dead when it has no end record and a later tick of its role exists
function tickHung(db: Database): Candidate[] {
	const dead = db
		.query(
			`SELECT t.id, t.role, t.started_at FROM ticks t
       WHERE t.ended_at IS NULL
         AND EXISTS (SELECT 1 FROM ticks l WHERE l.role = t.role AND l.id > t.id)
       ORDER BY t.id`,
		)
		.all() as { id: number; role: string; started_at: string }[];
	return dead.map((t) => ({
		kind: "tick-hung",
		ref: String(t.id),
		detail: `${t.role} started ${t.started_at}`,
	}));
}

function roleSilent(db: Database, nowMs: number): Candidate[] {
	const latest = db
		.query(
			`SELECT r.name, r.every_minutes, r.checked_at, max(t.started_at) AS last FROM roles r
       JOIN ticks t ON t.role = r.name
       WHERE EXISTS (SELECT 1 FROM ticks e WHERE e.role = r.name AND e.ended_at IS NOT NULL)
       GROUP BY r.name`,
		)
		.all() as {
		name: string;
		every_minutes: number;
		checked_at: string | null;
		last: string;
	}[];
	return latest
		.map((r) => {
			const since =
				r.checked_at && r.checked_at > r.last ? r.checked_at : r.last;
			return {
				...r,
				since,
				detail:
					since === r.last
						? `last tick started ${r.last}`
						: `last check ${since}`,
			};
		})
		.filter(
			(r) =>
				ageMs(nowMs, r.since) >
				ROLE_SILENT_INTERVALS * r.every_minutes * MINUTE_MS,
		)
		.map((r) => ({ kind: "role-silent", ref: r.name, detail: r.detail }));
}

function tickFailing(db: Database): Candidate[] {
	const failing = db
		.query(
			`WITH ranked AS (
         SELECT role, COALESCE(precinct, '-') AS precinct, outcome,
                ROW_NUMBER() OVER (PARTITION BY role, COALESCE(precinct, '-') ORDER BY ended_at DESC, id DESC) AS n
         FROM ticks WHERE ended_at IS NOT NULL AND (precinct IS NOT NULL OR role = 'duty-desk'))
       SELECT role, precinct FROM ranked WHERE n <= ${TICK_FAILING_RUN}
       GROUP BY role, precinct
       HAVING count(*) = ${TICK_FAILING_RUN}
          AND sum(outcome LIKE 'stopped-%' OR outcome LIKE 'skipped-%' OR outcome = 'failed') = ${TICK_FAILING_RUN}
       ORDER BY role, precinct`,
		)
		.all() as { role: string; precinct: string }[];
	return failing.map((f) => ({
		kind: "tick-failing",
		ref: `${f.role}/${f.precinct}`,
		detail: `last ${TICK_FAILING_RUN} ticks stopped, skipped or failed`,
	}));
}

// the duty desk records the cause at each read of a precinct
function noConstitution(db: Database): Candidate[] {
	const rows = db
		.query(
			"SELECT name, constitution_cause AS cause FROM precincts WHERE weight > 0 AND constitution_cause IS NOT NULL ORDER BY name",
		)
		.all() as { name: string; cause: string }[];
	return rows.map((r) => ({
		kind: "no-constitution",
		ref: r.name,
		detail: lackText(r.cause as Lack),
	}));
}

// How many texts the cache withholds on a precinct, and the first of them with their links.
const NAMED = 3;
const COMMENT_ID = /^[A-Za-z0-9_=-]+$/;
function withheldTexts(db: Database): Candidate[] {
	const precincts = db
		.query("SELECT name FROM precincts WHERE weight > 0 ORDER BY name")
		.all() as { name: string }[];
	return precincts.flatMap(({ name }) => {
		const found = db
			.query(
				`SELECT 'issue' AS kind, issue AS number, NULL AS id FROM issues WHERE precinct = ?1 AND withheld = 1
         UNION ALL SELECT 'pull', number, NULL FROM pulls WHERE precinct = ?1 AND withheld = 1
         UNION ALL SELECT kind, number, id FROM comments WHERE precinct = ?1 AND withheld = 1
         ORDER BY 2, 1, 3`,
			)
			.all(name) as { kind: Subject; number: number; id: string | null }[];
		if (found.length === 0) return [];
		const named = found.slice(0, NAMED).map((t) => {
			const url = urlOf(db, name, t.kind, t.number);
			const what =
				t.id === null
					? `${t.kind} #${t.number}`
					: `comment ${COMMENT_ID.test(t.id) ? `${t.id} ` : ""}on ${t.kind} #${t.number}`;
			return url === null ? what : `${what} ${url}`;
		});
		const more =
			found.length > NAMED ? `, and ${found.length - NAMED} more` : "";
		return [
			{
				kind: "withheld-text",
				ref: name,
				detail: `${found.length} text${found.length === 1 ? " is" : "s are"} withheld, because the journal could not clean ${found.length === 1 ? "it" : "them"}: ${named.join("; ")}${more}. Edit or delete each on the host. The next sync cleans it again.`,
			},
		];
	});
}

const WAITS_FOR_REVIEW = "pull request waits for a review of its finished work";
const WAITS_FOR_VOTE = "pull request waits for a vote on its newest spec";
const WAITS_FOR_PRECEDENT =
	"pull request waits for a decision on its precedent";

function decisionWaiting(db: Database): Candidate[] {
	// a precinct of weight 0 is never synced, so its cached rows go stale
	const waiting = db
		.query(
			`SELECT p.precinct, p.number, p.issues, p.work FROM pulls p
       WHERE (p.spec = 'waiting' OR p.work = 'ready')
         AND EXISTS (SELECT 1 FROM precincts r WHERE r.name = p.precinct AND r.weight > 0)
       ORDER BY p.precinct, p.number`,
		)
		.all() as {
		precinct: string;
		number: number;
		issues: string;
		work: string;
	}[];
	const pairs = waiting
		.filter((p) => isHanded(sourceMarkers(db, p.precinct, p.issues), p.number))
		.map((p) => ({
			...p,
			detail: p.work === "ready" ? WAITS_FOR_REVIEW : WAITS_FOR_VOTE,
		}));
	// a pull request that both lists name has one alarm: the handed one wins
	const seen = new Set<string>();
	return [...pairs, ...precedentWaiting(db)]
		.filter((p) => {
			const ref = `${p.precinct}#${p.number}`;
			if (seen.has(ref)) return false;
			seen.add(ref);
			return true;
		})
		.sort((a, b) => byText(a.precinct, b.precinct) || a.number - b.number)
		.map((p) => ({
			kind: "decision-waiting",
			ref: `${p.precinct}#${p.number}`,
			detail: p.detail,
		}));
}

type Waiting = { precinct: string; number: number; detail: string };

// a precedent pull request has no sources: the clerk's entry marker names it
function precedentWaiting(db: Database): Waiting[] {
	const open = db
		.query(
			`SELECT p.precinct, p.number FROM pulls p
       WHERE EXISTS (SELECT 1 FROM precincts r WHERE r.name = p.precinct AND r.weight > 0)`,
		)
		.all() as { precinct: string; number: number }[];
	const waiting = new Map(
		[...new Set(open.map((p) => p.precinct))].map((precinct) => [
			precinct,
			new Set(
				[...clerkMarkersOf(db, precinct).values()].flatMap(awaitingDecision),
			),
		]),
	);
	return open
		.filter((p) => waiting.get(p.precinct)?.has(p.number))
		.map((p) => ({ ...p, detail: WAITS_FOR_PRECEDENT }));
}

const DETECTORS = [
	noProgress,
	tickHung,
	roleSilent,
	tickFailing,
	decisionWaiting,
	noConstitution,
	withheldTexts,
] as ((db: Database, nowMs: number) => Candidate[])[];

type OpenAlarm = {
	id: number;
	kind: string;
	ref: string;
	detail: string;
};

// a changed detail is a new condition: the old alarm clears and the new one prints
const alarmKey = (a: Candidate) => `${a.kind} ${a.ref} ${a.detail}`;

// An alarm about an issue or a pull request ends with its link. The address is looked up
// from the alarm's subject, never stored in the alarm, so it is no part of the alarm's identity.
const SUBJECTS: Record<string, Subject> = { "decision-waiting": "pull" };

function alarmLine(db: Database, a: Candidate): string {
	const subject = SUBJECTS[a.kind];
	const [precinct = "", number = ""] = a.ref.split("#");
	const url =
		subject === undefined ? null : urlOf(db, precinct, subject, Number(number));
	return `ALARM ${a.kind} ${a.ref} ${a.detail}${url === null ? "" : ` ${url}`}`;
}

export function reconcileAlarms(
	db: Database,
	stamp: string,
	repeat: boolean,
): string[] {
	const nowMs = Date.parse(stamp);
	const wanted = DETECTORS.flatMap((detect) => detect(db, nowMs));
	const open = db
		.query(
			"SELECT id, kind, ref, detail FROM alarms WHERE cleared_at IS NULL ORDER BY id",
		)
		.all() as OpenAlarm[];
	const wantedKeys = new Set(wanted.map(alarmKey));
	const openKeys = new Set(open.map(alarmKey));
	const lines: string[] = [];
	for (const o of open) {
		if (!wantedKeys.has(alarmKey(o)))
			db.run("UPDATE alarms SET cleared_at = ? WHERE id = ?", [stamp, o.id]);
	}
	for (const w of wanted) {
		if (openKeys.has(alarmKey(w))) continue;
		db.run(
			// the notified_at column is never read; it stays so the schema does not change
			"INSERT INTO alarms (kind, ref, detail, raised_at, notified_at) VALUES (?, ?, ?, ?, ?)",
			[w.kind, w.ref, w.detail, stamp, stamp],
		);
		lines.push(alarmLine(db, w));
	}
	// the duty desk repeats an open alarm at each of its ticks; the alarms this
	// call raised are printed once above and never repeated here
	if (repeat)
		for (const o of open)
			if (wantedKeys.has(alarmKey(o))) lines.push(alarmLine(db, o));
	return lines;
}

function statusOrders(db: Database): string[] {
	const rows = db
		.query(
			"SELECT id, precinct, role, department, issue, at, taken_at FROM dispatches WHERE outcome IS NULL ORDER BY at, id",
		)
		.all() as {
		id: number;
		precinct: string;
		role: string;
		department: string | null;
		issue: number | null;
		at: string;
		taken_at: string | null;
	}[];
	return rows.map(
		(r) =>
			`order ${r.id} ${r.precinct} ${r.role} ${r.department ?? "-"} ${r.issue ?? "-"} since ${r.at} ${r.taken_at ? `taken ${r.taken_at}` : "untaken"}`,
	);
}

function statusQueue(db: Database): string[] {
	const rows = db
		.query(
			"SELECT role, count(*) AS n, min(at) AS oldest FROM dispatches WHERE outcome IS NULL GROUP BY role ORDER BY role",
		)
		.all() as { role: string; n: number; oldest: string }[];
	return rows.map((r) => `queue ${r.role} ${r.n} oldest ${r.oldest}`);
}

function statusTicks(db: Database): string[] {
	const rows = db
		.query(
			`SELECT role, started_at, ended_at, outcome FROM (
         SELECT role, started_at, ended_at, outcome,
                ROW_NUMBER() OVER (PARTITION BY role ORDER BY started_at DESC, id DESC) AS n
         FROM ticks)
       WHERE n = 1
       ORDER BY role`,
		)
		.all() as {
		role: string;
		started_at: string;
		ended_at: string | null;
		outcome: string | null;
	}[];
	return rows.map((r) =>
		r.ended_at === null
			? `last-tick ${r.role} running since ${r.started_at}`
			: `last-tick ${r.role} ${r.outcome} at ${r.ended_at}`,
	);
}

function statusAlarms(db: Database): string[] {
	const rows = db
		.query(
			"SELECT kind, ref, detail, raised_at FROM alarms WHERE cleared_at IS NULL ORDER BY id",
		)
		.all() as {
		kind: string;
		ref: string;
		detail: string;
		raised_at: string;
	}[];
	return rows.map(
		(r) => `alarm ${r.kind} ${r.ref} ${r.detail} since ${r.raised_at}`,
	);
}

function statusLeads(db: Database): string[] {
	const rows = db
		.query(
			`SELECT m.department, count(*) AS n ${LEAD_ORIGIN_FROM} AND i.state = 'OPEN'
       GROUP BY m.department ORDER BY m.department`,
		)
		.all() as { department: string | null; n: number }[];
	return rows.length === 0
		? ["leads 0"]
		: rows.map((r) => `leads ${r.department ?? "-"} ${r.n}`);
}

export function status(args: string[]): void {
	if (args.length > 0) throw usage("status");
	withDb((db) => {
		const sections = [
			statusOrders,
			statusQueue,
			statusTicks,
			statusAlarms,
			statusLeads,
		];
		for (const section of sections) for (const line of section(db)) out(line);
	});
}

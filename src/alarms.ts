import type { Database } from "bun:sqlite";
import { usage } from "./args";
import {
	CLAIM_TTL_MS,
	HOUR_MS,
	inTransaction,
	isoSeconds,
	LEAD_ORIGIN_FROM,
	LEAD_PREFIX,
	MINUTE_MS,
	now,
	out,
	withDb,
} from "./db";

const ORDER_UNTAKEN_MS = 48 * HOUR_MS;
const TICK_HUNG_MS = 2 * HOUR_MS;
const ROLE_SILENT_INTERVALS = 3;
const TICK_FAILING_RUN = 3;
const ALARM_REPEAT_MS = 24 * HOUR_MS;

type Candidate = { kind: string; ref: string; detail: string };
type Pause = { started_at: string; ended_at: string | null };
type Clock = { nowMs: number; pauses: Pause[] };

function pausedMs(clock: Clock, sinceMs: number): number {
	return clock.pauses.reduce((sum, p) => {
		const end =
			p.ended_at === null
				? clock.nowMs
				: Math.min(Date.parse(p.ended_at), clock.nowMs);
		return sum + Math.max(0, end - Math.max(Date.parse(p.started_at), sinceMs));
	}, 0);
}

// time spent paused does not age anything
function ageMs(clock: Clock, since: string): number {
	const sinceMs = Date.parse(since);
	return clock.nowMs - sinceMs - pausedMs(clock, sinceMs);
}

function orderUntaken(db: Database, clock: Clock): Candidate[] {
	const open = db
		.query(
			"SELECT id, precinct, role, at, taken_at FROM dispatches WHERE outcome IS NULL",
		)
		.all() as {
		id: number;
		precinct: string;
		role: string;
		at: string;
		taken_at: string | null;
	}[];
	const limit = (o: { taken_at: string | null }) =>
		ORDER_UNTAKEN_MS + (o.taken_at === null ? 0 : CLAIM_TTL_MS);
	return open
		.filter((o) => ageMs(clock, o.taken_at ?? o.at) > limit(o))
		.map((o) => ({
			kind: "order-untaken",
			ref: String(o.id),
			detail: `${o.precinct} ${o.role} ordered ${o.at}`,
		}));
}

function tickHung(db: Database, clock: Clock): Candidate[] {
	const open = db
		.query("SELECT id, role, started_at FROM ticks WHERE ended_at IS NULL")
		.all() as {
		id: number;
		role: string;
		started_at: string;
	}[];
	return open
		.filter((t) => ageMs(clock, t.started_at) > TICK_HUNG_MS)
		.map((t) => ({
			kind: "tick-hung",
			ref: String(t.id),
			detail: `${t.role} started ${t.started_at}`,
		}));
}

function roleSilent(db: Database, clock: Clock): Candidate[] {
	const latest = db
		.query(
			`SELECT r.name, r.every_minutes, max(t.started_at) AS last FROM roles r
       JOIN ticks t ON t.role = r.name
       WHERE EXISTS (SELECT 1 FROM ticks e WHERE e.role = r.name AND e.ended_at IS NOT NULL)
       GROUP BY r.name`,
		)
		.all() as { name: string; every_minutes: number; last: string }[];
	return latest
		.filter(
			(r) =>
				ageMs(clock, r.last) >
				ROLE_SILENT_INTERVALS * r.every_minutes * MINUTE_MS,
		)
		.map((r) => ({
			kind: "role-silent",
			ref: r.name,
			detail: `last tick started ${r.last}`,
		}));
}

function tickFailing(db: Database): Candidate[] {
	const failing = db
		.query(
			`WITH ranked AS (
         SELECT role, COALESCE(precinct, '-') AS precinct, outcome,
                ROW_NUMBER() OVER (PARTITION BY role, COALESCE(precinct, '-') ORDER BY ended_at DESC, id DESC) AS n
         FROM ticks WHERE ended_at IS NOT NULL)
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

function brokenLead(db: Database): Candidate[] {
	const broken = db
		.query(
			`SELECT precinct, issue FROM issues i
       WHERE substr(title, 1, ${LEAD_PREFIX.length}) = '${LEAD_PREFIX}' AND state = 'OPEN'
         AND NOT EXISTS (
           SELECT 1 FROM markers m WHERE m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead')
       ORDER BY precinct, issue`,
		)
		.all() as { precinct: string; issue: number }[];
	return broken.map((b) => ({
		kind: "broken-lead",
		ref: `${b.precinct}#${b.issue}`,
		detail: `title starts with ${LEAD_PREFIX} but no lead marker`,
	}));
}

const DETECTORS = [
	orderUntaken,
	tickHung,
	roleSilent,
	tickFailing,
	brokenLead,
] as ((db: Database, clock: Clock) => Candidate[])[];

type OpenAlarm = {
	id: number;
	kind: string;
	ref: string;
	detail: string;
	notified_at: string;
};

const alarmKey = (a: { kind: string; ref: string }) => `${a.kind} ${a.ref}`;
const alarmLine = (a: Candidate) => `ALARM ${a.kind} ${a.ref} ${a.detail}`;

function reconcileAlarms(
	db: Database,
	stamp: string,
	repeat: boolean,
): string[] {
	const nowMs = Date.parse(stamp);
	const pauses = db
		.query("SELECT started_at, ended_at FROM pauses")
		.all() as Pause[];
	const wanted = DETECTORS.flatMap((detect) => detect(db, { nowMs, pauses }));
	const open = db
		.query(
			"SELECT id, kind, ref, detail, notified_at FROM alarms WHERE cleared_at IS NULL ORDER BY id",
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
			"INSERT INTO alarms (kind, ref, detail, raised_at, notified_at) VALUES (?, ?, ?, ?, ?)",
			[w.kind, w.ref, w.detail, stamp, stamp],
		);
		lines.push(alarmLine(w));
	}
	const due = isoSeconds(new Date(nowMs - ALARM_REPEAT_MS));
	for (const o of open) {
		if (!repeat || !wantedKeys.has(alarmKey(o)) || o.notified_at >= due)
			continue;
		db.run("UPDATE alarms SET notified_at = ? WHERE id = ?", [stamp, o.id]);
		lines.push(alarmLine(o));
	}
	return lines;
}

export function alarm(args: string[]): void {
	const text = "alarm [--repeat]";
	if (args.length > 1 || (args.length === 1 && args[0] !== "--repeat"))
		throw usage(text);
	const stamp = now();
	withDb((db) => {
		for (const line of inTransaction(db, () =>
			reconcileAlarms(db, stamp, args.length === 1),
		))
			out(line);
	});
}

function statusPrecincts(db: Database): string[] {
	const rows = db
		.query(
			"SELECT name, weight, credit, synced_at FROM precincts ORDER BY name",
		)
		.all() as {
		name: string;
		weight: number;
		credit: number;
		synced_at: string | null;
	}[];
	return rows.map(
		(r) =>
			`precinct ${r.name} weight=${r.weight} credit=${r.credit} synced=${r.synced_at ?? "never"}`,
	);
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

function statusTicks(db: Database): string[] {
	const rows = db
		.query(
			`SELECT role, started_at, ended_at, outcome FROM ticks t
       WHERE id = (SELECT id FROM ticks WHERE role = t.role ORDER BY started_at DESC, id DESC LIMIT 1)
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

function statusPause(db: Database): string[] {
	const open = db
		.query("SELECT started_at FROM pauses WHERE ended_at IS NULL")
		.get() as { started_at: string } | null;
	return open ? [`pause since ${open.started_at}`] : [];
}

export function status(args: string[]): void {
	if (args.length > 0) throw usage("status");
	withDb((db) => {
		const sections = [
			statusPrecincts,
			statusOrders,
			statusTicks,
			statusAlarms,
			statusLeads,
			statusPause,
		];
		for (const section of sections) for (const line of section(db)) out(line);
	});
}

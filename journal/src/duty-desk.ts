import type { Database } from "bun:sqlite";
import { isFresh, reconcileAlarms } from "./alarms";
import { check, count, fits, parseArgs, usage } from "./args";
import { consents, licensesAllowed } from "./consent";
import { type Lack, lackingPrecincts, lackOf, SLUG } from "./constitution";
import { EXIT, Fail, inTransaction, now, out, withDb } from "./db";
import {
	departmentNames,
	departmentPage,
	listSharedPages,
	type PageRead,
} from "./department-page";
import { PATROL, type Taken, takeableOrders } from "./dispatch";
import { dueEntries } from "./due";
import { orderLine, readConfig } from "./input-files";
import { framed } from "./input-parts";
import { DUTY_DESK, ROLES } from "./input-roles";
import { intakeWaiting } from "./intake";
import { configValue } from "./law-sync";
import { lawCheck, lawVersion } from "./law-version";
import { lintPage } from "./lint";
import { asciiLower, stripCr } from "./markers";
import { type Operated, operate } from "./operations";
import { rotationOrder } from "./rotation";
import { JOBS } from "./settings";
import { stageFor } from "./tick-start";

const START_USAGE =
	"tick start --role <r> --order <id>|tick start --role duty-desk";
const CONTINUE_USAGE = "tick continue <id>";
const CONSTITUTION = "LAWMAN.md";
const RESPONSE_UNIT = "response-unit";
// the roles whose orders come from the cases and the pull requests
const CASE_ROLES = [
	"investigation",
	"prosecutor",
	"defender",
	"court",
	"clerk",
	"spec-writer",
	"executor",
];

type Tick = { id: number; started: string };
type Precinct = {
	name: string;
	repo: string;
	synced_at: string | null;
	pulls_synced_at: string | null;
};
type Reading = { revision: string; files: string; lines: string[] };
// What one read of a precinct found. `cause` is the recorded lack of an unusable constitution.
// A read that failed before the constitution has neither a reading nor a cause.
type Read = { reading: Reading | null; cause: Lack | null };
type Visit = Read & { department: string | null };
type Written = Taken & { role: string };

const call = (args: string[], author = "") => ({ args, author, reset: false });
const firstLine = (r: Operated) =>
	r.blocks[0] !== undefined && "line" in r.blocks[0] ? r.blocks[0].line : "";
const empty = (r: Operated) => r.text === null && r.code === EXIT.OK;
const listed = (files: string, path: string) =>
	files.split("\n").map(stripCr).includes(path);

const weighted = () =>
	withDb(
		(db) =>
			db
				.query(
					"SELECT name, repo, synced_at, pulls_synced_at FROM precincts WHERE weight > 0 ORDER BY name",
				)
				.all() as Precinct[],
	);

function print(t: Tick, lines: string[]): number {
	out(framed([lines], () => `role=${DUTY_DESK} tick=${t.id}`)[0] ?? "");
	return EXIT.OK;
}

function ended(
	t: Tick,
	alarms: string[],
	outcome: string,
	report: string,
): number {
	withDb((db) =>
		db.run(
			"UPDATE ticks SET ended_at = ?, outcome = ?, report = ? WHERE id = ? AND ended_at IS NULL",
			[now(), outcome, report, t.id],
		),
	);
	return print(t, [...alarms, `ended ${outcome}`, `report ${report}`]);
}

// The shared department pages of the law. A failed listing leaves none and says so.
function sharedPages(blockers: string[]): string[] {
	try {
		return listSharedPages();
	} catch {
		blockers.push("shared department pages: the listing failed");
		return [];
	}
}

// The fetch and the constitution of one precinct. No reading, with the cause in Blockers, when either fails.
async function readPrecinct(p: string, blockers: string[]): Promise<Read> {
	const unread: Read = { reading: null, cause: null };
	const lacking = (cause: Lack): Read => {
		blockers.push(`${p}: ${SLUG[cause]}`);
		return { reading: null, cause };
	};
	const fetched = await operate(p, "fetch", call([]));
	if (fetched.text === null) {
		blockers.push(`${p}: ${firstLine(fetched)}`);
		return unread;
	}
	const revision = fetched.text.replace(/\r?\n$/, "");
	const files = await operate(p, "files", call([revision]));
	if (files.text === null) {
		blockers.push(`${p}: ${firstLine(files)}`);
		return unread;
	}
	if (!listed(files.text, CONSTITUTION)) return lacking("missing");
	const file = await operate(p, "file", call([revision, CONSTITUTION]));
	if (file.text === null) {
		blockers.push(`${p}: constitution ${firstLine(file)}`);
		return unread;
	}
	const lint = lintPage("constitution", file.text);
	if (lint.reasons.length > 0) return lacking(lackOf(lint.reasons));
	return {
		reading: {
			revision,
			files: files.text,
			lines: lint.departments.map(([name]) => name),
		},
		cause: null,
	};
}

// the precinct place through the host operations
const hostRead =
	(p: string, reading: Reading, d: string) => async (): Promise<PageRead> => {
		const own = `.lawman/departments/${d}.md`;
		if (!listed(reading.files, own)) return { kind: "none" };
		const file = await operate(p, "file", call([reading.revision, own]));
		return file.text === null
			? { kind: "failed", why: firstLine(file) }
			: { kind: "page", text: file.text };
	};

// The department that has waited longest and can take a lead, as the rotation walks it.
async function chooseDepartment(
	p: string,
	reading: Reading,
	shared: string[],
	config: string | null,
	blockers: string[],
): Promise<string | null> {
	for (const d of [...shared, ...reading.lines])
		if (!fits("department", d))
			blockers.push(`${p}: a department name outside its class`);
	const names = departmentNames(shared, reading.lines).filter((d) =>
		fits("department", d),
	);
	const turns = withDb((db) => rotationOrder(db, p, PATROL, names));
	let capped = false;
	for (const { department: d, cap } of turns) {
		const found = await departmentPage(d, hostRead(p, reading, d));
		if (found.kind === "failed")
			blockers.push(`${p}: department ${d} ${found.why}`);
		if (found.kind === "none")
			blockers.push(`${p}: department ${d} has no page`);
		if (found.kind !== "page") continue;
		const { page, lint } = found;
		if (lint.reasons.length > 0) {
			blockers.push(`${p}: department ${d} page check failed`);
			continue;
		}
		// a law clone page of licenses without the precinct's consent counts as capped
		const consented = licensesAllowed(
			d,
			page.place,
			consents(config, p, "license_precincts"),
		);
		if (consented && (cap > 0 || lint.alarmCheck)) return d;
		capped = true;
	}
	if (!capped) blockers.push(`${p}: skipped-bad-department`);
	return null;
}

const openPatrolOrder = (p: string) =>
	withDb(
		(db) =>
			db
				.query(
					"SELECT 1 FROM dispatches WHERE precinct = ? AND role = ? AND issue IS NULL AND outcome IS NULL",
				)
				.get(p, PATROL) !== null,
	);

// Closes the open orders that nobody took and that no role needs any more; the role of a
// taken order closes it on its own tick. An order is not needed when its stale rule says so,
// or when its role reads the constitution of a precinct that lacks one.
function closeUnneeded(
	db: Database,
	eligible: Set<string>,
	lacking: Set<string>,
	stamp: string,
): Map<string, number> {
	const closed = new Map<string, number>();
	const close = db.query(
		`UPDATE dispatches SET outcome = 'silent', closed_at = ?1
     WHERE id = ?2 AND outcome IS NULL AND taken_at IS NULL`,
	);
	const unneeded = (role: string, o: Taken): boolean => {
		if (ROLES[role]?.constitution && lacking.has(o.precinct)) return true;
		const input = ROLES[role];
		if (input?.stale === undefined) return false;
		const stage = stageFor(db, input, o);
		return stage !== null && input.stale(stage);
	};
	for (const role of Object.keys(ROLES))
		for (const o of takeableOrders(db, role))
			if (
				eligible.has(o.precinct) &&
				unneeded(role, o) &&
				close.run(stamp, o.id).changes > 0
			)
				closed.set(role, (closed.get(role) ?? 0) + 1);
	return closed;
}

// One order per case, pull request, waiting issue and patrol visit that needs a role.
// The open-order index is the only bar: a repeat writes nothing.
function writeOrders(
	db: Database,
	precincts: Precinct[],
	visits: Map<string, Visit>,
	lacking: Set<string>,
	stamp: string,
): Written[] {
	const repo = new Map(precincts.map((p) => [p.name, p.repo]));
	const insert = db.query(
		`INSERT INTO dispatches (at, precinct, role, department, issue) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
	);
	const written: Written[] = [];
	const add = (
		precinct: string,
		role: string,
		department: string | null,
		issue: number | null,
	) => {
		const r = insert.run(stamp, precinct, role, department, issue);
		if (r.changes > 0)
			written.push({
				id: Number(r.lastInsertRowid),
				precinct,
				repo: repo.get(precinct) ?? "",
				department,
				issue,
				role,
			});
	};
	// a role that cannot work without the constitution gets no order on a precinct that lacks one
	const mayOrder = (role: string, precinct: string) =>
		!(ROLES[role]?.constitution && lacking.has(precinct));
	for (const role of CASE_ROLES)
		for (const e of dueEntries(db, role))
			if (visits.has(e.precinct) && mayOrder(role, e.precinct))
				add(e.precinct, role, null, e.number);
	for (const [p, v] of visits)
		if (v.reading !== null)
			for (const n of intakeWaiting(db, p)) add(p, RESPONSE_UNIT, null, n);
	for (const [p, v] of visits)
		if (v.department !== null) add(p, PATROL, v.department, null);
	return written;
}

const roleCounts = (counts: Map<string, number>) =>
	Object.keys(JOBS)
		.map((role) => `${role} ${counts.get(role) ?? 0}`)
		.join(", ");

// Steps 5 to 8: read the eligible precincts, close the stale orders, write the orders, end the tick.
// `failed` holds the first line of the sync that failed at a precinct, which the continuation has none of.
async function finish(
	t: Tick,
	config: string | null,
	known: string[] = [],
	failed = new Map<string, string>(),
): Promise<number> {
	const precincts = weighted();
	const blockers: string[] = [...known];
	const visits = new Map<string, Visit>();
	const fresh = new Set<string>();
	const shared = sharedPages(blockers);
	for (const p of precincts) {
		if (!isFresh(p, t.started)) {
			const why = failed.get(p.name);
			blockers.push(
				`${p.name}: not synced in this tick, issues ${p.synced_at ?? "never"}, pulls ${p.pulls_synced_at ?? "never"}${why === undefined ? "" : `: ${why}`}`,
			);
			continue;
		}
		fresh.add(p.name);
		const read = await readPrecinct(p.name, blockers);
		const department =
			read.reading === null || openPatrolOrder(p.name)
				? null
				: await chooseDepartment(
						p.name,
						read.reading,
						shared,
						config,
						blockers,
					);
		visits.set(p.name, { ...read, department });
	}
	const stamp = now();
	const done = withDb((db) =>
		inTransaction(db, () => {
			// the cause stays as it was where a failed command hid the constitution
			for (const [name, v] of visits)
				if (v.reading !== null || v.cause !== null)
					db.run("UPDATE precincts SET constitution_cause = ? WHERE name = ?", [
						v.cause,
						name,
					]);
			const alarms = reconcileAlarms(db, stamp, true, fresh);
			const lacking = lackingPrecincts(db);
			const closed = closeUnneeded(db, new Set(visits.keys()), lacking, stamp);
			const written = writeOrders(db, precincts, visits, lacking, stamp);
			const byRole = new Map<string, number>();
			for (const o of written)
				byRole.set(o.role, (byRole.get(o.role) ?? 0) + 1);
			const outcome = written.length > 0 ? "ordered" : "silent";
			const report = [
				`Coverage: orders: ${roleCounts(byRole)}; closed stale: ${roleCounts(closed)}; precincts: ${[...visits.keys()].join(", ") || "none"}`,
				"Candidates: none. The duty desk analyses nothing.",
				"Filed: Filed nothing.",
				"Strongest rejected: none.",
				`Blockers: ${blockers.join("; ") || "none"}`,
			];
			const changed = db.run(
				"UPDATE ticks SET ended_at = ?, outcome = ?, report = ? WHERE id = ? AND ended_at IS NULL",
				[stamp, outcome, report.join("\n"), t.id],
			).changes;
			if (changed === 0)
				throw new Fail(EXIT.USAGE, `no open tick with id ${t.id}`);
			return { alarms, written, outcome, report };
		}),
	);
	return print(t, [
		...done.alarms,
		...done.written.map(orderLine),
		`ended ${done.outcome}`,
		...done.report.map((line) => `report ${line}`),
	]);
}

export async function dutyDeskStart(args: string[]): Promise<number> {
	const { opt } = parseArgs(args, 0, ["role"], START_USAGE);
	if (check("role", opt.role) !== DUTY_DESK) throw usage(START_USAGE);
	const stamp = now();
	const t: Tick = {
		started: stamp,
		id: withDb((db) =>
			Number(
				db.run("INSERT INTO ticks (role, started_at) VALUES (?, ?)", [
					DUTY_DESK,
					stamp,
				]).lastInsertRowid,
			),
		),
	};
	// an end before the sync has no fresh host data, so it prints the journal alarms only
	const early = (outcome: string, report: string) =>
		ended(
			t,
			withDb((db) =>
				inTransaction(db, () => reconcileAlarms(db, stamp, true, new Set())),
			),
			outcome,
			report,
		);
	const config = readConfig();
	if (config === null) return early("failed", "config.yaml is missing");
	const login = configValue(config, "trusted_login");
	if (login === undefined || !fits("login", login))
		return early("failed", "config.yaml has no trusted_login");
	const law = await lawCheck(config);
	if (law !== "current" && law !== "self")
		return early(law.outcome, law.report);
	const selfs: string[] = law === "self" ? ["self law-version"] : [];
	const failed = new Map<string, string>();
	for (const p of weighted()) {
		const step = (name: string) =>
			selfs.push(`self ${name} ${p.name} ${p.repo}`);
		const who = await operate(p.name, "identity", call([]));
		if (who.text === null) step("identity");
		else {
			const seen = who.text.replace(/\r?\n$/, "");
			if (asciiLower(seen) !== asciiLower(login))
				return early(
					"stopped-identity-changed",
					`Host identity changed at ${p.name}: ${seen}`,
				);
		}
		// a failed sync keeps the old time, so the precinct gets no orders and the others go on
		for (const kind of ["issues", "pulls"] as const) {
			const synced = await operate(p.name, kind, call([], login));
			if (empty(synced)) step(kind);
			else if (synced.text === null && !failed.has(p.name))
				failed.set(p.name, firstLine(synced));
		}
	}
	if (selfs.length > 0) return print(t, selfs);
	return finish(t, config, [], failed);
}

type TickRow = { role: string; started_at: string; ended_at: string | null };

export async function dutyDeskContinue(args: string[]): Promise<number> {
	const { pos } = parseArgs(args, 1, [], CONTINUE_USAGE);
	const id = count(pos[0], "id", 1);
	const row = withDb(
		(db) =>
			db
				.query("SELECT role, started_at, ended_at FROM ticks WHERE id = ?")
				.get(id) as TickRow | null,
	);
	if (row === null || row.ended_at !== null || row.role !== DUTY_DESK)
		throw new Fail(EXIT.USAGE, `no open tick with id ${id} for this role`);
	const t: Tick = { id, started: row.started_at };
	// the self step of a failing `law-version` command is no stop, so the report names it
	const failing =
		(await lawVersion()) === "failed" ? ["law-version command failed"] : [];
	return finish(t, readConfig(), failing);
}

import type { Database } from "bun:sqlite";
import { reconcileAlarms } from "./alarms";
import { check, count, fits, parseArgs, usage } from "./args";
import { consents, licensesAllowed } from "./consent";
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
import { lawCheck } from "./law-version";
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
// lacks: why the constitution is unusable, null when it is usable or the read failed before it
type Visit = {
	reading: Reading | null;
	department: string | null;
	lacks: string | null;
};
type Visited = { reading: Reading | null; lacks: string | null };
type Written = Taken & { role: string };

const call = (args: string[], author = "") => ({ args, author, reset: false });
const firstLine = (r: Operated) =>
	r.blocks[0] !== undefined && "line" in r.blocks[0] ? r.blocks[0].line : "";
// the texts a sync line says it held back, named as the line names them
const uncleaned = (r: Operated) =>
	firstLine(r)
		.match(/ uncleaned=(\S+)/)?.[1]
		?.split(",") ?? [];
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
// A constitution that is missing or fails its check is named in `lacks`; a failed command is not.
async function readPrecinct(p: string, blockers: string[]): Promise<Visited> {
	const fetched = await operate(p, "fetch", call([]));
	if (fetched.text === null) {
		blockers.push(`${p}: ${firstLine(fetched)}`);
		return { reading: null, lacks: null };
	}
	const revision = fetched.text.replace(/\r?\n$/, "");
	const files = await operate(p, "files", call([revision]));
	if (files.text === null) {
		blockers.push(`${p}: ${firstLine(files)}`);
		return { reading: null, lacks: null };
	}
	if (!listed(files.text, CONSTITUTION)) {
		blockers.push(`${p}: skipped-no-constitution`);
		return { reading: null, lacks: "skipped-no-constitution" };
	}
	const file = await operate(p, "file", call([revision, CONSTITUTION]));
	if (file.text === null) {
		blockers.push(`${p}: constitution ${firstLine(file)}`);
		return { reading: null, lacks: null };
	}
	const lint = lintPage("constitution", file.text);
	if (lint.reasons.length > 0) {
		const token = lint.reasons.some((r) => r.includes("contract_version"))
			? "skipped-contract-version"
			: "skipped-bad-constitution";
		blockers.push(`${p}: ${token}`);
		return { reading: null, lacks: token };
	}
	return {
		reading: {
			revision,
			files: files.text,
			lines: lint.departments.map(([name]) => name),
		},
		lacks: null,
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

// Closes the open stale orders that nobody took; the role of a taken order
// closes it on its own tick. An untaken order of a role that needs the
// constitution is closed too on a precinct that lacks one.
function closeStale(
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
	for (const [role, input] of Object.entries(ROLES)) {
		for (const o of takeableOrders(db, role)) {
			if (!eligible.has(o.precinct)) continue;
			if (!(input.constitution && lacking.has(o.precinct))) {
				if (input.stale === undefined) continue;
				const stage = stageFor(db, input, o);
				if (stage === null || !input.stale(stage)) continue;
			}
			if (close.run(stamp, o.id).changes > 0)
				closed.set(role, (closed.get(role) ?? 0) + 1);
		}
	}
	return closed;
}

// One order per case, pull request, waiting issue and patrol visit that needs a role.
// The open-order index is the only bar: a repeat writes nothing.
function writeOrders(
	db: Database,
	precincts: Precinct[],
	visits: Map<string, Visit>,
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
	const needs = (role: string, precinct: string) =>
		!(ROLES[role]?.constitution && visits.get(precinct)?.lacks);
	for (const role of CASE_ROLES)
		for (const e of dueEntries(db, role))
			if (visits.has(e.precinct) && needs(role, e.precinct))
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
async function finish(
	t: Tick,
	alarms: string[],
	config: string | null,
	held: string[] = [],
): Promise<number> {
	const precincts = weighted();
	const blockers: string[] = [...held];
	const visits = new Map<string, Visit>();
	const shared = sharedPages(blockers);
	for (const p of precincts) {
		const synced =
			(p.synced_at ?? "") >= t.started &&
			(p.pulls_synced_at ?? "") >= t.started;
		if (!synced) {
			blockers.push(`${p.name}: pull request sync failed`);
			continue;
		}
		const { reading, lacks } = await readPrecinct(p.name, blockers);
		const department =
			reading === null || openPatrolOrder(p.name)
				? null
				: await chooseDepartment(p.name, reading, shared, config, blockers);
		visits.set(p.name, { reading, department, lacks });
	}
	const stamp = now();
	const done = withDb((db) =>
		inTransaction(db, () => {
			// the cause stays as it was where a failed command hid the constitution
			for (const [name, v] of visits)
				if (v.reading !== null || v.lacks !== null)
					db.run("UPDATE precincts SET constitution_cause = ? WHERE name = ?", [
						v.lacks,
						name,
					]);
			const raised = reconcileAlarms(db, stamp, false);
			const lacking = new Set(
				[...visits].filter(([, v]) => v.lacks !== null).map(([name]) => name),
			);
			const closed = closeStale(db, new Set(visits.keys()), lacking, stamp);
			const written = writeOrders(db, precincts, visits, stamp);
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
			return { written, outcome, report, raised };
		}),
	);
	return print(t, [
		...alarms,
		...done.raised,
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
	const alarms = withDb((db) =>
		inTransaction(db, () => reconcileAlarms(db, stamp, true)),
	);
	const config = readConfig();
	if (config === null)
		return ended(t, alarms, "failed", "config.yaml is missing");
	const login = configValue(config, "trusted_login");
	if (login === undefined || !fits("login", login))
		return ended(t, alarms, "failed", "config.yaml has no trusted_login");
	const law = await lawCheck(config);
	if (law !== "current" && law !== "self")
		return ended(t, alarms, law.outcome, law.report);
	const selfs: string[] = law === "self" ? ["self law-version"] : [];
	const held: string[] = [];
	for (const p of weighted()) {
		const step = (name: string) =>
			selfs.push(`self ${name} ${p.name} ${p.repo}`);
		const who = await operate(p.name, "identity", call([]));
		if (who.text === null) step("identity");
		else {
			const seen = who.text.replace(/\r?\n$/, "");
			if (asciiLower(seen) !== asciiLower(login))
				return ended(
					t,
					alarms,
					"stopped-identity-changed",
					`Host identity changed at ${p.name}: ${seen}`,
				);
		}
		const issues = await operate(p.name, "issues", call([], login));
		if (empty(issues)) step("issues");
		else if (issues.text === null)
			return ended(
				t,
				alarms,
				"stopped-sync",
				`Tracker sync failed at ${p.name}: ${firstLine(issues)}`,
			);
		// a failed pull request sync keeps the old time, so the precinct gets no orders
		const pulls = await operate(p.name, "pulls", call([], login));
		if (empty(pulls)) step("pulls");
		const names = [...uncleaned(issues), ...uncleaned(pulls)];
		if (names.length > 0)
			held.push(`${p.name}: texts withheld, not cleaned: ${names.join(" ")}`);
	}
	if (selfs.length > 0) return print(t, [...alarms, ...selfs]);
	return finish(t, alarms, config, held);
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
	// a tracker that no sync of this tick refreshed stops the tick, as a failed sync does
	const stale = weighted().filter((p) => (p.synced_at ?? "") < t.started);
	if (stale.length > 0)
		return ended(
			t,
			[],
			"stopped-sync",
			`Tracker not synced in this tick: ${stale.map((p) => p.name).join(", ")}`,
		);
	return finish(t, [], readConfig());
}

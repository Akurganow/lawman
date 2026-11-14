import type { Database } from "bun:sqlite";
import { isFresh, reconcileAlarms, type Synced } from "./alarms";
import {
	check,
	count,
	fits,
	parseArgs,
	parsePart,
	partOutOfRange,
} from "./args";
import { CleanFailed, printCached, type TextKind as Text } from "./cache-text";
import { caseStage } from "./cases";
import { cleanCharacters } from "./clean";
import { lackOf, SLUG } from "./constitution";
import { EXIT, Fail, inTransaction, now, open, out, withDb } from "./db";
import { type PageRead, pageAt, placeNumber } from "./department-page";
import { type Taken, takeableOrders, takeOrder } from "./dispatch";
import { inputChars, orderLine, readConfig } from "./input-files";
import { type Block, fencedBlock, framed, pack, render } from "./input-parts";
import { inputOf, type RoleInput, type StageFields } from "./input-roles";
import { intakeStage } from "./intake";
import { configValue } from "./law-sync";
import { lawCheck } from "./law-version";
import { urlOf } from "./link";
import { lintPage, type PageKind, pageLines } from "./lint";
import { asciiLower, stripCr } from "./markers";
import { empty, operate } from "./operations";
import {
	DISMISSAL,
	departmentsField,
	type Header,
	headerOf,
	serves,
} from "./precedent-file";
import { pullLine, stageOf } from "./pull-stage";

const TICK_INPUT_USAGE = "tick input (<id> [--part <k>]|--role <r> --part <k>)";
const START_USAGE = "tick start --role <r> --order <id>";
const NONE = "-";
const CONSTITUTION = "LAWMAN.md";
const PRECEDENTS = ".lawman/precedents/";
const SELF_PRECEDENTS = `precedents ${PRECEDENTS}`;
// an ended tick prints no foreign text, only the lines that explain the end
const CASE_TEXTS = [
	"title",
	"constitution",
	"department",
	"precedent",
	"issue",
	"pull",
	"comment",
];
const SYNC_STEPS = ["fetch", "issues", "pulls"];
const CACHES = ["issues", "pulls"] as const;

type Stage = StageFields & { department: string; pull: string; line: string };
type Tick = { id: number; role: string };

// the stage of an order from the cache, null when the cache cannot give it
export function stageFor(
	db: Database,
	input: RoleInput,
	o: Taken,
): Stage | null {
	const n = o.issue ?? 0;
	try {
		if (input.stage === "case") return caseStage(db, o.precinct, n);
		if (input.stage === "intake")
			return {
				...intakeStage(db, o.precinct, n),
				department: NONE,
				pull: NONE,
			};
		if (input.stage === "pull") {
			const s = stageOf(db, o.precinct, n);
			return {
				need: s.need,
				state: NONE,
				department: NONE,
				pull: NONE,
				line: pullLine(s),
			};
		}
	} catch (e) {
		if (e instanceof Fail && e.code === EXIT.USAGE) return null;
		throw e;
	}
	return null;
}

// The stage line of a case order and, after it, the link of its issue or pull request when
// the cache holds one. A role copies the link onto the alarm it prints about that case.
function caseLines(
	db: Database,
	input: RoleInput,
	o: Taken,
	stage: Stage,
): string[] {
	const url =
		o.issue === null
			? null
			: urlOf(
					db,
					o.precinct,
					input.number === "pull" ? "pull" : "issue",
					o.issue,
				);
	return url === null
		? [stage.line]
		: [stage.line, `link ${o.precinct}#${o.issue} ${url}`];
}

// the issue or the pull request whose text the role reads, by the table
function textsOf(
	input: RoleInput,
	o: Taken,
	stage: Stage | null,
): [Text, number][] {
	return input.texts.flatMap((kind): [Text, number][] => {
		// the order's number is the issue, or the pull request of a pull request role;
		// the clerk's pull request comes from the stage
		if (kind === "issue" || input.number === "pull")
			return o.issue === null ? [] : [[kind, o.issue]];
		const pull = stage?.pull ?? NONE;
		return pull === NONE ? [] : [[kind, Number(pull)]];
	});
}

async function characters(text: string): Promise<string | null> {
	try {
		return await cleanCharacters(text);
	} catch {
		return null;
	}
}

// the title passes the character layer, the bodies the whole cleaning, as PR 2 prints them
async function caseTexts(
	db: Database,
	precinct: string,
	texts: [Text, number][],
	size: number,
): Promise<{ blocks: Block[]; selfs: string[] }> {
	const blocks: Block[] = [];
	const selfs: string[] = [];
	for (const [kind, n] of texts) {
		const title =
			kind === "issue"
				? (db
						.query("SELECT title FROM issues WHERE precinct = ? AND issue = ?")
						.get(precinct, n) as { title: string } | null)
				: null;
		const cleanTitle = title === null ? null : await characters(title.title);
		let cached: Block[] | null = null;
		try {
			cached = await printCached(db, precinct, kind, n, size);
		} catch (e) {
			if (!(e instanceof CleanFailed)) throw e;
		}
		if (cached === null || (kind === "issue" && cleanTitle === null)) {
			selfs.push(`${kind} ${n}`);
			continue;
		}
		if (cleanTitle !== null) blocks.push(fencedBlock("title", cleanTitle));
		blocks.push(...cached);
	}
	return { blocks, selfs };
}

async function withDbAsync<T>(body: (db: Database) => Promise<T>): Promise<T> {
	const db = open();
	try {
		return await body(db);
	} finally {
		db.close();
	}
}

class Output {
	readonly blocks: Block[] = [];
	readonly selfs: string[] = [];
	add(...blocks: Block[]) {
		this.blocks.push(...blocks);
	}
	line(line: string) {
		this.blocks.push({ line });
	}
	// the alarms lead the group
	lead(lines: string[]) {
		this.blocks.unshift(...lines.map((line) => ({ line })));
	}
	all(): Block[] {
		return [...this.blocks, ...this.selfs.map((s) => ({ line: `self ${s}` }))];
	}
}

function storeParts(t: Tick, blocks: Block[], size: number): string[] {
	const parts = framed(pack(blocks, size), () => `role=${t.role} tick=${t.id}`);
	withDb((db) =>
		db.run("UPDATE ticks SET parts = ? WHERE id = ?", [
			JSON.stringify(parts),
			t.id,
		]),
	);
	return parts;
}

const withoutCaseTexts = (blocks: Block[]) =>
	blocks.filter((b) => !("label" in b && CASE_TEXTS.includes(b.label)));

// One part, whatever its size: the journal ended the tick, the role only answers.
function ended(
	t: Tick,
	o: Output,
	outcome: string,
	report: string,
	order: number | null,
): number {
	const stamp = now();
	withDb((db) =>
		inTransaction(db, () => {
			db.run(
				"UPDATE ticks SET ended_at = ?, outcome = ?, report = ?, parts = NULL WHERE id = ? AND ended_at IS NULL",
				[stamp, outcome, report, t.id],
			);
			if (order !== null)
				db.run(
					"UPDATE dispatches SET outcome = ?, closed_at = ? WHERE id = ? AND outcome IS NULL",
					[outcome, stamp, order],
				);
		}),
	);
	const lines = [
		...withoutCaseTexts(o.blocks).flatMap(render),
		`ended ${outcome}`,
		`report ${report}`,
	];
	out(framed([lines], () => `role=${t.role} tick=${t.id}`)[0] ?? "");
	return EXIT.OK;
}

const call = (args: string[], author = "") => ({ args, author, reset: false });

// The alarms of a group that is built from the cache, and a line for each sync of the
// precinct that this tick did not refresh. The host alarms of any other precinct stay silent.
function cacheHead(
	db: Database,
	p: string,
	started: string,
): { alarms: string[]; stale: string[] } {
	const row = (db
		.query("SELECT synced_at, pulls_synced_at FROM precincts WHERE name = ?")
		.get(p) as Synced | null) ?? { synced_at: null, pulls_synced_at: null };
	const at = { issues: row.synced_at, pulls: row.pulls_synced_at };
	return {
		alarms: reconcileAlarms(
			db,
			now(),
			false,
			isFresh(row, started) ? new Set([p]) : new Set(),
		),
		stale: CACHES.filter((k) => (at[k] ?? "") < started).map(
			(k) => `unsynced ${p} ${k} synced=${at[k] ?? "never"}`,
		),
	};
}

function fieldsFailure(input: RoleInput, order: Taken): string | null {
	if (input.number === "issue" && order.issue === null)
		return "The order has no issue number";
	if (input.number === "pull" && order.issue === null)
		return "The order has no pull request number";
	if (
		input.number === "department" &&
		(order.issue !== null || order.department === null)
	)
		return "The patrol order has an issue number or no department";
	return null;
}

const listed = (files: string, path: string) =>
	files.split("\n").map(stripCr).includes(path);

// The lint lines go in a fence of their own. Null when the cleaning failed.
async function lintedPage(
	o: Output,
	kind: PageKind,
	page: string,
	name?: string,
): Promise<{ passed: boolean; reasons: string[] } | null> {
	const lint = lintPage(kind, page, name);
	const passed = lint.reasons.length === 0;
	const lines = await characters(pageLines(lint).join("\n"));
	const text = passed ? await characters(page) : "";
	if (lines === null || text === null) return null;
	o.add(fencedBlock("lint", lines));
	if (passed) o.add(fencedBlock(kind, text));
	return { passed, reasons: lint.reasons };
}

// the department of the order or of the stage, `-` for any other source
const departmentFrom = (
	source: string | null,
	order: Taken,
	stage: Stage | null,
) =>
	source === "order"
		? (order.department ?? NONE)
		: source === "stage"
			? (stage?.department ?? NONE)
			: NONE;

const departmentOf = (input: RoleInput, order: Taken, stage: Stage | null) =>
	departmentFrom(input.department, order, stage);

const precedentsOf = (input: RoleInput, order: Taken, stage: Stage | null) =>
	input.precedents === null
		? null
		: departmentFrom(input.precedents, order, stage);

// the issues of the precinct whose lead is open or fixed, so a dismissal naming one does not apply
const liveIssues = (db: Database, precinct: string): Set<number> =>
	new Set(
		(
			db
				.query(
					"SELECT issue FROM issues WHERE precinct = ? AND (state = 'OPEN' OR (state = 'CLOSED' AND state_reason = 'COMPLETED'))",
				)
				.all(precinct) as { issue: number }[]
		).map((r) => r.issue),
	);

// Each direct file of the folder, by name, when it serves the department and the
// header passes. A file the journal cannot read leaves one self line, so the role
// reads the folder itself.
async function precedentBlocks(
	o: Output,
	p: string,
	revision: string,
	files: string | null,
	department: string,
	handed: (header: Header) => boolean,
): Promise<void> {
	if (files === null) {
		o.selfs.push(SELF_PRECEDENTS);
		return;
	}
	const names = files
		.split("\n")
		.map(stripCr)
		.filter((f) => f.startsWith(PRECEDENTS) && f.endsWith(".md"))
		.map((f) => f.slice(PRECEDENTS.length, -".md".length))
		.filter((name) => !name.includes("/"))
		.sort();
	let missed = false;
	let shown = 0;
	for (const name of names) {
		const path = `${PRECEDENTS}${name}.md`;
		if (!fits("precedent", name) || !fits("path", path)) {
			missed = true;
			continue;
		}
		const file = await operate(p, "file", call([revision, path]));
		if (file.text === null) {
			o.add(...file.blocks);
			missed = true;
			continue;
		}
		const header = headerOf(file.text);
		if (!serves(header.departments, department) || !handed(header)) continue;
		const text = await characters(file.text);
		if (text === null) {
			missed = true;
			continue;
		}
		o.line(
			`precedent ${name} kind=${header.kind} departments=${departmentsField(header.departments)}${header.kind === DISMISSAL ? ` finding=${header.finding ?? NONE}` : ""}`,
		);
		o.add(fencedBlock("precedent", text));
		shown++;
	}
	if (missed) o.selfs.push(SELF_PRECEDENTS);
	else if (shown === 0) o.line("precedents none");
}

export async function tickStart(args: string[]): Promise<number> {
	const { opt } = parseArgs(args, 0, ["role", "order"], START_USAGE);
	const role = check("role", opt.role);
	const id = count(opt.order, "order", 1);
	const input = inputOf(role);
	if (input === undefined)
		throw new Fail(EXIT.USAGE, `no tick input for role ${role}`);
	const stamp = now();
	const order = withDb((db) =>
		takeableOrders(db, role).find((x) => x.id === id),
	);
	if (order === undefined) {
		out(`order ${id} untakeable`);
		return EXIT.OK;
	}
	const config = readConfig();
	const size = inputChars(config);
	const t: Tick = {
		role,
		// the precinct is on the row from the start, so a stop before the take still counts on it
		id: withDb((db) =>
			Number(
				db.run(
					"INSERT INTO ticks (role, started_at, precinct, department) VALUES (?, ?, ?, ?)",
					[role, stamp, order.precinct, order.department],
				).lastInsertRowid,
			),
		),
	};
	const o = new Output();
	// an end before the sync has no fresh host data, so it prints the journal alarms only
	const stop = (
		outcome: string,
		report: string,
		closes: number | null = null,
	) => {
		o.lead(
			withDb((db) =>
				inTransaction(db, () => reconcileAlarms(db, stamp, false, new Set())),
			),
		);
		return ended(t, o, outcome, report, closes);
	};
	if (config === null) return stop("failed", "config.yaml is missing");
	const login = configValue(config, "trusted_login");
	if (login === undefined || !fits("login", login))
		return stop("failed", "config.yaml has no trusted_login");
	const law = await lawCheck(config);
	if (law === "self") o.selfs.push("law-version");
	else if (law !== "current") return stop(law.outcome, law.report);
	const p = order.precinct;
	const who = await operate(p, "identity", call([]));
	o.add(...who.blocks);
	if (who.text === null) o.selfs.push("identity");
	else {
		const seen = who.text.replace(/\r?\n$/, "");
		if (asciiLower(seen) !== asciiLower(login))
			return stop("stopped-identity-changed", `Host identity changed: ${seen}`);
	}
	const taken = withDb((db) =>
		inTransaction(db, () => {
			if (!takeOrder(db, role, id, stamp)) return false;
			db.run("UPDATE ticks SET dispatch = ? WHERE id = ?", [id, t.id]);
			return true;
		}),
	);
	if (!taken) return stop("silent", "No order.");
	o.line(orderLine(order));
	const fieldsFailed = fieldsFailure(input, order);
	if (fieldsFailed !== null) return stop("failed", fieldsFailed, id);
	const fetched = await operate(p, "fetch", call([]));
	o.add(...fetched.blocks);
	if (fetched.text === null) o.selfs.push("fetch");
	// a failed sync leaves the cache as it was; only a command the host lacks is a self step
	for (const kind of CACHES) {
		const synced = await operate(p, kind, call([], login));
		o.add(...synced.blocks);
		if (empty(synced)) o.selfs.push(kind);
	}
	const head = withDb((db) => inTransaction(db, () => cacheHead(db, p, stamp)));
	o.lead(head.alarms);
	// the role does these steps itself, then `tick input` builds the group from the cache
	if (o.selfs.some((s) => SYNC_STEPS.includes(s))) {
		out(
			framed([o.all().flatMap(render)], () => `role=${role} tick=${t.id}`)[0] ??
				"",
		);
		return EXIT.OK;
	}
	for (const line of head.stale) o.line(line);
	const revision = (fetched.text ?? "").replace(/\r?\n$/, "");
	const stage =
		input.stage === null ? null : withDb((db) => stageFor(db, input, order));
	if (input.stage !== null) {
		if (stage === null)
			return ended(t, o, "failed", "The stage check failed", id);
		for (const line of withDb((db) => caseLines(db, input, order, stage)))
			o.line(line);
		if (input.stale?.(stage))
			return ended(t, o, "silent", `Order stale: ${stage.line}`, id);
	}
	let files: string | null = null;
	if (input.constitution) {
		const listedFiles = await operate(p, "files", call([revision]));
		if (listedFiles.text === null) {
			o.add(...listedFiles.blocks);
			o.selfs.push("constitution");
		} else {
			files = listedFiles.text;
			if (!listed(files, CONSTITUTION))
				return ended(t, o, SLUG.missing, `No constitution at ${revision}`, id);
			const file = await operate(p, "file", call([revision, CONSTITUTION]));
			if (file.text === null) {
				o.add(...file.blocks);
				o.selfs.push("constitution");
			} else {
				const lint = await lintedPage(o, "constitution", file.text);
				if (lint === null) o.selfs.push("constitution");
				else if (!lint.passed) {
					return ended(
						t,
						o,
						SLUG[lackOf(lint.reasons)],
						`Constitution check failed at ${revision}`,
						id,
					);
				}
			}
		}
	}
	const d = departmentOf(input, order, stage);
	if (d !== NONE) {
		if (!fits("department", d))
			return ended(
				t,
				o,
				"stopped-bad-department",
				"The department name is not safe",
				id,
			);
		const own = `.lawman/departments/${d}.md`;
		const found =
			files === null
				? null
				: await pageAt(d, async (): Promise<PageRead> => {
						if (!listed(files, own)) return { kind: "none" };
						const file = await operate(p, "file", call([revision, own]));
						if (file.text !== null) return { kind: "page", text: file.text };
						o.add(...file.blocks);
						return { kind: "failed" };
					});
		const page = found?.kind === "page" ? found.page : null;
		const self = found === null || found.kind === "failed";
		if (page !== null)
			o.line(`department ${d} place=${placeNumber(page.place)}`);
		const lint =
			page === null ? null : await lintedPage(o, "department", page.text, d);
		if (self || (page !== null && lint === null))
			o.selfs.push(`department ${d}`);
		else if (lint === null || !lint.passed)
			return ended(
				t,
				o,
				"stopped-bad-department",
				`Department page check failed: ${d}`,
				id,
			);
	}
	const pd = precedentsOf(input, order, stage);
	if (pd !== null) {
		const live = input.dismissals
			? withDb((db) => liveIssues(db, p))
			: new Set<number>();
		const handed = (h: Header) =>
			h.kind !== DISMISSAL ||
			(input.dismissals && (h.issue === undefined || !live.has(h.issue)));
		await precedentBlocks(o, p, revision, files, pd, handed);
	}
	const texts = await withDbAsync((db) =>
		caseTexts(db, p, textsOf(input, order, stage), size),
	);
	o.add(...texts.blocks);
	o.selfs.push(...texts.selfs);
	out(storeParts(t, o.all(), size)[0] ?? "");
	return EXIT.OK;
}

type TickRow = {
	role: string;
	started_at: string;
	ended_at: string | null;
	dispatch: number | null;
	parts: string | null;
};

export async function tickInput(args: string[]): Promise<number> {
	if (args[0] === "--role")
		return (await import("./role-entry")).rolePartCommand(args);
	const { pos, opt } = parseArgs(args, 1, [], TICK_INPUT_USAGE, ["part"]);
	const id = count(pos[0], "id", 1);
	const row = withDb(
		(db) =>
			db
				.query(
					"SELECT role, started_at, ended_at, dispatch, parts FROM ticks WHERE id = ?",
				)
				.get(id) as TickRow | null,
	);
	if (row === null || row.ended_at !== null)
		throw new Fail(EXIT.USAGE, `no open tick with id ${id}`);
	const stored = JSON.parse(row.parts ?? "[]") as string[];
	// the part asked for; part 1 without the option
	const k = parsePart(opt.part, TICK_INPUT_USAGE);
	// a built group stays as it was, so its constitution and page are not lost
	if (stored.length > 0) {
		const part = stored[k - 1];
		if (part === undefined) throw partOutOfRange(k, stored.length);
		out(part);
		return EXIT.OK;
	}
	const input = inputOf(row.role);
	const orderId = row.dispatch;
	if (input === undefined || orderId === null)
		throw new Fail(EXIT.USAGE, `tick ${id} has no order or input to print`);
	const order = withDb(
		(db) =>
			db
				.query(
					`SELECT d.id, d.precinct, p.repo, d.department, d.issue FROM dispatches d
             JOIN precincts p ON p.name = d.precinct WHERE d.id = ?`,
				)
				.get(orderId) as Taken | null,
	);
	if (order === null)
		throw new Fail(EXIT.USAGE, `tick ${id} has no order or input to print`);
	const size = inputChars(readConfig());
	const t: Tick = { id, role: row.role };
	const o = new Output();
	const head = withDb((db) =>
		inTransaction(db, () => cacheHead(db, order.precinct, row.started_at)),
	);
	o.lead(head.alarms);
	for (const line of head.stale) o.line(line);
	const stage =
		input.stage === null ? null : withDb((db) => stageFor(db, input, order));
	if (input.stage !== null) {
		if (stage === null) o.selfs.push("stage");
		else {
			for (const line of withDb((db) => caseLines(db, input, order, stage)))
				o.line(line);
		}
	}
	if (input.constitution) o.selfs.push("constitution");
	const d = departmentOf(input, order, stage);
	// a name outside its class stays out of the output, the role's own check refuses it
	if (d !== NONE)
		o.selfs.push(fits("department", d) ? `department ${d}` : "department");
	if (input.precedents !== null) o.selfs.push(SELF_PRECEDENTS);
	const texts = await withDbAsync((db) =>
		caseTexts(db, order.precinct, textsOf(input, order, stage), size),
	);
	o.add(...texts.blocks);
	o.selfs.push(...texts.selfs);
	const built = storeParts(t, o.all(), size);
	const asked = built[k - 1];
	if (asked === undefined) throw partOutOfRange(k, built.length);
	out(asked);
	return EXIT.OK;
}

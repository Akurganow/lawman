import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { reconcileAlarms } from "./alarms";
import { check, count, fits, parseArgs } from "./args";
import { CleanFailed, printCached } from "./cache-text";
import { caseStage } from "./cases";
import { cleanCharacters } from "./clean";
import { EXIT, Fail, inTransaction, now, open, out, withDb } from "./db";
import { type Taken, takeableOrders } from "./dispatch";
import { type Block, fencedBlock, framed, pack, render } from "./input-parts";
import {
	ROLES,
	type RoleInput,
	type StageFields,
	type Text,
} from "./input-roles";
import { intakeStage } from "./intake";
import { commandFolder } from "./launch";
import { configValue } from "./law-sync";
import { lintPage, type PageKind, pageLines } from "./lint";
import { asciiLower, stripCr } from "./markers";
import { operate } from "./operations";
import { pullLine, stageOf } from "./pull-stage";
import {
	inputChars,
	orderLine,
	REFERENCES,
	readConfig,
	readText,
} from "./role-entry";

const TICK_INPUT_USAGE = "tick input (<id> [--part <k>]|--role <r> --part <k>)";
const START_USAGE = "tick start --role <r> --order <id>";
const NONE = "-";
const CONSTITUTION = "LAWMAN.md";
// an ended tick prints no foreign text, only the lines that explain the end
const CASE_TEXTS = [
	"title",
	"constitution",
	"department",
	"issue",
	"pull",
	"comment",
];
const SYNC_STEPS = ["fetch", "issues", "pulls"];

type Stage = StageFields & { department: string; pull: string; line: string };
type Tick = { id: number; role: string };

function stageFor(db: Database, input: RoleInput, o: Taken): Stage | null {
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

// the issue or the pull request whose text the role reads, by the table
function textsOf(
	input: RoleInput,
	o: Taken,
	stage: Stage | null,
): [Text, number][] {
	return input.texts.flatMap((kind): [Text, number][] => {
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
			cached = await printCached(db, precinct, kind, n);
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
	const kept = o.blocks.filter(
		(b) => !("label" in b && CASE_TEXTS.includes(b.label)),
	);
	const lines = [
		...kept.flatMap(render),
		`ended ${outcome}`,
		`report ${report}`,
	];
	out(framed([lines], () => `role=${t.role} tick=${t.id}`)[0] ?? "");
	return EXIT.OK;
}

const call = (args: string[], author = "") => ({ args, author, reset: false });

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

type Page = { text: string; place: number };

// The lint lines go in a fence of their own. Null when the cleaning failed.
async function lintedPage(
	o: Output,
	kind: PageKind,
	page: Page,
	name?: string,
): Promise<{ passed: boolean; reasons: string[] } | null> {
	const lint = lintPage(kind, page.text, name);
	const lines = await characters(pageLines(lint).join("\n"));
	const text = await characters(page.text);
	if (lines === null || text === null) return null;
	o.add(fencedBlock("lint", lines));
	const passed = lint.reasons.length === 0;
	if (passed) o.add(fencedBlock(kind, text));
	return { passed, reasons: lint.reasons };
}

const departmentOf = (input: RoleInput, order: Taken, stage: Stage | null) =>
	input.department === "order"
		? (order.department ?? NONE)
		: input.department === "stage"
			? (stage?.department ?? NONE)
			: NONE;

// the places of the "Resolve the department page" section, in its order
function installationPage(d: string): Page | null {
	const places = [
		join(commandFolder(), "departments", `${d}.md`),
		join(commandFolder(), REFERENCES, "departments", `${d}.md`),
	];
	for (const [i, path] of places.entries()) {
		const text = readText(path);
		if (text !== null) return { text, place: i + 2 };
	}
	return null;
}

export async function tickStart(args: string[]): Promise<number> {
	const { opt } = parseArgs(args, 0, ["role", "order"], START_USAGE);
	const role = check("role", opt.role);
	const id = count(opt.order, "order", 1);
	const input = ROLES[role];
	if (input === undefined)
		throw new Fail(EXIT.USAGE, `no tick input for role ${role}`);
	const stamp = now();
	const order = withDb((db) =>
		takeableOrders(db, role, stamp).find((x) => x.id === id),
	);
	if (order === undefined) {
		out(`order ${id} untakeable`);
		return EXIT.OK;
	}
	const config = readConfig();
	const size = inputChars(config);
	const t: Tick = {
		role,
		id: withDb((db) =>
			Number(
				db.run("INSERT INTO ticks (role, started_at) VALUES (?, ?)", [
					role,
					stamp,
				]).lastInsertRowid,
			),
		),
	};
	const o = new Output();
	for (const line of withDb((db) =>
		inTransaction(db, () => reconcileAlarms(db, stamp, false)),
	))
		o.line(line);
	if (config === null)
		return ended(t, o, "failed", "config.yaml is missing", null);
	const login = configValue(config, "trusted_login");
	if (login === undefined || !fits("login", login))
		return ended(t, o, "failed", "config.yaml has no trusted_login", null);
	const p = order.precinct;
	const who = await operate(p, "identity", call([]));
	o.add(...who.blocks);
	if (who.text === null) o.selfs.push("identity");
	else {
		const seen = who.text.replace(/\r?\n$/, "");
		if (asciiLower(seen) !== asciiLower(login))
			return ended(
				t,
				o,
				"stopped-identity-changed",
				`Host identity changed: ${seen}`,
				null,
			);
	}
	const taken = withDb((db) =>
		inTransaction(db, () => {
			if (!takeableOrders(db, role, stamp).some((x) => x.id === id))
				return false;
			db.run("UPDATE dispatches SET taken_at = ? WHERE id = ?", [stamp, id]);
			db.run(
				"UPDATE ticks SET precinct = ?, department = ?, dispatch = ? WHERE id = ?",
				[p, order.department, id, t.id],
			);
			return true;
		}),
	);
	if (!taken) return ended(t, o, "silent", "No order.", null);
	o.line(orderLine(order));
	const fieldsFailed = fieldsFailure(input, order);
	if (fieldsFailed !== null) return ended(t, o, "failed", fieldsFailed, id);
	const fetched = await operate(p, "fetch", call([]));
	o.add(...fetched.blocks);
	if (fetched.text === null) o.selfs.push("fetch");
	for (const kind of input.sync) {
		const synced = await operate(p, kind, call([], login));
		o.add(...synced.blocks);
		if (synced.text === null) o.selfs.push(kind);
	}
	// the role does these steps itself, then `tick input` builds the group from the cache
	if (o.selfs.some((s) => SYNC_STEPS.includes(s))) {
		out(
			framed([o.all().flatMap(render)], () => `role=${role} tick=${t.id}`)[0] ??
				"",
		);
		return EXIT.OK;
	}
	const revision = (fetched.text ?? "").replace(/\r?\n$/, "");
	const stage =
		input.stage === null ? null : withDb((db) => stageFor(db, input, order));
	if (input.stage !== null) {
		if (stage === null)
			return ended(t, o, "failed", "The stage check failed", id);
		o.line(stage.line);
		if (input.stale(stage))
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
				return ended(
					t,
					o,
					"skipped-no-constitution",
					`No constitution at ${revision}`,
					id,
				);
			const file = await operate(p, "file", call([revision, CONSTITUTION]));
			if (file.text === null) {
				o.add(...file.blocks);
				o.selfs.push("constitution");
			} else {
				const lint = await lintedPage(o, "constitution", {
					text: file.text,
					place: 1,
				});
				if (lint === null) o.selfs.push("constitution");
				else if (!lint.passed) {
					const token = lint.reasons.some((r) => r.includes("contract_version"))
						? "skipped-contract-version"
						: "skipped-bad-constitution";
					return ended(
						t,
						o,
						token,
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
		let page: Page | null = null;
		let self = files === null;
		if (files !== null && listed(files, own)) {
			const file = await operate(p, "file", call([revision, own]));
			if (file.text === null) {
				o.add(...file.blocks);
				self = true;
			} else page = { text: file.text, place: 1 };
		} else if (files !== null) page = installationPage(d);
		if (page !== null) o.line(`department ${d} place=${page.place}`);
		const lint =
			page === null ? null : await lintedPage(o, "department", page, d);
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
	const texts = await withDbAsync((db) =>
		caseTexts(db, p, textsOf(input, order, stage)),
	);
	o.add(...texts.blocks);
	o.selfs.push(...texts.selfs);
	out(storeParts(t, o.all(), size)[0] ?? "");
	return EXIT.OK;
}

type TickRow = {
	role: string;
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
				.query("SELECT role, ended_at, dispatch, parts FROM ticks WHERE id = ?")
				.get(id) as TickRow | null,
	);
	if (row === null || row.ended_at !== null)
		throw new Fail(EXIT.USAGE, `no open tick with id ${id}`);
	if (opt.part !== undefined) {
		const k = count(opt.part, "part", 1);
		const part = (JSON.parse(row.parts ?? "[]") as string[])[k - 1];
		if (part === undefined)
			throw new Fail(EXIT.USAGE, `tick ${id} has no part ${k}`);
		out(part);
		return EXIT.OK;
	}
	const input = ROLES[row.role];
	const orderId = row.dispatch;
	if (input === undefined || orderId === null)
		throw new Fail(EXIT.USAGE, `tick ${id} took no order`);
	const order = withDb(
		(db) =>
			db
				.query(
					`SELECT d.id, d.precinct, p.repo, d.department, d.issue FROM dispatches d
             JOIN precincts p ON p.name = d.precinct WHERE d.id = ?`,
				)
				.get(orderId) as Taken | null,
	);
	if (order === null) throw new Fail(EXIT.USAGE, `tick ${id} took no order`);
	const size = inputChars(readConfig());
	const t: Tick = { id, role: row.role };
	const o = new Output();
	const stage =
		input.stage === null ? null : withDb((db) => stageFor(db, input, order));
	if (input.stage !== null) {
		if (stage === null) o.selfs.push("stage");
		else o.line(stage.line);
	}
	if (input.constitution) o.selfs.push("constitution");
	const d = departmentOf(input, order, stage);
	if (d !== NONE && fits("department", d)) o.selfs.push(`department ${d}`);
	const texts = await withDbAsync((db) =>
		caseTexts(db, order.precinct, textsOf(input, order, stage)),
	);
	o.add(...texts.blocks);
	o.selfs.push(...texts.selfs);
	out(storeParts(t, o.all(), size)[0] ?? "");
	return EXIT.OK;
}

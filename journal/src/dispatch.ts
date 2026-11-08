import type { Database } from "bun:sqlite";
import { check, count, parseArgs, subcommand, usage } from "./args";
import {
	EXIT,
	Fail,
	inTransaction,
	isConstraint,
	now,
	out,
	readStdin,
	withDb,
} from "./db";
import { creditVisit } from "./precincts";

const DISPATCH_USAGE =
	"dispatch add --precinct <p> --role <r> [--department <d>] [--issue <n>]";
export const PATROL = "patrol";

function dispatchAdd(db: Database, args: string[]): void {
	const { opt } = parseArgs(args, 0, ["precinct", "role"], DISPATCH_USAGE, [
		"department",
		"issue",
	]);
	const precinctName = check("precinct", opt.precinct);
	const roleName = check("role", opt.role);
	const department =
		opt.department === undefined ? null : check("department", opt.department);
	const issue = opt.issue === undefined ? null : count(opt.issue, "issue", 1);
	if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(precinctName)) {
		throw new Fail(EXIT.USAGE, `unknown precinct: ${precinctName}`);
	}
	try {
		const r = db.run(
			"INSERT INTO dispatches (at, precinct, role, department, issue) VALUES (?, ?, ?, ?, ?)",
			[now(), precinctName, roleName, department, issue],
		);
		out(Number(r.lastInsertRowid));
	} catch (e) {
		if (!isConstraint(e)) throw e;
		throw new Fail(
			EXIT.DUPLICATE_ORDER,
			`open order already exists: ${precinctName} ${roleName} ${issue ?? ""}`.trimEnd(),
		);
	}
}

export type Taken = {
	id: number;
	precinct: string;
	repo: string;
	department: string | null;
	issue: number | null;
};

// Patrol takes by weight: the precinct that the credit picks comes first, and a
// precinct of weight 0 has no takeable patrol order. An order nobody took comes
// before an order a tick took; inside each group patrol keeps credit, weight and
// name, the other roles come oldest first.
export function takeableOrders(db: Database, roleName: string): Taken[] {
	return db
		.query(
			`SELECT d.id, d.precinct, p.repo, d.department, d.issue FROM dispatches d
         JOIN precincts p ON p.name = d.precinct
         WHERE d.role = ?1 AND d.outcome IS NULL
           AND (?1 <> '${PATROL}' OR p.weight > 0)
         ORDER BY CASE WHEN d.taken_at IS NULL THEN 0 ELSE 1 END,
           CASE WHEN ?1 = '${PATROL}' THEN -(p.credit + p.weight) END,
           CASE WHEN ?1 = '${PATROL}' THEN p.name END, d.at, d.id`,
		)
		.all(roleName) as Taken[];
}

// Inside the caller's transaction. A patrol take moves the credit: every
// admitted precinct gains its weight, the taken one loses the sum.
export function takeOrder(
	db: Database,
	roleName: string,
	id: number,
	stamp: string,
): boolean {
	const orders = takeableOrders(db, roleName);
	const order = orders.find((o) => o.id === id);
	if (order === undefined) return false;
	db.run("UPDATE dispatches SET taken_at = ? WHERE id = ?", [stamp, id]);
	db.run("UPDATE roles SET checks = 0 WHERE name = ?", [roleName]);
	if (roleName === PATROL)
		creditVisit(
			db,
			[...new Set(orders.map((o) => o.precinct))],
			order.precinct,
		);
	return true;
}

export function dispatch(args: string[]): void {
	const [name, ...rest] = args;
	if (name !== "add") throw usage(DISPATCH_USAGE);
	withDb((db) => dispatchAdd(db, rest));
}

const TICK_USAGE =
	"tick <start --role <r> [--order <id>]|continue <id>|input (<id> [--part <k>]|--role <r> --part <k>)|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]|list (--limit <n>|--id <n>) [--role <r>] [--precinct <p>]>";

function tickEnd(db: Database, args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["outcome"], TICK_USAGE, [
		"precinct",
		"department",
		"dispatch",
	]);
	const id = count(pos[0], "id", 1);
	const outcome = check("outcome", opt.outcome);
	const precinctName =
		opt.precinct === undefined ? null : check("precinct", opt.precinct);
	const department =
		opt.department === undefined ? null : check("department", opt.department);
	const order =
		opt.dispatch === undefined ? null : count(opt.dispatch, "dispatch", 1);
	const report = readStdin();
	inTransaction(db, () => {
		const changed = db.run(
			`UPDATE ticks SET ended_at = ?, outcome = ?, report = ?, parts = NULL,
         precinct = COALESCE(?, precinct), department = COALESCE(?, department)
       WHERE id = ? AND ended_at IS NULL`,
			[now(), outcome, report, precinctName, department, id],
		).changes;
		if (changed === 0) throw new Fail(EXIT.USAGE, `no open tick with id ${id}`);
		if (order !== null) {
			const closed = db.run(
				"UPDATE dispatches SET outcome = ?, closed_at = ? WHERE id = ? AND outcome IS NULL",
				[outcome, now(), order],
			).changes;
			if (closed === 0)
				throw new Fail(EXIT.USAGE, `no open order with id ${order}`);
		}
	});
}

type ListedTick = {
	id: number;
	role: string;
	precinct: string | null;
	department: string | null;
	outcome: string | null;
	started_at: string;
	ended_at: string | null;
	report: string | null;
};

function tickList(db: Database, args: string[]): void {
	const { opt } = parseArgs(args, 0, [], TICK_USAGE, [
		"limit",
		"id",
		"role",
		"precinct",
	]);
	if ((opt.limit === undefined) === (opt.id === undefined))
		throw usage(TICK_USAGE);
	const id = opt.id === undefined ? null : count(opt.id, "id", 1);
	const limit = opt.limit === undefined ? 1 : count(opt.limit, "limit", 1);
	const role = opt.role === undefined ? null : check("role", opt.role);
	const precinct =
		opt.precinct === undefined ? null : check("precinct", opt.precinct);
	const ticks = db
		.query(
			`SELECT * FROM ticks
       WHERE (?1 IS NULL OR id = ?1) AND (?2 IS NULL OR role = ?2) AND (?3 IS NULL OR precinct = ?3)
       ORDER BY started_at DESC, id DESC LIMIT ?4`,
		)
		.all(id, role, precinct, limit) as ListedTick[];
	for (const t of ticks) {
		out(
			t.id,
			t.role,
			t.precinct ?? "-",
			t.department ?? "-",
			t.outcome ?? "running",
			t.started_at,
			t.ended_at ?? "-",
		);
		for (const line of (t.report ?? "").split("\n"))
			if (line !== "") out(`| ${line}`);
	}
}

const TICK_COMMANDS: Record<string, (db: Database, args: string[]) => void> = {
	end: tickEnd,
	list: tickList,
};

// the starts and the input load the parser and the cleaning inside the command
export function tick(args: string[]): undefined | Promise<number> {
	const [name, ...rest] = args;
	if (name === "start" && !rest.includes("--order"))
		return import("./duty-desk").then((m) => m.dutyDeskStart(rest));
	if (name === "start")
		return import("./tick-start").then((m) => m.tickStart(rest));
	if (name === "continue")
		return import("./duty-desk").then((m) => m.dutyDeskContinue(rest));
	if (name === "input")
		return import("./tick-start").then((m) => m.tickInput(rest));
	const { run, rest: tail } = subcommand(TICK_COMMANDS, args, TICK_USAGE);
	withDb((db) => run(db, tail));
	return undefined;
}

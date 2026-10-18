import type { Database } from "bun:sqlite";
import { check, count, parseArgs, subcommand, usage } from "./args";
import {
	CLAIM_TTL_MS,
	EXIT,
	Fail,
	inTransaction,
	isConstraint,
	isoSeconds,
	now,
	out,
	readStdin,
	withDb,
} from "./db";

const DISPATCH_USAGE =
	"dispatch <add --precinct <p> --role <r> [--department <d>] [--issue <n>]|take --role <r>>";

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

type Taken = {
	id: number;
	precinct: string;
	repo: string;
	department: string | null;
	issue: number | null;
};

export function takeableOrders(
	db: Database,
	roleName: string,
	stamp: string,
): Taken[] {
	const stale = isoSeconds(new Date(Date.parse(stamp) - CLAIM_TTL_MS));
	return db
		.query(
			`SELECT d.id, d.precinct, p.repo, d.department, d.issue FROM dispatches d
         JOIN precincts p ON p.name = d.precinct
         WHERE d.role = ? AND d.outcome IS NULL AND (d.taken_at IS NULL OR d.taken_at < ?)
         ORDER BY d.at, d.id`,
		)
		.all(roleName, stale) as Taken[];
}

function dispatchTake(db: Database, args: string[]): void {
	const { opt } = parseArgs(args, 0, ["role"], DISPATCH_USAGE);
	const roleName = check("role", opt.role);
	const stamp = now();
	const order = inTransaction(db, () => {
		const row = takeableOrders(db, roleName, stamp)[0];
		if (row)
			db.run("UPDATE dispatches SET taken_at = ? WHERE id = ?", [
				stamp,
				row.id,
			]);
		return row;
	});
	if (order)
		out(
			order.id,
			order.precinct,
			order.repo,
			order.department ?? "",
			order.issue ?? "",
		);
}

const DISPATCH_COMMANDS: Record<
	string,
	(db: Database, args: string[]) => void
> = {
	add: dispatchAdd,
	take: dispatchTake,
};

export function dispatch(args: string[]): void {
	const { run, rest } = subcommand(DISPATCH_COMMANDS, args, DISPATCH_USAGE);
	withDb((db) => run(db, rest));
}

const TICK_USAGE =
	"tick <start --role <r>|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]|list (--limit <n>|--id <n>) [--role <r>] [--precinct <p>]>";

function tickStart(db: Database, args: string[]): void {
	const { opt } = parseArgs(args, 0, ["role"], TICK_USAGE);
	const roleName = check("role", opt.role);
	out(
		Number(
			db.run("INSERT INTO ticks (role, started_at) VALUES (?, ?)", [
				roleName,
				now(),
			]).lastInsertRowid,
		),
	);
}

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
			`UPDATE ticks SET ended_at = ?, outcome = ?, report = ?,
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
	start: tickStart,
	end: tickEnd,
	list: tickList,
};

export function tick(args: string[]): void {
	const { run, rest } = subcommand(TICK_COMMANDS, args, TICK_USAGE);
	withDb((db) => run(db, rest));
}

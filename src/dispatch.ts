import type { Database } from "bun:sqlite";
import { check, count, parseArgs, pick, usage } from "./args";
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

function dispatchTake(db: Database, args: string[]): void {
	const { opt } = parseArgs(args, 0, ["role"], DISPATCH_USAGE);
	const roleName = check("role", opt.role);
	const stamp = now();
	const stale = isoSeconds(new Date(Date.parse(stamp) - CLAIM_TTL_MS));
	const order = inTransaction(db, () => {
		const row = db
			.query(
				`SELECT d.id, d.precinct, p.repo, d.department, d.issue FROM dispatches d
         JOIN precincts p ON p.name = d.precinct
         WHERE d.role = ? AND d.outcome IS NULL AND (d.taken_at IS NULL OR d.taken_at < ?)
         ORDER BY d.at, d.id LIMIT 1`,
			)
			.get(roleName, stale) as Taken | null;
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

function closeOrder(db: Database, id: number, outcome: string): void {
	const changed = db.run(
		"UPDATE dispatches SET outcome = ?, closed_at = ? WHERE id = ? AND outcome IS NULL",
		[outcome, now(), id],
	).changes;
	if (changed === 0) throw new Fail(EXIT.USAGE, `no open order with id ${id}`);
}

const DISPATCH_COMMANDS: Record<
	string,
	(db: Database, args: string[]) => void
> = {
	add: dispatchAdd,
	take: dispatchTake,
};

export function dispatch(args: string[]): void {
	const [sub, ...rest] = args;
	const run = pick(DISPATCH_COMMANDS, sub);
	if (run === undefined) throw usage(DISPATCH_USAGE);
	withDb((db) => run(db, rest));
}

const TICK_USAGE =
	"tick <start --role <r>|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]>";

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
		if (order !== null) closeOrder(db, order, outcome);
	});
}

const TICK_COMMANDS: Record<string, (db: Database, args: string[]) => void> = {
	start: tickStart,
	end: tickEnd,
};

export function tick(args: string[]): void {
	const [sub, ...rest] = args;
	const run = pick(TICK_COMMANDS, sub);
	if (run === undefined) throw usage(TICK_USAGE);
	withDb((db) => run(db, rest));
}

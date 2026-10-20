import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pkg from "../package.json";
import { MIGRATIONS } from "./migrations";

export { MIGRATIONS };

export const EXIT = {
	OK: 0,
	USAGE: 1,
	DUPLICATE_ORDER: 2,
	SYNC_LIMIT: 3,
	SYNC_INPUT: 4,
	SCHEMA: 6,
	LINT_BODY: 7,
	LINT_PAGE: 8,
} as const;

export class Fail extends Error {
	constructor(
		readonly code: number,
		message: string,
	) {
		super(message);
	}
}

type Env = Record<string, string | undefined>;

const BUSY_TIMEOUT_MS = 5000;
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const CLAIM_TTL_MS = 24 * HOUR_MS;
export const LEAD_PREFIX = "[Lead]";

const envValue = (env: Env, name: string): string | undefined =>
	env[name] || undefined;
const envSet = (env: Env, name: string) => envValue(env, name) !== undefined;

export function checkEnv(env: Env = process.env): void {
	if (envSet(env, "LAWMAN_NOW") && !envSet(env, "LAWMAN_DB")) {
		throw new Fail(EXIT.USAGE, "LAWMAN_NOW requires LAWMAN_DB");
	}
}

export function isoSeconds(date: Date): string {
	return `${date.toISOString().slice(0, 19)}Z`;
}

const TIME_SHAPE =
	/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// UTC seconds with a Z for an ISO 8601 time with a zone, null for anything else
export function normalizeTime(value: string): string | null {
	const m = value.match(TIME_SHAPE);
	if (!m) return null;
	const [, year = "", month = "", day = ""] = m;
	const calendar = new Date(
		Date.UTC(Number(year), Number(month) - 1, Number(day)),
	);
	if (calendar.getUTCDate() !== Number(day)) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : isoSeconds(date);
}

export function now(env: Env = process.env): string {
	checkEnv(env);
	const stamp = envValue(env, "LAWMAN_NOW");
	const raw = stamp === undefined ? new Date() : new Date(stamp);
	if (Number.isNaN(raw.getTime())) {
		throw new Fail(
			EXIT.USAGE,
			`LAWMAN_NOW is not a timestamp: ${JSON.stringify(stamp)}`,
		);
	}
	return isoSeconds(raw);
}

export function dbPath(
	env: Env = process.env,
	execPath: string = process.execPath,
): string {
	return (
		envValue(env, "LAWMAN_DB") ??
		join(dirname(dirname(execPath)), "journal.sqlite")
	);
}

function userVersion(db: Database): number {
	return (db.query("PRAGMA user_version").get() as { user_version: number })
		.user_version;
}

function tooNew(found: number): Fail {
	return new Fail(
		EXIT.SCHEMA,
		`database schema ${found} is newer than this binary (${MIGRATIONS.length})`,
	);
}

function migrate(db: Database): void {
	const seen = userVersion(db);
	if (seen > MIGRATIONS.length) throw tooNew(seen);
	if (seen === MIGRATIONS.length) return;
	inTransaction(db, () => {
		// another process may have migrated while this one waited for the write lock
		const current = userVersion(db);
		if (current > MIGRATIONS.length) throw tooNew(current);
		for (const sql of MIGRATIONS.slice(current)) db.run(sql);
		db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
	});
}

function enableWal(db: Database): void {
	// switching to WAL can fail at once with SQLITE_BUSY when processes race on a new file
	const deadline = Date.now() + BUSY_TIMEOUT_MS;
	for (;;) {
		try {
			db.run("PRAGMA journal_mode = WAL");
			return;
		} catch (e) {
			if (
				(e as { code?: string }).code !== "SQLITE_BUSY" ||
				Date.now() > deadline
			)
				throw e;
			Bun.sleepSync(10);
		}
	}
}

export function open(path: string = dbPath()): Database {
	const db = new Database(path);
	try {
		db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
		enableWal(db);
		db.run("PRAGMA foreign_keys = ON");
		migrate(db);
	} catch (e) {
		db.close();
		throw e;
	}
	return db;
}

export function probeLine(db: Database): string {
	db.run("BEGIN IMMEDIATE");
	try {
		db.run("INSERT INTO roles (name, every_minutes) VALUES ('probe', 1)");
	} finally {
		db.run("ROLLBACK");
	}
	const mode = (
		db.query("PRAGMA journal_mode").get() as { journal_mode: string }
	).journal_mode;
	return `journal ${pkg.version} schema ${userVersion(db)} ${mode}`;
}

export function probe(args: string[]): void {
	if (envSet(process.env, "LAWMAN_DB") || envSet(process.env, "LAWMAN_NOW")) {
		throw new Fail(
			EXIT.USAGE,
			"probe refuses LAWMAN_DB and LAWMAN_NOW: unset them",
		);
	}
	const [flag, schema] = args;
	if (
		args.length > 0 &&
		!(
			args.length === 2 &&
			flag === "--schema" &&
			schema !== undefined &&
			/^\d+$/.test(schema)
		)
	) {
		throw new Fail(EXIT.USAGE, "usage: journal probe [--schema N]");
	}
	if (schema !== undefined) requireSchema(Number(schema));
	const db = open();
	try {
		out(probeLine(db));
	} finally {
		db.close();
	}
}

export function requireSchema(needed: number): void {
	if (needed > MIGRATIONS.length)
		throw new Fail(
			EXIT.SCHEMA,
			`schema ${needed} is newer than this binary (${MIGRATIONS.length})`,
		);
}

export function out(...fields: (string | number)[]): void {
	process.stdout.write(`${fields.join("\t")}\n`);
}

export function inTransaction<T>(db: Database, body: () => T): T {
	db.run("BEGIN IMMEDIATE");
	try {
		const result = body();
		db.run("COMMIT");
		return result;
	} catch (e) {
		db.run("ROLLBACK");
		throw e;
	}
}

export function withDb<T = void>(body: (db: Database) => T): T {
	const db = open();
	try {
		return body(db);
	} finally {
		db.close();
	}
}

export function isConstraint(e: unknown): boolean {
	return String((e as { code?: string }).code).startsWith("SQLITE_CONSTRAINT");
}

export function readStdin(): string {
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

export const LEAD_ORIGIN_FROM = `FROM issues i
  JOIN markers m ON m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead'
  WHERE m.ord = (SELECT min(ord) FROM markers WHERE precinct = i.precinct AND issue = i.issue AND stage = 'lead')`;

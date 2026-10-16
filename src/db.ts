import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pkg from "../package.json";

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

export const MIGRATIONS: string[] = [
	`
  CREATE TABLE precincts (
    name      TEXT PRIMARY KEY,
    repo      TEXT NOT NULL UNIQUE,
    weight    INTEGER NOT NULL CHECK (weight >= 0),
    credit    INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT);
  CREATE TABLE roles (
    name          TEXT PRIMARY KEY,
    every_minutes INTEGER NOT NULL CHECK (every_minutes > 0));
  CREATE TABLE dispatches (
    id         INTEGER PRIMARY KEY,
    at         TEXT NOT NULL,
    precinct   TEXT NOT NULL REFERENCES precincts(name),
    role       TEXT NOT NULL,
    department TEXT,
    issue      INTEGER,
    taken_at   TEXT,
    outcome    TEXT,
    closed_at  TEXT);
  CREATE UNIQUE INDEX open_order
    ON dispatches(precinct, role, COALESCE(issue, 0)) WHERE outcome IS NULL;
  CREATE TABLE ticks (
    id         INTEGER PRIMARY KEY,
    role       TEXT NOT NULL,
    precinct   TEXT,
    department TEXT,
    started_at TEXT NOT NULL,
    ended_at   TEXT,
    outcome    TEXT,
    report     TEXT);
  CREATE TABLE alarms (
    id          INTEGER PRIMARY KEY,
    kind        TEXT NOT NULL,
    ref         TEXT NOT NULL,
    detail      TEXT NOT NULL,
    raised_at   TEXT NOT NULL,
    notified_at TEXT NOT NULL,
    cleared_at  TEXT);
  CREATE UNIQUE INDEX open_alarm ON alarms(kind, ref) WHERE cleared_at IS NULL;
  CREATE TABLE issues (
    precinct     TEXT NOT NULL,
    issue        INTEGER NOT NULL,
    state        TEXT NOT NULL,
    state_reason TEXT,
    title        TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    closed_at    TEXT,
    PRIMARY KEY (precinct, issue));
  CREATE TABLE markers (
    precinct   TEXT NOT NULL,
    issue      INTEGER NOT NULL,
    ord        TEXT NOT NULL,
    role       TEXT NOT NULL,
    stage      TEXT NOT NULL,
    department TEXT,
    lead_id    TEXT,
    fields     TEXT NOT NULL,
    raw        TEXT NOT NULL,
    PRIMARY KEY (precinct, issue, ord));
  `,
	// pauses has no reader. The migration stays because installed databases are at schema 2.
	`
  CREATE TABLE pauses (
    id         INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at   TEXT);
  CREATE UNIQUE INDEX open_pause ON pauses((1)) WHERE ended_at IS NULL;
  `,
];

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
	if (schema !== undefined && Number(schema) > MIGRATIONS.length) {
		throw new Fail(
			EXIT.SCHEMA,
			`schema ${schema} is newer than this binary (${MIGRATIONS.length})`,
		);
	}
	const db = open();
	try {
		out(probeLine(db));
	} finally {
		db.close();
	}
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

export function withDb(body: (db: Database) => void): void {
	const db = open();
	try {
		body(db);
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

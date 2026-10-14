import { Database } from "bun:sqlite";
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
type Handler = (args: string[]) => void;

const BUSY_TIMEOUT_MS = 5000;

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
];

const PATTERNS = {
  precinct: /^[a-z][a-z0-9-]*$/,
  role: /^[a-z][a-z0-9-]*$/,
  repo: /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
  login: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  outcome: /^(silent|ordered|filed|capped|failed|skipped-[a-z0-9-]+|stopped-[a-z0-9-]+)$/,
};

export function check(kind: keyof typeof PATTERNS, value: string): string {
  if (!PATTERNS[kind].test(value)) {
    throw new Fail(EXIT.USAGE, `invalid ${kind}: ${JSON.stringify(value)}`);
  }
  return value;
}

function envSet(env: Env, name: string): boolean {
  return env[name] !== undefined && env[name] !== "";
}

export function checkEnv(env: Env = process.env): void {
  if (envSet(env, "LAWMAN_NOW") && !envSet(env, "LAWMAN_DB")) {
    throw new Fail(EXIT.USAGE, "LAWMAN_NOW requires LAWMAN_DB");
  }
}

export function now(env: Env = process.env): string {
  checkEnv(env);
  const raw = envSet(env, "LAWMAN_NOW") ? new Date(env.LAWMAN_NOW!) : new Date();
  if (Number.isNaN(raw.getTime())) {
    throw new Fail(EXIT.USAGE, `LAWMAN_NOW is not a timestamp: ${JSON.stringify(env.LAWMAN_NOW)}`);
  }
  return raw.toISOString().slice(0, 19) + "Z";
}

export function dbPath(env: Env = process.env, execPath: string = process.execPath): string {
  return envSet(env, "LAWMAN_DB") ? env.LAWMAN_DB! : join(dirname(dirname(execPath)), "journal.sqlite");
}

function userVersion(db: Database): number {
  return (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
}

function tooNew(found: number): Fail {
  return new Fail(EXIT.SCHEMA, `database schema ${found} is newer than this binary (${MIGRATIONS.length})`);
}

function migrate(db: Database): void {
  const seen = userVersion(db);
  if (seen > MIGRATIONS.length) throw tooNew(seen);
  if (seen === MIGRATIONS.length) return;
  db.run("BEGIN IMMEDIATE");
  try {
    // another process may have migrated while this one waited for the write lock
    const current = userVersion(db);
    if (current > MIGRATIONS.length) throw tooNew(current);
    for (let v = current; v < MIGRATIONS.length; v++) db.run(MIGRATIONS[v]);
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`);
    db.run("COMMIT");
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  }
}

function enableWal(db: Database): void {
  // switching to WAL can fail at once with SQLITE_BUSY when processes race on a new file
  const deadline = Date.now() + BUSY_TIMEOUT_MS;
  for (;;) {
    try {
      db.run("PRAGMA journal_mode = WAL");
      return;
    } catch (e) {
      if ((e as { code?: string }).code !== "SQLITE_BUSY" || Date.now() > deadline) throw e;
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
  const mode = (db.query("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode;
  return `journal ${pkg.version} schema ${userVersion(db)} ${mode}`;
}

function probe(args: string[]): void {
  if (envSet(process.env, "LAWMAN_DB") || envSet(process.env, "LAWMAN_NOW")) {
    throw new Fail(EXIT.USAGE, "probe refuses LAWMAN_DB and LAWMAN_NOW: unset them");
  }
  if (args.length > 0 && !(args.length === 2 && args[0] === "--schema" && /^\d+$/.test(args[1]))) {
    throw new Fail(EXIT.USAGE, "usage: journal probe [--schema N]");
  }
  if (args.length === 2 && Number(args[1]) > MIGRATIONS.length) {
    throw new Fail(EXIT.SCHEMA, `schema ${args[1]} is newer than this binary (${MIGRATIONS.length})`);
  }
  const db = open();
  try {
    out(probeLine(db));
  } finally {
    db.close();
  }
}

export function out(...fields: (string | number)[]): void {
  process.stdout.write(fields.join("\t") + "\n");
}

export const COMMANDS: Record<string, Handler> = { probe };

export function main(argv: string[]): number {
  try {
    checkEnv();
    const [name, ...args] = argv;
    if (name === "--version") {
      out(pkg.version);
    } else if (name !== undefined && Object.hasOwn(COMMANDS, name)) {
      COMMANDS[name](args);
    } else {
      throw new Fail(EXIT.USAGE, `usage: journal <${["--version", ...Object.keys(COMMANDS)].join("|")}> [args]`);
    }
    return EXIT.OK;
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    process.stderr.write(`journal: ${e.message}\n`);
    return e.code;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));

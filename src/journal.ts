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
const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

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

function isoSeconds(date: Date): string {
  return date.toISOString().slice(0, 19) + "Z";
}

export function now(env: Env = process.env): string {
  checkEnv(env);
  const raw = envSet(env, "LAWMAN_NOW") ? new Date(env.LAWMAN_NOW!) : new Date();
  if (Number.isNaN(raw.getTime())) {
    throw new Fail(EXIT.USAGE, `LAWMAN_NOW is not a timestamp: ${JSON.stringify(env.LAWMAN_NOW)}`);
  }
  return isoSeconds(raw);
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

function usage(text: string): Fail {
  return new Fail(EXIT.USAGE, `usage: journal ${text}`);
}

function parseArgs(args: string[], positional: number, names: string[], text: string, optional: string[] = []) {
  const pos = args.slice(0, positional);
  const rest = args.slice(positional);
  const opt: Record<string, string> = {};
  const allowed = [...names, ...optional];
  if (pos.length < positional || rest.length % 2 !== 0 || rest.length > allowed.length * 2) throw usage(text);
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i].slice(2);
    if (!rest[i].startsWith("--") || !allowed.includes(name) || name in opt) throw usage(text);
    opt[name] = rest[i + 1];
  }
  if (names.some((name) => !(name in opt))) throw usage(text);
  return { pos, opt };
}

function count(value: string, label: string, min: number): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min) {
    throw new Fail(EXIT.USAGE, `invalid ${label}: ${JSON.stringify(value)}`);
  }
  return n;
}

function inTransaction<T>(db: Database, body: () => T): T {
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

function withDb(body: (db: Database) => void): void {
  const db = open();
  try {
    body(db);
  } finally {
    db.close();
  }
}

function isConstraint(e: unknown): boolean {
  return String((e as { code?: string }).code).startsWith("SQLITE_CONSTRAINT");
}

const PRECINCT_USAGE = "precinct <add <name> --repo <owner/repo> --weight <n>|set <name> --weight <n>|list>";

function precinctAdd(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["repo", "weight"], PRECINCT_USAGE);
  const name = check("precinct", pos[0]);
  const repo = check("repo", opt.repo);
  const weight = count(opt.weight, "weight", 0);
  try {
    db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [name, repo, weight]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    throw new Fail(EXIT.USAGE, `precinct or repo already registered: ${name} ${repo}`);
  }
}

function precinctSet(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["weight"], PRECINCT_USAGE);
  const name = check("precinct", pos[0]);
  const weight = count(opt.weight, "weight", 0);
  inTransaction(db, () => {
    if (db.run("UPDATE precincts SET weight = ? WHERE name = ?", [weight, name]).changes === 0) {
      throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
    }
    db.run("UPDATE precincts SET credit = 0");
  });
}

function precinctList(db: Database, args: string[]): void {
  if (args.length > 0) throw usage(PRECINCT_USAGE);
  const rows = db.query("SELECT name, repo, weight, credit, synced_at FROM precincts ORDER BY name").all();
  for (const r of rows as { name: string; repo: string; weight: number; credit: number; synced_at: string | null }[]) {
    out(r.name, r.repo, r.weight, r.credit, r.synced_at ?? "");
  }
}

const PRECINCT_COMMANDS: Record<string, (db: Database, args: string[]) => void> = {
  add: precinctAdd,
  set: precinctSet,
  list: precinctList,
};

function precinct(args: string[]): void {
  const [sub, ...rest] = args;
  if (sub === undefined || !Object.hasOwn(PRECINCT_COMMANDS, sub)) throw usage(PRECINCT_USAGE);
  withDb((db) => PRECINCT_COMMANDS[sub](db, rest));
}

function role(args: string[]): void {
  const text = "role set <role> --every <minutes>";
  if (args[0] !== "set") throw usage(text);
  const { pos, opt } = parseArgs(args.slice(1), 1, ["every"], text);
  const name = check("role", pos[0]);
  const minutes = count(opt.every, "minutes", 1);
  withDb((db) => {
    db.run(
      "INSERT INTO roles (name, every_minutes) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET every_minutes = excluded.every_minutes",
      [name, minutes],
    );
  });
}

type Admitted = { name: string; repo: string; weight: number; credit: number };

export function pickNext(db: Database, roleName: string): { name: string; repo: string } | null {
  return inTransaction(db, () => {
    const admitted = db
      .query(
        `SELECT name, repo, weight, credit FROM precincts p
         WHERE weight > 0 AND NOT EXISTS (
           SELECT 1 FROM dispatches d
           WHERE d.precinct = p.name AND d.role = ? AND d.outcome IS NULL AND d.issue IS NULL)
         ORDER BY name`,
      )
      .all(roleName) as Admitted[];
    if (admitted.length === 0) return null;
    const total = admitted.reduce((sum, p) => sum + p.weight, 0);
    const bump = db.query("UPDATE precincts SET credit = credit + weight WHERE name = ?");
    for (const p of admitted) {
      bump.run(p.name);
      p.credit += p.weight;
    }
    const chosen = admitted.reduce((best, p) => (p.credit > best.credit ? p : best));
    db.run("UPDATE precincts SET credit = credit - ? WHERE name = ?", [total, chosen.name]);
    return { name: chosen.name, repo: chosen.repo };
  });
}

function next(args: string[]): void {
  const { opt } = parseArgs(args, 0, ["role"], "next --role <role>");
  const roleName = check("role", opt.role);
  withDb((db) => {
    const pick = pickNext(db, roleName);
    if (pick) out(pick.name, pick.repo);
  });
}

const DISPATCH_USAGE =
  "dispatch <add --precinct <p> --role <r> [--department <d>] [--issue <n>]|take --role <r>|close <id> --outcome <token>>";

function dispatchAdd(db: Database, args: string[]): void {
  const { opt } = parseArgs(args, 0, ["precinct", "role"], DISPATCH_USAGE, ["department", "issue"]);
  const precinctName = check("precinct", opt.precinct);
  const roleName = check("role", opt.role);
  const department = opt.department === undefined ? null : check("role", opt.department);
  const issue = opt.issue === undefined ? null : count(opt.issue, "issue", 1);
  if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(precinctName)) {
    throw new Fail(EXIT.USAGE, `unknown precinct: ${precinctName}`);
  }
  try {
    const r = db.run("INSERT INTO dispatches (at, precinct, role, department, issue) VALUES (?, ?, ?, ?, ?)", [
      now(),
      precinctName,
      roleName,
      department,
      issue,
    ]);
    out(Number(r.lastInsertRowid));
  } catch (e) {
    if (!isConstraint(e)) throw e;
    throw new Fail(EXIT.DUPLICATE_ORDER, `open order already exists: ${precinctName} ${roleName} ${issue ?? ""}`.trimEnd());
  }
}

type Taken = { id: number; precinct: string; repo: string; department: string | null; issue: number | null };

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
    if (row) db.run("UPDATE dispatches SET taken_at = ? WHERE id = ?", [stamp, row.id]);
    return row;
  });
  if (order) out(order.id, order.precinct, order.repo, order.department ?? "", order.issue ?? "");
}

function dispatchClose(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["outcome"], DISPATCH_USAGE);
  const id = count(pos[0], "id", 1);
  const outcome = check("outcome", opt.outcome);
  const changed = db.run("UPDATE dispatches SET outcome = ?, closed_at = ? WHERE id = ? AND outcome IS NULL", [
    outcome,
    now(),
    id,
  ]).changes;
  if (changed === 0) throw new Fail(EXIT.USAGE, `no open order with id ${id}`);
}

const DISPATCH_COMMANDS: Record<string, (db: Database, args: string[]) => void> = {
  add: dispatchAdd,
  take: dispatchTake,
  close: dispatchClose,
};

function dispatch(args: string[]): void {
  const [sub, ...rest] = args;
  if (sub === undefined || !Object.hasOwn(DISPATCH_COMMANDS, sub)) throw usage(DISPATCH_USAGE);
  withDb((db) => DISPATCH_COMMANDS[sub](db, rest));
}

export const COMMANDS: Record<string, Handler> = { probe, precinct, role, next, dispatch };

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

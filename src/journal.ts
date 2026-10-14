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
type Handler = (args: string[]) => void;

const BUSY_TIMEOUT_MS = 5000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const CLAIM_TTL_MS = 24 * HOUR_MS;
const ORDER_UNTAKEN_MS = 48 * HOUR_MS;
const TICK_HUNG_MS = 2 * HOUR_MS;
const ROLE_SILENT_INTERVALS = 3;
const TICK_FAILING_RUN = 3;
const ALARM_REPEAT_MS = 24 * HOUR_MS;
const LEAD_PREFIX = "[Lead]";

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
  `
  CREATE TABLE pauses (
    id         INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at   TEXT);
  CREATE UNIQUE INDEX open_pause ON pauses((1)) WHERE ended_at IS NULL;
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

function closeOrder(db: Database, id: number, outcome: string): void {
  const changed = db.run("UPDATE dispatches SET outcome = ?, closed_at = ? WHERE id = ? AND outcome IS NULL", [
    outcome,
    now(),
    id,
  ]).changes;
  if (changed === 0) throw new Fail(EXIT.USAGE, `no open order with id ${id}`);
}

function dispatchClose(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["outcome"], DISPATCH_USAGE);
  closeOrder(db, count(pos[0], "id", 1), check("outcome", opt.outcome));
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

const TICK_USAGE =
  "tick <start --role <r>|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]>";

function tickStart(db: Database, args: string[]): void {
  const { opt } = parseArgs(args, 0, ["role"], TICK_USAGE);
  const roleName = check("role", opt.role);
  out(Number(db.run("INSERT INTO ticks (role, started_at) VALUES (?, ?)", [roleName, now()]).lastInsertRowid));
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function tickEnd(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["outcome"], TICK_USAGE, ["precinct", "department", "dispatch"]);
  const id = count(pos[0], "id", 1);
  const outcome = check("outcome", opt.outcome);
  const precinctName = opt.precinct === undefined ? null : check("precinct", opt.precinct);
  const department = opt.department === undefined ? null : check("role", opt.department);
  const order = opt.dispatch === undefined ? null : count(opt.dispatch, "dispatch", 1);
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

const TICK_COMMANDS: Record<string, (db: Database, args: string[]) => void> = { start: tickStart, end: tickEnd };

function tick(args: string[]): void {
  const [sub, ...rest] = args;
  if (sub === undefined || !Object.hasOwn(TICK_COMMANDS, sub)) throw usage(TICK_USAGE);
  withDb((db) => TICK_COMMANDS[sub](db, rest));
}

const PAUSE_USAGE = "pause <set|clear>";

function pauseSet(db: Database): void {
  try {
    db.run("INSERT INTO pauses (started_at) VALUES (?)", [now()]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    throw new Fail(EXIT.USAGE, "a pause is already open");
  }
}

function pauseClear(db: Database): void {
  if (db.run("UPDATE pauses SET ended_at = ? WHERE ended_at IS NULL", [now()]).changes === 0) {
    throw new Fail(EXIT.USAGE, "no open pause");
  }
}

function pause(args: string[]): void {
  if (args.length !== 1 || (args[0] !== "set" && args[0] !== "clear")) throw usage(PAUSE_USAGE);
  withDb((db) => (args[0] === "set" ? pauseSet(db) : pauseClear(db)));
}

type Candidate = { kind: string; ref: string; detail: string };
type Pause = { started_at: string; ended_at: string | null };
type Clock = { nowMs: number; pauses: Pause[] };

function pausedMs(clock: Clock, sinceMs: number): number {
  return clock.pauses.reduce((sum, p) => {
    const end = p.ended_at === null ? clock.nowMs : Math.min(Date.parse(p.ended_at), clock.nowMs);
    return sum + Math.max(0, end - Math.max(Date.parse(p.started_at), sinceMs));
  }, 0);
}

// time spent paused does not age anything
function ageMs(clock: Clock, since: string): number {
  const sinceMs = Date.parse(since);
  return clock.nowMs - sinceMs - pausedMs(clock, sinceMs);
}

function orderUntaken(db: Database, clock: Clock): Candidate[] {
  const open = db
    .query("SELECT id, precinct, role, at FROM dispatches WHERE outcome IS NULL AND taken_at IS NULL")
    .all() as { id: number; precinct: string; role: string; at: string }[];
  return open
    .filter((o) => ageMs(clock, o.at) > ORDER_UNTAKEN_MS)
    .map((o) => ({ kind: "order-untaken", ref: String(o.id), detail: `${o.precinct} ${o.role} ordered ${o.at}` }));
}

function tickHung(db: Database, clock: Clock): Candidate[] {
  const open = db.query("SELECT id, role, started_at FROM ticks WHERE ended_at IS NULL").all() as {
    id: number;
    role: string;
    started_at: string;
  }[];
  return open
    .filter((t) => ageMs(clock, t.started_at) > TICK_HUNG_MS)
    .map((t) => ({ kind: "tick-hung", ref: String(t.id), detail: `${t.role} started ${t.started_at}` }));
}

function roleSilent(db: Database, clock: Clock): Candidate[] {
  const latest = db
    .query(
      `SELECT r.name, r.every_minutes, max(t.started_at) AS last FROM roles r
       JOIN ticks t ON t.role = r.name
       WHERE EXISTS (SELECT 1 FROM ticks e WHERE e.role = r.name AND e.ended_at IS NOT NULL)
       GROUP BY r.name`,
    )
    .all() as { name: string; every_minutes: number; last: string }[];
  return latest
    .filter((r) => ageMs(clock, r.last) > ROLE_SILENT_INTERVALS * r.every_minutes * MINUTE_MS)
    .map((r) => ({ kind: "role-silent", ref: r.name, detail: `last tick started ${r.last}` }));
}

function tickFailing(db: Database): Candidate[] {
  const failing = db
    .query(
      `WITH ranked AS (
         SELECT role, precinct, outcome,
                ROW_NUMBER() OVER (PARTITION BY role, precinct ORDER BY ended_at DESC, id DESC) AS n
         FROM ticks WHERE ended_at IS NOT NULL AND precinct IS NOT NULL)
       SELECT role, precinct FROM ranked WHERE n <= ${TICK_FAILING_RUN}
       GROUP BY role, precinct
       HAVING count(*) = ${TICK_FAILING_RUN}
          AND sum(outcome LIKE 'stopped-%' OR outcome LIKE 'skipped-%' OR outcome = 'failed') = ${TICK_FAILING_RUN}
       ORDER BY role, precinct`,
    )
    .all() as { role: string; precinct: string }[];
  return failing.map((f) => ({
    kind: "tick-failing",
    ref: `${f.role}/${f.precinct}`,
    detail: `last ${TICK_FAILING_RUN} ticks stopped, skipped or failed`,
  }));
}

function brokenLead(db: Database): Candidate[] {
  const broken = db
    .query(
      `SELECT precinct, issue FROM issues i
       WHERE substr(title, 1, ${LEAD_PREFIX.length}) = '${LEAD_PREFIX}'
         AND NOT EXISTS (
           SELECT 1 FROM markers m WHERE m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead')
       ORDER BY precinct, issue`,
    )
    .all() as { precinct: string; issue: number }[];
  return broken.map((b) => ({
    kind: "broken-lead",
    ref: `${b.precinct}#${b.issue}`,
    detail: `title starts with ${LEAD_PREFIX} but no lead marker`,
  }));
}

const DETECTORS = [orderUntaken, tickHung, roleSilent, tickFailing, brokenLead] as ((db: Database, clock: Clock) => Candidate[])[];

type OpenAlarm = { id: number; kind: string; ref: string; detail: string; notified_at: string };

const alarmKey = (a: { kind: string; ref: string }) => `${a.kind} ${a.ref}`;
const alarmLine = (a: Candidate) => `ALARM ${a.kind} ${a.ref} ${a.detail}`;

function reconcileAlarms(db: Database, stamp: string, repeat: boolean): string[] {
  const nowMs = Date.parse(stamp);
  const pauses = db.query("SELECT started_at, ended_at FROM pauses").all() as Pause[];
  const wanted = DETECTORS.flatMap((detect) => detect(db, { nowMs, pauses }));
  const open = db
    .query("SELECT id, kind, ref, detail, notified_at FROM alarms WHERE cleared_at IS NULL ORDER BY id")
    .all() as OpenAlarm[];
  const wantedKeys = new Set(wanted.map(alarmKey));
  const openKeys = new Set(open.map(alarmKey));
  const lines: string[] = [];
  for (const o of open) {
    if (!wantedKeys.has(alarmKey(o))) db.run("UPDATE alarms SET cleared_at = ? WHERE id = ?", [stamp, o.id]);
  }
  for (const w of wanted) {
    if (openKeys.has(alarmKey(w))) continue;
    db.run("INSERT INTO alarms (kind, ref, detail, raised_at, notified_at) VALUES (?, ?, ?, ?, ?)", [
      w.kind,
      w.ref,
      w.detail,
      stamp,
      stamp,
    ]);
    lines.push(alarmLine(w));
  }
  const due = isoSeconds(new Date(nowMs - ALARM_REPEAT_MS));
  for (const o of open) {
    if (!repeat || !wantedKeys.has(alarmKey(o)) || o.notified_at >= due) continue;
    db.run("UPDATE alarms SET notified_at = ? WHERE id = ?", [stamp, o.id]);
    lines.push(alarmLine(o));
  }
  return lines;
}

function alarm(args: string[]): void {
  const text = "alarm [--repeat]";
  if (args.length > 1 || (args.length === 1 && args[0] !== "--repeat")) throw usage(text);
  const stamp = now();
  withDb((db) => {
    for (const line of inTransaction(db, () => reconcileAlarms(db, stamp, args.length === 1))) out(line);
  });
}

function statusPrecincts(db: Database): string[] {
  const rows = db.query("SELECT name, weight, credit, synced_at FROM precincts ORDER BY name").all() as {
    name: string;
    weight: number;
    credit: number;
    synced_at: string | null;
  }[];
  return rows.map((r) => `precinct ${r.name} weight=${r.weight} credit=${r.credit} synced=${r.synced_at ?? "never"}`);
}

function statusOrders(db: Database): string[] {
  const rows = db
    .query(
      "SELECT id, precinct, role, department, issue, at, taken_at FROM dispatches WHERE outcome IS NULL ORDER BY at, id",
    )
    .all() as { id: number; precinct: string; role: string; department: string | null; issue: number | null; at: string; taken_at: string | null }[];
  return rows.map(
    (r) =>
      `order ${r.id} ${r.precinct} ${r.role} ${r.department ?? "-"} ${r.issue ?? "-"} since ${r.at} ${r.taken_at ? `taken ${r.taken_at}` : "untaken"}`,
  );
}

function statusTicks(db: Database): string[] {
  const rows = db
    .query(
      `SELECT role, started_at, ended_at, outcome FROM ticks t
       WHERE id = (SELECT id FROM ticks WHERE role = t.role ORDER BY started_at DESC, id DESC LIMIT 1)
       ORDER BY role`,
    )
    .all() as { role: string; started_at: string; ended_at: string | null; outcome: string | null }[];
  return rows.map((r) =>
    r.ended_at === null
      ? `last-tick ${r.role} running since ${r.started_at}`
      : `last-tick ${r.role} ${r.outcome} at ${r.ended_at}`,
  );
}

function statusAlarms(db: Database): string[] {
  const rows = db
    .query("SELECT kind, ref, detail, raised_at FROM alarms WHERE cleared_at IS NULL ORDER BY id")
    .all() as { kind: string; ref: string; detail: string; raised_at: string }[];
  return rows.map((r) => `alarm ${r.kind} ${r.ref} ${r.detail} since ${r.raised_at}`);
}

function statusLeads(db: Database): string[] {
  const rows = db
    .query(
      `SELECT m.department, count(*) AS n FROM issues i
       JOIN markers m ON m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead'
       WHERE i.state = 'OPEN' AND m.ord = (
         SELECT min(ord) FROM markers WHERE precinct = i.precinct AND issue = i.issue AND stage = 'lead')
       GROUP BY m.department ORDER BY m.department`,
    )
    .all() as { department: string | null; n: number }[];
  return rows.length === 0 ? ["leads 0"] : rows.map((r) => `leads ${r.department ?? "-"} ${r.n}`);
}

function statusPause(db: Database): string[] {
  const open = db.query("SELECT started_at FROM pauses WHERE ended_at IS NULL").get() as { started_at: string } | null;
  return open ? [`pause since ${open.started_at}`] : [];
}

function status(args: string[]): void {
  if (args.length > 0) throw usage("status");
  withDb((db) => {
    const sections = [statusPrecincts, statusOrders, statusTicks, statusAlarms, statusLeads, statusPause];
    for (const section of sections) for (const line of section(db)) out(line);
  });
}

export const COMMANDS: Record<string, Handler> = { probe, precinct, role, next, dispatch, tick, pause, alarm, status };

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

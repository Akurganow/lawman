import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import {
  EXIT,
  Fail,
  BODY_MAX_BYTES,
  CONSTITUTION_HEADINGS,
  DEPARTMENT_HEADINGS,
  MARKER_MAX_BYTES,
  MIGRATIONS,
  canonicalId,
  check,
  collectIssueMarkers,
  dbPath,
  decodeIdPart,
  encodeIdPart,
  extractMarkers,
  lintBody,
  lintPage,
  now,
  open,
  parseMarker,
  pickNext,
  probeLine,
  CAP_TABLE,
  SYNC_LIMIT,
} from "./journal";
import issues from "./fixtures/issues.json";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src", "journal.ts");
const HARNESS = `
const j = await import(${JSON.stringify(SRC)});
j.COMMANDS["open-db"] = () => { j.open().close(); };
process.exitCode = j.main(["open-db"]);
`;

let dir: string;
let dbFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lawman-test-"));
  dbFile = join(dir, "journal.sqlite");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function env(extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: process.env.PATH ?? "", ...extra };
}

function cli(args: string[], extra: Record<string, string> = {}) {
  const r = Bun.spawnSync(["bun", "src/journal.ts", ...args], { cwd: ROOT, env: env(extra) });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function harness(extra: Record<string, string>) {
  return Bun.spawn(["bun", "-e", HARNESS], { cwd: ROOT, env: env(extra), stdout: "pipe", stderr: "pipe" });
}

function tables(db: Database): string[] {
  const rows = db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
  return rows.map((r) => r.name);
}

function userVersion(db: Database): number {
  return (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
}

describe("exit codes", () => {
  test("table matches the contract", () => {
    expect(EXIT).toEqual({
      OK: 0,
      USAGE: 1,
      DUPLICATE_ORDER: 2,
      SYNC_LIMIT: 3,
      SYNC_INPUT: 4,
      SCHEMA: 6,
      LINT_BODY: 7,
      LINT_PAGE: 8,
    });
  });
});

describe("open", () => {
  test("fresh database reaches the current user_version", () => {
    const db = open(dbFile);
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    expect(tables(db)).toEqual(
      expect.arrayContaining(["alarms", "dispatches", "issues", "markers", "precincts", "roles", "ticks"]),
    );
    db.close();
  });

  test("sets WAL, busy timeout and foreign keys", () => {
    const db = open(dbFile);
    expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(db.query("PRAGMA busy_timeout").get()).toEqual({ timeout: 5000 });
    expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  test("database at version 0 with no tables migrates and keeps its rows", () => {
    const legacy = new Database(dbFile);
    legacy.run("CREATE TABLE legacy (x INTEGER)");
    legacy.run("INSERT INTO legacy VALUES (42)");
    legacy.close();
    const db = open(dbFile);
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    expect(db.query("SELECT x FROM legacy").get()).toEqual({ x: 42 });
    db.close();
  });

  test("reopening a migrated database changes nothing", () => {
    open(dbFile).close();
    const db = open(dbFile);
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  test("migration 1 enforces one open order per precinct, role and issue", () => {
    const db = open(dbFile);
    db.run("INSERT INTO precincts (name, repo, weight) VALUES ('p', 'o/p', 1)");
    const add = (issue: number | null) =>
      db.run("INSERT INTO dispatches (at, precinct, role, issue) VALUES ('t', 'p', 'patrol', ?)", [issue]);
    add(null);
    expect(() => add(null)).toThrow();
    add(7);
    expect(() => add(7)).toThrow();
    db.close();
  });

  test("migration 1 allows one open alarm per kind and ref", () => {
    const db = open(dbFile);
    const raise = () =>
      db.run("INSERT INTO alarms (kind, ref, detail, raised_at, notified_at) VALUES ('k', 'r', 'd', 't', 't')");
    raise();
    expect(() => raise()).toThrow();
    db.run("UPDATE alarms SET cleared_at = 't'");
    raise();
    db.close();
  });

  test("database newer than the binary fails with the schema code", () => {
    const newer = new Database(dbFile);
    newer.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    newer.close();
    try {
      open(dbFile);
      throw new Error("open did not fail");
    } catch (e) {
      expect(e).toBeInstanceOf(Fail);
      expect((e as Fail).code).toBe(EXIT.SCHEMA);
    }
  });

  test("two processes opening the same new database both succeed", async () => {
    const procs = Array.from({ length: 4 }, () => harness({ LAWMAN_DB: dbFile }));
    const codes = await Promise.all(procs.map((p) => p.exited));
    expect(codes).toEqual([0, 0, 0, 0]);
    const db = open(dbFile);
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });
});

describe("cli", () => {
  test("--version prints the package version", () => {
    const r = cli(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`${pkg.version}\n`);
  });

  test("unknown subcommand exits 1 with usage on stderr", () => {
    const r = cli(["frobnicate"]);
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toContain("usage");
  });

  test("no subcommand exits 1", () => {
    expect(cli([]).code).toBe(1);
  });

  test("database newer than the binary makes a command exit 6", async () => {
    const newer = new Database(dbFile);
    newer.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    newer.close();
    const p = harness({ LAWMAN_DB: dbFile });
    expect(await p.exited).toBe(6);
    expect(await new Response(p.stderr).text()).toContain("newer");
  });

  test("any command exits 1 when LAWMAN_NOW is set without LAWMAN_DB", () => {
    for (const args of [["--version"], ["probe"], ["frobnicate"]]) {
      const r = cli(args, { LAWMAN_NOW: "2026-01-01T00:00:00Z" });
      expect(r.code).toBe(1);
      expect(r.err.trim().split("\n")).toHaveLength(1);
      expect(r.err).toContain("LAWMAN_NOW");
    }
  });

  test("--version still works with both variables set", () => {
    const r = cli(["--version"], { LAWMAN_DB: dbFile, LAWMAN_NOW: "2026-01-01T00:00:00Z" });
    expect(r.code).toBe(0);
  });
});

describe("probe", () => {
  test("probe prints the version, schema and journal mode and leaves no row", () => {
    const db = open(dbFile);
    expect(probeLine(db)).toBe(`journal ${pkg.version} schema ${MIGRATIONS.length} wal`);
    expect(db.query("SELECT count(*) AS n FROM roles").get()).toEqual({ n: 0 });
    db.close();
  });

  test("--schema above the supported version exits 6", () => {
    const r = cli(["probe", "--schema", "99"]);
    expect(r.code).toBe(6);
  });

  test("--schema that is not a number exits 1", () => {
    expect(cli(["probe", "--schema", "abc"]).code).toBe(1);
    expect(cli(["probe", "--schema"]).code).toBe(1);
    expect(cli(["probe", "--bogus"]).code).toBe(1);
  });

  test("exits 1 when LAWMAN_NOW is set", () => {
    const r = cli(["probe"], { LAWMAN_DB: dbFile, LAWMAN_NOW: "2026-01-01T00:00:00Z" });
    expect(r.code).toBe(1);
  });

  test("exits 1 when LAWMAN_DB is set", () => {
    const r = cli(["probe"], { LAWMAN_DB: dbFile });
    expect(r.code).toBe(1);
    expect(r.err).toContain("LAWMAN_DB");
  });
});

describe("paths and clock", () => {
  test("default database sits one directory above the binary directory", () => {
    expect(dbPath({}, "/opt/lawman/bin/journal")).toBe("/opt/lawman/journal.sqlite");
  });

  test("LAWMAN_DB overrides the default", () => {
    expect(dbPath({ LAWMAN_DB: "/x/y.sqlite" }, "/opt/lawman/bin/journal")).toBe("/x/y.sqlite");
  });

  test("now returns ISO UTC seconds from the system clock", () => {
    expect(now({})).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test("now reads LAWMAN_NOW only with LAWMAN_DB and drops sub-second digits", () => {
    const env = { LAWMAN_DB: "x", LAWMAN_NOW: "2026-01-02T03:04:05.678Z" };
    expect(now(env)).toBe("2026-01-02T03:04:05Z");
  });

  test("now rejects LAWMAN_NOW without LAWMAN_DB", () => {
    expect(() => now({ LAWMAN_NOW: "2026-01-02T03:04:05Z" })).toThrow(Fail);
  });

  test("now rejects an unparsable LAWMAN_NOW", () => {
    try {
      now({ LAWMAN_DB: "x", LAWMAN_NOW: "yesterday" });
      throw new Error("now did not fail");
    } catch (e) {
      expect((e as Fail).code).toBe(EXIT.USAGE);
    }
  });
});

describe("argument validators", () => {
  const good = {
    precinct: ["a", "ai-plugins", "x1-y2"],
    role: ["patrol", "duty-desk", "a1"],
    repo: ["o/r", "Some-Org/repo.name_1", "a.b/c-d"],
    login: ["a", "octo-cat", "A1", "a".repeat(39)],
    outcome: ["silent", "ordered", "filed", "capped", "failed", "skipped-no-constitution", "stopped-gh-auth"],
  } as const;
  const bad = {
    precinct: ["", "A", "1a", "-a", "a_b", "a b", "a\n", "a/b"],
    role: ["", "Patrol", "9", "a.b", "a\nb"],
    repo: ["", "o", "o/", "/r", "o/r/x", "o r/x", "o/r\n", "o/r;ls"],
    login: ["", "-a", "a-", "a--b-", "a_b", "a".repeat(40), "a b", "a\n"],
    outcome: ["", "done", "skipped", "skipped-", "skipped-A", "stopped-x y", "silent\n", "Silent", "filed-extra"],
  } as const;

  for (const kind of Object.keys(good) as (keyof typeof good)[]) {
    test(`${kind} accepts valid values`, () => {
      for (const v of good[kind]) expect(check(kind, v)).toBe(v);
    });

    test(`${kind} rejects invalid values with the usage code`, () => {
      for (const v of bad[kind]) {
        try {
          check(kind, v);
          throw new Error(`accepted ${JSON.stringify(v)}`);
        } catch (e) {
          expect(e).toBeInstanceOf(Fail);
          expect((e as Fail).code).toBe(EXIT.USAGE);
        }
      }
    });
  }
});

function run(args: string[]) {
  return cli(args, { LAWMAN_DB: dbFile });
}

function addPrecincts(weights: Record<string, number>): void {
  for (const [name, weight] of Object.entries(weights)) {
    expect(run(["precinct", "add", name, "--repo", `o/${name}`, "--weight", String(weight)]).code).toBe(0);
  }
}

function credits(): Record<string, number> {
  const rows = run(["precinct", "list"]).out.trim().split("\n").map((l) => l.split("\t"));
  return Object.fromEntries(rows.map((r) => [r[0], Number(r[3])]));
}

function openOrder(db: Database, precinct: string, role: string, at = "t"): void {
  db.run("INSERT INTO dispatches (at, precinct, role) VALUES (?, ?, ?)", [at, precinct, role]);
}

function tally(picks: (string | undefined)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of picks) if (p) counts[p] = (counts[p] ?? 0) + 1;
  return counts;
}

const START_MS = Date.parse("2026-03-01T00:00:00Z");
const UNEVEN_STEP_SECONDS = (i: number) => ((i * 7919) % 100003) + 1;

function cycles(weights: Record<string, number>, count: number, stepSeconds: (i: number) => number): string[] {
  const db = open(dbFile);
  for (const [name, weight] of Object.entries(weights)) {
    db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [name, `o/${name}`, weight]);
  }
  const picks: string[] = [];
  let ms = START_MS;
  for (let i = 0; i < count; i++) {
    ms += stepSeconds(i) * 1000;
    const clock = { LAWMAN_DB: "x", LAWMAN_NOW: new Date(ms).toISOString() };
    const pick = pickNext(db, "patrol")!;
    picks.push(pick.name);
    openOrder(db, pick.name, "patrol", now(clock));
    db.run("UPDATE dispatches SET outcome = 'silent', closed_at = ? WHERE outcome IS NULL", [now(clock)]);
  }
  db.close();
  return picks;
}

describe("precinct and role commands", () => {
  test("add then list shows name, repo, weight, credit and synced_at ordered by name", () => {
    addPrecincts({ zeta: 1, alpha: 2 });
    expect(run(["precinct", "list"]).out).toBe("alpha\to/alpha\t2\t0\t\nzeta\to/zeta\t1\t0\t\n");
  });

  test("duplicate add exits 1", () => {
    addPrecincts({ alpha: 1 });
    expect(run(["precinct", "add", "alpha", "--repo", "o/other", "--weight", "1"]).code).toBe(1);
    expect(run(["precinct", "add", "beta", "--repo", "o/alpha", "--weight", "1"]).code).toBe(1);
  });

  test("invalid arguments exit 1", () => {
    const bad = [
      ["precinct", "add", "Bad", "--repo", "o/r", "--weight", "1"],
      ["precinct", "add", "ok", "--repo", "nope", "--weight", "1"],
      ["precinct", "add", "ok", "--repo", "o/r", "--weight", "-1"],
      ["precinct", "add", "ok", "--repo", "o/r", "--weight", "1.5"],
      ["precinct", "add", "ok", "--repo", "o/r", "--weight", "x"],
      ["precinct", "add", "ok", "--repo", "o/r"],
      ["precinct", "add", "ok", "--weight", "1"],
      ["precinct", "add", "ok", "--repo", "o/r", "--weight", "1", "--bogus", "2"],
      ["precinct", "set", "missing", "--weight", "1"],
      ["precinct", "set", "Bad", "--weight", "1"],
      ["precinct", "bogus"],
      ["role", "set", "patrol", "--every", "0"],
      ["role", "set", "patrol", "--every", "-5"],
      ["role", "set", "patrol", "--every", "1.5"],
      ["role", "set", "Patrol", "--every", "5"],
      ["role", "set", "patrol"],
      ["next"],
      ["next", "--role", "Bad"],
    ];
    for (const args of bad) expect([args, run(args).code]).toEqual([args, 1]);
  });

  test("role set upserts", () => {
    expect(run(["role", "set", "patrol", "--every", "30"]).code).toBe(0);
    expect(run(["role", "set", "patrol", "--every", "45"]).code).toBe(0);
    const db = open(dbFile);
    expect(db.query("SELECT name, every_minutes FROM roles").all()).toEqual([{ name: "patrol", every_minutes: 45 }]);
    db.close();
  });

  test("precinct set updates weight and resets every credit to 0", () => {
    addPrecincts({ a: 2, b: 1 });
    run(["next", "--role", "patrol"]);
    expect(Object.values(credits()).some((c) => c !== 0)).toBe(true);
    expect(run(["precinct", "set", "b", "--weight", "7"]).code).toBe(0);
    expect(credits()).toEqual({ a: 0, b: 0 });
    expect(run(["precinct", "list"]).out).toContain("b\to/b\t7\t0");
  });
});

describe("next", () => {
  test("prints name and repo separated by a tab, nothing when no precinct is admitted", () => {
    expect(run(["next", "--role", "patrol"])).toMatchObject({ code: 0, out: "" });
    addPrecincts({ idle: 0 });
    expect(run(["next", "--role", "patrol"])).toMatchObject({ code: 0, out: "" });
    addPrecincts({ busy: 1 });
    expect(run(["next", "--role", "patrol"]).out).toBe("busy\to/busy\n");
  });

  test("weights 4/3/2: the first nine picks hold each precinct 4, 3 and 2 times", () => {
    const picks = cycles({ a: 4, b: 3, c: 2 }, 9, () => 60);
    expect(tally(picks)).toEqual({ a: 4, b: 3, c: 2 });
  });

  test("weights 4/3/2 over 900 cycles give 400/300/200 and ignore the clock", () => {
    const frozen = cycles({ a: 4, b: 3, c: 2 }, 900, () => 0);
    expect(tally(frozen)).toEqual({ a: 400, b: 300, c: 200 });
    rmSync(dbFile);
    const advancing = cycles({ a: 4, b: 3, c: 2 }, 900, UNEVEN_STEP_SECONDS);
    expect(advancing).toEqual(frozen);
  });

  test("weights 5/3/2 over 1000 cycles give 500/300/200 and ignore the clock", () => {
    const frozen = cycles({ a: 5, b: 3, c: 2 }, 1000, () => 0);
    expect(tally(frozen)).toEqual({ a: 500, b: 300, c: 200 });
    rmSync(dbFile);
    const advancing = cycles({ a: 5, b: 3, c: 2 }, 1000, UNEVEN_STEP_SECONDS);
    expect(advancing).toEqual(frozen);
  });

  test("the command line gives the same nine picks under a frozen and an advancing LAWMAN_NOW", () => {
    const sequence = (nowFor: (i: number) => string) => {
      addPrecincts({ a: 4, b: 3, c: 2 });
      const db = open(dbFile);
      const picks: string[] = [];
      for (let i = 0; i < 9; i++) {
        const r = cli(["next", "--role", "patrol"], { LAWMAN_DB: dbFile, LAWMAN_NOW: nowFor(i) });
        const name = r.out.split("\t")[0];
        picks.push(name);
        openOrder(db, name, "patrol");
        db.run("UPDATE dispatches SET outcome = 'silent' WHERE outcome IS NULL");
      }
      db.close();
      rmSync(dbFile);
      return picks;
    };
    const frozen = sequence(() => "2026-03-01T00:00:00Z");
    const advancing = sequence((i) => new Date(START_MS + UNEVEN_STEP_SECONDS(i) * 1000 * (i + 1)).toISOString());
    expect(tally(frozen)).toEqual({ a: 4, b: 3, c: 2 });
    expect(advancing).toEqual(frozen);
  });

  test("weight 0 is never picked", () => {
    const picks = cycles({ a: 1, z: 0, b: 1 }, 50, () => 1);
    expect(picks).not.toContain("z");
  });

  test("a precinct with an open order of this role is skipped and the others move as if it were absent", () => {
    addPrecincts({ a: 3, b: 2, c: 1 });
    const db = open(dbFile);
    openOrder(db, "a", "patrol");
    for (let i = 0; i < 4; i++) run(["next", "--role", "patrol"]);
    const withOrder = credits();
    db.close();
    rmSync(dbFile);
    addPrecincts({ b: 2, c: 1 });
    for (let i = 0; i < 4; i++) run(["next", "--role", "patrol"]);
    const absent = credits();
    expect(withOrder).toEqual({ a: 0, ...absent });
  });

  test("an open order of another role does not exclude the precinct", () => {
    addPrecincts({ a: 1 });
    const db = open(dbFile);
    openOrder(db, "a", "duty-desk");
    db.close();
    expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
  });

  test("an open order for an issue does not exclude the precinct", () => {
    addPrecincts({ a: 1 });
    const db = open(dbFile);
    db.run("INSERT INTO dispatches (at, precinct, role, issue) VALUES ('t', 'a', 'patrol', 5)");
    db.close();
    expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
  });

  test("ties go to the smaller name", () => {
    addPrecincts({ b: 1, a: 1 });
    expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
  });
});

describe("dispatch", () => {
  const T0 = "2026-04-01T00:00:00Z";
  const HOUR_MS = 3600 * 1000;
  const later = (hours: number, seconds = 0) =>
    new Date(Date.parse(T0) + hours * HOUR_MS + seconds * 1000).toISOString().replace(".000Z", "Z");
  const at = (clock: string, args: string[]) => cli(args, { LAWMAN_DB: dbFile, LAWMAN_NOW: clock });
  const add = (precinct: string, role = "patrol", extra: string[] = [], clock = T0) =>
    at(clock, ["dispatch", "add", "--precinct", precinct, "--role", role, ...extra]);
  const take = (clock = T0, role = "patrol") => at(clock, ["dispatch", "take", "--role", role]);

  test("add prints an integer id and a duplicate open order exits 2 with one stderr line", () => {
    addPrecincts({ a: 1 });
    const first = add("a");
    expect(first.code).toBe(0);
    expect(first.out).toMatch(/^\d+\n$/);
    const dup = add("a");
    expect(dup.code).toBe(2);
    expect(dup.out).toBe("");
    expect(dup.err.trim().split("\n")).toHaveLength(1);
  });

  test("orders for different issues coexist, a duplicate issue exits 2, issue and precinct level do not block each other", () => {
    addPrecincts({ a: 1 });
    expect(add("a", "patrol", ["--issue", "5"]).code).toBe(0);
    expect(add("a", "patrol", ["--issue", "6"]).code).toBe(0);
    expect(add("a", "patrol", ["--issue", "5"]).code).toBe(2);
    expect(add("a").code).toBe(0);
    expect(add("a").code).toBe(2);
    addPrecincts({ b: 1 });
    expect(add("b").code).toBe(0);
    expect(add("b", "patrol", ["--issue", "5"]).code).toBe(0);
  });

  test("add rejects bad input with exit 1", () => {
    addPrecincts({ a: 1 });
    const bad = [
      ["--precinct", "missing", "--role", "patrol"],
      ["--precinct", "a", "--role", "Patrol"],
      ["--precinct", "a", "--role", "patrol", "--department", "Bad Dept"],
      ["--precinct", "a", "--role", "patrol", "--issue", "0"],
      ["--precinct", "a", "--role", "patrol", "--issue", "x"],
      ["--precinct", "a", "--role", "patrol", "--issue", "1", "--issue", "2"],
      ["--precinct", "a"],
      ["--role", "patrol"],
    ];
    for (const args of bad) expect([args, at(T0, ["dispatch", "add", ...args]).code]).toEqual([args, 1]);
    expect(at(T0, ["dispatch"]).code).toBe(1);
    expect(at(T0, ["dispatch", "bogus"]).code).toBe(1);
  });

  test("add stores the clock time, the department and the issue", () => {
    addPrecincts({ a: 1 });
    add("a", "patrol", ["--department", "billing", "--issue", "9"], "2026-04-01T05:06:07Z");
    const db = open(dbFile);
    expect(db.query("SELECT at, department, issue, taken_at, outcome FROM dispatches").all()).toEqual([
      { at: "2026-04-01T05:06:07Z", department: "billing", issue: 9, taken_at: null, outcome: null },
    ]);
    db.close();
  });

  test("take prints id, precinct, repo, department and issue, empty for NULL", () => {
    addPrecincts({ a: 1 });
    const id = add("a", "patrol", ["--department", "billing", "--issue", "9"]).out.trim();
    expect(take().out).toBe(`${id}\ta\to/a\tbilling\t9\n`);
    addPrecincts({ b: 1 });
    const second = add("b").out.trim();
    expect(take().out).toBe(`${second}\tb\to/b\t\t\n`);
  });

  test("take prints nothing and exits 0 when no order is open for the role", () => {
    addPrecincts({ a: 1 });
    expect(take()).toMatchObject({ code: 0, out: "" });
    add("a", "duty-desk");
    expect(take()).toMatchObject({ code: 0, out: "" });
    expect(take(T0, "Bad").code).toBe(1);
  });

  test("take returns the oldest open order first", () => {
    addPrecincts({ a: 1, b: 1 });
    const older = add("b", "patrol", [], later(0)).out.trim();
    const newer = add("a", "patrol", [], later(1)).out.trim();
    expect(take(later(2)).out.split("\t")[0]).toBe(older);
    expect(take(later(2)).out.split("\t")[0]).toBe(newer);
    expect(take(later(2)).out).toBe("");
  });

  test("two concurrent takes hand the single order to exactly one", async () => {
    addPrecincts({ a: 1 });
    add("a");
    const spawn = () =>
      Bun.spawn(["bun", "src/journal.ts", "dispatch", "take", "--role", "patrol"], {
        cwd: ROOT,
        env: env({ LAWMAN_DB: dbFile, LAWMAN_NOW: T0 }),
        stdout: "pipe",
        stderr: "pipe",
      });
    const procs = [spawn(), spawn()];
    const codes = await Promise.all(procs.map((p) => p.exited));
    const outs = await Promise.all(procs.map((p) => new Response(p.stdout).text()));
    expect(codes).toEqual([0, 0]);
    expect(outs.filter((o) => o !== "")).toHaveLength(1);
  });

  test("a taken order is reclaimed only after 24 hours", () => {
    addPrecincts({ a: 1 });
    const id = add("a").out.trim();
    expect(take(T0).out).not.toBe("");
    expect(take(later(0, 1)).out).toBe("");
    expect(take(later(23, 3599)).out).toBe("");
    expect(take(later(24)).out).toBe("");
    expect(take(later(24, 1)).out.split("\t")[0]).toBe(id);
    expect(take(later(24, 2)).out).toBe("");
  });

  test("close sets the outcome and closing time, and the pair can be ordered again", () => {
    addPrecincts({ a: 1 });
    const id = add("a").out.trim();
    expect(at(later(1), ["dispatch", "close", id, "--outcome", "filed"])).toMatchObject({ code: 0, out: "" });
    const db = open(dbFile);
    expect(db.query("SELECT outcome, closed_at FROM dispatches WHERE id = ?").get(Number(id))).toEqual({
      outcome: "filed",
      closed_at: later(1),
    });
    db.close();
    expect(take(later(2)).out).toBe("");
    expect(add("a").code).toBe(0);
  });

  test("close rejects a bad token, an unknown id and an already closed order with exit 1", () => {
    addPrecincts({ a: 1 });
    const id = add("a").out.trim();
    expect(at(T0, ["dispatch", "close", id, "--outcome", "bogus-token"]).code).toBe(1);
    expect(at(T0, ["dispatch", "close", "9999", "--outcome", "filed"]).code).toBe(1);
    expect(at(T0, ["dispatch", "close", "x", "--outcome", "filed"]).code).toBe(1);
    expect(at(T0, ["dispatch", "close", id, "--outcome", "filed"]).code).toBe(0);
    const again = at(T0, ["dispatch", "close", id, "--outcome", "failed"]);
    expect(again.code).toBe(1);
    expect(again.err.trim().split("\n")).toHaveLength(1);
  });

  test("next skips a precinct with an open order and admits it again after close", () => {
    addPrecincts({ a: 1 });
    const id = add("a").out.trim();
    expect(run(["next", "--role", "patrol"]).out).toBe("");
    at(T0, ["dispatch", "close", id, "--outcome", "silent"]);
    expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
  });
});

describe("ticks, pauses, alarms and status", () => {
  const BASE = "2026-05-01T00:00:00Z";
  const later = (hours: number, seconds = 0) =>
    new Date(Date.parse(BASE) + hours * 3600 * 1000 + seconds * 1000).toISOString().replace(".000Z", "Z");
  const at = (clock: string, args: string[], stdin = "") =>
    Bun.spawnSync(["bun", "src/journal.ts", ...args], {
      cwd: ROOT,
      env: env({ LAWMAN_DB: dbFile, LAWMAN_NOW: clock }),
      stdin: Buffer.from(stdin),
    });
  const call = (clock: string, args: string[], stdin = "") => {
    const r = at(clock, args, stdin);
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };
  const alarm = (clock: string, ...flags: string[]) => call(clock, ["alarm", ...flags]);
  const seed = (body: (db: Database) => void) => {
    const db = open(dbFile);
    body(db);
    db.close();
  };
  const rows = (sql: string) => {
    const db = open(dbFile);
    const result = db.query(sql).all();
    db.close();
    return result;
  };
  const precinct = (db: Database, name: string) =>
    db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, 1)", [name, `o/${name}`]);
  const tick = (db: Database, role: string, startedAt: string, endedAt: string | null, outcome: string | null, p: string | null = null) =>
    db.run("INSERT INTO ticks (role, precinct, started_at, ended_at, outcome) VALUES (?, ?, ?, ?, ?)", [
      role,
      p,
      startedAt,
      endedAt,
      outcome,
    ]);

  describe("migration 2", () => {
    test("creates pauses and allows only one open pause", () => {
      const db = open(dbFile);
      expect(MIGRATIONS).toHaveLength(2);
      expect(tables(db)).toContain("pauses");
      db.run("INSERT INTO pauses (started_at) VALUES ('a')");
      expect(() => db.run("INSERT INTO pauses (started_at) VALUES ('b')")).toThrow();
      db.run("UPDATE pauses SET ended_at = 'c'");
      db.run("INSERT INTO pauses (started_at) VALUES ('d')");
      db.close();
    });
  });

  describe("tick", () => {
    test("start prints the id and stores the clock time", () => {
      const r = call(BASE, ["tick", "start", "--role", "patrol"]);
      expect(r).toMatchObject({ code: 0, out: "1\n" });
      expect(rows("SELECT role, started_at, ended_at FROM ticks")).toEqual([
        { role: "patrol", started_at: BASE, ended_at: null },
      ]);
    });

    test("end stores outcome, precinct, department and the stdin report", () => {
      const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
      const end = call(later(1), ["tick", "end", id, "--outcome", "filed", "--precinct", "a", "--department", "billing"], "line one\nline two\n");
      expect(end).toMatchObject({ code: 0, out: "" });
      expect(rows("SELECT precinct, department, started_at, ended_at, outcome, report FROM ticks")).toEqual([
        {
          precinct: "a",
          department: "billing",
          started_at: BASE,
          ended_at: later(1),
          outcome: "filed",
          report: "line one\nline two\n",
        },
      ]);
    });

    test("end accepts an empty report and no precinct", () => {
      const id = call(BASE, ["tick", "start", "--role", "duty-desk"]).out.trim();
      expect(call(later(1), ["tick", "end", id, "--outcome", "silent"]).code).toBe(0);
      expect(rows("SELECT precinct, department, report, outcome FROM ticks")).toEqual([
        { precinct: null, department: null, report: "", outcome: "silent" },
      ]);
    });

    test("end with --dispatch closes the order with the same outcome", () => {
      seed((db) => precinct(db, "a"));
      const order = call(BASE, ["dispatch", "add", "--precinct", "a", "--role", "patrol"]).out.trim();
      const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
      expect(call(later(1), ["tick", "end", id, "--outcome", "capped", "--dispatch", order]).code).toBe(0);
      expect(rows("SELECT outcome, closed_at FROM dispatches")).toEqual([{ outcome: "capped", closed_at: later(1) }]);
      expect(rows("SELECT outcome FROM ticks")).toEqual([{ outcome: "capped" }]);
    });

    test("an unknown or closed order exits 1 and leaves the tick unended", () => {
      seed((db) => precinct(db, "a"));
      const order = call(BASE, ["dispatch", "add", "--precinct", "a", "--role", "patrol"]).out.trim();
      call(BASE, ["dispatch", "close", order, "--outcome", "silent"]);
      const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
      for (const dispatch of ["9999", order]) {
        const r = call(later(1), ["tick", "end", id, "--outcome", "filed", "--dispatch", dispatch], "report");
        expect(r.code).toBe(1);
        expect(r.err.trim().split("\n")).toHaveLength(1);
        expect(rows("SELECT ended_at, outcome, report FROM ticks")).toEqual([
          { ended_at: null, outcome: null, report: null },
        ]);
      }
    });

    test("an unknown or already ended tick exits 1 and keeps the first end", () => {
      expect(call(BASE, ["tick", "end", "9", "--outcome", "silent"]).code).toBe(1);
      const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
      expect(call(later(1), ["tick", "end", id, "--outcome", "silent"], "first").code).toBe(0);
      expect(call(later(2), ["tick", "end", id, "--outcome", "failed"], "second").code).toBe(1);
      expect(rows("SELECT outcome, report FROM ticks")).toEqual([{ outcome: "silent", report: "first" }]);
    });

    test("bad arguments exit 1", () => {
      const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
      const bad = [
        ["tick"],
        ["tick", "bogus"],
        ["tick", "start"],
        ["tick", "start", "--role", "Bad"],
        ["tick", "end", id],
        ["tick", "end", id, "--outcome", "done"],
        ["tick", "end", "x", "--outcome", "silent"],
        ["tick", "end", id, "--outcome", "silent", "--precinct", "Bad"],
        ["tick", "end", id, "--outcome", "silent", "--department", "Bad Dept"],
        ["tick", "end", id, "--outcome", "silent", "--dispatch", "0"],
      ];
      for (const args of bad) expect([args, call(BASE, args).code]).toEqual([args, 1]);
    });
  });

  describe("pause", () => {
    test("set opens a pause, clear closes it, and a new one can follow", () => {
      expect(call(BASE, ["pause", "set"])).toMatchObject({ code: 0, out: "" });
      expect(call(later(1), ["pause", "clear"])).toMatchObject({ code: 0, out: "" });
      expect(call(later(2), ["pause", "set"]).code).toBe(0);
      expect(rows("SELECT started_at, ended_at FROM pauses ORDER BY id")).toEqual([
        { started_at: BASE, ended_at: later(1) },
        { started_at: later(2), ended_at: null },
      ]);
    });

    test("a second set and a clear without an open pause exit 1", () => {
      expect(call(BASE, ["pause", "clear"]).code).toBe(1);
      call(BASE, ["pause", "set"]);
      const twice = call(later(1), ["pause", "set"]);
      expect(twice.code).toBe(1);
      expect(twice.err.trim().split("\n")).toHaveLength(1);
      call(later(2), ["pause", "clear"]);
      expect(call(later(3), ["pause", "clear"]).code).toBe(1);
    });

    test("bad arguments exit 1", () => {
      for (const args of [["pause"], ["pause", "bogus"], ["pause", "set", "extra"]]) {
        expect([args, call(BASE, args).code]).toEqual([args, 1]);
      }
    });
  });

  describe("alarm kinds", () => {
    test("order-untaken fires after 48 hours and not before", () => {
      seed((db) => {
        precinct(db, "a");
        db.run("INSERT INTO dispatches (at, precinct, role) VALUES (?, 'a', 'patrol')", [BASE]);
      });
      expect(alarm(later(48))).toMatchObject({ code: 0, out: "" });
      const r = alarm(later(48, 1));
      expect(r.out).toMatch(/^ALARM order-untaken 1 .+\n$/);
    });

    test("an order that was taken or closed does not alarm", () => {
      seed((db) => {
        precinct(db, "a");
        db.run("INSERT INTO dispatches (at, precinct, role, taken_at) VALUES (?, 'a', 'patrol', ?)", [BASE, BASE]);
        db.run("INSERT INTO dispatches (at, precinct, role, outcome) VALUES (?, 'a', 'duty-desk', 'silent')", [BASE]);
      });
      expect(alarm(later(100)).out).toBe("");
    });

    test("tick-hung fires after 2 hours and not before", () => {
      seed((db) => tick(db, "patrol", BASE, null, null));
      expect(alarm(later(2)).out).toBe("");
      expect(alarm(later(2, 1)).out).toMatch(/^ALARM tick-hung 1 .+\n$/);
    });

    test("role-silent fires after three intervals and not before", () => {
      seed((db) => {
        db.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 10)");
        tick(db, "patrol", BASE, later(0, 60), "silent");
      });
      expect(alarm(later(0, 1800)).out).toBe("");
      expect(alarm(later(0, 1801)).out).toMatch(/^ALARM role-silent patrol .+\n$/);
    });

    test("role-silent measures from the latest tick start", () => {
      seed((db) => {
        db.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 10)");
        tick(db, "patrol", BASE, later(0, 60), "silent");
        tick(db, "patrol", later(0, 1200), later(0, 1260), "silent");
      });
      expect(alarm(later(0, 3000)).out).toBe("");
      expect(alarm(later(0, 3001)).out).toMatch(/^ALARM role-silent patrol /);
    });

    test("a role with no ticks, or no ended tick, never raises role-silent", () => {
      seed((db) => {
        db.run("INSERT INTO roles (name, every_minutes) VALUES ('ghost', 1)");
        db.run("INSERT INTO roles (name, every_minutes) VALUES ('starter', 1)");
        tick(db, "starter", BASE, null, null);
      });
      expect(alarm(later(1000)).out).not.toContain("role-silent");
    });

    test("tick-failing needs the three latest ended ticks of one role and precinct to fail", () => {
      seed((db) => {
        tick(db, "patrol", later(0), later(0, 60), "filed", "a");
        tick(db, "patrol", later(1), later(1, 60), "failed", "a");
        tick(db, "patrol", later(2), later(2, 60), "stopped-gh-auth", "a");
        tick(db, "patrol", later(3), later(3, 60), "skipped-no-constitution", "b");
        tick(db, "patrol", later(4), later(4, 60), "failed", "b");
        tick(db, "duty-desk", later(5), later(5, 60), "failed", "a");
      });
      expect(alarm(later(6)).out).toBe("");
      seed((db) => tick(db, "patrol", later(6), later(6, 60), "skipped-no-departments", "a"));
      const r = alarm(later(7));
      expect(r.out).toMatch(/^ALARM tick-failing patrol\/a .+\n$/);
      expect(r.out.trim().split("\n")).toHaveLength(1);
    });

    test("a newer success ends tick-failing", () => {
      seed((db) => {
        for (let i = 0; i < 3; i++) tick(db, "patrol", later(i), later(i, 60), "failed", "a");
      });
      expect(alarm(later(4)).out).toContain("tick-failing patrol/a");
      seed((db) => tick(db, "patrol", later(5), later(5, 60), "silent", "a"));
      alarm(later(6));
      expect(rows("SELECT cleared_at FROM alarms")).toEqual([{ cleared_at: later(6) }]);
    });

    test("unended ticks and ticks without a precinct do not count towards tick-failing", () => {
      seed((db) => {
        tick(db, "patrol", later(0), later(0, 60), "failed", "a");
        tick(db, "patrol", later(1), later(1, 60), "failed", "a");
        tick(db, "patrol", later(2), null, null, "a");
        for (let i = 3; i < 6; i++) tick(db, "patrol", later(i), later(i, 60), "stopped-sync");
      });
      expect(alarm(later(6, 120)).out).not.toContain("tick-failing");
    });

    test("broken-lead fires for a [Lead] issue without a lead marker", () => {
      seed((db) => {
        const issue = (n: number, title: string) =>
          db.run("INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('a', ?, 'OPEN', ?, ?)", [n, title, BASE]);
        const marker = (n: number, stage: string) =>
          db.run("INSERT INTO markers (precinct, issue, ord, role, stage, fields, raw) VALUES ('a', ?, '1', 'patrol', ?, '{}', 'raw')", [n, stage]);
        issue(7, "[Lead] broken");
        issue(8, "[Lead] fine");
        marker(8, "lead");
        issue(9, "ordinary issue about [Lead]");
        issue(10, "[Lead] only a later stage");
        marker(10, "verify");
      });
      const r = alarm(BASE);
      expect(r.out.trim().split("\n").map((l) => l.split(" ").slice(0, 3).join(" "))).toEqual([
        "ALARM broken-lead a#7",
        "ALARM broken-lead a#10",
      ]);
    });
  });

  describe("alarm lifecycle", () => {
    const untaken = () =>
      seed((db) => {
        precinct(db, "a");
        db.run("INSERT INTO dispatches (at, precinct, role) VALUES (?, 'a', 'patrol')", [BASE]);
      });

    test("a new alarm prints once and is silent without --repeat", () => {
      untaken();
      expect(alarm(later(49)).out).toMatch(/^ALARM order-untaken 1 .+\n$/);
      expect(alarm(later(50)).out).toBe("");
      expect(alarm(later(80)).out).toBe("");
      expect(rows("SELECT kind, ref, raised_at, notified_at, cleared_at FROM alarms")).toEqual([
        { kind: "order-untaken", ref: "1", raised_at: later(49), notified_at: later(49), cleared_at: null },
      ]);
    });

    test("--repeat prints an open alarm only after 24 hours and renews the notice time", () => {
      untaken();
      alarm(later(49));
      expect(alarm(later(72), "--repeat").out).toBe("");
      expect(alarm(later(73), "--repeat").out).toBe("");
      expect(alarm(later(73, 1), "--repeat").out).toMatch(/^ALARM order-untaken 1 .+\n$/);
      expect(alarm(later(73, 2), "--repeat").out).toBe("");
      expect(rows("SELECT notified_at FROM alarms")).toEqual([{ notified_at: later(73, 1) }]);
    });

    test("--repeat prints a new alarm once, not twice", () => {
      untaken();
      expect(alarm(later(49), "--repeat").out.trim().split("\n")).toHaveLength(1);
    });

    test("the alarm clears when the condition ends and returns as new if it comes back", () => {
      untaken();
      alarm(later(49));
      call(later(50), ["dispatch", "take", "--role", "patrol"]);
      expect(alarm(later(51), "--repeat").out).toBe("");
      expect(rows("SELECT cleared_at FROM alarms")).toEqual([{ cleared_at: later(51) }]);
      seed((db) => db.run("UPDATE dispatches SET taken_at = NULL"));
      expect(alarm(later(52)).out).toMatch(/^ALARM order-untaken 1 /);
      expect(rows("SELECT cleared_at FROM alarms ORDER BY id")).toEqual([{ cleared_at: later(51) }, { cleared_at: null }]);
    });

    test("alarm prints order-untaken when every precinct has an open order and next is empty", () => {
      untaken();
      expect(call(later(49), ["next", "--role", "patrol"]).out).toBe("");
      expect(alarm(later(49)).out).toMatch(/^ALARM order-untaken 1 /);
    });

    test("bad arguments exit 1", () => {
      for (const args of [["alarm", "--bogus"], ["alarm", "--repeat", "x"], ["alarm", "x"]]) {
        expect([args, call(BASE, args).code]).toEqual([args, 1]);
      }
    });
  });

  describe("pause window", () => {
    const stuck = () =>
      seed((db) => {
        precinct(db, "a");
        db.run("INSERT INTO dispatches (at, precinct, role) VALUES (?, 'a', 'patrol')", [BASE]);
        db.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 10)");
        tick(db, "patrol", BASE, later(0, 60), "silent");
        tick(db, "duty-desk", BASE, null, null);
      });

    test("an open pause freezes the age of orders, hung ticks and silent roles", () => {
      stuck();
      call(later(0, 600), ["pause", "set"]);
      expect(alarm(later(100)).out).toBe("");
      expect(alarm(later(1000)).out).toBe("");
    });

    test("a closed pause removes its duration from the age", () => {
      stuck();
      call(later(0, 600), ["pause", "set"]);
      call(later(100), ["pause", "clear"]);
      expect(alarm(later(100)).out).toBe("");
      expect(alarm(later(147, 3000)).out).not.toContain("order-untaken");
      expect(alarm(later(147, 3001)).out).toContain("order-untaken");
    });

    test("tick-failing and broken-lead ignore the pause", () => {
      seed((db) => {
        for (let i = 0; i < 3; i++) tick(db, "patrol", later(i), later(i, 60), "failed", "a");
        db.run("INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('a', 1, 'OPEN', '[Lead] x', ?)", [BASE]);
      });
      call(later(0), ["pause", "set"]);
      const kinds = alarm(later(5)).out.trim().split("\n").map((l) => l.split(" ")[1]);
      expect(kinds.sort()).toEqual(["broken-lead", "tick-failing"]);
    });
  });

  describe("status", () => {
    test("prints every precinct, open orders, last ticks, alarms, leads and the pause", () => {
      seed((db) => {
        precinct(db, "alpha");
        precinct(db, "beta");
        db.run("UPDATE precincts SET synced_at = ? WHERE name = 'alpha'", [BASE]);
        db.run("INSERT INTO dispatches (at, precinct, role, department) VALUES (?, 'alpha', 'patrol', 'billing')", [BASE]);
        tick(db, "patrol", BASE, later(0, 60), "filed", "alpha");
        tick(db, "patrol", later(1), null, null);
        tick(db, "duty-desk", later(1), later(1, 60), "ordered", "alpha");
        const issue = (n: number, state: string) =>
          db.run("INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('alpha', ?, ?, '[Lead] t', ?)", [n, state, BASE]);
        const marker = (n: number, department: string) =>
          db.run("INSERT INTO markers (precinct, issue, ord, role, stage, department, fields, raw) VALUES ('alpha', ?, '1', 'patrol', 'lead', ?, '{}', 'r')", [n, department]);
        issue(1, "OPEN");
        marker(1, "billing");
        issue(2, "OPEN");
        marker(2, "billing");
        issue(3, "CLOSED");
        marker(3, "billing");
        issue(4, "OPEN");
        marker(4, "search");
      });
      alarm(later(60));
      call(later(61), ["pause", "set"]);
      const r = call(later(62), ["status"]);
      expect(r.code).toBe(0);
      const lines = r.out.trim().split("\n");
      expect(lines).toContain(`precinct alpha weight=1 credit=0 synced=${BASE}`);
      expect(lines).toContain("precinct beta weight=1 credit=0 synced=never");
      expect(lines.filter((l) => l.startsWith("order "))).toHaveLength(1);
      expect(lines).toContain(`order 1 alpha patrol billing - since ${BASE} untaken`);
      expect(lines).toContain(`last-tick patrol running since ${later(1)}`);
      expect(lines).toContain(`last-tick duty-desk ordered at ${later(1, 60)}`);
      expect(lines.filter((l) => l.startsWith("alarm ")).map((l) => l.split(" ").slice(0, 3).join(" "))).toEqual([
        "alarm order-untaken 1",
        "alarm tick-hung 2",
      ]);
      expect(lines).toContain("leads billing 2");
      expect(lines).toContain("leads search 1");
      expect(lines).toContain(`pause since ${later(61)}`);
    });

    test("prints precincts and zero leads on an empty journal and rejects arguments", () => {
      seed((db) => precinct(db, "solo"));
      const r = call(BASE, ["status"]);
      expect(r.out).toContain("precinct solo weight=1 credit=0 synced=never");
      expect(r.out).toContain("leads 0");
      expect(r.out).not.toContain("pause");
      expect(call(BASE, ["status", "x"]).code).toBe(1);
    });
  });
});

describe("source constraints", () => {
  test("the journal never starts processes or touches the network", () => {
    const src = readFileSync(SRC, "utf8");
    for (const banned of ["spawn", "Bun.$", "child_process", "fetch(", "exec("]) {
      expect(src).not.toContain(banned);
    }
  });
});

const TRUSTED = "octocat-lawman";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const AT = "at=2026-10-14T09:30:00Z";
const LEAD_ID = "src/a.rs::f::dead-code";
const lead = (extra = "", id = LEAD_ID) =>
  `<!-- lawman: role=patrol stage=lead department=core id=${id} sha=${SHA} ${AT}${extra} -->`;
const ret = (extra = "") => `<!-- lawman: role=judge stage=return to=patrol round=1 ${AT}${extra} -->`;

function collect(n: number) {
  const issue = issues.find((i) => i.number === n)!;
  return collectIssueMarkers(issue, TRUSTED);
}

const rounds = (n: number) => collect(n).markers.map((m) => m.marker.fields.round);

function carrier(text: string, author = TRUSTED) {
  return extractMarkers({ text, createdAt: "2026-10-14T09:00:00Z", rank: 0, author }, TRUSTED);
}

describe("parseMarker", () => {
  test("a lead keeps role, stage, every field and the raw line", () => {
    const line = lead(" of=42");
    const m = parseMarker(line)!;
    expect(m.role).toBe("patrol");
    expect(m.stage).toBe("lead");
    expect(m.raw).toBe(line);
    expect(m.fields).toEqual({
      role: "patrol",
      stage: "lead",
      department: "core",
      id: LEAD_ID,
      sha: SHA,
      at: "2026-10-14T09:30:00Z",
      of: "42",
    });
  });

  test("a return needs to and a positive round without leading zeros", () => {
    expect(parseMarker(ret())).not.toBeNull();
    for (const bad of [
      "<!-- lawman: role=judge stage=return round=1 at=2026-10-14T09:30:00Z -->",
      "<!-- lawman: role=judge stage=return to=patrol at=2026-10-14T09:30:00Z -->",
      "<!-- lawman: role=judge stage=return to=Patrol round=1 at=2026-10-14T09:30:00Z -->",
      ret().replace("round=1", "round=0"),
      ret().replace("round=1", "round=01"),
      ret().replace("round=1", "round=1.5"),
    ]) {
      expect(parseMarker(bad)).toBeNull();
    }
  });

  test("a lead needs role patrol, department, id and a lowercase 40 hex sha", () => {
    expect(parseMarker(lead())).not.toBeNull();
    expect(parseMarker(lead().replace("role=patrol", "role=judge"))).toBeNull();
    expect(parseMarker(lead().replace(" department=core", ""))).toBeNull();
    expect(parseMarker(lead().replace(` id=${LEAD_ID}`, ""))).toBeNull();
    expect(parseMarker(lead().replace(` sha=${SHA}`, ""))).toBeNull();
    expect(parseMarker(lead().replace(SHA, SHA.toUpperCase()))).toBeNull();
    expect(parseMarker(lead().replace(SHA, SHA.slice(1)))).toBeNull();
  });

  test("of is a positive integer without leading zeros", () => {
    expect(parseMarker(lead(" of=7"))).not.toBeNull();
    for (const bad of ["0", "07", "-1", "x", "1.5"]) expect(parseMarker(lead(` of=${bad}`))).toBeNull();
  });

  test("at must have the UTC shape and role, stage and at are required", () => {
    expect(parseMarker(ret().replace("2026-10-14T09:30:00Z", "2026-10-14 09:30:00Z"))).toBeNull();
    expect(parseMarker(ret().replace("2026-10-14T09:30:00Z", "2026-10-14T09:30:00+00:00"))).toBeNull();
    expect(parseMarker(ret().replace("role=judge ", ""))).toBeNull();
    expect(parseMarker(ret().replace("stage=return ", ""))).toBeNull();
    expect(parseMarker(ret().replace(` ${AT}`, ""))).toBeNull();
  });

  test("role and stage match their pattern", () => {
    expect(parseMarker("<!-- lawman: role=Judge stage=x at=2026-10-14T09:30:00Z -->")).toBeNull();
    expect(parseMarker("<!-- lawman: role=judge stage=_x at=2026-10-14T09:30:00Z -->")).toBeNull();
    expect(parseMarker("<!-- lawman: role=judge-2 stage=x-y at=2026-10-14T09:30:00Z -->")).not.toBeNull();
  });

  test("the line shape is strict", () => {
    const ok = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z -->";
    expect(parseMarker(ok)).not.toBeNull();
    for (const bad of [
      ok.replace("<!-- ", "<!--"),
      ok.replace(" -->", "-->"),
      ok.replace(" -->", "  -->"),
      ok.replace("role=judge stage", "role=judge  stage"),
      ok.replace("<!-- lawman:", "<!-- lawman:  "),
      ok.replace("role=judge", "role="),
      ok.replace("role=judge", "Role=judge"),
      ok.replace("role=judge", "role=jud>ge"),
      ok.replace("role=judge", "role=ju dge"),
      ok.replace("role=judge", "role=jüdge"),
      `${ok}\r`,
      `${ok} `,
      ` ${ok}`,
      `x ${ok}`,
    ]) {
      expect(parseMarker(bad)).toBeNull();
    }
  });

  test("values allow letters, digits and . : _ / % + - and nothing else", () => {
    const m = parseMarker("<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z v=aZ09.:_/%+-q -->")!;
    expect(m.fields.v).toBe("aZ09.:_/%+-q");
    for (const ch of ["~", "!", "=", "*", "(", ",", "'", "\\"]) {
      expect(parseMarker(`<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z v=a${ch}b -->`)).toBeNull();
    }
  });

  test("-- and :: are banned in values, except :: inside id", () => {
    const base = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z";
    expect(parseMarker(`${base} v=a--b -->`)).toBeNull();
    expect(parseMarker(`${base} v=a::b -->`)).toBeNull();
    expect(parseMarker(`${base} v=a:b -->`)).not.toBeNull();
    expect(parseMarker(`${base} v=a-b-c -->`)).not.toBeNull();
    expect(parseMarker(lead().replace("department=core", "department=a::b"))).toBeNull();
  });

  test("a duplicate key is invalid, also for names on the object prototype", () => {
    expect(parseMarker(ret(" round=1"))).toBeNull();
    const base = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z";
    expect(parseMarker(`${base} constructor=a -->`)!.fields.constructor).toBe("a");
    expect(parseMarker(`${base} constructor=a constructor=b -->`)).toBeNull();
  });

  test("unknown keys and stages are kept", () => {
    const m = parseMarker("<!-- lawman: role=curator stage=audit at=2026-10-14T09:30:00Z flavor=mint k_2=x -->")!;
    expect(m.stage).toBe("audit");
    expect(m.fields.flavor).toBe("mint");
    expect(m.fields.k_2).toBe("x");
  });

  test("the length limit counts bytes of the whole line", () => {
    const head = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z note=";
    const fill = (n: number) => head + "a".repeat(n - head.length - " -->".length) + " -->";
    expect(MARKER_MAX_BYTES).toBe(1024);
    expect(fill(1024).length).toBe(1024);
    expect(parseMarker(fill(1024))).not.toBeNull();
    expect(parseMarker(fill(1025))).toBeNull();
  });

  test("a non-ASCII byte never passes, and the byte count is not the character count", () => {
    expect(parseMarker("<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z note=é -->")).toBeNull();
  });

  test("an id value must be canonical", () => {
    expect(parseMarker(lead("", "src/my%20file.rs::Foo%3A%3Abar::dead-code"))).not.toBeNull();
    expect(parseMarker(lead("", "src/a.rs::Foo%3a%3abar::dead-code"))).toBeNull();
    expect(parseMarker(lead("", "src/%41.rs::f::dead-code"))).toBeNull();
    expect(parseMarker(lead("", "src/a.rs::f"))).toBeNull();
    expect(parseMarker(lead("", "src/a.rs::f::g::h"))).toBeNull();
    expect(parseMarker(lead("", "::f::g"))).toBeNull();
    expect(parseMarker(lead("", "src/a--b.rs::f::g"))).toBeNull();
    expect(parseMarker(lead("", "src/a-%2Db.rs::f::g"))).not.toBeNull();
  });
});

describe("id parts", () => {
  const canonical: [string, string][] = [
    ["src/a.rs", "src/a.rs"],
    ["src/my file.rs", "src/my%20file.rs"],
    ["Foo::bar", "Foo%3A%3Abar"],
    ["a-b", "a-b"],
    ["a--b", "a-%2Db"],
    ["a---b", "a-%2D%2Db"],
    ["a--b--c", "a-%2Db-%2Dc"],
    ["--", "-%2D"],
    ["é", "%C3%A9"],
    ["100%", "100%25"],
    ["a_b.c/d", "a_b.c/d"],
  ];

  test("encode and decode agree on canonical forms", () => {
    for (const [plain, encoded] of canonical) {
      expect(encodeIdPart(plain)).toBe(encoded);
      expect(decodeIdPart(encoded)).toBe(plain);
      expect(encodeIdPart(decodeIdPart(encoded)!)).toBe(encoded);
    }
  });

  test("decode returns null for every non-canonical form", () => {
    for (const bad of ["%3a", "%41", "a--b", "a%2D-b", "a-%2D-b", "%2", "%GG", "a b", "a:b", "", "a%2Db", "é"]) {
      expect(decodeIdPart(bad)).toBeNull();
    }
  });

  test("bytes outside UTF-8 are canonical but have no string form, and a BOM survives", () => {
    expect(canonicalId("%E9::b::c")).toBe(true);
    expect(decodeIdPart("%E9")).toBeNull();
    expect(decodeIdPart("%EF%BB%BFa")).toBe("\uFEFFa");
    expect(encodeIdPart("\uFEFFa")).toBe("%EF%BB%BFa");
  });

  test("canonicalId needs exactly three canonical parts", () => {
    expect(canonicalId("src/my%20file.rs::Foo%3A%3Abar::dead-code")).toBe(true);
    expect(canonicalId("a::b")).toBe(false);
    expect(canonicalId("a::b::c::d")).toBe(false);
    expect(canonicalId("a:::b::c")).toBe(false);
    expect(canonicalId("a::%3a::c")).toBe(false);
    expect(canonicalId("a::b::")).toBe(false);
  });
});

describe("extractMarkers", () => {
  test("ord sorts by carrier time, then rank, then line", () => {
    const at = (createdAt: string, rank: number, text: string) =>
      extractMarkers({ text, createdAt, rank, author: TRUSTED }, TRUSTED).map((m) => m.ord);
    const ords = [
      ...at("2026-10-14T10:00:00Z", 1, `${ret()}\n${ret()}`),
      ...at("2026-10-14T10:00:00Z", 2, ret()),
      ...at("2026-10-14T10:00:00Z", 10, ret()),
      ...at("2026-10-14T11:00:00Z", 0, ret()),
    ];
    expect(ords).toEqual([...ords].sort());
    expect(new Set(ords).size).toBe(ords.length);
  });

  test("lines are numbered from 1, CRLF is stripped once, blank lines count", () => {
    const found = carrier(`text\r\n\r\n${ret()}\r\n`);
    expect(found.map((f) => f.line)).toEqual([3]);
    expect(found[0].marker.raw).toBe(ret());
    expect(carrier(`${ret()}\r\r\n`)).toEqual([]);
  });

  test("an author is trusted ignoring ASCII case only", () => {
    expect(carrier(ret(), "OCTOCAT-Lawman")).toHaveLength(1);
    expect(carrier(ret(), "octocat-lawmaN")).toHaveLength(1);
    expect(carrier(ret(), "someone-else")).toHaveLength(0);
    expect(carrier(ret(), "")).toHaveLength(0);
    expect(extractMarkers({ text: ret(), createdAt: "x", rank: 0, author: "" }, "")).toEqual([]);
    expect(carrier(ret(), "octocat-lawman2")).toHaveLength(0);
  });

  test("a fence opens with 3+ backticks or tildes, indented up to 3 spaces", () => {
    for (const open of ["```", "~~~", "   ```", "   ~~~", "`````", "```js", "~~~ a`b"]) {
      expect(carrier(`${open}\n${ret()}\n`)).toEqual([]);
    }
    expect(carrier(`    \`\`\`\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\n${ret()}\n`)).toHaveLength(1);
  });

  test("a backtick fence with a backtick in its info string is no fence", () => {
    expect(carrier(`\`\`\` a\`b\n${ret()}\n`)).toHaveLength(1);
  });

  test("a fence closes with the same char, at least as long, up to 3 spaces, only whitespace after", () => {
    expect(carrier(`\`\`\`\n\`\`\`\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\`\n\`\`\`\`\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\`\n   \`\`\` \t\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\`\n~~~\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`~~~~\n~~~\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`\`\`\`\`\n\`\`\`\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`\`\`\`\n    \`\`\`\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`\`\`\`\n\`\`\` x\n${ret()}\n`)).toHaveLength(0);
  });

  test("an unclosed fence runs to the end and resets for the next carrier", () => {
    expect(carrier(`${ret()}\n\`\`\`\n${ret()}\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(ret())).toHaveLength(1);
  });

  test("a marker line is not itself a fence opener and does not need a blank line", () => {
    expect(carrier(`${ret()}\n${ret()}\n`)).toHaveLength(2);
  });
});

describe("law examples", () => {
  const law = readFileSync(join(ROOT, "law", "markers.md"), "utf8");
  const examples = law.slice(law.indexOf("## Examples"));
  const blocks = [...examples.matchAll(/^(`{3,})\n([\s\S]*?)\n\1$/gm)].map((m) => m[2]);

  test("E1 and E2 are valid", () => {
    const [e1, e2] = blocks[0].split("\n");
    const m1 = parseMarker(e1)!;
    expect(m1.fields.id).toBe("src/my%20file.rs::Foo%3A%3Abar::dead-code");
    expect(decodeIdPart(m1.fields.id.split("::")[0])).toBe("src/my file.rs");
    expect(decodeIdPart(m1.fields.id.split("::")[1])).toBe("Foo::bar");
    expect(m1.fields.of).toBe("42");
    expect(parseMarker(e2)!.fields.round).toBe("2");
    expect(carrier(blocks[0]).map((f) => f.marker.stage)).toEqual(["lead", "return"]);
  });

  test("E3, E4 and E5 are invalid", () => {
    const lines = blocks[1].split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(parseMarker(line)).toBeNull();
    expect(carrier(blocks[1])).toEqual([]);
  });

  test("E6 is a valid marker that the fence hides", () => {
    expect(blocks[2].startsWith("```\n")).toBe(true);
    expect(parseMarker(blocks[2].split("\n")[1])).not.toBeNull();
    expect(carrier(blocks[2])).toEqual([]);
  });
});

describe("fixture issues", () => {
  test("the fixture has the gh issue list shape", () => {
    for (const i of issues) {
      expect(Object.keys(i).sort()).toEqual(
        ["author", "body", "closedAt", "comments", "createdAt", "number", "state", "stateReason", "title"],
      );
      expect(Object.keys(i.author)).toEqual(["login"]);
    }
  });

  test("#1 a lead in the body and a return in a comment", () => {
    const { markers, leadOrigin, newestByRole } = collect(1);
    expect(markers.map((m) => m.marker.stage)).toEqual(["lead", "return"]);
    expect(markers.map((m) => m.line)).toEqual([3, 3]);
    expect(leadOrigin!.marker.fields.of).toBe("42");
    expect(newestByRole.get("judge")!.marker.fields.round).toBe("2");
    expect([...newestByRole.keys()].sort()).toEqual(["judge", "patrol"]);
  });

  test("#2 a marker in a backtick fence does not count", () => {
    expect(collect(2).markers).toEqual([]);
  });

  test("#3 a marker in a tilde fence does not count", () => {
    expect(collect(3).markers).toEqual([]);
  });

  test("#4 a three-backtick line does not close a four-backtick fence", () => {
    expect(rounds(4)).toEqual(["3"]);
  });

  test("#5 indented, quoted, mid-line, trailing and leading-space markers do not count", () => {
    expect(collect(5).markers).toEqual([]);
  });

  test("#6 an untrusted author counts for nothing, body or comment", () => {
    const c = collect(6);
    expect(c.markers).toEqual([]);
    expect(c.leadOrigin).toBeNull();
    expect(c.newestByRole.size).toBe(0);
  });

  test("#7 the trusted login is compared ignoring case", () => {
    expect(collect(7).markers).toHaveLength(2);
  });

  test("#8 carrier order wins over at", () => {
    const { markers, newestByRole } = collect(8);
    expect(markers.map((m) => m.marker.fields.round)).toEqual(["1", "2"]);
    expect(markers[0].marker.fields.at > markers[1].marker.fields.at).toBe(true);
    expect(newestByRole.get("judge")!.marker.fields.round).toBe("2");
  });

  test("#9 comments are ranked by creation time with a stable tie-break", () => {
    const c = collect(9);
    expect(rounds(9)).toEqual(["2", "3", "1"]);
    expect(c.newestByRole.get("judge")!.marker.fields.round).toBe("1");
  });

  test("#10 the line number orders markers inside one carrier", () => {
    const c = collect(10);
    expect(rounds(10)).toEqual(["1", "2"]);
    expect(c.markers.map((m) => m.line)).toEqual([1, 3]);
    expect(c.newestByRole.get("judge")!.marker.fields.round).toBe("2");
  });

  test("#11 non-canonical ids are dropped and displace nothing", () => {
    const c = collect(11);
    expect(c.markers).toHaveLength(1);
    expect(c.newestByRole.get("patrol")).toBe(c.leadOrigin);
  });

  test("#12 a double hyphen in a value drops the marker", () => {
    expect(rounds(12)).toEqual(["1"]);
    expect(collect(12).leadOrigin).toBeNull();
  });

  test("#13 a duplicate key drops the marker and displaces nothing", () => {
    const c = collect(13);
    expect(rounds(13)).toEqual(["1"]);
    expect(c.newestByRole.get("judge")!.marker.fields.round).toBe("1");
  });

  test("#14 a marker over 1024 bytes drops and displaces nothing", () => {
    const comment = issues.find((i) => i.number === 14)!.comments[0].body;
    expect(Buffer.byteLength(comment.split("\n").at(-1)!)).toBeGreaterThan(MARKER_MAX_BYTES);
    expect(rounds(14)).toEqual(["1"]);
  });

  test("#15 a-%2Db is valid and a--b is not", () => {
    const c = collect(15);
    expect(c.markers).toHaveLength(1);
    const id = c.leadOrigin!.marker.fields.id;
    expect(id).toBe("src/a-%2Db.rs::f::dead-code");
    expect(decodeIdPart(id.split("::")[0])).toBe("src/a--b.rs");
  });

  test("#16 an unknown stage with unknown keys is kept", () => {
    const [m] = collect(16).markers;
    expect(m.marker.role).toBe("curator");
    expect(m.marker.stage).toBe("audit");
    expect(m.marker.fields.flavor).toBe("mint");
    expect(m.marker.fields.round_trip).toBe("3");
  });

  test("#17 a later marker of another role or a later lead never displaces the origin", () => {
    const c = collect(17);
    expect(c.markers.map((m) => `${m.marker.role}/${m.marker.stage}`)).toEqual([
      "patrol/lead",
      "judge/return",
      "patrol/lead",
    ]);
    expect(c.leadOrigin).toBe(c.markers[0]);
    expect(c.leadOrigin!.marker.fields.id).toBe(LEAD_ID);
    expect(c.newestByRole.get("patrol")).toBe(c.markers[2]);
    expect(c.newestByRole.get("judge")).toBe(c.markers[1]);
  });

  test("#18 CRLF line endings do not hide the last line", () => {
    expect(collect(18).markers).toHaveLength(1);
    expect(collect(18).markers[0].line).toBe(3);
  });

  test("the input order of comments does not matter", () => {
    const issue = structuredClone(issues.find((i) => i.number === 9)!);
    issue.comments.reverse();
    const reversed = collectIssueMarkers(issue, TRUSTED).newestByRole.get("judge")!.marker.fields.round;
    expect(reversed).toBe("1");
  });

  test("a null author or empty body does not throw", () => {
    const base = { number: 1, author: null, body: "", createdAt: "2026-10-14T09:00:00Z", comments: [] };
    expect(collectIssueMarkers(base, TRUSTED).markers).toEqual([]);
  });
});

describe("legacy fingerprints", () => {
  const PRECINCT = "main";
  const canonical = (n: number) => collect(n).markers.map((m) => m.marker);
  const legacyLine = (s: string) => carrier(s).map((f) => f.marker);

  test("#19 police-fingerprint becomes a lead with a department and an id", () => {
    const [m] = canonical(19);
    expect(m).toMatchObject({ role: "patrol", stage: "lead", raw: issues[18].body.split("\n")[2] });
    expect(m.fields).toEqual({
      role: "patrol",
      stage: "lead",
      department: "slop",
      id: "tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
      legacy: "police-fingerprint",
      at: "2026-10-14T09:00:00Z",
    });
  });

  test("#20 a value with spaces gives a lead without an id", () => {
    const [m] = canonical(20);
    expect(m.fields).toEqual({
      role: "patrol",
      stage: "lead",
      department: "agent",
      legacy: "police-fingerprint",
      at: "2026-10-14T09:00:00Z",
    });
  });

  test("#21 role-fingerprint becomes a lead", () => {
    const [m] = canonical(21);
    expect(m.fields).toMatchObject({
      department: "slop",
      id: "plugins/triz::principles-subitems-attributed-to-altshuller::lying",
      legacy: "slop-police-fingerprint",
    });
  });

  test("#22 repo-audit-routine gives department repo and no id", () => {
    const [m] = canonical(22);
    expect(m.fields).toMatchObject({ department: "repo", legacy: "repo-audit-routine" });
    expect(m.fields).not.toHaveProperty("id");
  });

  test("#23 a fenced legacy line and #24 a foreign one do not count", () => {
    expect(collect(23).markers).toEqual([]);
    expect(collect(24).markers).toEqual([]);
    expect(collect(24).leadOrigin).toBeNull();
  });

  test("the department mapping", () => {
    const dept = (line: string) => legacyLine(line)[0]?.fields.department;
    expect(dept("<!-- police-fingerprint: abstraction-police a/b::c::d -->")).toBe("abstractions");
    expect(dept("<!-- abstraction-police-fingerprint: a/b::c::d -->")).toBe("abstractions");
    expect(dept("<!-- police-fingerprint: evals x -->")).toBe("evals");
    expect(dept("<!-- evals-fingerprint: x -->")).toBe("evals");
    expect(dept("<!-- police-fingerprint: dependency-police x -->")).toBe("dependency");
    expect(dept("<!-- repo-audit-routine:x -->")).toBe("repo");
  });

  test("a bad department or a malformed line is dropped", () => {
    expect(legacyLine("<!-- police-fingerprint: Slop-Police a/b::c::d -->")).toEqual([]);
    expect(legacyLine("<!-- police-fingerprint: 9police a/b::c::d -->")).toEqual([]);
    expect(legacyLine("<!-- police-fingerprint: slop-police -->")).toEqual([]);
    expect(legacyLine("<!-- repo-audit-routine: -->")).toEqual([]);
    expect(legacyLine(" <!-- repo-audit-routine:x -->")).toEqual([]);
    expect(legacyLine("<!-- repo-audit-routine:x --> tail")).toEqual([]);
    expect(legacyLine("> <!-- police-fingerprint: slop-police a/b::c::d -->")).toEqual([]);
  });

  test("an id needs three canonical parts without a hyphen run", () => {
    const id = (v: string) => legacyLine(`<!-- police-fingerprint: slop-police ${v} -->`)[0].fields.id;
    expect(id("a/b::c::d")).toBe("a/b::c::d");
    expect(id("a/b::c--x::d")).toBeUndefined();
    expect(id("a/b::c")).toBeUndefined();
    expect(id("a/b::c::d::e")).toBeUndefined();
    expect(id("a/b::::d")).toBeUndefined();
    expect(id("A:CODE_OF_CONDUCT.md:missing-code-of-conduct")).toBeUndefined();
  });

  test("a lawman marker and a legacy marker on one issue are both kept, the earlier is the origin", () => {
    const text = `<!-- police-fingerprint: slop-police a/b::c::d -->\n${lead()}`;
    const found = extractMarkers({ text, createdAt: "2026-10-14T09:00:00Z", rank: 0, author: TRUSTED }, TRUSTED);
    expect(found.map((f) => f.marker.fields.legacy ?? "lawman")).toEqual(["police-fingerprint", "lawman"]);
    const issue = { number: 1, author: { login: TRUSTED }, body: text, createdAt: "2026-10-14T09:00:00Z", comments: [] };
    expect(collectIssueMarkers(issue, TRUSTED).leadOrigin!.marker.fields.legacy).toBe("police-fingerprint");
    const swapped = { ...issue, body: `${lead()}\n<!-- repo-audit-routine:x -->` };
    expect(collectIssueMarkers(swapped, TRUSTED).leadOrigin!.marker.fields.legacy).toBeUndefined();
  });

  test("an untrusted author and an oversized line count for nothing", () => {
    expect(carrier("<!-- repo-audit-routine:x -->", "bystander-fictional")).toEqual([]);
    expect(legacyLine(`<!-- repo-audit-routine:${"x".repeat(MARKER_MAX_BYTES)} -->`)).toEqual([]);
  });

  describe("through the CLI", () => {
    const sync = () =>
      Bun.spawnSync(["bun", "src/journal.ts", "sync", PRECINCT, "--author", TRUSTED], {
        cwd: ROOT,
        env: env({ LAWMAN_DB: dbFile }),
        stdin: Buffer.from(JSON.stringify(issues)),
      });
    const rows = (args: string[]) => run(args).out.split("\n").filter((l) => l !== "");
    const legacyRows = (all: string[]) => all.filter((l) => /^(19|2[0-4])\t/.test(l)).map((l) => l.split("\t").slice(0, 5).join("|"));

    beforeEach(() => {
      addPrecincts({ [PRECINCT]: 1 });
      expect(sync().exitCode).toBe(0);
    });

    test("leads lists the four with their departments and ids", () => {
      expect(legacyRows(rows(["leads", PRECINCT, "--state", "all"]))).toEqual([
        "19|OPEN||slop|tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
        "20|OPEN||agent|",
        "21|CLOSED|NOT_PLANNED|slop|plugins/triz::principles-subitems-attributed-to-altshuller::lying",
        "22|OPEN||repo|",
      ]);
    });

    test("cap counts the open legacy leads of a department", () => {
      expect(run(["cap", PRECINCT, "--department", "slop"]).out.trim()).toBe("cap=3 open=1");
      expect(run(["cap", PRECINCT, "--department", "agent"]).out.trim()).toBe("cap=3 open=1");
    });

    test("seen finds a legacy id by its symbol", () => {
      const seen = (id: string) => run(["seen", PRECINCT, "--id", id]).out.trim();
      expect(seen("tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying")).toBe("open #19");
      expect(seen("tools/check-conformance.py::skills-ref-not-pinnable-in-ci::unused")).toBe("open #19");
      expect(seen("plugins/triz::principles-subitems-attributed-to-altshuller::lying")).toBe("declined #21");
      expect(seen("src/f.rs::g::lying")).toBe("none");
      expect(seen("src/h.rs::i::lying")).toBe("none");
    });

    test("sync counts legacy markers as markers and not as invalid", () => {
      const kept = issues.filter((i) => i.author.login.toLowerCase() === TRUSTED);
      const all = kept.flatMap((i) => collectIssueMarkers(i, TRUSTED).markers);
      const shaped = kept.flatMap((i) => [i.body, ...i.comments.map((c) => c.body)]).flatMap((t) => t.split("\n"));
      const lawman = all.filter((m) => m.marker.fields.legacy === undefined).length;
      const invalid = shaped.filter((l) => l.startsWith("<!-- lawman:")).length - lawman;
      expect(all.length - lawman).toBe(4);
      expect(sync().stdout.toString()).toContain(`markers=${all.length} invalid=${invalid} `);
    });
  });
});

describe("sync", () => {
  const PRECINCT = "main";
  const syncArgs = (extra: string[] = []) => ["sync", PRECINCT, "--author", TRUSTED, ...extra];
  const feed = (input: string, args = syncArgs()) =>
    Bun.spawnSync(["bun", "src/journal.ts", ...args], {
      cwd: ROOT,
      env: env({ LAWMAN_DB: dbFile }),
      stdin: Buffer.from(input),
    });
  const sync = (data: unknown, extra: string[] = []) => {
    const r = feed(typeof data === "string" ? data : JSON.stringify(data), syncArgs(extra));
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };
  const query = (sql: string) => {
    const db = open(dbFile);
    try {
      return db.query(sql).all() as Record<string, unknown>[];
    } finally {
      db.close();
    }
  };
  const snapshot = () => ({
    issues: query("SELECT * FROM issues ORDER BY issue"),
    markers: query("SELECT * FROM markers ORDER BY issue, ord"),
    synced: query("SELECT synced_at FROM precincts"),
  });
  const mine = (i: (typeof issues)[number]) => i.author.login.toLowerCase() === TRUSTED;
  const lines = (i: (typeof issues)[number]) =>
    [i.body, ...i.comments.map((c) => c.body)].flatMap((t) => t.split("\n"));

  beforeEach(() => addPrecincts({ [PRECINCT]: 1 }));

  test("a fixture sync prints counts that match the fixture", () => {
    const kept = issues.filter(mine);
    const found = kept.map((i) => collectIssueMarkers(i, TRUSTED));
    const markers = found.reduce((n, f) => n + f.markers.length, 0);
    const legacy = found.flatMap((f) => f.markers).filter((m) => m.marker.fields.legacy !== undefined).length;
    const shaped = kept.flatMap(lines).filter((l) => l.startsWith("<!-- lawman:")).length;
    const r = sync(issues);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(
      `issues=${kept.length} leads=${found.filter((f) => f.leadOrigin).length} markers=${markers} invalid=${shaped - (markers - legacy)} skipped=${issues.length - kept.length}`,
    );
    expect(query("SELECT count(*) AS n FROM issues")).toEqual([{ n: kept.length }]);
    expect(query("SELECT count(*) AS n FROM markers")).toEqual([{ n: markers }]);
    expect(query("SELECT synced_at IS NOT NULL AS ok FROM precincts")).toEqual([{ ok: 1 }]);
  });

  test("rows keep the issue fields and the marker columns", () => {
    sync(issues);
    const one = query("SELECT * FROM issues WHERE issue = 17")[0];
    expect(one).toEqual({
      precinct: PRECINCT,
      issue: 17,
      state: "CLOSED",
      state_reason: "COMPLETED",
      title: "Later markers never displace the lead origin",
      created_at: "2026-10-14T09:00:00Z",
      closed_at: "2026-10-15T08:00:00Z",
    });
    expect(query("SELECT state_reason FROM issues WHERE issue = 2")).toEqual([{ state_reason: null }]);
    const rows = query("SELECT * FROM markers WHERE issue = 1 ORDER BY ord");
    const want = collectIssueMarkers(issues[0], TRUSTED).markers;
    expect(rows.map((r) => r.ord)).toEqual(want.map((m) => m.ord));
    expect(rows[0]).toMatchObject({
      role: "patrol",
      stage: "lead",
      department: "core",
      lead_id: "src/my%20file.rs::Foo%3A%3Abar::dead-code",
      raw: want[0].marker.raw,
    });
    expect(JSON.parse(rows[0].fields as string)).toEqual(want[0].marker.fields);
    expect(rows[1]).toMatchObject({ stage: "return", department: null, lead_id: null });
  });

  test("a second sync replaces the rows", () => {
    sync(issues);
    const first = snapshot();
    expect(sync(issues.slice(0, 3)).code).toBe(0);
    expect(query("SELECT issue FROM issues ORDER BY issue")).toEqual([{ issue: 1 }, { issue: 2 }, { issue: 3 }]);
    expect(query("SELECT DISTINCT issue FROM markers")).toEqual([{ issue: 1 }]);
    expect(sync(issues).code).toBe(0);
    expect(snapshot().issues).toEqual(first.issues);
    expect(snapshot().markers).toEqual(first.markers);
  });

  test("another precinct keeps its rows", () => {
    addPrecincts({ other: 1 });
    expect(feed(JSON.stringify(issues.slice(0, 2)), ["sync", "other", "--author", TRUSTED]).exitCode).toBe(0);
    sync(issues);
    expect(sync([], ["--reset"]).code).toBe(0);
    expect(query("SELECT count(*) AS n FROM issues WHERE precinct = 'other'")).toEqual([{ n: 2 }]);
    expect(query("SELECT count(*) AS n FROM markers WHERE precinct = 'other'")).toEqual([{ n: 2 }]);
  });

  test.each([
    ["empty stdin", ""],
    ["not json", "not json"],
    ["truncated json", JSON.stringify(issues).slice(0, 200)],
    ["a json object", "{}"],
    ["a json string", '"x"'],
    ["an element without a number", JSON.stringify([{ state: "OPEN" }])],
    ["a fractional number", JSON.stringify([{ number: 1.5, state: "OPEN" }])],
    ["an element without a state", JSON.stringify([{ number: 1 }])],
    ["a null element", "[null]"],
  ])("%s exits 4 and leaves the cache", (_name, input) => {
    sync(issues);
    const before = snapshot();
    const r = sync(input);
    expect(r.code).toBe(4);
    expect(r.err).toContain("journal:");
    expect(snapshot()).toEqual(before);
  });

  test("an empty array over a filled cache exits 4 and --reset clears it", () => {
    sync(issues);
    const before = snapshot();
    expect(sync([]).code).toBe(4);
    expect(snapshot()).toEqual(before);
    const r = sync([], ["--reset"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("issues=0 leads=0 markers=0 invalid=0 skipped=0");
    expect(query("SELECT count(*) AS n FROM issues")).toEqual([{ n: 0 }]);
    expect(query("SELECT count(*) AS n FROM markers")).toEqual([{ n: 0 }]);
  });

  test("an empty array over an empty cache succeeds", () => {
    expect(sync([]).code).toBe(0);
  });

  test("exactly the sync limit exits 3 and one fewer succeeds", () => {
    sync(issues);
    const before = snapshot();
    const minimal = (n: number) => Array.from({ length: n }, (_, i) => ({ number: i + 1, state: "OPEN", author: { login: TRUSTED } }));
    const r = sync(minimal(SYNC_LIMIT));
    expect(r.code).toBe(3);
    expect(snapshot()).toEqual(before);
    expect(sync(minimal(SYNC_LIMIT - 1)).code).toBe(0);
    expect(query("SELECT count(*) AS n FROM issues")).toEqual([{ n: SYNC_LIMIT - 1 }]);
  });

  test("a duplicate issue number fails with 4 and the old cache stays", () => {
    sync(issues);
    const before = snapshot();
    const twin = { number: 5, state: "OPEN", title: "x", author: { login: TRUSTED } };
    const r = sync([issues[0], twin, twin]);
    expect(r.code).toBe(4);
    expect(snapshot()).toEqual(before);
  });

  test("issues by another author are skipped and counted", () => {
    const foreign = { number: 50, state: "OPEN", title: "[Lead] foreign", author: { login: "bystander-fictional" }, body: lead(), comments: [] };
    const r = sync([issues[0], foreign, { number: 51, state: "OPEN", title: "ghost", author: null }]);
    expect(r.out.trim()).toBe("issues=1 leads=1 markers=2 invalid=0 skipped=2");
    expect(query("SELECT issue FROM issues")).toEqual([{ issue: 1 }]);
  });

  test("an unknown precinct exits 1 and a bad login exits 1", () => {
    expect(feed("[]", ["sync", "nowhere", "--author", TRUSTED]).exitCode).toBe(1);
    expect(feed("[]", ["sync", PRECINCT, "--author", "-bad-"]).exitCode).toBe(1);
    expect(feed("[]", ["sync", PRECINCT]).exitCode).toBe(1);
    expect(feed("[]", ["sync", PRECINCT, "--author", TRUSTED, "--reset", "--reset"]).exitCode).toBe(1);
  });

  test("status counts the synced leads by department", () => {
    sync(issues);
    const want = new Map<string, number>();
    for (const i of issues.filter(mine).filter((x) => x.state === "OPEN")) {
      const dept = collectIssueMarkers(i, TRUSTED).leadOrigin?.marker.fields.department;
      if (dept !== undefined) want.set(dept, (want.get(dept) ?? 0) + 1);
    }
    expect(want.size).toBeGreaterThan(0);
    const got = run(["status"]).out.split("\n").filter((l) => l.startsWith("leads "));
    expect(got).toEqual([...want].sort().map(([d, n]) => `leads ${d} ${n}`));
  });

  test("alarm raises broken-lead for an open [Lead] issue without a marker and not for a closed one", () => {
    const bare = (number: number, state: string) => ({
      number,
      state,
      title: "[Lead] no marker",
      author: { login: TRUSTED },
      body: "",
      comments: [],
    });
    sync([...issues, bare(101, "OPEN"), bare(102, "CLOSED")]);
    const r = run(["alarm"]);
    expect(r.out).toContain("ALARM broken-lead main#101");
    expect(r.out).not.toContain("main#102");
    expect(r.out).not.toContain("main#1 ");
  });
});

describe("leads, seen, cap and last", () => {
  const PRECINCT = "main";
  const ID = "src/a.rs::f::dead-code";
  const OTHER_KIND = "src/a.rs::f::unused-import";
  const cmd = (...args: string[]) => run(args);
  const lines = (r: { out: string }) => r.out.split("\n").filter((l) => l !== "");
  let db: Database;

  type Origin = { department: string; id: string; ord?: string };
  function put(n: number, state: string, reason: string | null, origin?: Origin, title = `[Lead] x: ${n}`) {
    db.run("INSERT INTO issues VALUES (?, ?, ?, ?, ?, 't', NULL)", [PRECINCT, n, state, reason, title]);
    if (origin) mark(n, "patrol", "lead", origin.ord ?? "2026-10-14T09:00:00Z|000000|000001", origin);
  }
  function mark(n: number, role: string, stage: string, ord: string, origin?: Origin) {
    db.run("INSERT INTO markers VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'raw')", [
      PRECINCT,
      n,
      ord,
      role,
      stage,
      origin?.department ?? null,
      origin?.id ?? null,
    ]);
  }
  const lead = (department: string, id = ID): Origin => ({ department, id });
  const seen = (id: string) => cmd("seen", PRECINCT, "--id", id).out.trim();
  const cap = (department: string) => cmd("cap", PRECINCT, "--department", department).out.trim();

  beforeEach(() => {
    addPrecincts({ [PRECINCT]: 1 });
    db = open(dbFile);
  });
  afterEach(() => db.close());

  describe("leads", () => {
    beforeEach(() => {
      put(3, "OPEN", null, lead("core", ID), "[Lead] core: three");
      put(1, "OPEN", null, lead("web", OTHER_KIND), "[Lead] web: one");
      put(2, "CLOSED", "NOT_PLANNED", lead("core", "src/b.rs::g::dead-code"), "[Lead] core: two");
      put(4, "OPEN", null, undefined, "plain issue");
    });

    test("the default lists open origins by issue number as TSV", () => {
      const r = cmd("leads", PRECINCT);
      expect(r.code).toBe(0);
      expect(lines(r)).toEqual([`1\tOPEN\t\tweb\t${OTHER_KIND}\t[Lead] web: one`, `3\tOPEN\t\tcore\t${ID}\t[Lead] core: three`]);
    });

    test("--state all adds closed issues with their reason", () => {
      const r = cmd("leads", PRECINCT, "--state", "all");
      expect(lines(r).map((l) => l.split("\t").slice(0, 3).join(" "))).toEqual(["1 OPEN ", "2 CLOSED NOT_PLANNED", "3 OPEN "]);
    });

    test("--department filters by the origin department", () => {
      expect(lines(cmd("leads", PRECINCT, "--department", "core")).map((l) => l.split("\t")[0])).toEqual(["3"]);
      expect(lines(cmd("leads", PRECINCT, "--department", "core", "--state", "all")).map((l) => l.split("\t")[0])).toEqual(["2", "3"]);
    });

    test("an unknown state or a missing precinct exits 1", () => {
      expect(cmd("leads", PRECINCT, "--state", "closed").code).toBe(1);
      expect(cmd("leads").code).toBe(1);
      expect(cmd("leads", PRECINCT, "--department", "Bad Dept").code).toBe(1);
    });

    test("another precinct is not listed", () => {
      expect(lines(cmd("leads", "elsewhere"))).toEqual([]);
    });

    test("the origin survives a later marker of another role", () => {
      mark(3, "investigation", "case", "2026-10-14T10:00:00Z|000001|000001");
      expect(lines(cmd("leads", PRECINCT, "--department", "core")).map((l) => l.split("\t")[0])).toEqual(["3"]);
      expect(cap("core")).toBe("cap=3 open=1");
    });

    test("the earliest lead marker is the origin", () => {
      mark(3, "patrol", "lead", "2026-10-14T11:00:00Z|000001|000001", lead("web", "src/z.rs::h::dead-code"));
      expect(lines(cmd("leads", PRECINCT, "--department", "core")).map((l) => l.split("\t")[0])).toEqual(["3"]);
      expect(lines(cmd("leads", PRECINCT, "--department", "web")).map((l) => l.split("\t")[0])).toEqual(["1"]);
    });
  });

  describe("seen", () => {
    test("none when nothing matches", () => {
      expect(seen(ID)).toBe("none");
    });

    test("open when an open origin shares path::symbol, whatever kind or department", () => {
      put(5, "OPEN", null, lead("web", OTHER_KIND));
      expect(seen(ID)).toBe("open #5");
    });

    test.each([["NOT_PLANNED"], ["DUPLICATE"], [null]])("declined for a closed origin with reason %p", (reason) => {
      put(6, "CLOSED", reason, lead("core", OTHER_KIND));
      expect(seen(ID)).toBe("declined #6");
    });

    test("fixed for a COMPLETED closure with the exact id", () => {
      put(7, "CLOSED", "COMPLETED", lead("core"));
      expect(seen(ID)).toBe("fixed #7");
    });

    test("a COMPLETED closure of another kind is not fixed", () => {
      put(7, "CLOSED", "COMPLETED", lead("core", OTHER_KIND));
      expect(seen(ID)).toBe("none");
    });

    test("another path::symbol does not match", () => {
      put(8, "OPEN", null, lead("core", "src/a.rs::g::dead-code"));
      put(9, "OPEN", null, lead("core", "src/ab.rs::f::dead-code"));
      expect(seen(ID)).toBe("none");
    });

    test("open beats declined beats fixed", () => {
      put(10, "CLOSED", "COMPLETED", lead("core"));
      expect(seen(ID)).toBe("fixed #10");
      put(11, "CLOSED", "NOT_PLANNED", lead("core"));
      expect(seen(ID)).toBe("declined #11");
      put(12, "OPEN", null, lead("core"));
      expect(seen(ID)).toBe("open #12");
    });

    test("the lowest issue number wins inside a class", () => {
      put(22, "OPEN", null, lead("core"));
      put(21, "OPEN", null, lead("web"));
      put(32, "CLOSED", "NOT_PLANNED", lead("core"));
      put(31, "CLOSED", "DUPLICATE", lead("core"));
      expect(seen(ID)).toBe("open #21");
      db.run("UPDATE issues SET state = 'CLOSED', state_reason = 'COMPLETED' WHERE issue IN (21, 22)");
      expect(seen(ID)).toBe("declined #31");
    });

    test("the origin marker decides, not a later lead marker", () => {
      put(13, "OPEN", null, lead("core", "src/q.rs::f::dead-code"));
      mark(13, "patrol", "lead", "2026-10-15T00:00:00Z|000001|000001", lead("core", ID));
      expect(seen(ID)).toBe("none");
    });

    test("a non-canonical id exits 1", () => {
      for (const bad of ["src/a.rs::f", "a::b::c::d", "a b::f::k", ""]) {
        const r = cmd("seen", PRECINCT, "--id", bad);
        expect(r.code).toBe(1);
        expect(r.out).toBe("");
      }
      expect(cmd("seen", PRECINCT).code).toBe(1);
    });
  });

  describe("cap", () => {
    const fill = (n: number, department = "core", from = 100) => {
      for (let i = 0; i < n; i++) put(from + i, "OPEN", null, lead(department, `src/f${from + i}.rs::f::dead-code`));
    };

    test.each([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 1],
      [4, 1],
      [5, 0],
      [6, 0],
    ])("%i open leads give cap %i", (open, want) => {
      fill(open);
      expect(cap("core")).toBe(`cap=${want} open=${open}`);
    });

    test("closed issues and other departments do not count", () => {
      fill(2);
      fill(5, "web", 200);
      put(300, "CLOSED", "COMPLETED", lead("core", "src/c.rs::f::dead-code"));
      expect(cap("core")).toBe("cap=3 open=2");
      expect(cap("web")).toBe("cap=0 open=5");
      expect(cap("idle")).toBe("cap=3 open=0");
    });

    test("an open broken lead without a marker counts by its title", () => {
      fill(2);
      put(400, "OPEN", null, undefined, "[Lead] core: broken");
      expect(cap("core")).toBe("cap=1 open=3");
      put(401, "CLOSED", null, undefined, "[Lead] core: closed broken");
      put(402, "OPEN", null, undefined, "[Lead] web: other department");
      put(403, "OPEN", null, undefined, "[Lead] corex: prefix only");
      put(404, "OPEN", null, undefined, "core: no prefix");
      expect(cap("core")).toBe("cap=1 open=3");
    });

    test("an open lead whose title names another department counts for its origin", () => {
      put(500, "OPEN", null, lead("web"), "[Lead] core: mislabelled");
      expect(cap("core")).toBe("cap=3 open=0");
      expect(cap("web")).toBe("cap=3 open=1");
    });

    test("a missing department exits 1", () => {
      expect(cmd("cap", PRECINCT).code).toBe(1);
    });

    test("the code table equals the table in the law", () => {
      const law = readFileSync(join(ROOT, "law", "LAW.md"), "utf8").split("\n");
      const head = law.findIndex((l) => l === "| Open leads of the department on the precinct | Maximum filings per tick |");
      expect(head).toBeGreaterThan(-1);
      const rows: { upTo: number | null; cap: number }[] = [];
      for (const line of law.slice(head + 2)) {
        const m = line.match(/^\| (\d+) (?:to (\d+)|or more) \| (\d+) \|$/);
        if (!m) break;
        rows.push({ upTo: m[2] === undefined ? null : Number(m[2]), cap: Number(m[3]) });
      }
      expect(rows.length).toBe(3);
      expect(CAP_TABLE).toEqual(rows);
    });
  });

  describe("last", () => {
    const dispatch = (department: string | null, at: string, role = "patrol", closed = true) =>
      db.run("INSERT INTO dispatches (at, precinct, role, department, outcome) VALUES (?, ?, ?, ?, ?)", [
        at,
        PRECINCT,
        role,
        department,
        closed ? "filed" : null,
      ]);

    test("no dispatches print nothing", () => {
      const r = cmd("last", PRECINCT, "--role", "patrol");
      expect(r.code).toBe(0);
      expect(r.out).toBe("");
    });

    test("departments come ascending by their latest at", () => {
      dispatch("web", "2026-10-01T00:00:00Z");
      dispatch("core", "2026-09-01T00:00:00Z");
      dispatch("api", "2026-10-05T00:00:00Z");
      expect(lines(cmd("last", PRECINCT, "--role", "patrol"))).toEqual([
        "core\t2026-09-01T00:00:00Z",
        "web\t2026-10-01T00:00:00Z",
        "api\t2026-10-05T00:00:00Z",
      ]);
    });

    test("the latest at of a department wins, open or closed", () => {
      dispatch("web", "2026-10-01T00:00:00Z");
      dispatch("web", "2026-10-09T00:00:00Z", "patrol", false);
      dispatch("core", "2026-10-03T00:00:00Z");
      dispatch("core", "2026-09-03T00:00:00Z");
      expect(lines(cmd("last", PRECINCT, "--role", "patrol"))).toEqual([
        "core\t2026-10-03T00:00:00Z",
        "web\t2026-10-09T00:00:00Z",
      ]);
    });

    test("other roles, other precincts and orders without a department are ignored", () => {
      dispatch("web", "2026-10-01T00:00:00Z", "judge");
      dispatch(null, "2026-10-02T00:00:00Z");
      expect(lines(cmd("last", PRECINCT, "--role", "patrol"))).toEqual([]);
      expect(lines(cmd("last", "elsewhere", "--role", "judge"))).toEqual([]);
    });

    test("a missing role exits 1", () => {
      expect(cmd("last", PRECINCT).code).toBe(1);
    });
  });
});

const HOME_MAC = ["/Us", "ers/someone"].join("");
const HOME_LINUX = ["/ho", "me/someone"].join("");

describe("lint-body", () => {
  const TITLE = "[Lead] core: dead code";
  const TOKEN = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2";
  const FINE = ["Analysed commit: 0123456", "", "## What", "A function nobody calls.", ""];
  const body = (...lines: string[]) => [...lines, lead()].join("\n");
  const lintText = (text: string, title = TITLE) => lintBody(`${title}\n\n${text}`);
  const reasonsOf = (...lines: string[]) => lintText(body(...lines));

  test("a clean body passes", () => {
    expect(reasonsOf(...FINE)).toEqual([]);
  });

  test("the marker may be followed by blank lines", () => {
    expect(lintText(body(...FINE) + "\n\n  \n")).toEqual([]);
  });

  test("home directories, $HOME and installation roots are rejected with the body line", () => {
    const leaks = [
      `see ${HOME_MAC}/code`,
      `see ${HOME_LINUX}/code`,
      "see ~/code",
      "run $HOME/bin",
      "run ${HOME}/bin",
      "tool at .lawman/bin/journal",
      "tool at /opt/.lawman/bin",
      "tool at .lawman",
    ];
    for (const leak of leaks) expect(reasonsOf("ok", leak)).toEqual(["2: home or installation path"]);
  });

  test("the precinct-local department directory is allowed, any other .lawman path is not", () => {
    expect(reasonsOf("page at .lawman/departments/x.md")).toEqual([]);
    expect(reasonsOf("page at tree/.lawman/departments/x.md")).toEqual([]);
    expect(reasonsOf("page at .lawman/departments")).toEqual(["1: home or installation path"]);
    expect(reasonsOf("page at .lawman/other/x.md")).toEqual(["1: home or installation path"]);
    expect(reasonsOf("a name like not.lawman is no segment")).toEqual([]);
  });

  test("a segment that only resembles a home directory passes", () => {
    expect(reasonsOf("src/Us" + "ers/model.rs", "see https://example.org/x")).toEqual([]);
  });

  test("GitHub token shapes are rejected", () => {
    const pat = "github_pat_" + "A1b2C3d4E5f6G7h8I9j0_k";
    for (const secret of [TOKEN, pat, "gho_" + "x".repeat(20), "ghs_" + "y".repeat(30)]) {
      expect(reasonsOf(`key ${secret}`)).toEqual(["1: GitHub token"]);
    }
    expect(reasonsOf("ghp_short")).toEqual([]);
  });

  test("image embeds and image tags are rejected", () => {
    for (const line of ["![shot](https://example.org/a.png)", "<img src=x>", "<IMG src=x>", "<picture>"]) {
      expect(reasonsOf(line)).toEqual(["1: image embed"]);
    }
  });

  test("an @ mention is rejected outside code", () => {
    expect(reasonsOf("thanks @someone")).toEqual(["1: @ mention"]);
    expect(reasonsOf("mail a@b.example")).toEqual(["1: @ mention"]);
    expect(reasonsOf("@7days")).toEqual(["1: @ mention"]);
  });

  test("an @ sign without a letter or digit after it passes", () => {
    expect(reasonsOf("at @ sign, @-, @")).toEqual([]);
  });

  test("an @ inside a code span passes, one outside it does not", () => {
    expect(reasonsOf("the `@Override` tag and ``@x`` too")).toEqual([]);
    expect(reasonsOf("the `@Override` tag and @someone")).toEqual(["1: @ mention"]);
    expect(reasonsOf("an unclosed `span @someone")).toEqual(["1: @ mention"]);
  });

  test("an @ inside a fenced block passes, other rules still apply there", () => {
    expect(reasonsOf("```", "@Override", "```")).toEqual([]);
    expect(reasonsOf("~~~~", "@Override", "~~~", "@someone", "~~~~")).toEqual([]);
    expect(reasonsOf("```", "@Override", "```", "@someone")).toEqual(["4: @ mention"]);
    expect(reasonsOf("```", `${HOME_LINUX}/x`, "```")).toEqual(["2: home or installation path"]);
  });

  test("one line can fail several rules, each named once and in a fixed order", () => {
    expect(reasonsOf(`${HOME_LINUX} ${TOKEN} @someone`)).toEqual([
      "1: home or installation path",
      "1: GitHub token",
      "1: @ mention",
    ]);
  });

  test("the output never holds the matched text", () => {
    const text = reasonsOf(`${HOME_LINUX} ${TOKEN} @someone ![x](y)`).join("\n");
    for (const secret of ["someone", TOKEN, "![x]"]) expect(text).not.toContain(secret);
  });

  test("the last non-empty line must be a valid marker", () => {
    const missing = lintText(FINE.join("\n"));
    expect(missing).toEqual(["4: last line is not a valid marker"]);
    const notLast = lintText([lead(), "trailing words"].join("\n"));
    expect(notLast).toEqual(["2: last line is not a valid marker"]);
    expect(lintText(lead().replace("role=patrol", "role=Patrol"))).toEqual(["1: last line is not a valid marker"]);
  });

  test("an empty body has no marker", () => {
    expect(lintBody(`${TITLE}\n\n`)).toEqual(["1: last line is not a valid marker"]);
    expect(lintBody(`${TITLE}\n`)).toEqual(["1: last line is not a valid marker"]);
  });

  test("the marker stage is not constrained", () => {
    expect(lintText(ret())).toEqual([]);
  });

  test("a marker inside a fence at the end still counts as the last line", () => {
    expect(lintText(["```", lead(), "```"].join("\n"))).toEqual(["3: last line is not a valid marker"]);
  });

  test("CRLF line ends are accepted", () => {
    expect(lintBody(`${TITLE}\r\n\r\nok\r\n${lead()}\r\n`)).toEqual([]);
  });

  test("the size limit is 64 KB and counts bytes of the body", () => {
    expect(BODY_MAX_BYTES).toBe(64 * 1024);
    const room = BODY_MAX_BYTES - Buffer.byteLength("\n" + lead());
    expect(lintText("x".repeat(room) + "\n" + lead())).toEqual([]);
    expect(lintText("x".repeat(room + 1) + "\n" + lead())).toEqual([`1: body exceeds ${BODY_MAX_BYTES} bytes`]);
    expect(lintText("é".repeat(BODY_MAX_BYTES / 2) + "\n" + lead())).toEqual([`1: body exceeds ${BODY_MAX_BYTES} bytes`]);
  });

  test("the title is checked with the same rules and reported as title", () => {
    expect(lintText(body(...FINE), "")).toEqual(["title: empty title"]);
    expect(lintText(body(...FINE), "x @someone")).toEqual(["title: @ mention"]);
    expect(lintText(body(...FINE), `x ${HOME_LINUX}`)).toEqual(["title: home or installation path"]);
    expect(lintText(body(...FINE), `x ${TOKEN}`)).toEqual(["title: GitHub token"]);
  });

  test("a second line that is not blank is a title error and the body starts there", () => {
    expect(lintBody(`${TITLE}\nfirst body line\n${lead()}`)).toEqual(["title: no blank line after the title"]);
  });

  describe("command", () => {
    const feed = (input: string) =>
      Bun.spawnSync(["bun", "src/journal.ts", "lint-body"], { cwd: ROOT, env: env(), stdin: Buffer.from(input) });

    test("a clean body prints nothing and exits 0", () => {
      const r = feed(`${TITLE}\n\n${body(...FINE)}\n`);
      expect([r.exitCode, r.stdout.toString(), r.stderr.toString()]).toEqual([0, "", ""]);
    });

    test("rejected input prints one reason per line on stdout and exits 7", () => {
      const r = feed(`${TITLE}\n\n${body(HOME_LINUX, "@someone")}\n`);
      expect(r.exitCode).toBe(EXIT.LINT_BODY);
      expect(r.stdout.toString()).toBe("1: home or installation path\n2: @ mention\n");
      expect(r.stderr.toString()).toBe("");
    });

    test("empty stdin is rejected with exit 7", () => {
      const r = feed("");
      expect(r.exitCode).toBe(7);
      expect(r.stdout.toString()).toBe("title: empty title\n1: last line is not a valid marker\n");
    });

    test("arguments are a usage error that names the input format", () => {
      const r = cli(["lint-body", "extra"]);
      expect(r.code).toBe(1);
      expect(r.err).toContain("title");
      expect(r.err).toContain("blank line");
    });
  });
});

describe("lint-page", () => {
  const pages = join(ROOT, "src", "fixtures", "pages");
  const page = (name: string) => readFileSync(join(pages, name), "utf8");
  const reasons = (name: string, kind: "constitution" | "department" = "constitution") => lintPage(kind, page(name)).reasons;

  const headingsOf = (file: string) => {
    const text = readFileSync(join(ROOT, "law", file), "utf8");
    const block = text.split("\n## Headings, in order\n")[1].split("\n## ")[0];
    return block.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  };

  test("the constant heading lists equal the contract blocks", () => {
    expect(CONSTITUTION_HEADINGS).toEqual(headingsOf("constitution.md"));
    expect(DEPARTMENT_HEADINGS).toEqual(headingsOf("departments.md"));
    expect(CONSTITUTION_HEADINGS).toHaveLength(8);
    expect(DEPARTMENT_HEADINGS).toHaveLength(9);
  });

  test("the constitution example passes and yields the department pairs", () => {
    expect(lintPage("constitution", page("constitution-valid.md"))).toEqual({
      reasons: [],
      departments: [
        ["abstraction", "docs/review/abstractions.md"],
        ["dead-code", "docs/review/dead-code.md"],
        ["docs-drift", "none"],
      ],
    });
  });

  test("the department example and the shipped abstractions page pass", () => {
    expect(reasons("department-valid.md", "department")).toEqual([]);
    const shipped = readFileSync(join(ROOT, "departments", "abstractions.md"), "utf8");
    expect(lintPage("department", shipped, "abstractions").reasons).toEqual([]);
  });

  test("a missing heading is named", () => {
    expect(reasons("constitution-missing-heading.md")).toEqual(['19: missing heading "Fence"']);
  });

  test("an extra heading is named", () => {
    expect(reasons("constitution-extra-heading.md")).toEqual(['44: extra heading "Notes"']);
  });

  test("headings out of order are named at the first misplaced one", () => {
    expect(reasons("constitution-wrong-order.md")).toEqual(['19: heading "Regression proof" is out of order, expected "Fence"']);
  });

  test("a repeated heading is extra", () => {
    const text = page("constitution-valid.md") + "\n## Precedents\n\nnone\n";
    expect(lintPage("constitution", text).reasons).toEqual(['49: extra heading "Precedents"']);
  });

  test("a wrong contract version is named at its line", () => {
    expect(reasons("constitution-bad-version.md")).toEqual(["2: contract_version must be 1"]);
  });

  test("missing frontmatter, an unclosed one and a missing version are named", () => {
    const body = page("constitution-valid.md").split("---\n")[2];
    expect(lintPage("constitution", body).reasons).toEqual(["1: frontmatter missing or not closed"]);
    expect(lintPage("constitution", "---\ncontract_version: 1\n" + body).reasons).toEqual([
      "1: frontmatter missing or not closed",
    ]);
    expect(lintPage("constitution", "---\nother: 1\n---\n" + body).reasons).toEqual(["1: contract_version missing"]);
  });

  test("an empty section is named, none is accepted", () => {
    expect(reasons("constitution-empty-section.md")).toEqual(['24: section "Regression proof" is empty, write none']);
    const text = page("constitution-valid.md");
    expect(lintPage("constitution", text.replace(/## Regression proof\n[\s\S]*?\n(?=## Not)/, "## Regression proof\n\nnone\n\n")).reasons).toEqual([]);
  });

  test("a heading inside a fence counts for neither the list nor a section", () => {
    expect(reasons("constitution-fenced-heading.md")).toEqual(['48: missing heading "Precedents"']);
    const text = page("constitution-valid.md").replace(
      "## Fence\n",
      "## Fence\n\n```\n## Bogus\n```\n",
    );
    expect(lintPage("constitution", text).reasons).toEqual([]);
    const onlyFence = page("constitution-valid.md").replace(/## Not judged\n\nnone\n/, "## Not judged\n\n~~~\n## Execution\n~~~\n");
    expect(lintPage("constitution", onlyFence).reasons).toEqual([]);
  });

  test("a deeper heading is not a section heading", () => {
    const text = page("constitution-valid.md").replace("## Fence\n", "## Fence\n\n### Detail\n");
    expect(lintPage("constitution", text).reasons).toEqual([]);
  });

  test("the constitution needs the title line before the first heading", () => {
    const text = page("constitution-valid.md").replace("# Constitution of example/widgets\n", "# Widgets\n");
    expect(lintPage("constitution", text).reasons).toEqual(['4: title line "# Constitution of <owner>/<repo>" missing']);
    const late = page("constitution-valid.md").replace("# Constitution of example/widgets\n\n", "").replace("## Precedents", "# Constitution of a/b\n## Precedents");
    expect(lintPage("constitution", late).reasons).toEqual(['4: title line "# Constitution of <owner>/<repo>" missing']);
  });

  test("a parent segment in a listed path is named", () => {
    expect(reasons("constitution-dotdot.md")).toEqual(["10: path holds .."]);
  });

  test("leading slashes and backslashes are named in every path section", () => {
    const text = page("constitution-valid.md")
      .replace("- README.md\n", "- /etc/passwd\n- docs\\x.md\n")
      .replace("- rules/testing.md", "- /rules/testing.md")
      .replace("## Not judged\n\nnone", "## Not judged\n\n- a/../b\n")
      .replace("judged by docs/review/dead-code.md", "judged by ../dead-code.md");
    expect(lintPage("constitution", text).reasons.map((r) => r.replace(/^\d+: /, ""))).toEqual([
      "path starts with a slash",
      "path holds a backslash",
      "path holds ..",
      "path holds ..",
      "path starts with a slash",
    ]);
  });

  test("a quoted heading after a path is not part of the path", () => {
    const text = page("constitution-valid.md").replace('"Module boundaries"', '"Wait... what"');
    expect(lintPage("constitution", text).reasons).toEqual([]);
  });

  test("a department line of the wrong shape is named", () => {
    expect(reasons("constitution-bad-department-line.md")).toEqual([
      '17: department line must read "- <name>: judged by <path or none>"',
    ]);
    for (const bad of ["- x judged by none", "- x: judged by", "- x: judged by a b", "x: judged by none", "- X: judged by none", "- x:  judged by none"]) {
      const text = page("constitution-valid.md").replace("- docs-drift: judged by none", bad);
      expect(lintPage("constitution", text).reasons).toHaveLength(1);
    }
  });

  test("a failing page yields no pairs", () => {
    expect(lintPage("constitution", page("constitution-bad-version.md")).departments).toEqual([]);
  });

  test("a Departments section of none yields no pairs and passes", () => {
    const text = page("constitution-valid.md").replace(/## Departments\n[\s\S]*?(?=## Fence)/, "## Departments\n\nnone\n\n");
    expect(lintPage("constitution", text)).toEqual({ reasons: [], departments: [] });
  });

  test("a department page needs name and version, and the name must fit", () => {
    const text = page("department-valid.md");
    expect(lintPage("department", text.replace("name: fixtures\n", "")).reasons).toEqual(["1: name missing"]);
    expect(lintPage("department", text.replace("name: fixtures", "name: Fixtures")).reasons).toEqual([
      "2: name must match [a-z][a-z0-9-]*",
    ]);
    expect(lintPage("department", text.replace("contract_version: 1", "contract_version: 3")).reasons).toEqual([
      "3: contract_version must be 1",
    ]);
  });

  test("the expected name is compared only when given", () => {
    const text = page("department-valid.md");
    expect(lintPage("department", text, "fixtures").reasons).toEqual([]);
    expect(lintPage("department", text, "other").reasons).toEqual(["2: name differs from the file name"]);
    expect(lintPage("department", text).reasons).toEqual([]);
  });

  test("a department page uses its own heading list", () => {
    expect(lintPage("department", page("constitution-valid.md")).reasons[0]).toContain("name missing");
    expect(lintPage("constitution", page("department-valid.md")).reasons).toContain('5: extra heading "Mission"');
  });

  describe("command", () => {
    const feed = (args: string[], input: string) => {
      const r = Bun.spawnSync(["bun", "src/journal.ts", "lint-page", ...args], { cwd: ROOT, env: env(), stdin: Buffer.from(input) });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    };

    test("a valid constitution prints name TAB judged-by per department and exits 0", () => {
      const r = feed(["constitution"], page("constitution-valid.md"));
      expect(r).toEqual({
        code: 0,
        out: "abstraction\tdocs/review/abstractions.md\ndead-code\tdocs/review/dead-code.md\ndocs-drift\tnone\n",
        err: "",
      });
    });

    test("a valid department page prints nothing and exits 0", () => {
      expect(feed(["department"], page("department-valid.md"))).toEqual({ code: 0, out: "", err: "" });
    });

    test("the shipped abstractions page passes through stdin", () => {
      const shipped = readFileSync(join(ROOT, "departments", "abstractions.md"), "utf8");
      expect(feed(["department", "--name", "abstractions"], shipped)).toEqual({ code: 0, out: "", err: "" });
    });

    test("reasons go to stdout, one per line, with exit 8", () => {
      const r = feed(["constitution"], page("constitution-bad-version.md"));
      expect(r).toEqual({ code: EXIT.LINT_PAGE, out: "2: contract_version must be 1\n", err: "" });
    });

    test("a name mismatch exits 8", () => {
      const r = feed(["department", "--name", "other"], page("department-valid.md"));
      expect([r.code, r.out]).toEqual([8, "2: name differs from the file name\n"]);
    });

    test("bad arguments are a usage error", () => {
      for (const args of [[], ["page"], ["constitution", "--name", "x"], ["department", "--name"], ["department", "--name", "Bad"]]) {
        const r = feed(args, "");
        expect(r.code).toBe(1);
        expect(r.out).toBe("");
      }
    });
  });
});

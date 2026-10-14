import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import {
  EXIT,
  Fail,
  MIGRATIONS,
  check,
  dbPath,
  now,
  open,
  pickNext,
  probeLine,
} from "./journal";

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

describe("source constraints", () => {
  test("the journal never starts processes or touches the network", () => {
    const src = readFileSync(SRC, "utf8");
    for (const banned of ["spawn", "Bun.$", "child_process", "fetch(", "exec("]) {
      expect(src).not.toContain(banned);
    }
  });
});

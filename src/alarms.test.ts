import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { MIGRATIONS, open } from "./db";
import { ROOT, dbFile, env, tables, tempDb } from "./test-helpers";

tempDb();

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
      expect(alarm(later(72)).out).toBe("");
    });

    test("a taken order whose claim expired alarms 48 hours after the claim TTL", () => {
      seed((db) => precinct(db, "a"));
      expect(call(BASE, ["dispatch", "add", "--precinct", "a", "--role", "patrol"]).code).toBe(0);
      expect(call(BASE, ["dispatch", "take", "--role", "patrol"]).code).toBe(0);
      expect(alarm(later(72)).out).toBe("");
      expect(alarm(later(72, 1)).out).toMatch(/^ALARM order-untaken 1 .+\n$/);
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

    test("unended ticks do not count towards tick-failing", () => {
      seed((db) => {
        tick(db, "patrol", later(0), later(0, 60), "failed", "a");
        tick(db, "patrol", later(1), later(1, 60), "failed", "a");
        tick(db, "patrol", later(2), null, null, "a");
        tick(db, "patrol", later(3), later(3, 60), "stopped-sync");
        tick(db, "patrol", later(4), later(4, 60), "stopped-sync");
      });
      expect(alarm(later(6, 120)).out).not.toContain("tick-failing");
    });

    test("three stopped ticks without a precinct raise tick-failing under role/-", () => {
      seed((db) => {
        tick(db, "patrol", later(0), later(0, 60), "stopped-law-drift");
        tick(db, "patrol", later(1), later(1, 60), "stopped-dirty-law");
        tick(db, "patrol", later(2), later(2, 60), "stopped-gh-auth");
      });
      const r = alarm(later(3));
      expect(r.out).toMatch(/^ALARM tick-failing patrol\/- .+\n$/);
      expect(r.out.trim().split("\n")).toHaveLength(1);
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

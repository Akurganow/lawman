import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import pkg from "../package.json";
import { dbPath, EXIT, Fail, MIGRATIONS, now, open, probeLine } from "./db";
import {
	cli,
	dbFile,
	harness,
	tables,
	tempDb,
	userVersion,
} from "./test-helpers";

tempDb();

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
			expect.arrayContaining([
				"alarms",
				"dispatches",
				"issues",
				"markers",
				"precincts",
				"roles",
				"ticks",
			]),
		);
		db.close();
	});

	test("sets WAL, busy timeout and foreign keys", () => {
		const db = open(dbFile);
		expect(db.query("PRAGMA journal_mode").get()).toEqual({
			journal_mode: "wal",
		});
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
			db.run(
				"INSERT INTO dispatches (at, precinct, role, issue) VALUES ('t', 'p', 'patrol', ?)",
				[issue],
			);
		add(null);
		expect(() => add(null)).toThrow();
		add(7);
		expect(() => add(7)).toThrow();
		db.close();
	});

	test("migration 1 allows one open alarm per kind and ref", () => {
		const db = open(dbFile);
		const raise = () =>
			db.run(
				"INSERT INTO alarms (kind, ref, detail, raised_at, notified_at) VALUES ('k', 'r', 'd', 't', 't')",
			);
		raise();
		expect(() => raise()).toThrow();
		db.run("UPDATE alarms SET cleared_at = 't'");
		raise();
		db.close();
	});

	test("migration 3 keeps the data of a schema 2 database and adds replied_at", () => {
		const old = new Database(dbFile);
		for (const sql of MIGRATIONS.slice(0, 2)) old.run(sql);
		old.run("PRAGMA user_version = 2");
		old.run(
			"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('p', 7, 'OPEN', 't', 'c')",
		);
		old.close();
		const db = open(dbFile);
		expect(userVersion(db)).toBe(3);
		expect(
			db.query("SELECT issue, title, replied_at FROM issues").all(),
		).toEqual([{ issue: 7, title: "t", replied_at: null }]);
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
		const procs = Array.from({ length: 4 }, () =>
			harness({ LAWMAN_DB: dbFile }),
		);
		const codes = await Promise.all(procs.map((p) => p.exited));
		expect(codes).toEqual([0, 0, 0, 0]);
		const db = open(dbFile);
		expect(userVersion(db)).toBe(MIGRATIONS.length);
		db.close();
	});
});

describe("probe", () => {
	test("probe prints the version, schema and journal mode and leaves no row", () => {
		const db = open(dbFile);
		expect(probeLine(db)).toBe(
			`journal ${pkg.version} schema ${MIGRATIONS.length} wal`,
		);
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
		const r = cli(["probe"], {
			LAWMAN_DB: dbFile,
			LAWMAN_NOW: "2026-01-01T00:00:00Z",
		});
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
		expect(dbPath({}, "/opt/lawman/bin/journal")).toBe(
			"/opt/lawman/journal.sqlite",
		);
	});

	test("LAWMAN_DB overrides the default", () => {
		expect(
			dbPath({ LAWMAN_DB: "/x/y.sqlite" }, "/opt/lawman/bin/journal"),
		).toBe("/x/y.sqlite");
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

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	BASE,
	call,
	dbFile,
	tick as insertTick,
	later,
	precinct,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

describe("ticks", () => {
	describe("tick", () => {
		const start = (role: string) =>
			call(BASE, ["tick", "start", "--role", role]).out.trim();
		const addOrder = () =>
			call(BASE, [
				"dispatch",
				"add",
				"--precinct",
				"a",
				"--role",
				"patrol",
			]).out.trim();

		test("start prints the id and stores the clock time", () => {
			const r = call(BASE, ["tick", "start", "--role", "patrol"]);
			expect(r).toMatchObject({ code: 0, out: "1\n" });
			expect(rows("SELECT role, started_at, ended_at FROM ticks")).toEqual([
				{ role: "patrol", started_at: BASE, ended_at: null },
			]);
		});

		test("end stores outcome, precinct, department and the stdin report", () => {
			const id = start("patrol");
			const end = call(
				later(1),
				[
					"tick",
					"end",
					id,
					"--outcome",
					"filed",
					"--precinct",
					"a",
					"--department",
					"billing",
				],
				"line one\nline two\n",
			);
			expect(end).toMatchObject({ code: 0, out: "" });
			expect(
				rows(
					"SELECT precinct, department, started_at, ended_at, outcome, report FROM ticks",
				),
			).toEqual([
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
			const id = start("duty-desk");
			expect(
				call(later(1), ["tick", "end", id, "--outcome", "silent"]).code,
			).toBe(0);
			expect(
				rows("SELECT precinct, department, report, outcome FROM ticks"),
			).toEqual([
				{ precinct: null, department: null, report: "", outcome: "silent" },
			]);
		});

		test("end accepts the executed and skipped-merge-conflict outcomes", () => {
			for (const outcome of ["executed", "skipped-merge-conflict"]) {
				const id = start("executor");
				expect(
					call(later(1), ["tick", "end", id, "--outcome", outcome]).code,
				).toBe(0);
			}
			expect(rows("SELECT outcome FROM ticks ORDER BY id")).toEqual([
				{ outcome: "executed" },
				{ outcome: "skipped-merge-conflict" },
			]);
		});

		test("end with --dispatch closes the order with the same outcome", () => {
			seed((db) => precinct(db, "a"));
			const order = addOrder();
			const id = start("patrol");
			expect(
				call(later(1), [
					"tick",
					"end",
					id,
					"--outcome",
					"capped",
					"--dispatch",
					order,
				]).code,
			).toBe(0);
			expect(rows("SELECT outcome, closed_at FROM dispatches")).toEqual([
				{ outcome: "capped", closed_at: later(1) },
			]);
			expect(rows("SELECT outcome FROM ticks")).toEqual([
				{ outcome: "capped" },
			]);
		});

		test("an unknown or closed order exits 1 and leaves the tick unended", () => {
			seed((db) => precinct(db, "a"));
			const order = addOrder();
			const first = start("patrol");
			call(
				BASE,
				["tick", "end", first, "--outcome", "silent", "--dispatch", order],
				"report",
			);
			const id = start("patrol");
			for (const dispatch of ["9999", order]) {
				const r = call(
					later(1),
					["tick", "end", id, "--outcome", "filed", "--dispatch", dispatch],
					"report",
				);
				expect(r.code).toBe(1);
				expect(r.err.trim().split("\n")).toHaveLength(1);
				expect(
					rows(`SELECT ended_at, outcome, report FROM ticks WHERE id = ${id}`),
				).toEqual([{ ended_at: null, outcome: null, report: null }]);
			}
		});

		test("an unknown or already ended tick exits 1 and keeps the first end", () => {
			expect(call(BASE, ["tick", "end", "9", "--outcome", "silent"]).code).toBe(
				1,
			);
			const id = start("patrol");
			expect(
				call(later(1), ["tick", "end", id, "--outcome", "silent"], "first")
					.code,
			).toBe(0);
			expect(
				call(later(2), ["tick", "end", id, "--outcome", "failed"], "second")
					.code,
			).toBe(1);
			expect(rows("SELECT outcome, report FROM ticks")).toEqual([
				{ outcome: "silent", report: "first" },
			]);
		});

		test("bad arguments exit 1", () => {
			const id = start("patrol");
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
			for (const args of bad)
				expect([args, call(BASE, args).code]).toEqual([args, 1]);
		});
	});

	describe("tick list", () => {
		const list = (...args: string[]) => call(BASE, ["tick", "list", ...args]);
		const LIST_USAGE =
			"tick <start --role <r>|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]|list (--limit <n>|--id <n>) [--role <r>] [--precinct <p>]>";
		const ended = (
			role: string,
			startedAt: string,
			p: string | null = null,
			report: string | null = "",
		) =>
			seed((db) => {
				insertTick(db, role, startedAt, later(2), "silent", p);
				db.run("UPDATE ticks SET report = ? WHERE id = last_insert_rowid()", [
					report,
				]);
			});
		const idsOf = (out: string) =>
			out
				.split("\n")
				.filter((l) => /^\d+\t/.test(l))
				.map((l) => l.split("\t")[0]);

		test("lists newest first and breaks equal start times by larger id", () => {
			ended("patrol", later(1));
			ended("patrol", later(3));
			ended("patrol", later(3));
			ended("patrol", later(2));
			expect(idsOf(list("--limit", "10").out)).toEqual(["3", "2", "4", "1"]);
		});

		test("--limit keeps the first n of that order", () => {
			for (const hours of [1, 2, 3]) ended("patrol", later(hours));
			expect(idsOf(list("--limit", "2").out)).toEqual(["3", "2"]);
			expect(idsOf(list("--limit", "99").out)).toEqual(["3", "2", "1"]);
		});

		test("a fact line has seven tab fields and report lines follow with a bar", () => {
			seed((db) => {
				precinct(db, "a");
				insertTick(db, "patrol", BASE, later(1), "filed", "a");
				db.run(
					"UPDATE ticks SET department = 'billing', report = 'one\ntwo\n'",
				);
			});
			expect(list("--limit", "1")).toMatchObject({
				code: 0,
				out: `1\tpatrol\ta\tbilling\tfiled\t${BASE}\t${later(1)}\n| one\n| two\n`,
			});
		});

		test("empty report lines are skipped and whitespace-only lines are kept", () => {
			ended("patrol", BASE, null, "a\n\n  \nb\n");
			expect(list("--limit", "1").out.split("\n").slice(1)).toEqual([
				"| a",
				"|   ",
				"| b",
				"",
			]);
		});

		test("empty fields print a dash and a closed tick without report prints no bar", () => {
			ended("patrol", BASE);
			expect(list("--limit", "1").out).toBe(
				`1\tpatrol\t-\t-\tsilent\t${BASE}\t${later(2)}\n`,
			);
		});

		test("an open tick prints running, a dash for the end and no report", () => {
			call(BASE, ["tick", "start", "--role", "patrol"]);
			expect(list("--limit", "1").out).toBe(
				`1\tpatrol\t-\t-\trunning\t${BASE}\t-\n`,
			);
		});

		test("ticks follow one another without separators", () => {
			ended("patrol", later(1), null, "x");
			ended("patrol", later(2), null, "y");
			expect(list("--limit", "2").out).toBe(
				`2\tpatrol\t-\t-\tsilent\t${later(2)}\t${later(2)}\n| y\n` +
					`1\tpatrol\t-\t-\tsilent\t${later(1)}\t${later(2)}\n| x\n`,
			);
		});

		test("--role and --precinct narrow the selection, alone or together", () => {
			ended("patrol", later(1), "a");
			ended("patrol", later(2), "b");
			ended("court", later(3), "a");
			expect(idsOf(list("--limit", "9", "--role", "patrol").out)).toEqual([
				"2",
				"1",
			]);
			expect(idsOf(list("--limit", "9", "--precinct", "a").out)).toEqual([
				"3",
				"1",
			]);
			expect(
				idsOf(list("--limit", "9", "--role", "patrol", "--precinct", "a").out),
			).toEqual(["1"]);
		});

		test("the filter applies before --limit", () => {
			ended("patrol", later(1));
			ended("court", later(2));
			ended("court", later(3));
			expect(idsOf(list("--limit", "1", "--role", "patrol").out)).toEqual([
				"1",
			]);
		});

		test("--id prints one tick, and a later tick does not move it", () => {
			ended("patrol", later(1), null, "kept");
			const first = list("--id", "1");
			expect(idsOf(first.out)).toEqual(["1"]);
			ended("patrol", later(2));
			ended("patrol", later(3));
			expect(list("--id", "1")).toEqual(first);
			expect(list("--limit", "1").out).not.toBe(first.out);
		});

		test("--id with another role or precinct, or an unknown id, prints nothing", () => {
			ended("patrol", later(1), "a");
			for (const args of [
				["--id", "1", "--role", "court"],
				["--id", "1", "--precinct", "b"],
				["--id", "9"],
			])
				expect([args, list(...args)]).toEqual([
					args,
					{ code: 0, out: "", err: "" },
				]);
			expect(
				idsOf(list("--id", "1", "--role", "patrol", "--precinct", "a").out),
			).toEqual(["1"]);
		});

		test("no matching tick prints nothing and exits 0", () => {
			expect(list("--limit", "5")).toEqual({ code: 0, out: "", err: "" });
		});

		test("every argument shape error exits 1 with the usage line and no output", () => {
			ended("patrol", BASE);
			const bad = [
				["tick", "list"],
				["tick", "list", "--role", "patrol"],
				["tick", "list", "--limit", "1", "--id", "1"],
				["tick", "list", "--limit", "1", "--limit", "2"],
				["tick", "list", "--limit"],
				["tick", "list", "--limit", "1", "extra"],
				["tick", "list", "extra", "--limit", "1"],
				["tick", "list", "--limit", "1", "--bogus", "x"],
			];
			for (const args of bad) {
				const r = call(BASE, args);
				expect([args, r.code, r.out]).toEqual([args, 1, ""]);
				expect(r.err).toBe(`journal: usage: journal ${LIST_USAGE}\n`);
			}
		});

		test("bad values exit 1 with one line naming the value", () => {
			const bad: [string[], string][] = [
				[["--limit", "0"], "invalid limit"],
				[["--limit", "-1"], "invalid limit"],
				[["--limit", "1.5"], "invalid limit"],
				[["--limit", "x"], "invalid limit"],
				[["--limit", "99999999999999999999"], "invalid limit"],
				[["--id", "0"], "invalid id"],
				[["--id", "x"], "invalid id"],
				[["--limit", "1", "--role", "Bad"], "invalid role"],
				[["--limit", "1", "--precinct", "Bad Precinct"], "invalid precinct"],
			];
			for (const [args, message] of bad) {
				const r = list(...args);
				expect([args, r.code, r.out]).toEqual([args, 1, ""]);
				expect(r.err.trim().split("\n")).toHaveLength(1);
				expect(r.err).toStartWith(`journal: ${message}`);
			}
		});

		test("reading leaves the database file unchanged", () => {
			ended("patrol", BASE, null, "report");
			const before = readFileSync(dbFile);
			list("--limit", "5");
			list("--id", "1");
			expect(readFileSync(dbFile).equals(before)).toBe(true);
		});
	});
});

import { describe, expect, test } from "bun:test";
import { MIGRATIONS, open } from "./db";
import {
	BASE,
	call,
	dbFile,
	later,
	precinct,
	rows,
	seed,
	tables,
	tempDb,
} from "./test-helpers";

tempDb();

describe("ticks and pauses", () => {
	describe("migration 2", () => {
		test("creates pauses and allows only one open pause", () => {
			const db = open(dbFile);
			expect(MIGRATIONS).toHaveLength(2);
			expect(tables(db)).toContain("pauses");
			db.run("INSERT INTO pauses (started_at) VALUES ('a')");
			expect(() =>
				db.run("INSERT INTO pauses (started_at) VALUES ('b')"),
			).toThrow();
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
			const id = call(BASE, [
				"tick",
				"start",
				"--role",
				"duty-desk",
			]).out.trim();
			expect(
				call(later(1), ["tick", "end", id, "--outcome", "silent"]).code,
			).toBe(0);
			expect(
				rows("SELECT precinct, department, report, outcome FROM ticks"),
			).toEqual([
				{ precinct: null, department: null, report: "", outcome: "silent" },
			]);
		});

		test("end with --dispatch closes the order with the same outcome", () => {
			seed((db) => precinct(db, "a"));
			const order = call(BASE, [
				"dispatch",
				"add",
				"--precinct",
				"a",
				"--role",
				"patrol",
			]).out.trim();
			const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
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
			const order = call(BASE, [
				"dispatch",
				"add",
				"--precinct",
				"a",
				"--role",
				"patrol",
			]).out.trim();
			const first = call(BASE, [
				"tick",
				"start",
				"--role",
				"patrol",
			]).out.trim();
			call(
				BASE,
				["tick", "end", first, "--outcome", "silent", "--dispatch", order],
				"report",
			);
			const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
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
			const id = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
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
			for (const args of bad)
				expect([args, call(BASE, args).code]).toEqual([args, 1]);
		});
	});

	describe("pause", () => {
		test("set opens a pause, clear closes it, and a new one can follow", () => {
			expect(call(BASE, ["pause", "set"])).toMatchObject({ code: 0, out: "" });
			expect(call(later(1), ["pause", "clear"])).toMatchObject({
				code: 0,
				out: "",
			});
			expect(call(later(2), ["pause", "set"]).code).toBe(0);
			expect(
				rows("SELECT started_at, ended_at FROM pauses ORDER BY id"),
			).toEqual([
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
			for (const args of [
				["pause"],
				["pause", "bogus"],
				["pause", "set", "extra"],
			]) {
				expect([args, call(BASE, args).code]).toEqual([args, 1]);
			}
		});
	});
});

import { describe, expect, test } from "bun:test";
import { open } from "./db";
import {
	addPrecincts,
	BASE,
	call,
	dbFile,
	env,
	later,
	ROOT,
	run,
	tempDb,
} from "./test-helpers";

tempDb();

describe("dispatch", () => {
	const add = (
		precinct: string,
		role = "patrol",
		extra: string[] = [],
		clock = BASE,
	) =>
		call(clock, [
			"dispatch",
			"add",
			"--precinct",
			precinct,
			"--role",
			role,
			...extra,
		]);
	const take = (clock = BASE, role = "patrol") =>
		call(clock, ["dispatch", "take", "--role", role]);

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
		for (const args of bad)
			expect([args, call(BASE, ["dispatch", "add", ...args]).code]).toEqual([
				args,
				1,
			]);
		expect(call(BASE, ["dispatch"]).code).toBe(1);
		expect(call(BASE, ["dispatch", "bogus"]).code).toBe(1);
	});

	test("add stores the clock time, the department and the issue", () => {
		addPrecincts({ a: 1 });
		add(
			"a",
			"patrol",
			["--department", "billing", "--issue", "9"],
			"2026-04-01T05:06:07Z",
		);
		const db = open(dbFile);
		expect(
			db
				.query(
					"SELECT at, department, issue, taken_at, outcome FROM dispatches",
				)
				.all(),
		).toEqual([
			{
				at: "2026-04-01T05:06:07Z",
				department: "billing",
				issue: 9,
				taken_at: null,
				outcome: null,
			},
		]);
		db.close();
	});

	test("take prints id, precinct, repo, department and issue, empty for NULL", () => {
		addPrecincts({ a: 1 });
		const id = add("a", "patrol", [
			"--department",
			"billing",
			"--issue",
			"9",
		]).out.trim();
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
		expect(take(BASE, "Bad").code).toBe(1);
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
			Bun.spawn(
				["bun", "src/journal.ts", "dispatch", "take", "--role", "patrol"],
				{
					cwd: ROOT,
					env: env({ LAWMAN_DB: dbFile, LAWMAN_NOW: BASE }),
					stdout: "pipe",
					stderr: "pipe",
				},
			);
		const procs = [spawn(), spawn()];
		const codes = await Promise.all(procs.map((p) => p.exited));
		const outs = await Promise.all(
			procs.map((p) => new Response(p.stdout).text()),
		);
		expect(codes).toEqual([0, 0]);
		expect(outs.filter((o) => o !== "")).toHaveLength(1);
	});

	test("a taken order is reclaimed only after 24 hours", () => {
		addPrecincts({ a: 1 });
		const id = add("a").out.trim();
		expect(take(BASE).out).not.toBe("");
		expect(take(later(0, 1)).out).toBe("");
		expect(take(later(23, 3599)).out).toBe("");
		expect(take(later(24)).out).toBe("");
		expect(take(later(24, 1)).out.split("\t")[0]).toBe(id);
		expect(take(later(24, 2)).out).toBe("");
	});

	test("close is a usage error and leaves the order open", () => {
		addPrecincts({ a: 1 });
		const id = add("a").out.trim();
		const r = call(BASE, ["dispatch", "close", id, "--outcome", "filed"]);
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
		const db = open(dbFile);
		expect(
			db.query("SELECT outcome FROM dispatches WHERE id = ?").get(Number(id)),
		).toEqual({ outcome: null });
		db.close();
	});

	test("next skips a precinct with an open order and admits it again after tick end closes it", () => {
		addPrecincts({ a: 1 });
		const id = add("a").out.trim();
		expect(run(["next", "--role", "patrol"]).out).toBe("");
		const tick = call(BASE, ["tick", "start", "--role", "patrol"]).out.trim();
		call(BASE, ["tick", "end", tick, "--outcome", "silent", "--dispatch", id]);
		expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
	});
});

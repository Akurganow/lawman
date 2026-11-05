import { describe, expect, test } from "bun:test";
import { inTransaction, open } from "./db";
import { takeableOrders, takeOrder } from "./dispatch";
import {
	addPrecincts,
	BASE,
	call,
	dbFile,
	env,
	JOURNAL,
	later,
	seed,
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
	// the first takeable order of the role, taken as the start does it, in the line the old take printed
	const take = (clock = BASE, role = "patrol") => {
		const db = open(dbFile);
		try {
			const o = takeableOrders(db, role, clock)[0];
			if (o === undefined) return { out: "" };
			inTransaction(db, () => takeOrder(db, role, o.id, clock));
			return {
				out: `${o.id}\t${o.precinct}\t${o.repo}\t${o.department ?? ""}\t${o.issue ?? ""}\n`,
			};
		} finally {
			db.close();
		}
	};

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

	test("take finds nothing when no order is open for the role", () => {
		addPrecincts({ a: 1 });
		expect(take().out).toBe("");
		add("a", "duty-desk");
		expect(take().out).toBe("");
	});

	test("take returns the oldest open order of a role first, patrol by credit and then by name", () => {
		addPrecincts({ a: 1, b: 1 });
		const older = add("b", "clerk", [], later(0)).out.trim();
		const newer = add("a", "clerk", [], later(1)).out.trim();
		expect(take(later(2), "clerk").out.split("\t")[0]).toBe(older);
		expect(take(later(2), "clerk").out.split("\t")[0]).toBe(newer);
		expect(take(later(2), "clerk").out).toBe("");
		add("b", "patrol", [], later(0));
		const first = add("a", "patrol", [], later(1)).out.trim();
		expect(take(later(2)).out.split("\t")[0]).toBe(first);
	});

	test("two concurrent takes hand the single order to exactly one", async () => {
		addPrecincts({ a: 1 });
		add("a");
		const script = `
const { open, inTransaction } = await import("./src/db");
const { takeOrder } = await import("./src/dispatch");
const db = open();
process.stdout.write(String(inTransaction(db, () => takeOrder(db, "patrol", 1, process.env.LAWMAN_NOW))));
db.close();
`;
		const spawn = () =>
			Bun.spawn(["bun", "-e", script], {
				cwd: JOURNAL,
				env: env({ LAWMAN_DB: dbFile, LAWMAN_NOW: BASE }),
				stdout: "pipe",
				stderr: "pipe",
			});
		const procs = [spawn(), spawn()];
		const codes = await Promise.all(procs.map((p) => p.exited));
		const outs = await Promise.all(
			procs.map((p) => new Response(p.stdout).text()),
		);
		expect(codes).toEqual([0, 0]);
		expect(outs.sort()).toEqual(["false", "true"]);
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

	test("a taken order leaves the take list and a new one is admitted after tick end closes it", () => {
		addPrecincts({ a: 1 });
		const id = add("a").out.trim();
		take();
		expect(add("a").code).toBe(2);
		seed((db) =>
			db.run("INSERT INTO ticks (role, started_at) VALUES ('patrol', ?)", [
				BASE,
			]),
		);
		expect(
			call(BASE, ["tick", "end", "1", "--outcome", "silent", "--dispatch", id])
				.code,
		).toBe(0);
		const next = add("a").out.trim();
		expect(take(later(1)).out.split("\t")[0]).toBe(next);
	});

	test("take, next and the other removed commands are usage errors", () => {
		expect(call(BASE, ["dispatch", "take", "--role", "patrol"]).code).toBe(1);
		expect(call(BASE, ["next", "--role", "patrol"]).code).toBe(1);
	});
});

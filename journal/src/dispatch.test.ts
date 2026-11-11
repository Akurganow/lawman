import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { inTransaction, open } from "./db";
import { takeableOrders, takeOrder } from "./dispatch";
import {
	addPrecincts,
	BASE,
	call,
	dbFile,
	dir,
	later,
	must,
	order,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

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
		const o = takeableOrders(db, role)[0];
		if (o === undefined) return { out: "" };
		inTransaction(db, () => takeOrder(db, role, o.id, clock));
		return {
			out: `${o.id}	${o.precinct}	${o.repo}	${o.department ?? ""}	${o.issue ?? ""}\n`,
		};
	} finally {
		db.close();
	}
};
const wake = (clock = BASE, role = "patrol") =>
	call(clock, ["wake", "--role", role]);
function seedOrders(body: (db: Database) => void): void {
	seed((db) => {
		db.run(
			"INSERT OR IGNORE INTO precincts (name, repo, weight) VALUES ('main', 'o/main', 1)",
		);
		body(db);
	});
}
const ordersOf = (out: string) =>
	out.split("\n").filter((line) => line.startsWith("order "));
const takeable = () => {
	const db = open(dbFile);
	const names = takeableOrders(db, "patrol").map((o) => o.precinct);
	db.close();
	return names;
};
// the state one test got from the hooks: a new folder for the database
const fresh = () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir);
};

describe("dispatch", () => {
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
		expect(take(later(2), "clerk").out.split("	")[0]).toBe(older);
		expect(take(later(2), "clerk").out.split("	")[0]).toBe(newer);
		// a taken order stays takeable; among the taken the old one comes first
		expect(take(later(2), "clerk").out.split("	")[0]).toBe(older);
		add("b", "patrol", [], later(0));
		const first = add("a", "patrol", [], later(1)).out.trim();
		expect(take(later(2)).out.split("	")[0]).toBe(first);
	});

	test("an untaken order is taken before a taken one and each group keeps its old order", () => {
		addPrecincts({ a: 1, b: 1 });
		seed((db) => {
			order(db, "a", "clerk", { at: BASE, takenAt: BASE, issue: 1 });
			order(db, "b", "clerk", { at: later(3), issue: 2 });
			order(db, "a", "clerk", { at: later(1), takenAt: later(2), issue: 5 });
			order(db, "b", "clerk", { at: later(4), issue: 6 });
		});
		const ids = rows("SELECT id FROM dispatches ORDER BY id").map((r) =>
			must(r.id as number | undefined),
		);
		const takenOld = must(ids[0]);
		const untakenFirst = must(ids[1]);
		const takenNew = must(ids[2]);
		const untakenSecond = must(ids[3]);
		const db = open(dbFile);
		try {
			expect(takeableOrders(db, "clerk").map((o) => o.id)).toEqual([
				untakenFirst,
				untakenSecond,
				takenOld,
				takenNew,
			]);
		} finally {
			db.close();
		}
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

	test("an open order blocks a duplicate and a taken order stays in the take list until tick end closes it", () => {
		addPrecincts({ a: 1 });
		const id = add("a").out.trim();
		take();
		expect(take(later(1)).out.split("	")[0]).toBe(id);
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
		expect(take(later(1)).out.split("	")[0]).toBe(next);
	});

	test("tick end on an order another tick closed fails and leaves the tick open", () => {
		addPrecincts({ a: 1 });
		const id = add("a").out.trim();
		take();
		seed((db) =>
			db.run("INSERT INTO ticks (role, started_at) VALUES ('patrol', ?)", [
				BASE,
			]),
		);
		// another tick closed the order while this tick worked on it
		seed((db) =>
			db.run(
				"UPDATE dispatches SET outcome = 'silent', closed_at = ? WHERE id = ?",
				[later(1), Number(id)],
			),
		);
		const r = call(BASE, [
			"tick",
			"end",
			"1",
			"--outcome",
			"filed",
			"--dispatch",
			id,
		]);
		expect(r.code).toBe(1);
		expect(r.err).toContain(`no open order with id ${id}`);
		expect(rows("SELECT ended_at FROM ticks")).toEqual([{ ended_at: null }]);
	});

	test("take, next and the other removed commands are usage errors", () => {
		expect(call(BASE, ["dispatch", "take", "--role", "patrol"]).code).toBe(1);
		expect(call(BASE, ["next", "--role", "patrol"]).code).toBe(1);
	});
});

test("a patrol order nobody took comes before a taken one", () => {
	// dispatch
	addPrecincts({ a: 3, b: 2, c: 1 });
	seed((db) => {
		order(db, "a", "patrol", { at: BASE, takenAt: BASE });
		order(db, "b", "patrol", { at: later(1) });
		order(db, "c", "patrol", { at: later(2) });
	});
	{
		const db = open(dbFile);
		try {
			expect(takeableOrders(db, "patrol").map((o) => o.precinct)).toEqual([
				"b",
				"c",
				"a",
			]);
		} finally {
			db.close();
		}
	}
	// wake
	fresh();
	seedOrders((db) => {
		db.run(
			"INSERT OR IGNORE INTO precincts (name, repo, weight) VALUES ('other', 'o/other', 1)",
		);
		order(db, "main", "patrol", { at: BASE, takenAt: BASE });
		order(db, "other", "patrol", { at: later(1) });
	});
	const untaken = must(
		rows("SELECT id FROM dispatches WHERE taken_at IS NULL")[0]?.id as
			| number
			| undefined,
	);
	const taken = must(
		rows("SELECT id FROM dispatches WHERE taken_at IS NOT NULL")[0]?.id as
			| number
			| undefined,
	);
	{
		const db = open(dbFile);
		try {
			expect(takeableOrders(db, "patrol").map((o) => o.id)).toEqual([
				untaken,
				taken,
			]);
		} finally {
			db.close();
		}
	}
	// the wake lists the first patrol order only: the one nobody took
	expect(ordersOf(wake(later(2)).out)).toEqual([
		`order ${untaken} other o/other - -`,
	]);
});

test("a taken order stays takeable at any time", () => {
	// dispatch
	addPrecincts({ a: 1 });
	const id = add("a").out.trim();
	expect(take(BASE).out).not.toBe("");
	expect(take(later(0, 1)).out.split("	")[0]).toBe(id);
	expect(take(later(24, 1)).out.split("	")[0]).toBe(id);
	// the patrol take
	fresh();
	addPrecincts({ a: 1 });
	seed((db) => order(db, "a", "patrol", { takenAt: "2026-03-01T00:00:00Z" }));
	expect(takeable()).toEqual(["a"]);
});

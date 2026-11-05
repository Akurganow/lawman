import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { open } from "./db";
import { takeableOrders, takeOrder } from "./dispatch";
import { creditVisit } from "./precincts";
import { addPrecincts, dbFile, order, run, seed, tempDb } from "./test-helpers";

tempDb();

function credits(): Record<string, number> {
	const rows = run(["precinct", "list"])
		.out.trim()
		.split("\n")
		.map((l) => l.split("\t"));
	return Object.fromEntries(rows.map((r) => [r[0], Number(r[3])]));
}

function tally(picks: (string | undefined)[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const p of picks) if (p) counts[p] = (counts[p] ?? 0) + 1;
	return counts;
}

const START_MS = Date.parse("2026-03-01T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
const START = iso(START_MS);
const UNEVEN_STEP_SECONDS = (i: number) => ((i * 7919) % 100003) + 1;

// One patrol take as the start does it; the closed order is replaced by a new one on the precinct.
function visit(db: Database, stamp: string): string | undefined {
	const first = takeableOrders(db, "patrol", stamp)[0];
	if (first === undefined) return undefined;
	takeOrder(db, "patrol", first.id, stamp);
	db.run(
		"UPDATE dispatches SET outcome = 'silent', closed_at = ? WHERE id = ?",
		[stamp, first.id],
	);
	order(db, first.precinct, "patrol", { at: stamp });
	return first.precinct;
}

function cycles(
	weights: Record<string, number>,
	count: number,
	stepSeconds: (i: number) => number,
): string[] {
	const db = open(dbFile);
	for (const [name, weight] of Object.entries(weights)) {
		db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [
			name,
			`o/${name}`,
			weight,
		]);
		order(db, name, "patrol", { at: START });
	}
	const picks: string[] = [];
	let ms = START_MS;
	for (let i = 0; i < count; i++) {
		ms += stepSeconds(i) * 1000;
		picks.push(String(visit(db, iso(ms))));
	}
	db.close();
	return picks;
}

describe("precinct and role commands", () => {
	test("add then list shows name, repo, weight, credit and synced_at ordered by name", () => {
		addPrecincts({ zeta: 1, alpha: 2 });
		expect(run(["precinct", "list"]).out).toBe(
			"alpha\to/alpha\t2\t0\t\nzeta\to/zeta\t1\t0\t\n",
		);
	});

	test("duplicate add exits 1", () => {
		addPrecincts({ alpha: 1 });
		expect(
			run(["precinct", "add", "alpha", "--repo", "o/other", "--weight", "1"])
				.code,
		).toBe(1);
		expect(
			run(["precinct", "add", "beta", "--repo", "o/alpha", "--weight", "1"])
				.code,
		).toBe(1);
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
			[
				"precinct",
				"add",
				"ok",
				"--repo",
				"o/r",
				"--weight",
				"1",
				"--bogus",
				"2",
			],
			["precinct", "set", "missing", "--weight", "1"],
			["precinct", "set", "Bad", "--weight", "1"],
			["precinct", "bogus"],
			["role", "set", "patrol", "--every", "0"],
			["role", "set", "patrol", "--every", "-5"],
			["role", "set", "patrol", "--every", "1.5"],
			["role", "set", "Patrol", "--every", "5"],
			["role", "set", "patrol"],
		];
		for (const args of bad) expect([args, run(args).code]).toEqual([args, 1]);
	});

	test("role set upserts", () => {
		expect(run(["role", "set", "patrol", "--every", "30"]).code).toBe(0);
		expect(run(["role", "set", "patrol", "--every", "45"]).code).toBe(0);
		const db = open(dbFile);
		expect(db.query("SELECT name, every_minutes FROM roles").all()).toEqual([
			{ name: "patrol", every_minutes: 45 },
		]);
		db.close();
	});

	test("role set keeps the check time of an existing role", () => {
		run(["role", "set", "patrol", "--every", "30"]);
		const db = open(dbFile);
		db.run("UPDATE roles SET checked_at = '2026-05-01T00:00:00Z'");
		db.close();
		expect(run(["role", "set", "patrol", "--every", "45"]).code).toBe(0);
		const after = open(dbFile);
		expect(
			after.query("SELECT every_minutes, checked_at FROM roles").all(),
		).toEqual([{ every_minutes: 45, checked_at: "2026-05-01T00:00:00Z" }]);
		after.close();
	});

	test("precinct set updates weight and resets every credit to 0", () => {
		addPrecincts({ a: 2, b: 1 });
		seed((db) => creditVisit(db, ["a", "b"], "a"));
		expect(Object.values(credits()).some((c) => c !== 0)).toBe(true);
		expect(run(["precinct", "set", "b", "--weight", "7"]).code).toBe(0);
		expect(credits()).toEqual({ a: 0, b: 0 });
		expect(run(["precinct", "list"]).out).toContain("b\to/b\t7\t0");
	});
});

describe("the patrol take", () => {
	const takeable = (stamp = START) => {
		const db = open(dbFile);
		const names = takeableOrders(db, "patrol", stamp).map((o) => o.precinct);
		db.close();
		return names;
	};

	test("a precinct of weight 0 and an empty journal have no takeable patrol order", () => {
		expect(takeable()).toEqual([]);
		addPrecincts({ idle: 0 });
		seed((db) => order(db, "idle", "patrol"));
		expect(takeable()).toEqual([]);
		addPrecincts({ busy: 1 });
		seed((db) => order(db, "busy", "patrol"));
		expect(takeable()).toEqual(["busy"]);
	});

	test("weights 4/3/2: the first nine picks hold each precinct 4, 3 and 2 times", () => {
		const picks = cycles({ a: 4, b: 3, c: 2 }, 9, () => 60);
		expect(tally(picks)).toEqual({ a: 4, b: 3, c: 2 });
	});

	test("the first takeable order is the precinct with the most credit plus weight", () => {
		const db = open(dbFile);
		for (const [name, weight] of [
			["a", 4],
			["b", 3],
			["c", 2],
		] as const) {
			db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [
				name,
				`o/${name}`,
				weight,
			]);
			order(db, name, "patrol");
		}
		const picks = [];
		for (let i = 0; i < 3; i++) picks.push(visit(db, START));
		db.close();
		expect(picks).toEqual(["a", "b", "c"]);
	});

	test.each([
		["4/3/2", { a: 4, b: 3, c: 2 }, 900, { a: 400, b: 300, c: 200 }],
		["5/3/2", { a: 5, b: 3, c: 2 }, 1000, { a: 500, b: 300, c: 200 }],
	])(
		"weights %s over the given cycles keep their shares and ignore the clock",
		(_label, weights, count, shares) => {
			const frozen = cycles(weights, count, () => 0);
			expect(tally(frozen)).toEqual(shares);
			rmSync(dbFile);
			const advancing = cycles(weights, count, UNEVEN_STEP_SECONDS);
			expect(advancing).toEqual(frozen);
		},
		60_000,
	);

	test("weight 0 is never picked", () => {
		const picks = cycles({ a: 1, z: 0, b: 1 }, 50, () => 1);
		expect(picks).not.toContain("z");
	});

	test("a precinct with a taken patrol order is skipped and the others move as if it were absent", () => {
		const run4 = (withTaken: boolean) => {
			addPrecincts({ ...(withTaken ? { a: 3 } : {}), b: 2, c: 1 });
			const db = open(dbFile);
			if (withTaken) order(db, "a", "patrol", { takenAt: START });
			for (const name of ["b", "c"]) order(db, name, "patrol");
			for (let i = 0; i < 4; i++) visit(db, START);
			db.close();
			return credits();
		};
		const withOrder = run4(true);
		rmSync(dbFile);
		const absent = run4(false);
		expect(withOrder).toEqual({ a: 0, ...absent });
	});

	test("an open order of another role does not exclude the precinct", () => {
		addPrecincts({ a: 1 });
		seed((db) => {
			order(db, "a", "duty-desk", { takenAt: START });
			order(db, "a", "patrol");
		});
		expect(takeable()).toEqual(["a"]);
	});

	test("an open order for an issue is takeable", () => {
		addPrecincts({ a: 1 });
		seed((db) => order(db, "a", "patrol", { issue: 5 }));
		expect(takeable()).toEqual(["a"]);
	});

	test("ties go to the smaller name", () => {
		addPrecincts({ b: 1, a: 1 });
		seed((db) => {
			order(db, "b", "patrol");
			order(db, "a", "patrol");
		});
		expect(takeable()).toEqual(["a", "b"]);
	});

	test("an expired claim makes the order takeable again, a live one does not", () => {
		addPrecincts({ a: 1 });
		seed((db) => order(db, "a", "patrol", { takenAt: START }));
		expect(takeable(iso(START_MS + 24 * 3600 * 1000))).toEqual([]);
		expect(takeable(iso(START_MS + 24 * 3600 * 1000 + 1000))).toEqual(["a"]);
	});

	test("the next command is a usage error", () => {
		addPrecincts({ a: 1 });
		expect(run(["next", "--role", "patrol"]).code).toBe(1);
	});
});

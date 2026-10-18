import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { now, open } from "./db";
import { pickNext } from "./precincts";
import {
	addPrecincts,
	cli,
	dbFile,
	must,
	order,
	run,
	tempDb,
} from "./test-helpers";

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
const UNEVEN_STEP_SECONDS = (i: number) => ((i * 7919) % 100003) + 1;

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
	}
	const picks: string[] = [];
	let ms = START_MS;
	for (let i = 0; i < count; i++) {
		ms += stepSeconds(i) * 1000;
		const clock = { LAWMAN_DB: "x", LAWMAN_NOW: new Date(ms).toISOString() };
		const pick = must(pickNext(db, "patrol"));
		picks.push(pick.name);
		order(db, pick.name, "patrol", { at: now(clock) });
		db.run(
			"UPDATE dispatches SET outcome = 'silent', closed_at = ? WHERE outcome IS NULL",
			[now(clock)],
		);
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
			["next"],
			["next", "--role", "Bad"],
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
		run(["next", "--role", "patrol"]);
		expect(Object.values(credits()).some((c) => c !== 0)).toBe(true);
		expect(run(["precinct", "set", "b", "--weight", "7"]).code).toBe(0);
		expect(credits()).toEqual({ a: 0, b: 0 });
		expect(run(["precinct", "list"]).out).toContain("b\to/b\t7\t0");
	});
});

describe("next", () => {
	test("prints name and repo separated by a tab, nothing when no precinct is admitted", () => {
		expect(run(["next", "--role", "patrol"])).toMatchObject({
			code: 0,
			out: "",
		});
		addPrecincts({ idle: 0 });
		expect(run(["next", "--role", "patrol"])).toMatchObject({
			code: 0,
			out: "",
		});
		addPrecincts({ busy: 1 });
		expect(run(["next", "--role", "patrol"]).out).toBe("busy\to/busy\n");
	});

	test("weights 4/3/2: the first nine picks hold each precinct 4, 3 and 2 times", () => {
		const picks = cycles({ a: 4, b: 3, c: 2 }, 9, () => 60);
		expect(tally(picks)).toEqual({ a: 4, b: 3, c: 2 });
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

	test("the command line gives the same nine picks under a frozen and an advancing LAWMAN_NOW", () => {
		const sequence = (nowFor: (i: number) => string) => {
			addPrecincts({ a: 4, b: 3, c: 2 });
			const db = open(dbFile);
			const picks: string[] = [];
			for (let i = 0; i < 9; i++) {
				const r = cli(["next", "--role", "patrol"], {
					LAWMAN_DB: dbFile,
					LAWMAN_NOW: nowFor(i),
				});
				const name = must(r.out.split("\t")[0]);
				picks.push(name);
				order(db, name, "patrol");
				db.run(
					"UPDATE dispatches SET outcome = 'silent' WHERE outcome IS NULL",
				);
			}
			db.close();
			rmSync(dbFile);
			return picks;
		};
		const frozen = sequence(() => "2026-03-01T00:00:00Z");
		const advancing = sequence((i) =>
			new Date(
				START_MS + UNEVEN_STEP_SECONDS(i) * 1000 * (i + 1),
			).toISOString(),
		);
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
		order(db, "a", "patrol");
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
		order(db, "a", "duty-desk");
		db.close();
		expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
	});

	test("an open order for an issue does not exclude the precinct", () => {
		addPrecincts({ a: 1 });
		const db = open(dbFile);
		order(db, "a", "patrol", { issue: 5 });
		db.close();
		expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
	});

	test("ties go to the smaller name", () => {
		addPrecincts({ b: 1, a: 1 });
		expect(run(["next", "--role", "patrol"]).out).toBe("a\to/a\n");
	});
});

describe("next --exclude", () => {
	const next = (...excluded: string[]) =>
		run([
			"next",
			"--role",
			"patrol",
			...excluded.flatMap((name) => ["--exclude", name]),
		]);

	test("an excluded precinct is skipped", () => {
		addPrecincts({ a: 1, b: 1 });
		expect(next("a").out).toBe("b\to/b\n");
	});

	test("the flag repeats", () => {
		addPrecincts({ a: 1, b: 1, c: 1 });
		expect(next("a", "b").out).toBe("c\to/c\n");
	});

	test("all precincts excluded prints nothing and changes no credit", () => {
		addPrecincts({ a: 3, b: 1 });
		expect(next("a", "b")).toMatchObject({ code: 0, out: "" });
		expect(credits()).toEqual({ a: 0, b: 0 });
	});

	test("an excluded precinct gets no credit change", () => {
		addPrecincts({ a: 3, b: 2, c: 1 });
		expect(next("a").out).toBe("b\to/b\n");
		expect(credits()).toEqual({ a: 0, b: -1, c: 1 });
	});

	test("a name that is no precinct changes nothing", () => {
		addPrecincts({ a: 1 });
		expect(next("ghost").out).toBe("a\to/a\n");
	});

	test("a flag without a value or with a bad name exits 1", () => {
		addPrecincts({ a: 1 });
		for (const args of [
			["next", "--role", "patrol", "--exclude"],
			["next", "--role", "patrol", "--exclude", "Bad"],
			["next", "--role", "patrol", "--bogus", "a"],
		])
			expect([args, run(args).code]).toEqual([args, 1]);
		expect(credits()).toEqual({ a: 0 });
	});
});

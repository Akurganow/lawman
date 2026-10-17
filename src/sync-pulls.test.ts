import { beforeEach, describe, expect, test } from "bun:test";
import fixture from "./fixtures/pulls.json";
import { BOT, page } from "./pulls-fixture";
import { addPrecincts, cli, dbFile, rows, seed, tempDb } from "./test-helpers";

tempDb();

describe("sync --pulls", () => {
	const feed = (
		input: unknown,
		args = ["--pulls", "--author", BOT],
		p = "main",
	) =>
		cli(
			["sync", p, ...args],
			{ LAWMAN_DB: dbFile },
			typeof input === "string" ? input : JSON.stringify(input),
		);
	const stored = (p = "main") =>
		rows(
			`SELECT number, issues, spec FROM pulls WHERE precinct = '${p}' ORDER BY number`,
		);
	const OLD = [{ number: 99, issues: "1", spec: "waiting" }];
	const seedOld = () =>
		seed((db) => {
			db.run("INSERT INTO pulls VALUES ('main', 99, '1', 'waiting')");
		});

	beforeEach(() => addPrecincts({ main: 1, other: 1 }));

	test("stores the rows of the fixture and prints the count", () => {
		const r = feed(fixture);
		expect(r.code).toBe(0);
		expect(r.out).toBe("pulls=2\n");
		expect(stored()).toEqual([
			{ number: 7, issues: "3,4,5", spec: "up" },
			{ number: 12, issues: "", spec: "none" },
		]);
	});

	test("a second sync replaces the rows of that precinct only", () => {
		seedOld();
		seed((db) => {
			db.run("INSERT INTO pulls VALUES ('other', 5, '', 'none')");
		});
		expect(feed(fixture).code).toBe(0);
		expect(stored().map((r) => r.number)).toEqual([7, 12]);
		expect(stored("other")).toEqual([{ number: 5, issues: "", spec: "none" }]);
	});

	test("an empty list replaces a filled cache with none", () => {
		seedOld();
		const r = feed([page([])]);
		expect(r.out).toBe("pulls=0\n");
		expect(stored()).toEqual([]);
	});

	test("every validity failure exits 4 and leaves the cache intact", () => {
		const errors = [{ ...page([]), errors: [{ message: "boom" }] }];
		const cases = [
			"{",
			"{}",
			"[]",
			JSON.stringify(errors),
			JSON.stringify([{ data: { repository: {} } }]),
			JSON.stringify([page([], { next: true })]),
			JSON.stringify([page([], { collabNext: true })]),
		];
		seedOld();
		for (const input of cases) {
			const r = feed(input);
			expect(r.code).toBe(4);
			expect(r.err).toContain("cache untouched");
			expect(stored()).toEqual(OLD);
		}
	});

	test("a repeated pull request number exits 4 and leaves the cache intact", () => {
		seedOld();
		const r = feed([page([{ number: 3 }, { number: 3 }])]);
		expect(r.code).toBe(4);
		expect(stored()).toEqual(OLD);
	});

	test("--reset with --pulls is a usage error", () => {
		seedOld();
		const r = feed(fixture, ["--pulls", "--reset", "--author", BOT]);
		expect(r.code).toBe(1);
		expect(stored()).toEqual(OLD);
	});

	test("a repeated --pulls, a missing --author and an unknown precinct fail", () => {
		expect(feed(fixture, ["--pulls", "--pulls", "--author", BOT]).code).toBe(1);
		expect(feed(fixture, ["--pulls"]).code).toBe(1);
		const r = feed(fixture, ["--pulls", "--author", BOT], "nowhere");
		expect(r.code).toBe(1);
		expect(r.err).toContain("unknown precinct");
	});

	test("without --pulls the issue sync is unchanged", () => {
		expect(feed([], ["--author", BOT]).code).toBe(0);
	});
});

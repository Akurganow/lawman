import { beforeEach, describe, expect, test } from "bun:test";
import fixture from "./fixtures/pulls.json";
import { captured } from "./inproc";
import { syncPulls } from "./pulls";
import { BOT, FIXTURE_ROWS, hostPulls } from "./pulls-fixture";
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
			`SELECT number, issues, spec, work, spec_id FROM pulls WHERE precinct = '${p}' ORDER BY number`,
		);
	const OLD = [
		{ number: 99, issues: "1", spec: "waiting", work: "todo", spec_id: "-" },
	];
	const seedOld = () =>
		seed((db) => {
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec) VALUES ('main', 99, '1', 'waiting')",
			);
		});
	const expectRejected = (inputs: unknown[]) => {
		seedOld();
		for (const input of inputs) {
			const r = feed(input);
			expect(r.code).toBe(4);
			expect(r.err).toContain("cache untouched");
			expect(stored()).toEqual(OLD);
		}
	};

	beforeEach(() => addPrecincts({ main: 1, other: 1 }));

	test("stores the rows of the fixture and prints the count", () => {
		const r = feed(fixture);
		expect(r.code).toBe(0);
		expect(r.out).toBe("pulls=2\n");
		expect(stored()).toEqual(FIXTURE_ROWS);
	});

	test("a second sync replaces the rows of that precinct only", () => {
		seedOld();
		seed((db) => {
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec) VALUES ('other', 5, '', 'none')",
			);
		});
		expect(feed(fixture).code).toBe(0);
		expect(stored().map((r) => r.number)).toEqual([7, 12]);
		expect(stored("other")).toEqual([
			{ number: 5, issues: "", spec: "none", work: "todo", spec_id: "-" },
		]);
	});

	test("an empty list replaces a filled cache with none", () => {
		seedOld();
		const r = feed(hostPulls([]));
		expect(r.out).toBe("pulls=0\n");
		expect(stored()).toEqual([]);
	});

	test("every validity failure exits 4 and leaves the cache intact", () => {
		expectRejected(["{", "{}", "[]", JSON.stringify({ writers: [] })]);
	});

	test("a comment without an id, or with a bad time, exits 4", () => {
		const noId = hostPulls([
			{ number: 3, comments: [{ body: "x", noId: true }] },
		]);
		const badTime = hostPulls([{ number: 3, comments: [{ body: "x" }] }]);
		Object.assign(badTime.pulls[0]?.comments[0] as object, { createdAt: "x" });
		expectRejected([noId, badTime]);
	});

	test("a pull request of another author without a comment id is no failure", () => {
		const input = hostPulls([{ number: 4 }]);
		input.pulls.unshift({
			number: 3,
			author: "stranger",
			comments: [{ body: "x" }],
		} as never);
		const r = feed(input);
		expect(r.code).toBe(0);
		expect(stored().map((p) => p.number)).toEqual([4]);
	});

	test("a repeated pull request number exits 4 and leaves the cache intact", () => {
		seedOld();
		const r = feed(hostPulls([{ number: 3 }, { number: 3 }]));
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

describe("syncPulls in process", () => {
	beforeEach(() => addPrecincts({ main: 1 }));
	const sync = (name: string, input: string) =>
		captured("2026-05-01T00:00:00Z", () => syncPulls(name, BOT, input));

	test("stores the rows and prints the count", () => {
		const r = sync("main", JSON.stringify(fixture));
		expect(r).toMatchObject({ code: 0, out: "pulls=2\n" });
		expect(
			rows(
				"SELECT number, issues, spec, work, spec_id FROM pulls ORDER BY number",
			),
		).toEqual(FIXTURE_ROWS);
	});

	test("an unknown precinct is a usage error", () => {
		expect(sync("nowhere", "{}").code).toBe(1);
	});

	test("a repeated number is rejected and a valid replacement wins", () => {
		seed((db) => {
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec) VALUES ('main', 99, '1', 'waiting')",
			);
		});
		const repeated = JSON.stringify(hostPulls([{ number: 3 }, { number: 3 }]));
		expect(sync("main", repeated).code).toBe(4);
		expect(rows("SELECT number FROM pulls")).toEqual([{ number: 99 }]);
		expect(sync("main", JSON.stringify(hostPulls([]))).out).toBe("pulls=0\n");
		expect(rows("SELECT number FROM pulls")).toEqual([]);
	});
});

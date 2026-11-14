import { beforeEach, describe, expect, test } from "bun:test";
import { out } from "./db";
import fixture from "./fixtures/pulls.json";
import { capturedAsync } from "./inproc";
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

	test("every validity failure exits 4 and leaves the cache intact", () => {
		expectRejected(["{"]);
	});

	test("a comment url is stored when it is a plain address, and as null when it is not", () => {
		const input = hostPulls([
			{ number: 3, comments: [{ body: "a" }, { body: "b" }, { body: "c" }] },
		]);
		const comments = input.pulls[0]?.comments ?? [];
		const give = (i: number, url: string) =>
			Object.assign(comments[i] ?? {}, { url });
		give(0, "https://git.example/o/main/pull/3#c0");
		give(1, "javascript:alert(1)");
		expect(feed(input).code).toBe(0);
		expect(
			rows("SELECT id, url FROM comments WHERE precinct = 'main' ORDER BY id"),
		).toEqual([
			{ id: "IC_0", url: "https://git.example/o/main/pull/3#c0" },
			{ id: "IC_1", url: null },
			{ id: "IC_2", url: null },
		]);
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
});

describe("syncPulls in process", () => {
	beforeEach(() => addPrecincts({ main: 1 }));
	const sync = (name: string, input: string) =>
		capturedAsync("2026-05-01T00:00:00Z", async () =>
			out(await syncPulls(name, BOT, input)),
		);

	test("stores the rows and prints the count", async () => {
		const r = await sync("main", JSON.stringify(fixture));
		expect(r).toMatchObject({ code: 0, out: "pulls=2\n" });
		expect(
			rows(
				"SELECT number, issues, spec, work, spec_id FROM pulls ORDER BY number",
			),
		).toEqual(FIXTURE_ROWS);
	});

	test("a repeated number is rejected and a valid replacement wins", async () => {
		seed((db) => {
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec) VALUES ('main', 99, '1', 'waiting')",
			);
		});
		const repeated = JSON.stringify(hostPulls([{ number: 3 }, { number: 3 }]));
		expect((await sync("main", repeated)).code).toBe(4);
		expect(rows("SELECT number FROM pulls")).toEqual([{ number: 99 }]);
		expect((await sync("main", JSON.stringify(hostPulls([])))).out).toBe(
			"pulls=0\n",
		);
		expect(rows("SELECT number FROM pulls")).toEqual([]);
	});
});

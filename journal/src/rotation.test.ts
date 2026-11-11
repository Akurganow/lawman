import { beforeEach, describe, expect, test } from "bun:test";
import { open } from "./db";
import { rotationOrder } from "./rotation";
import { cli, dbFile, order, precinct, seed, tempDb } from "./test-helpers";

const PRECINCT = "main";

tempDb();
beforeEach(() => seed((db) => precinct(db, PRECINCT)));

// the lines the old command printed: department, last visit or a dash, cap
const rotation = (names: string[], role = "patrol") => {
	const db = open(dbFile);
	try {
		return {
			out: rotationOrder(db, PRECINCT, role, names)
				.map((t) => `${t.department}\t${t.at ?? "-"}\t${t.cap}\n`)
				.join(""),
		};
	} finally {
		db.close();
	}
};
const visit = (department: string, at: string, role = "patrol") =>
	seed((db) => order(db, PRECINCT, role, { department, at, outcome: "filed" }));
const lines = (r: { out: string }) => r.out.split("\n").filter((l) => l !== "");
let nextIssue = 1;
// a lead without a marker has only the title prefix, and counts for nothing
const openLead = (department: string, broken = false) =>
	seed((db) => {
		const n = nextIssue++;
		db.run(
			"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES (?, ?, 'OPEN', ?, 't')",
			[PRECINCT, n, `[Lead] ${department}: x`],
		);
		if (!broken)
			db.run("INSERT INTO markers VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'raw')", [
				PRECINCT,
				n,
				"2026-10-14T09:00:00Z|000000|000001",
				"patrol",
				"lead",
				department,
				`src/f${n}.rs::f::dead-code`,
			]);
	});
const capOf = (department: string) =>
	cli(["cap", PRECINCT, "--department", department], { LAWMAN_DB: dbFile })
		.out.trim()
		.match(/^cap=(\d)/)?.[1];

describe("rotation", () => {
	test("unvisited departments come first by name, then the oldest visit first", () => {
		visit("web", "2026-10-01T00:00:00Z");
		visit("core", "2026-09-01T00:00:00Z");
		visit("api", "2026-10-05T00:00:00Z");
		const r = rotation(["web", "zeta", "api", "core", "beta"]);
		expect(lines(r)).toEqual([
			"beta\t-\t3",
			"zeta\t-\t3",
			"core\t2026-09-01T00:00:00Z\t3",
			"web\t2026-10-01T00:00:00Z\t3",
			"api\t2026-10-05T00:00:00Z\t3",
		]);
	});

	test("equal visit times fall back to the name", () => {
		visit("web", "2026-10-01T00:00:00Z");
		visit("api", "2026-10-01T00:00:00Z");
		expect(lines(rotation(["web", "api"]))).toEqual([
			"api\t2026-10-01T00:00:00Z\t3",
			"web\t2026-10-01T00:00:00Z\t3",
		]);
	});

	test("the latest patrol order of a department sets its age", () => {
		visit("web", "2026-10-09T00:00:00Z");
		visit("web", "2026-09-01T00:00:00Z");
		visit("core", "2026-10-03T00:00:00Z");
		expect(lines(rotation(["web", "core"]))).toEqual([
			"core\t2026-10-03T00:00:00Z\t3",
			"web\t2026-10-09T00:00:00Z\t3",
		]);
	});

	test("orders of other roles do not count as visits", () => {
		visit("web", "2026-10-01T00:00:00Z", "investigation");
		expect(lines(rotation(["web"]))).toEqual(["web\t-\t3"]);
	});

	test("repeated names print once", () => {
		expect(lines(rotation(["web", "api", "web", "api"]))).toEqual([
			"api\t-\t3",
			"web\t-\t3",
		]);
	});

	test("empty input gives no turn", () => {
		expect(rotation([]).out).toBe("");
	});

	test.each([
		[0, "3"],
		[2, "3"],
		[3, "1"],
		[4, "1"],
		[5, "0"],
	])("%i open leads give the third field %s", (open, want) => {
		for (let i = 0; i < open; i++) openLead("core");
		expect(lines(rotation(["core"]))).toEqual([`core\t-\t${want}`]);
		expect(capOf("core")).toBe(want);
	});

	test("an issue with the prefix and no marker counts for no department", () => {
		for (let i = 0; i < 2; i++) openLead("core");
		openLead("core", true);
		openLead("web");
		const r = lines(rotation(["core", "web", "idle"]));
		expect(r).toEqual(["core\t-\t3", "idle\t-\t3", "web\t-\t3"]);
		expect(capOf("core")).toBe("3");
	});

	test("the rotation command is a usage error", () => {
		const r = cli(["rotation", PRECINCT, "--role", "patrol"], {
			LAWMAN_DB: dbFile,
		});
		expect(r.code).toBe(1);
	});
});

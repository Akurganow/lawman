import { beforeEach, describe, expect, test } from "bun:test";
import { open } from "./db";
import { rotationOrder } from "./rotation";
import { dbFile, order, precinct, seed, tempDb } from "./test-helpers";

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
const openLead = (department: string) =>
	seed((db) => {
		const n = nextIssue++;
		db.run(
			"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES (?, ?, 'OPEN', ?, 't')",
			[PRECINCT, n, `[Lead] ${department}: x`],
		);
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

	test("repeated names print once", () => {
		expect(lines(rotation(["web", "api", "web", "api"]))).toEqual([
			"api\t-\t3",
			"web\t-\t3",
		]);
	});

	test("empty input gives no turn", () => {
		expect(rotation([]).out).toBe("");
	});

	test.each([[3, "1"]])(
		"%i open leads give the third field %s",
		(open, want) => {
			for (let i = 0; i < open; i++) openLead("core");
			expect(lines(rotation(["core"]))).toEqual([`core\t-\t${want}`]);
		},
	);
});

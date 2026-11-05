import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { human } from "./cases-fixture";
import {
	dispatches,
	hostOf,
	openOrders,
	reportOf,
	setUp,
	startDesk,
	ticks,
	WORK,
} from "./duty-desk-fixture";
import { lines, references } from "./input-test-fixture";
import { BASE, later, order, seed, tempDb } from "./test-helpers";
import { CONSTITUTION } from "./tick-start-test-fixture";

tempDb();

const patrolOn = (precinct: string) =>
	openOrders().filter((o) => o.precinct === precinct && o.role === "patrol");

describe("the patrol department", () => {
	test("a department page that fails the check is skipped, the next department takes the visit", () => {
		setUp({ main: 1 });
		hostOf("main", {
			...WORK,
			tree: {
				"LAWMAN.md": CONSTITUTION,
				".lawman/departments/abstraction.md": "not a page",
			},
		});
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).toBe(
			"Blockers: main: department abstraction page check failed",
		);
		const [visit] = patrolOn("main");
		expect(visit?.department).toBe("abstractions");
	});

	test("every department skipped leaves the precinct without a patrol order and names the cause", () => {
		setUp({ main: 1 });
		rmSync(references("departments"), { recursive: true });
		hostOf("main", { ...WORK, tree: { "LAWMAN.md": CONSTITUTION } });
		const r = startDesk();
		expect(lines(r.out)).toContain("ended ordered");
		expect(patrolOn("main")).toEqual([]);
		expect(reportOf(r.out, "Blockers")).toContain(
			"main: skipped-bad-department",
		);
		expect(reportOf(r.out, "Blockers")).toContain(
			"main: department abstraction has no page",
		);
		expect(openOrders().some((o) => o.role === "court")).toBe(true);
	});

	test("a department name outside its class is skipped and named in Blockers", () => {
		setUp({ main: 1 });
		// a page file of the shared law is a name the constitution lint never sees
		writeFileSync(references("departments", "Bad_Name.md"), "x");
		hostOf("main", WORK);
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).toBe(
			"Blockers: main: a department name outside its class",
		);
		expect(patrolOn("main").map((o) => o.department)).toEqual(["abstraction"]);
	});

	test("a precinct that has an open patrol order gets no second one", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		seed((d) => order(d, "main", "patrol", { department: "claims" }));
		startDesk();
		expect(patrolOn("main").map((o) => o.department)).toEqual(["claims"]);
	});
});

// the stale rule of each role reads the cached stage: the cache below gives a closed issue and a pull request without work
const STALE = {
	issues: {
		10: human("CLOSED"),
		11: human("CLOSED"),
		12: human("CLOSED"),
	},
	pulls: [{ number: 20 }, { number: 21 }, { number: 22 }],
};
const CLOSED_ROLES = [
	"patrol",
	"response-unit",
	"investigation",
	"prosecutor",
	"defender",
	"court",
	"clerk",
	"spec-writer",
	"executor",
];
const ISSUE_ROLES = [
	"response-unit",
	"investigation",
	"prosecutor",
	"defender",
	"court",
	"clerk",
];
const PULL_ROLES = ["spec-writer", "executor"];

describe("the stale orders", () => {
	test.each([...ISSUE_ROLES, ...PULL_ROLES])(
		"%s: a stale untaken order and one whose claim expired are closed silent, a live claim and an issue the cache lacks are kept",
		(role) => {
			setUp({ main: 1 });
			hostOf("main", STALE);
			const pulls = PULL_ROLES.includes(role);
			const first = pulls ? 20 : 10;
			seed((d) => {
				order(d, "main", role, { issue: first });
				order(d, "main", role, { issue: first + 1, takenAt: BASE });
				order(d, "main", role, { issue: first + 2, takenAt: later(-25) });
				order(d, "main", role, { issue: 99 });
			});
			const r = startDesk();
			expect(r.code).toBe(0);
			const mine = dispatches().filter((o) => o.role === role);
			// a pull request that is not in the cache has the stage "none", so its order is stale; an issue has no stage then
			const absent = pulls ? ["silent", BASE] : [null, null];
			expect(mine.map((o) => [o.issue, o.outcome, o.closed_at])).toEqual([
				[first, "silent", BASE],
				[first + 1, null, null],
				[first + 2, "silent", BASE],
				[99, ...absent],
			]);
			expect(ticks().map((t) => t.role)).toEqual(["duty-desk"]);
			expect(reportOf(r.out, "Coverage")).toContain(
				`closed stale: ${CLOSED_ROLES.map((x) => `${x} ${x === role ? (pulls ? 3 : 2) : 0}`).join(", ")}`,
			);
		},
	);

	test("a patrol order is not closed and an order of another precinct state stays as it is", () => {
		setUp({ main: 1 });
		hostOf("main", STALE);
		seed((d) => order(d, "main", "patrol", { department: "claims" }));
		startDesk();
		expect(dispatches()[0]).toMatchObject({ role: "patrol", outcome: null });
	});
});

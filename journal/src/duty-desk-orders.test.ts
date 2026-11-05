import { describe, expect, test } from "bun:test";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
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
import { CONFIG, lines, references } from "./input-test-fixture";
import { BASE, later, order, seed, tempDb } from "./test-helpers";
import { CONSTITUTION, departmentPage } from "./tick-start-test-fixture";

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

describe("the consent to the licenses department", () => {
	// Only the shared page of licenses can win: the other shared pages are removed from the installation,
	// and the constitution names no department, so the precinct's own pages are not candidates either.
	const NO_DEPARTMENTS = CONSTITUTION.replace(
		/## Departments\n\n(- .*\n)+/,
		"## Departments\n\nnone\n",
	);
	const licensesOnly = (config = "") => {
		setUp({ main: 1 }, `${CONFIG}${config}`);
		for (const f of readdirSync(references("departments")))
			if (f !== "licenses.md" && f.endsWith(".md"))
				rmSync(references("departments", f));
	};
	const TREE = { "LAWMAN.md": NO_DEPARTMENTS };

	test("without the consent the page counts as capped: no patrol order and no Blockers entry", () => {
		expect(NO_DEPARTMENTS).not.toContain("abstraction");
		licensesOnly();
		hostOf("main", { ...WORK, tree: TREE });
		const r = startDesk();
		expect(patrolOn("main")).toEqual([]);
		expect(reportOf(r.out, "Blockers")).toBe("Blockers: none");
	});

	test("license_precincts: main=yes gives a patrol order of the licenses department", () => {
		licensesOnly("license_precincts: other=yes main=yes\n");
		hostOf("main", { ...WORK, tree: TREE });
		const r = startDesk();
		expect(patrolOn("main").map((o) => o.department)).toEqual(["licenses"]);
		expect(reportOf(r.out, "Blockers")).toBe("Blockers: none");
	});

	test("a consent for another precinct gives nothing", () => {
		licensesOnly("license_precincts: other=yes\n");
		hostOf("main", { ...WORK, tree: TREE });
		startDesk();
		expect(patrolOn("main")).toEqual([]);
	});

	test("the precinct's own licenses page needs no consent", () => {
		licensesOnly();
		hostOf("main", {
			...WORK,
			tree: {
				...TREE,
				".lawman/departments/licenses.md": departmentPage("licenses"),
			},
		});
		startDesk();
		expect(patrolOn("main").map((o) => o.department)).toEqual(["licenses"]);
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

import { beforeEach, describe, expect, test } from "bun:test";
import {
	cache,
	closed,
	due,
	fields,
	human,
	issuesJson,
	lined,
	need,
	needOnly,
	pairMark,
	put,
	ruled,
	type Spec,
	T,
	withLead,
} from "./cases-fixture";
import { pairs, run } from "./clerk-jobs-fixture";
import {
	acquittal,
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	conviction,
	defence,
	lead,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const expectJobs = (steps: readonly (readonly [Spec, string])[]) => {
	for (const [spec, expected] of steps) {
		put({ 1: spec });
		expect(`${fields(1).job} ${fields(1).action}`).toBe(expected);
	}
};

const JOBS = ["job", "action", "pull", "sources", "branch"] as const;
const jobOf = (n: number) => {
	const f = fields(n);
	return JOBS.map((k) => f[k]).join(" ");
};
const pair = (stage: string, issue: string, pull = 5) =>
	pairMark(stage, pull, issue);

describe("case: the line of a clerk job", () => {
	test("of two open precedent cases of one priority the older goes first", () => {
		put({
			1: { ...ruled(lined(acquittal)), createdAt: T(8) },
			2: { ...ruled(lined(acquittal)), createdAt: T(7) },
		});
		expect(due("clerk")).toBe("main\t2\n");
	});

	// a marker row exists only for the trusted login, so only its comment is the ruling
	test("a copy of the ruling marker by an outsider changes nothing", () => {
		const copy = `Copy.\n\n## Precedent\n\n- new gate: A rule.\n\n${conviction()}`;
		const asOutsider = (spec: Spec, at: number) => {
			const form = JSON.parse(issuesJson({ 1: spec }));
			form.issues[0].comments[at].author = { login: "outsider" };
			call(BASE, ["sync", "main", "--author", TRUSTED], JSON.stringify(form));
			expect(jobOf(1)).toBe("- - - - -");
		};
		asOutsider(closed(ruled(conviction, copy)), 4);
		// a ruling marker in the issue body has no comment, whoever comments first
		const body = [lead(), caseMark(), charge(), defence(), conviction()];
		asOutsider({ state: "CLOSED", body, comments: [[T(10), copy]] }, 0);
	});

	test("an open pull request of an open issue is adopted from any stage", () => {
		for (const spec of [
			withLead(),
			withLead(caseMark(), charge()),
			human("OPEN"),
		]) {
			put({ 1: spec });
			cache([7, [1]]);
			expect(needOnly(1)).toBe("need=clerk");
			expect(jobOf(1)).toBe("adopt - 7 1 -");
		}
	});

	test("a settle lists every issue handed with the pull request", () => {
		const handed = pairMark("handed", 7, "open");
		put({
			1: human("OPEN", handed),
			2: human("OPEN", handed),
			3: human("OPEN"),
		});
		expect(jobOf(1)).toBe("settle - 7 1,2 -");
	});
});

describe("case: leaving the funnel", () => {
	const stages: [string, string[]][] = [
		["investigation", []],
		["clerk", [caseMark(), charge(), defence(), conviction()]],
	];
	const kept = pairMark("handed", 7, "open");

	test.each(stages)("a pair at %s leaves the funnel", (_stage, marks) => {
		put({ 1: withLead(...marks) });
		expect(needOnly(1)).not.toBe("need=none");
		put({ 1: withLead(...marks, kept) });
		cache([7, [1]]);
		expect(needOnly(1)).toBe("need=none");
		expect(jobOf(1)).toBe("- - 7 1 -");
	});

	test("a human issue has the line of a clerk without a lead", () => {
		put({ 1: human("OPEN", pairMark("handed", 7, "open")) });
		cache([7, [1]]);
		expect(need(1)).toBe(
			"need=none round=- returned=- department=- sha=- state=OPEN lead=- related=- priority=P2 job=- action=- pull=7 sources=1 branch=- kind=- answer=- answer_id=-",
		);
	});

	test("a human issue needs the clerk for a job", () => {
		put({ 1: human("OPEN") });
		cache([7, [1]]);
		expect(need(1)).toBe(
			"need=clerk round=- returned=- department=- sha=- state=OPEN lead=- related=- priority=P2 job=adopt action=- pull=7 sources=1 branch=- kind=- answer=- answer_id=-",
		);
	});
});

describe("case: states of the pair", () => {
	test("a close with another source open is kept", () => {
		put({ 1: human("CLOSED", pair("handed", "open")), 2: human("OPEN") });
		cache([5, [1, 2]]);
		expect(jobOf(1)).toBe("state kept 5 1,2 -");
		put({ 1: human("CLOSED", pair("handed", "open")), 2: human("CLOSED") });
		expect(jobOf(1)).toBe("state close-pull 5 1,2 -");
	});

	test("the stranger sequence: close, reopen, then a decider closes the pull request", () => {
		const steps = [
			[human("CLOSED", pair("handed", "open")), "state close-pull"],
			[human("CLOSED", pair("handed", "open"), pair("kept", "closed")), "- -"],
			[
				human("OPEN", pair("handed", "open"), pair("kept", "closed")),
				"state kept",
			],
			[
				human(
					"OPEN",
					pair("handed", "open"),
					pair("kept", "closed"),
					pair("kept", "open"),
				),
				"- -",
			],
			[
				human(
					"CLOSED",
					pair("handed", "open"),
					pair("kept", "closed"),
					pair("kept", "open"),
				),
				"state close-pull",
			],
		] as const;
		cache([5, [1]]);
		expectJobs(steps);
	});

	test("the stranger sequence: reopen a shut issue, close it, a decider reopens", () => {
		const shut = pair("shut", "closed");
		const steps = [
			[human("OPEN", shut), "state reopen"],
			[human("OPEN", shut, pair("kept", "open")), "- -"],
			[human("CLOSED", shut, pair("kept", "open")), "state kept"],
			[
				human("CLOSED", shut, pair("kept", "open"), pair("kept", "closed")),
				"- -",
			],
			[
				human("OPEN", shut, pair("kept", "open"), pair("kept", "closed")),
				"state reopen",
			],
		] as const;
		expectJobs(steps);
	});

	test("a pull request closed outside, reopened, merged: the next draft is -2", () => {
		const shut = pair("shut", "closed");
		const handed = pair("handed", "open");
		const settled = pair("settled", "closed");
		cache();
		put({ 1: human("OPEN", handed) });
		expect(jobOf(1)).toBe("settle - 5 1 -");
		put({ 1: human("CLOSED", handed, shut) });
		cache([5, [1]]);
		expect(jobOf(1)).toBe("reopen-issue - 5 1 -");
		put({ 1: human("OPEN", handed, shut, handed) });
		expect(jobOf(1)).toBe("- - 5 1 -");
		cache();
		expect(jobOf(1)).toBe("settle - 5 1 -");
		put({ 1: human("CLOSED", handed, shut, handed, settled) });
		expect(jobOf(1)).toBe("- - 5 - -");
		put({ 1: human("OPEN", handed, shut, handed, settled) });
		expect(jobOf(1)).toBe("state open 5 - lawman/execute-1-2");
	});
});

test("kept issue=open over settled gives no job", () => {
	const r = run({
		markers: pairs(["settled", "7", "closed"], ["kept", "7", "open"]),
	});
	expect(r.job).toBe("-");
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
	cache,
	closed,
	due,
	fields,
	human,
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
	caseMark,
	charge,
	conviction,
	defence,
	mark,
	noEntry,
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
const tail = (n: number) => need(n).split(" ").slice(-9).join(" ");
const pair = (stage: string, issue: string, pull = 5) =>
	pairMark(stage, pull, issue);

describe("case: the line of a clerk job", () => {
	test("an open conviction prints the open job and its branch", () => {
		put({ 1: ruled(conviction) });
		expect(tail(1)).toBe(
			"priority=P2 job=open action=- pull=- sources=- branch=lawman/execute-1-1 kind=defect answer=- answer_id=-",
		);
	});

	test("an unanswered acquittal prints the precedent job", () => {
		put({ 1: ruled(acquittal) });
		expect(jobOf(1)).toBe("precedent - - - lawman/precedent-1-1");
	});

	test("of two open precedent cases of one priority the older goes first", () => {
		put({
			1: { ...ruled(acquittal), createdAt: T(8) },
			2: { ...ruled(acquittal), createdAt: T(7) },
		});
		expect(due("clerk")).toBe("main\t2\n");
	});

	test("a closed conviction with no pair prints the precedent job", () => {
		put({ 1: closed(ruled(conviction)) });
		expect(jobOf(1)).toBe("precedent - - - lawman/precedent-1-1");
		expect(needOnly(1)).toBe("need=clerk");
		expect(due("clerk")).toBe("main\t1\n");
	});

	test("a conviction whose issue is closed and answered needs nobody", () => {
		put({ 1: closed(ruled(conviction, noEntry())) });
		expect(needOnly(1)).toBe("need=none");
	});

	test("an adopted pull request does not carry the precedent of a conviction", () => {
		put({
			1: ruled(
				conviction,
				mark("clerk", "handed", " pull=7 issue=open adopted=yes"),
			),
		});
		cache([7, [1]]);
		expect(jobOf(1)).toBe("precedent - - - lawman/precedent-1-1");
		put({
			1: ruled(
				conviction,
				noEntry(),
				mark("clerk", "handed", " pull=7 issue=open adopted=yes"),
			),
		});
		expect(needOnly(1)).toBe("need=none");
	});

	test("a draft of the clerk carries the precedent of a conviction", () => {
		put({ 1: ruled(conviction, pairMark("handed", 7, "open")) });
		cache([7, [1]]);
		expect(jobOf(1)).toBe("- - 7 1 -");
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

	test("the lowest pull request of the issue is adopted", () => {
		put({ 1: human("OPEN") });
		cache([9, [1]], [4, [1, 2]], [3, [2]]);
		expect(jobOf(1)).toBe("adopt - 4 1,2 -");
	});

	test("a pull request of another issue is not adopted", () => {
		put({ 1: human("OPEN") });
		cache([9, [2]]);
		expect(jobOf(1)).toBe("- - - - -");
		expect(needOnly(1)).toBe("need=none");
	});

	test("a handed pair whose pull request left the cache settles", () => {
		put({ 1: human("OPEN", pairMark("handed", 7, "open")) });
		expect(needOnly(1)).toBe("need=clerk");
		expect(jobOf(1)).toBe("settle - 7 1 -");
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

	test("a closed pull request of a shut pair returns the issue when it reopens", () => {
		put({ 1: human("CLOSED", pairMark("shut", 7, "closed")) });
		cache([7, [1]]);
		expect(jobOf(1)).toBe("reopen-issue - 7 1 -");
	});
});

describe("case: leaving the funnel", () => {
	const stages: [string, string[]][] = [
		["investigation", []],
		["prosecutor", [caseMark()]],
		["defender", [caseMark(), charge()]],
		["court", [caseMark(), charge(), defence()]],
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

	test("a pair after an answered acquittal leaves the funnel, even without a pull request", () => {
		put({
			1: closed(ruled(acquittal, noEntry(), pairMark("settled", 7, "closed"))),
		});
		expect(needOnly(1)).toBe("need=none");
	});

	test("a pair after an unanswered acquittal leaves the precedent to the clerk", () => {
		put({ 1: closed(ruled(acquittal, pairMark("settled", 7, "closed"))) });
		expect(jobOf(1)).toBe("precedent - - - lawman/precedent-1-1");
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

	test("a closed issue never has a funnel need", () => {
		put({ 1: closed(withLead(caseMark())) });
		expect(needOnly(1)).toBe("need=none");
	});
});

describe("case: states of the pair", () => {
	const states = [
		["handed", "open", "CLOSED", "state close-pull"],
		["handed", "open", "OPEN", "- -"],
		["shut", "closed", "OPEN", "state reopen"],
		["shut", "closed", "CLOSED", "- -"],
		["settled", "closed", "OPEN", "state open"],
		["settled", "closed", "CLOSED", "- -"],
	];

	test.each(states)(
		"%s %s with the issue %s",
		(stage, recorded, now, expected) => {
			put({ 1: human(now, pair(stage as string, recorded as string)) });
			cache(...(stage === "handed" ? [[5, [1]] as [number, number[]]] : []));
			expect(`${fields(1).job} ${fields(1).action}`).toBe(expected as string);
			expect(needOnly(1)).toBe(expected === "- -" ? "need=none" : "need=clerk");
		},
	);

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
	// case
	put({
		1: human("OPEN", pair("settled", "closed"), pair("kept", "open")),
	});
	expect(`${fields(1).job} ${fields(1).action}`).toBe("- -");
	// clerk jobs
	const r = run({
		markers: pairs(["settled", "7", "closed"], ["kept", "7", "open"]),
	});
	expect(r.job).toBe("-");
});

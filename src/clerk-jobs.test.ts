import { describe, expect, test } from "bun:test";
import { hasPair } from "./clerk-jobs";
import {
	acquittal,
	conviction,
	marker,
	pairs,
	pull,
	run,
	type Spec,
} from "./clerk-jobs-fixture";

describe("state rule: base and issue state", () => {
	test.each<[string, Spec, string, number[], string]>([
		[
			"handed, closed, every source closed",
			["handed", "7", "open"],
			"CLOSED",
			[1, 2],
			"close-pull",
		],
		[
			"handed, closed, another source open",
			["handed", "7", "open"],
			"CLOSED",
			[1],
			"kept",
		],
		[
			"handed, open after a closed adopt",
			["handed", "7", "closed"],
			"OPEN",
			[],
			"kept",
		],
		["shut, open", ["shut", "7", "closed"], "OPEN", [], "reopen"],
		[
			"shut recorded open, closed",
			["shut", "7", "open"],
			"CLOSED",
			[1, 2],
			"kept",
		],
		["settled, open", ["settled", "7", "closed"], "OPEN", [], "open"],
		[
			"settled recorded open, closed",
			["settled", "7", "open"],
			"CLOSED",
			[1],
			"kept",
		],
	])("%s", (_name, spec, state, closed, action) => {
		const r = run({
			state,
			markers: pairs(spec),
			pulls: [pull(7, 1, 2)],
			closed,
		});
		expect(r).toMatchObject({ job: "state", action, pull: "7" });
	});

	test("a closed issue whose pull request left the cache is kept, not closed", () => {
		const r = run({
			state: "CLOSED",
			markers: pairs(["handed", "7", "open"]),
			closed: [1],
		});
		expect(r).toMatchObject({ job: "state", action: "kept" });
	});

	test("a source missing from the issue cache counts as open", () => {
		const r = run({
			state: "CLOSED",
			markers: pairs(["handed", "7", "open"]),
			pulls: [pull(7, 1, 3)],
			closed: [1],
		});
		expect(r.action).toBe("kept");
	});

	test("the state rule runs before the table", () => {
		const r = run({
			state: "OPEN",
			markers: pairs(["shut", "7", "closed"]),
			pulls: [pull(7, 1)],
		});
		expect(r.job).toBe("state");
	});

	test("a kept marker takes the base of the previous pair marker", () => {
		const r = run({
			state: "OPEN",
			markers: pairs(
				["shut", "7", "closed"],
				["kept", "7", "open"],
				["kept", "7", "closed"],
			),
		});
		expect(r).toMatchObject({ job: "state", action: "reopen", pull: "7" });
	});

	test("a kept marker with no earlier pair marker has no base", () => {
		const r = run({ state: "OPEN", markers: pairs(["kept", "7", "closed"]) });
		expect(r).toMatchObject({ job: "state", action: "kept" });
	});
});

describe("table rows", () => {
	test("1: a reopened pull request returns the issue", () => {
		const r = run({
			state: "CLOSED",
			markers: pairs(["shut", "7", "closed"]),
			pulls: [pull(7, 1, 2)],
		});
		expect(r).toMatchObject({
			job: "reopen-issue",
			action: "-",
			pull: "7",
			sources: "1,2",
			branch: "-",
		});
	});

	test("1: a kept marker over shut still reopens the issues when the pull request reopens", () => {
		const r = run({
			state: "CLOSED",
			markers: pairs(["shut", "7", "closed"], ["kept", "7", "closed"]),
			pulls: [pull(7, 1)],
		});
		expect(r.job).toBe("reopen-issue");
	});

	test.each([
		[
			"a shut marker for another pull request is not reopened",
			pairs(["shut", "6", "closed"]),
		],
	])("1: %s", (_name, markers) => {
		const r = run({ state: "CLOSED", markers, pulls: [pull(7, 1)] });
		expect(r.job).toBe("-");
	});

	test("2: an open pull request of an open issue is adopted", () => {
		const r = run({ pulls: [pull(9, 1), pull(7, 1, 2)] });
		expect(r).toMatchObject({
			job: "adopt",
			action: "-",
			pull: "7",
			sources: "1,2",
			branch: "-",
		});
	});

	test("2: a closed issue adopts nothing", () => {
		expect(run({ state: "CLOSED", pulls: [pull(7, 1)] }).job).toBe("-");
	});

	test("2: a pair marker for another pull request adopts the new one", () => {
		const r = run({
			markers: pairs(["handed", "5", "open"]),
			pulls: [pull(7, 1)],
		});
		expect(r).toMatchObject({ job: "adopt", pull: "7" });
	});

	test("2: the pull request named by K is the pull request, however low the others", () => {
		const r = run({
			markers: pairs(["handed", "9", "open"]),
			pulls: [pull(3, 1), pull(9, 1)],
		});
		expect(r).toMatchObject({ job: "-", pull: "9" });
	});

	test("2: a pull request of other issues is not adopted", () => {
		expect(run({ pulls: [pull(7, 2)] }).job).toBe("-");
	});

	test("3: a handed pair whose pull request left the cache settles", () => {
		const r = run({ markers: pairs(["handed", "7", "open"]) });
		expect(r).toMatchObject({
			job: "settle",
			action: "-",
			pull: "7",
			sources: "1",
			branch: "-",
		});
	});

	test("3: a kept marker keeps the handed base", () => {
		const r = run({
			state: "CLOSED",
			markers: pairs(["handed", "7", "open"], ["kept", "7", "closed"]),
		});
		expect(r.job).toBe("settle");
	});

	test("3: a shut or settled pair does not settle again", () => {
		expect(run({ markers: pairs(["shut", "7", "open"]) }).job).toBe("-");
		expect(
			run({ state: "CLOSED", markers: pairs(["settled", "7", "closed"]) }).job,
		).toBe("-");
	});

	test("4: a conviction on an open issue opens a draft", () => {
		const r = run({ ruling: conviction() });
		expect(r).toMatchObject({
			job: "open",
			action: "-",
			pull: "-",
			sources: "-",
			branch: "lawman/execute-1-1",
		});
	});

	test("4: a conviction on a closed issue gives no job", () => {
		expect(run({ state: "CLOSED", ruling: conviction() }).job).toBe("-");
	});

	test("4: an entry does not answer a conviction", () => {
		const entry = marker("clerk", "entry", 1);
		expect(run({ markers: [entry], ruling: conviction() }).job).toBe("open");
	});

	test("5: an unanswered acquittal is a precedent, open or closed", () => {
		for (const state of ["OPEN", "CLOSED"])
			expect(run({ state, ruling: acquittal() })).toMatchObject({
				job: "precedent",
				action: "-",
				branch: "-",
			});
	});

	test("5: an entry or a no-entry newer than the acquittal answers it", () => {
		for (const stage of ["entry", "no-entry"])
			expect(
				run({ markers: [marker("clerk", stage, 5)], ruling: acquittal(2) }).job,
			).toBe("-");
	});

	test("5: an entry older than the acquittal does not answer it", () => {
		const r = run({
			markers: [marker("clerk", "entry", 1)],
			ruling: acquittal(2),
		});
		expect(r.job).toBe("precedent");
	});

	test("5: other clerk markers do not answer an acquittal", () => {
		const r = run({
			markers: [marker("clerk", "handoff", 5)],
			ruling: acquittal(2),
		});
		expect(r.job).toBe("precedent");
	});

	test("no ruling, no pull request, no job", () => {
		expect(run({})).toMatchObject({
			job: "-",
			action: "-",
			pull: "-",
			sources: "-",
			branch: "-",
			priority: "P2",
		});
	});

	test("a pair means the funnel is left even when no job is due", () => {
		const r = run({
			markers: pairs(["handed", "7", "open"]),
			pulls: [pull(7, 1)],
			ruling: conviction(),
		});
		expect(r.job).toBe("-");
		expect(hasPair(pairs(["handed", "7", "open"]))).toBe(true);
	});

	test("K present: no precedent and no open from the ruling", () => {
		const open = run({
			markers: pairs(["handed", "7", "open"]),
			pulls: [pull(7, 1)],
			ruling: acquittal(),
		});
		expect(open.job).toBe("-");
	});

	test("kept issue=open over settled gives no job", () => {
		const r = run({
			markers: pairs(["settled", "7", "closed"], ["kept", "7", "open"]),
		});
		expect(r.job).toBe("-");
	});
});

import { describe, expect, test } from "bun:test";
import { hasPair, precedentDue } from "./clerk-jobs";
import {
	acquittal,
	conviction,
	inputOf,
	marker,
	owners,
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
			"settled recorded open, open",
			["settled", "7", "open"],
			"OPEN",
			[],
			"open",
		],
		["shut recorded open, open", ["shut", "7", "open"], "OPEN", [], "reopen"],
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

	test("a reopen after a merge waits while the owner's pull request closes the issue", () => {
		const markers = pairs(["settled", "7", "closed"]);
		const ruling = conviction();
		expect(run({ markers, ruling, pulls: [owners(9, 1)] })).toMatchObject({
			job: "brief",
			pull: "9",
		});
		expect(run({ markers, ruling })).toMatchObject({
			job: "state",
			action: "open",
		});
	});

	test("a kept marker over settled does not start a state job again", () => {
		const r = run({
			markers: pairs(["settled", "7", "closed"], ["kept", "7", "open"]),
		});
		expect(r.job).not.toBe("state");
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

	test("2: the owner's pull request is never adopted, and is briefed once per ruling", () => {
		const brief = marker("clerk", "brief", 2, { pull: "7" });
		const ruling = conviction(1);
		expect(run({ pulls: [owners(7, 1)] }).job).toBe("-");
		for (const state of ["OPEN", "CLOSED"])
			expect(run({ state, ruling, pulls: [owners(7, 1)] })).toMatchObject({
				job: "brief",
				pull: "7",
			});
		const after = { ruling, pulls: [owners(7, 1)], holds: false };
		expect(run({ ...after, markers: [brief] }).job).toBe("-");
		const both = {
			...after,
			markers: [brief],
			pulls: [owners(7, 1), owners(8, 1)],
		};
		expect(run(both)).toMatchObject({ job: "brief", pull: "8" });
		expect(run({ ...after, markers: [brief], ruling: acquittal(3) }).job).toBe(
			"brief",
		);
	});

	test("2: the owner's pull request gets the brief and leaves the pair to settle", () => {
		const r = run({
			markers: pairs(["handed", "5", "open"]),
			ruling: conviction(1),
			pulls: [owners(9, 1)],
		});
		expect(r).toMatchObject({ job: "brief", pull: "9" });
		const pair = { markers: pairs(["handed", "5", "open"]) };
		expect(run({ ...pair, pulls: [owners(9, 1)] }).job).toBe("settle");
		// a pair's pull request from before the trace line is no owner's
		const old = {
			...pair,
			ruling: conviction(1),
			pulls: [owners(5, 1)],
			holds: false,
		};
		expect(run(old).job).toBe("-");
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
		expect(
			run({ state: "CLOSED", markers: pairs(["shut", "7", "closed"]) }).job,
		).toBe("-");
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

	test("4: a conviction on a closed issue records its precedent", () => {
		expect(run({ state: "CLOSED", ruling: conviction() }).job).toBe(
			"precedent",
		);
	});

	test("a ruling with no Precedent line gives no job", () => {
		for (const ruling of [conviction(), acquittal()])
			expect(run({ state: "CLOSED", ruling, holds: false }).job).toBe("-");
	});

	test("a referral gives no job", () => {
		const referral = marker("court", "referral", 0);
		expect(run({ markers: [referral] }).job).toBe("-");
	});

	test("4: a conviction after a referral opens a draft", () => {
		const referral = marker("court", "referral", 0);
		expect(run({ markers: [referral], ruling: conviction(1) }).job).toBe(
			"open",
		);
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
				pull: "-",
				sources: "-",
				branch: "lawman/precedent-1-1",
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
			holds: false,
		});
		expect(r.job).toBe("-");
		expect(hasPair(pairs(["handed", "7", "open"]))).toBe(true);
	});

	test("a pair does not hold back the precedent job of a ruling", () => {
		for (const ruling of [conviction(), acquittal()])
			expect(
				run({
					markers: pairs(["handed", "7", "open"]),
					pulls: [pull(7, 1)],
					ruling,
				}).job,
			).toBe("precedent");
	});
});

describe("the precedent pull request", () => {
	const entry = (i: number, pull?: string, issue?: string) =>
		marker("clerk", "entry", i, {
			...(pull === undefined ? {} : { pull }),
			...(issue === undefined ? {} : { issue }),
		});
	const decision = { job: "decision", pull: "5", sources: "-", branch: "-" };

	test("an entry whose pull request left the cache gives the decision job", () => {
		for (const state of ["OPEN", "CLOSED"])
			expect(
				run({ state, markers: [entry(3, "5")], ruling: acquittal(2) }),
			).toMatchObject(decision);
	});

	test("an entry that carries the issue state still waits for its decision", () => {
		for (const state of ["OPEN", "CLOSED"])
			expect(
				run({
					state,
					markers: [entry(3, "5", state.toLowerCase())],
					ruling: acquittal(2),
				}),
			).toMatchObject(decision);
	});

	test("a kept marker that carries both fields is a pair marker, not a decision", () => {
		const kept = marker("clerk", "kept", 4, { pull: "5", issue: "closed" });
		const markers = [entry(3, "5", "closed"), kept];
		expect(
			run({ state: "CLOSED", markers, ruling: acquittal(2) }),
		).toMatchObject(decision);
	});

	test("an entry whose pull request is still open gives no job", () => {
		const r = run({
			markers: [entry(3, "5")],
			pulls: [pull(5)],
			ruling: acquittal(2),
		});
		expect(r.job).toBe("-");
	});

	test.each(["final", "kept"])(
		"%s after the entry ends the decision job",
		(stage) => {
			const markers = [entry(3, "5"), marker("clerk", stage, 4, { pull: "5" })];
			expect(run({ markers, ruling: acquittal(2) }).job).toBe("-");
		},
	);

	test("an entry after a final asks again", () => {
		const markers = [marker("clerk", "final", 3, { pull: "5" }), entry(4, "5")];
		expect(run({ markers, ruling: acquittal(2) })).toMatchObject(decision);
	});

	test("two entries waiting give the smallest pull request", () => {
		const markers = [entry(3, "7"), entry(4, "5")];
		expect(run({ markers, ruling: acquittal(2) })).toMatchObject(decision);
	});

	test("an entry of the old form without a pull request gives no decision", () => {
		expect(run({ markers: [entry(3)], ruling: acquittal(2) }).job).toBe("-");
	});

	test("a pull field outside its class gives no decision", () => {
		expect(run({ markers: [entry(3, "05")], ruling: acquittal(2) }).job).toBe(
			"-",
		);
	});

	test("a pair job comes before the decision", () => {
		const markers = [...pairs(["handed", "7", "open"]), entry(3, "5")];
		expect(run({ markers }).job).toBe("settle");
	});

	test("the precedent branch counts the entries of the case", () => {
		const markers = [entry(1, "5"), marker("clerk", "final", 2, { pull: "5" })];
		expect(run({ markers, ruling: acquittal(3) })).toMatchObject({
			job: "precedent",
			branch: "lawman/precedent-1-2",
		});
	});
});

describe("dismissal rows", () => {
	const closed = { state: "CLOSED", dismissible: true };
	const entry = (stage: string, issue?: string, i = 3) =>
		marker("clerk", stage, i, issue === undefined ? {} : { issue });

	test("a closed, dismissible issue with no marker gives precedent", () => {
		expect(run(closed)).toMatchObject({
			job: "precedent",
			pull: "-",
			sources: "-",
			branch: "lawman/precedent-1-1",
		});
	});

	test("a closed issue that is not dismissible gives no job", () => {
		expect(run({ state: "CLOSED" }).job).toBe("-");
	});

	test.each(["entry", "no-entry"])(
		"a %s marker with issue=closed ends the job, so a later close gives none",
		(stage) => {
			expect(run({ ...closed, markers: [entry(stage, "closed")] }).job).toBe(
				"-",
			);
		},
	);

	test("the same marker with the issue open gives no job, so a reopen gives none", () => {
		const markers = [entry("entry", "closed")];
		expect(run({ ...closed, state: "OPEN", markers }).job).toBe("-");
		expect(
			precedentDue(inputOf({ ...closed, state: "OPEN", markers })),
		).toEqual({
			ruling: false,
			dismissal: false,
		});
	});

	test("a ruling's entry with no issue leaves a closed, dismissible case due", () => {
		const markers = [entry("entry")];
		expect(run({ ...closed, markers, ruling: acquittal(2) }).job).toBe(
			"precedent",
		);
		expect(
			precedentDue(inputOf({ ...closed, markers, ruling: acquittal(2) })),
		).toEqual({ ruling: false, dismissal: true });
	});

	test("pull is the pair's pull request only for base shut", () => {
		const row = (marks: ReturnType<typeof pairs>, cached: number[] = []) =>
			run({
				...closed,
				markers: marks,
				pulls: cached.map((n) => pull(n, 2)),
			}).pull;
		expect(row(pairs(["shut", "7", "closed"]))).toBe("7");
		expect(row(pairs(["shut", "7", "closed"], ["kept", "7", "closed"]))).toBe(
			"7",
		);
		expect(row(pairs(["shut", "7", "closed"]), [8])).toBe("7");
		expect(row(pairs(["handed", "7", "closed"]), [7])).toBe("-");
		expect(row(pairs(["kept", "7", "closed"]))).toBe("-");
		expect(row([])).toBe("-");
	});

	test("an unanswered rule and a close at once give one row, and both answers are due", () => {
		const scene = { ...closed, ruling: conviction() };
		expect(run(scene)).toMatchObject({ job: "precedent" });
		expect(precedentDue(inputOf(scene))).toEqual({
			ruling: true,
			dismissal: true,
		});
	});
});

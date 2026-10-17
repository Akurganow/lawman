import { describe, expect, test } from "bun:test";
import { hasPair, priorityOf } from "./clerk-jobs";
import { conviction, marker, pairs, pull, run } from "./clerk-jobs-fixture";

describe("branch", () => {
	test("k counts the distinct pull values of the pair", () => {
		const r = run({
			state: "OPEN",
			markers: pairs(
				["handed", "5", "open"],
				["shut", "5", "closed"],
				["handed", "5", "open"],
				["settled", "5", "closed"],
			),
		});
		expect(r).toMatchObject({
			job: "state",
			action: "open",
			branch: "lawman/execute-1-2",
		});
	});

	test("a second pull request makes it -3", () => {
		const r = run({
			markers: pairs(
				["settled", "5", "closed"],
				["handed", "8", "open"],
				["settled", "8", "closed"],
			),
		});
		expect(r).toMatchObject({ action: "open", branch: "lawman/execute-1-3" });
	});

	test("a bad pull value is not a pair marker and does not count", () => {
		const bad = pairs(
			["handed", "07", "open"],
			["handed", "x", "open"],
			["handed", "0", "open"],
			["handed", "", "open"],
		);
		const r = run({ markers: bad, ruling: conviction() });
		expect(r).toMatchObject({ job: "open", branch: "lawman/execute-1-1" });
		expect(hasPair(bad)).toBe(false);
	});

	test("a marker with a missing pull field is not a pair marker", () => {
		expect(hasPair([marker("clerk", "handed", 0, { issue: "open" })])).toBe(
			false,
		);
	});

	test("a marker with a bad issue field is not a pair marker", () => {
		expect(hasPair(pairs(["handed", "7", "later"]))).toBe(false);
	});

	test("clerk stages without a pair and other roles do not make a pair", () => {
		const noise = [
			marker("clerk", "entry", 0, { pull: "7", issue: "open" }),
			marker("clerk", "handoff", 1, { pull: "7", issue: "open" }),
			marker("court", "handed", 2, { pull: "7", issue: "open" }),
		];
		expect(hasPair(noise)).toBe(false);
	});

	test("the newest valid pair marker is K, older bad ones are skipped", () => {
		const r = run({
			state: "CLOSED",
			markers: [
				...pairs(["handed", "7", "open"]),
				marker("clerk", "shut", 5, { pull: "bad", issue: "closed" }),
			],
			pulls: [pull(7, 1)],
			closed: [1],
		});
		expect(r).toMatchObject({ job: "state", action: "close-pull", pull: "7" });
	});
});

describe("priority", () => {
	test.each([
		["P0", "P0"],
		["P3", "P3"],
		["P9", "P2"],
		["p1", "P2"],
		["", "P2"],
	])("a conviction with priority %s reads %s", (value, expected) => {
		const m = marker("court", "conviction", 0, { priority: value });
		expect(priorityOf([m])).toBe(expected);
	});

	test("a conviction without the field reads P2", () => {
		expect(priorityOf([conviction()])).toBe("P2");
	});

	test("no conviction reads P2", () => {
		expect(priorityOf([])).toBe("P2");
		expect(
			priorityOf([marker("court", "acquittal", 0, { priority: "P0" })]),
		).toBe("P2");
	});

	test("the newest conviction wins", () => {
		const older = marker("court", "conviction", 0, { priority: "P0" });
		const newer = marker("court", "conviction", 1, { priority: "P3" });
		expect(priorityOf([newer, older])).toBe("P3");
	});

	test("the case carries the priority", () => {
		const m = marker("court", "conviction", 0, { priority: "P1" });
		expect(run({ markers: [m], ruling: m }).priority).toBe("P1");
	});
});

describe("sources of a pull request that left the cache", () => {
	const others = {
		2: pairs(["handed", "7", "open"]),
		3: pairs(["handed", "7", "open"], ["kept", "7", "closed"]),
		4: pairs(["handed", "8", "open"]),
		5: pairs(["handed", "7", "open"], ["settled", "7", "closed"]),
		6: pairs(["shut", "7", "closed"]),
	};

	test("settle lists the issues whose newest pair marker is handed for it", () => {
		const r = run({ markers: pairs(["handed", "7", "open"]), others });
		expect(r).toMatchObject({ job: "settle", sources: "1,2,3" });
	});

	test("reopen lists the issues whose pair is shut for it", () => {
		const r = run({ markers: pairs(["shut", "7", "closed"]), others });
		expect(r).toMatchObject({
			job: "state",
			action: "reopen",
			sources: "1,6",
			branch: "lawman/execute-1-2",
		});
	});

	test("a cached pull request keeps its own sources", () => {
		const r = run({
			markers: pairs(["handed", "7", "open"]),
			pulls: [pull(7, 1, 9)],
			others,
		});
		expect(r.sources).toBe("1,9");
	});

	test("without peers the sources are a dash", () => {
		expect(
			run({ markers: pairs(["settled", "7", "closed"]), state: "OPEN" })
				.sources,
		).toBe("-");
	});
});

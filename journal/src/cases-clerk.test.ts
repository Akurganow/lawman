import { beforeEach, describe, expect, test } from "bun:test";
import {
	closed,
	expectNeed,
	expectRoundKept,
	lined,
	need,
	put,
	ruled,
} from "./cases-fixture";
import {
	acquittal,
	addPrecincts,
	caseMark,
	charge,
	conviction,
	defence,
	entry,
	noEntry,
	returnTo,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

describe("case: clerk stage", () => {
	test.each([
		["an open conviction needs the clerk", ruled(conviction), "clerk"],
		["an open acquittal needs the clerk", ruled(lined(acquittal)), "clerk"],
		[
			"a closed acquittal needs the clerk",
			closed(ruled(lined(acquittal))),
			"clerk",
		],
		["a closed conviction needs nobody", closed(ruled(conviction)), "none"],
		[
			"a no-entry newer than the acquittal needs nobody",
			ruled(lined(acquittal), noEntry()),
			"none",
		],
		[
			"a new cycle after an entry needs the clerk",
			ruled(
				conviction,
				entry(),
				caseMark(),
				charge(),
				defence(),
				lined(acquittal)(),
			),
			"clerk",
		],
	])("%s", (_name, spec, expected) => expectNeed(spec, expected));

	test("clerk markers leave round and returned unchanged", () => {
		expectRoundKept(ruled(lined(acquittal), entry()));
	});

	test("a clerk return marker leaves round and returned unchanged", () => {
		put({ 1: ruled(conviction, returnTo("investigation", 1, "clerk")) });
		expect(need(1).split(" ").slice(1, 3)).toEqual(["round=1", "returned=-"]);
	});
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
	answer,
	expectNeed,
	expectRoundKept,
	fields,
	lined,
	put,
	referral,
	withLead,
} from "./cases-fixture";
import { inproc } from "./inproc";
import {
	acquittal,
	addPrecincts,
	BASE,
	caseMark,
	charge,
	conviction,
	decline,
	defence,
	mark,
	refute,
	returnTo,
	SHA,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

describe("case: court stage", () => {
	const defended = (...rest: string[]) =>
		withLead(caseMark(), charge(), defence(), ...rest);

	test.each([
		["a defence after the charge needs the court", defended(), "court"],
		[
			"an acquittal after a decline needs the clerk",
			withLead(caseMark(), decline(), lined(acquittal)()),
			"clerk",
		],
		[
			"a conviction after a refute needs the clerk",
			withLead(caseMark(), charge(), refute(), conviction()),
			"clerk",
		],
		[
			"a court marker older than the decline does not count",
			withLead(caseMark(), acquittal(), decline()),
			"court",
		],
		[
			"a conviction older than the defence does not count",
			withLead(caseMark(), charge(), conviction(), defence()),
			"court",
		],
		[
			"a conviction with no defence leaves the defender",
			withLead(caseMark(), charge(), conviction()),
			"defender",
		],
	])("%s", (_name, spec, expected) => expectNeed(spec, expected));

	test("a court return leaves round and returned unchanged", () => {
		expectRoundKept(defended(returnTo("investigation", 1, "court")));
	});
});

const referred = (...rest: string[]) =>
	withLead(caseMark(), charge(), defence(), referral(), ...rest);

describe("case: referral answers", () => {
	const line = (issue: number) => {
		const r = inproc(BASE, ["case", "main", String(issue)]);
		expect(r.code).toBe(0);
		return r.out.trim();
	};
	const need = (issue: number) => line(issue).split(" ")[0];

	test("an unanswered referral needs nobody", () => {
		put({ 1: referred() });
		expect(need(1)).toBe("need=none");
	});

	test.each([
		["up", "-"],
		["down", "-"],
		["comment", "IC_1_4"],
	])("a referral answered %s needs the court", (value, id) => {
		put({ 1: referred() });
		answer(1, value, id);
		expect(need(1)).toBe("need=court");
		expect(line(1)).toContain(" job=- ");
		expect(line(1)).toEndWith(` answer=${value} answer_id=${id}`);
	});

	test("a ruling after an answered referral needs the clerk", () => {
		for (const ruling of [conviction(), lined(acquittal)()]) {
			put({ 1: referred(ruling) });
			answer(1, "up");
			expect(need(1)).toBe("need=clerk");
		}
	});
});

describe("case: priority", () => {
	const ruledWith = (extra: string) =>
		withLead(
			caseMark(),
			charge(),
			defence(),
			mark("court", "conviction", ` sha=${SHA}${extra}`),
		);

	test.each([
		[" priority=P0", "P0"],
		[" priority=P1", "P1"],
		[" priority=P3", "P3"],
		["", "P2"],
		[" priority=P4", "P2"],
		[" priority=high", "P2"],
		[" priority=p0", "P2"],
	])("a conviction%s reads %s", (extra, expected) => {
		put({ 1: ruledWith(extra) });
		expect(fields(1).priority).toBe(expected);
	});

	test("the priority comes from the newest conviction", () => {
		put({
			1: withLead(
				caseMark(),
				charge(),
				defence(),
				mark("court", "conviction", ` sha=${SHA} priority=P0`),
				caseMark(),
				charge(),
				defence(),
				mark("court", "conviction", ` sha=${SHA} priority=P3`),
			),
		});
		expect(fields(1).priority).toBe("P3");
	});
});

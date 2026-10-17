import { beforeEach, describe, expect, test } from "bun:test";
import { fields, need, needOnly, put, withLead } from "./cases-fixture";
import {
	acquittal,
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	conviction,
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
			"a conviction after the defence needs the clerk",
			defended(conviction()),
			"clerk",
		],
		[
			"an acquittal on an open issue needs the clerk",
			defended(acquittal()),
			"clerk",
		],
		[
			"a refute instead of a defence needs nobody",
			withLead(caseMark(), charge(), refute()),
			"none",
		],
		[
			"a defender return instead of a defence needs the investigation",
			withLead(caseMark(), charge(), returnTo("investigation", 1, "defender")),
			"investigation",
		],
		[
			"a conviction older than the defence does not count",
			withLead(caseMark(), charge(), conviction(), defence()),
			"court",
		],
		[
			"a conviction from an earlier case does not count",
			withLead(
				caseMark(),
				charge(),
				conviction(),
				caseMark(),
				charge(),
				defence(),
			),
			"court",
		],
		[
			"a conviction with no defence leaves the defender",
			withLead(caseMark(), charge(), conviction()),
			"defender",
		],
		[
			"a conviction older than the charge leaves the defender",
			withLead(caseMark(), conviction(), charge()),
			"defender",
		],
		[
			"a new case and charge after a conviction need the defender",
			defended(conviction(), caseMark(), charge()),
			"defender",
		],
		[
			"a new case after a conviction needs the prosecutor",
			defended(conviction(), caseMark()),
			"prosecutor",
		],
	])("%s", (_name, spec, expected) => {
		put({ 1: spec });
		expect(needOnly(1)).toBe(`need=${expected}`);
	});

	test("due for the prosecutor, defender and investigation skips closed issues", () => {
		put({ 1: { ...withLead(), state: "CLOSED" } });
		put({ 2: { ...withLead(caseMark()), state: "CLOSED" } });
		put({ 3: { ...withLead(caseMark(), charge()), state: "CLOSED" } });
		for (const role of ["investigation", "prosecutor", "defender"])
			expect(call(BASE, ["due", "--role", role]).out).toBe("");
	});

	test("a court return leaves round and returned unchanged", () => {
		put({ 1: defended(returnTo("investigation", 1, "court")) });
		expect(need(1).split(" ").slice(0, 3)).toEqual([
			"need=none",
			"round=1",
			"returned=-",
		]);
	});

	test("due for the court lists only a defended open case", () => {
		const due = () => call(BASE, ["due", "--role", "court"]).out;
		put({ 1: defended() });
		expect(due()).toBe("main\t1\n");
		put({
			1: defended(conviction()),
			2: defended(acquittal()),
			3: { ...defended(), state: "CLOSED" },
		});
		expect(due()).toBe("");
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
		[" priority=P2", "P2"],
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

	test("a case without a conviction reads P2", () => {
		put({ 1: withLead(caseMark(), charge(), defence(), acquittal()) });
		expect(fields(1).priority).toBe("P2");
		put({ 1: withLead() });
		expect(fields(1).priority).toBe("P2");
	});
});

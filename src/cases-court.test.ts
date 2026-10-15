import { beforeEach, describe, expect, test } from "bun:test";
import { need, needOnly, put, withLead } from "./cases-fixture";
import {
	acquittal,
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	conviction,
	defence,
	refute,
	returnTo,
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
			"a conviction after the defence needs nobody",
			defended(conviction()),
			"none",
		],
		[
			"an acquittal on an open issue needs nobody",
			defended(acquittal()),
			"none",
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
			"a court return after the defence needs nobody",
			defended(returnTo("investigation", 1, "court")),
			"none",
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

	test("a closed issue with court markers needs nobody", () => {
		put({ 1: { ...defended(conviction()), state: "CLOSED" } });
		expect(needOnly(1)).toBe("need=none");
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

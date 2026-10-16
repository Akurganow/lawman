import { beforeEach, describe, expect, test } from "bun:test";
import { need, needOnly, put, withLead } from "./cases-fixture";
import {
	addPrecincts,
	caseMark,
	charge,
	decline,
	defence,
	refute,
	returnTo,
	SHA,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

describe("case: defender stage", () => {
	const afterCharge = (...rest: string[]) =>
		withLead(caseMark(), charge(), ...rest);
	const defenderReturn = (to: string) => returnTo(to, 1, "defender");

	test.each([
		["a charge with no defender marker needs the defender", [], "defender"],
		["a defence after the charge needs the court", [defence()], "court"],
		[
			"a refute after the charge on an open issue needs nobody",
			[refute()],
			"none",
		],
		[
			"a defender return to the investigation needs the investigation",
			[defenderReturn("investigation")],
			"investigation",
		],
		[
			"a defender return to another role needs nobody",
			[defenderReturn("patrol")],
			"none",
		],
		[
			"a new case after a defender return needs the prosecutor",
			[defenderReturn("investigation"), caseMark()],
			"prosecutor",
		],
		[
			"a new charge after that needs the defender again",
			[defenderReturn("investigation"), caseMark(), charge()],
			"defender",
		],
		[
			"a defence older than the second charge does not count",
			[defence(), caseMark(), charge()],
			"defender",
		],
	])("%s", (_name, rest, need) => {
		put({ 1: afterCharge(...rest) });
		expect(needOnly(1)).toBe(`need=${need}`);
	});

	test("a defender marker with no prosecutor marker is ignored", () => {
		put({
			1: withLead(caseMark(), defence()),
		});
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a defender marker older than a stale prosecutor marker is ignored", () => {
		put({
			1: withLead(caseMark(), defence(), charge(), caseMark()),
		});
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a defender marker older than the charge does not count", () => {
		put({
			1: withLead(defence(), caseMark(), charge()),
		});
		expect(needOnly(1)).toBe("need=defender");
	});

	test("a decline with an older defender marker needs nobody", () => {
		put({
			1: withLead(defence(), caseMark(), decline()),
		});
		expect(needOnly(1)).toBe("need=none");
	});

	test("a closed issue needs nobody with defender markers present", () => {
		put({ 1: { ...afterCharge(defence()), state: "CLOSED" } });
		expect(needOnly(1)).toBe("need=none");
	});

	describe("rounds and returned", () => {
		const field = (n: number, i: number) => need(n).split(" ")[i];

		test("a defender return counts like a prosecutor return", () => {
			put({
				1: afterCharge(defenderReturn("investigation")),
				2: withLead(
					returnTo("investigation", 1),
					defenderReturn("investigation"),
				),
				3: withLead(returnTo("investigation", 1, "judge")),
			});
			expect([1, 2, 3].map((n) => field(n, 1))).toEqual([
				"round=2",
				"round=3",
				"round=1",
			]);
		});

		test("returned names the roles that returned, in fixed order", () => {
			put({
				1: withLead(),
				2: withLead(returnTo("investigation")),
				3: withLead(defenderReturn("investigation")),
				4: withLead(defenderReturn("investigation"), returnTo("investigation")),
				5: withLead(returnTo("investigation", 1, "judge")),
			});
			expect([1, 2, 3, 4, 5].map((n) => field(n, 2))).toEqual([
				"returned=-",
				"returned=prosecutor",
				"returned=defender",
				"returned=prosecutor,defender",
				"returned=-",
			]);
		});

		test("the line carries returned right after round", () => {
			put({ 1: afterCharge(defenderReturn("investigation")) });
			expect(need(1)).toBe(
				`need=investigation round=2 returned=defender department=core sha=${SHA} state=OPEN lead=body related=-`,
			);
		});
	});
});

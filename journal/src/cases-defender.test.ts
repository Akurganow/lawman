import { beforeEach, describe, expect, test } from "bun:test";
import { need, needOnly, put, withLead } from "./cases-fixture";
import {
	addPrecincts,
	caseMark,
	charge,
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
		[
			"a refute after the charge on an open issue needs the court",
			[refute()],
			"court",
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
			"a new case and charge after a defender return need the defender again",
			[defenderReturn("investigation"), caseMark(), charge()],
			"defender",
		],
	])("%s", (_name, rest, need) => {
		put({ 1: afterCharge(...rest) });
		expect(needOnly(1)).toBe(`need=${need}`);
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
				`need=investigation round=2 returned=defender department=core sha=${SHA} state=OPEN lead=body related=- priority=P2 job=- action=- pull=- sources=- branch=- kind=defect answer=- answer_id=-`,
			);
		});
	});
});

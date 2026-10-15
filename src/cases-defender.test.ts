import { beforeEach, describe, expect, test } from "bun:test";
import { type Comment, need, needOnly, put, T } from "./cases-fixture";
import {
	addPrecincts,
	caseMark,
	charge,
	decline,
	defence,
	lead,
	refute,
	returnTo,
	SHA,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

describe("case: defender stage", () => {
	const afterCharge = (...rest: string[]) => ({
		body: [lead()],
		comments: [caseMark(), charge(), ...rest].map(
			(body, i): Comment => [T(10 + i), body],
		),
	});
	const defenderReturn = (to: string) => returnTo(to, 1, "defender");

	test("a charge with no defender marker needs the defender", () => {
		put({ 1: afterCharge() });
		expect(needOnly(1)).toBe("need=defender");
	});

	test("a defence after the charge needs nobody", () => {
		put({ 1: afterCharge(defence()) });
		expect(needOnly(1)).toBe("need=none");
	});

	test("a refute after the charge on an open issue needs nobody", () => {
		put({ 1: afterCharge(refute()) });
		expect(needOnly(1)).toBe("need=none");
	});

	test("a defender return to the investigation needs the investigation", () => {
		put({ 1: afterCharge(defenderReturn("investigation")) });
		expect(needOnly(1)).toBe("need=investigation");
	});

	test("a defender return to another role needs nobody", () => {
		put({ 1: afterCharge(defenderReturn("patrol")) });
		expect(needOnly(1)).toBe("need=none");
	});

	test("a new case after a defender return needs the prosecutor", () => {
		put({ 1: afterCharge(defenderReturn("investigation"), caseMark()) });
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a new charge after that needs the defender again", () => {
		put({
			1: afterCharge(defenderReturn("investigation"), caseMark(), charge()),
		});
		expect(needOnly(1)).toBe("need=defender");
	});

	test("a defence older than the second charge does not count", () => {
		put({ 1: afterCharge(defence(), caseMark(), charge()) });
		expect(needOnly(1)).toBe("need=defender");
	});

	test("a defender marker with no prosecutor marker is ignored", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), defence()],
				],
			},
		});
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a defender marker older than a stale prosecutor marker is ignored", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), defence()],
					[T(12), charge()],
					[T(13), caseMark()],
				],
			},
		});
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a defender marker older than the charge does not count", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), defence()],
					[T(11), caseMark()],
					[T(12), charge()],
				],
			},
		});
		expect(needOnly(1)).toBe("need=defender");
	});

	test("a decline with an older defender marker needs nobody", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), defence()],
					[T(11), caseMark()],
					[T(12), decline()],
				],
			},
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
				2: {
					body: [lead()],
					comments: [
						[T(10), returnTo("investigation", 1)],
						[T(11), defenderReturn("investigation")],
					],
				},
				3: {
					body: [lead()],
					comments: [[T(10), returnTo("investigation", 1, "judge")]],
				},
			});
			expect([1, 2, 3].map((n) => field(n, 1))).toEqual([
				"round=2",
				"round=3",
				"round=1",
			]);
		});

		test("returned names the roles that returned, in fixed order", () => {
			put({
				1: { body: [lead()] },
				2: { body: [lead()], comments: [[T(10), returnTo("investigation")]] },
				3: {
					body: [lead()],
					comments: [[T(10), defenderReturn("investigation")]],
				},
				4: {
					body: [lead()],
					comments: [
						[T(10), defenderReturn("investigation")],
						[T(11), returnTo("investigation")],
					],
				},
				5: {
					body: [lead()],
					comments: [[T(10), returnTo("investigation", 1, "judge")]],
				},
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
				`need=investigation round=2 returned=defender department=core sha=${SHA} state=OPEN`,
			);
		});
	});
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
	answer,
	type Comment,
	expectNeed,
	expectRoundKept,
	fields,
	needOnly,
	put,
	referral,
	type Spec,
	T,
	withLead,
} from "./cases-fixture";
import { inproc } from "./inproc";
import {
	acquittal,
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	conviction,
	defence,
	lead,
	mark,
	refute,
	returnTo,
	SHA,
	TRUSTED,
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
	])("%s", (_name, spec, expected) => expectNeed(spec, expected));

	test("due for the prosecutor, defender and investigation skips closed issues", () => {
		put({ 1: { ...withLead(), state: "CLOSED" } });
		put({ 2: { ...withLead(caseMark()), state: "CLOSED" } });
		put({ 3: { ...withLead(caseMark(), charge()), state: "CLOSED" } });
		for (const role of ["investigation", "prosecutor", "defender"])
			expect(call(BASE, ["due", "--role", role]).out).toBe("");
	});

	test("a court return leaves round and returned unchanged", () => {
		expectRoundKept(defended(returnTo("investigation", 1, "court")));
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

const referred = (...rest: string[]) =>
	withLead(caseMark(), charge(), defence(), referral(), ...rest);

describe.each([
	["cli", call],
	["in process", inproc],
])("case: referral answers (%s)", (_name, run) => {
	const line = (issue: number) => {
		const r = run(BASE, ["case", "main", String(issue)]);
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
		for (const ruling of [conviction(), acquittal()]) {
			put({ 1: referred(ruling) });
			answer(1, "up");
			expect(need(1)).toBe("need=clerk");
		}
	});
});

describe("case: referral", () => {
	test("a case reopened after an answered referral needs the prosecutor", () => {
		put({ 1: referred(caseMark()) });
		answer(1, "up");
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	const stepped = (...tail: Comment[]): Spec => ({
		body: [lead()],
		comments: [
			[T(10), caseMark()],
			[T(11), charge()],
			[T(12), defence()],
			...tail,
		],
	});

	test("a thumb on an older referral answers the new one", () => {
		put({
			1: stepped([T(13), referral(), [TRUSTED]], [T(14), referral()]),
		});
		expect(fields(1).answer).toBe("up");
		expect(needOnly(1)).toBe("need=court");
	});

	test("a thumbs up on the referral gives the court the case", () => {
		put({ 1: stepped([T(13), referral(), [TRUSTED]]) });
		expect(needOnly(1)).toBe("need=court");
		expect(fields(1).answer).toBe("up");
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

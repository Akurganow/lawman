import { beforeEach, describe, expect, test } from "bun:test";
import {
	expectNeed,
	need,
	needOnly,
	order,
	put,
	T,
	withLead,
} from "./cases-fixture";
import {
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	decline,
	defence,
	issues,
	issuesForm,
	lead,
	refute,
	returnTo,
	SHA,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

beforeEach(() => addPrecincts({ main: 1 }));

describe("case: stage", () => {
	test.each([
		["a lead alone needs the investigation", withLead(), "investigation"],
		["a case needs the prosecutor", withLead(caseMark()), "prosecutor"],
		[
			"a charge after the case needs the defender",
			withLead(caseMark(), charge()),
			"defender",
		],
		[
			"a decline after the case ends the work",
			withLead(caseMark(), decline()),
			"none",
		],
		[
			"a return to the investigation needs the investigation",
			withLead(caseMark(), returnTo("investigation")),
			"investigation",
		],
		[
			"a return to another role ends the case work",
			withLead(caseMark(), returnTo("patrol")),
			"none",
		],
		[
			"a newer case after a return needs the prosecutor",
			withLead(caseMark(), returnTo("investigation"), caseMark()),
			"prosecutor",
		],
	])("%s", (_name, spec, expected) => expectNeed(spec, expected));

	test("a closed issue needs nobody", () => {
		put({ 1: { state: "CLOSED", body: [lead()] } });
		expect(need(1)).toBe(
			"need=none round=1 returned=- department=core sha=- state=CLOSED lead=body related=- priority=P2 job=- action=- pull=- sources=- branch=- kind=defect answer=- answer_id=-",
		);
	});

	test("order follows the marker key, not the comment order in the list", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(11), charge()],
					[T(10), caseMark()],
				],
			},
			2: {
				body: [lead(), caseMark()],
				comments: [[T(10), returnTo("investigation")]],
			},
		});
		expect(needOnly(1)).toBe("need=defender");
		expect(needOnly(2)).toBe("need=investigation");
	});
});

describe("case: round, department, sha", () => {
	const roundOf = (n: number) => need(n).split(" ")[1];

	test("round counts the returns to the investigation plus one", () => {
		put({
			1: { body: [lead()] },
			2: { body: [lead()], comments: [[T(10), returnTo("investigation", 1)]] },
			3: withLead(returnTo("investigation", 1), returnTo("investigation", 2)),
			4: withLead(returnTo("investigation"), returnTo("patrol")),
		});
		expect([1, 2, 3, 4].map(roundOf)).toEqual([
			"round=1",
			"round=2",
			"round=3",
			"round=2",
		]);
	});

	test("the line carries the department of the lead origin and the sha of the newest case", () => {
		put({ 1: { body: [lead()], comments: [[T(10), caseMark()]] } });
		expect(need(1)).toBe(
			`need=prosecutor round=1 returned=- department=core sha=${SHA} state=OPEN lead=body related=- priority=P2 job=- action=- pull=- sources=- branch=- kind=defect answer=- answer_id=-`,
		);
	});

	test("without a case the sha is a dash", () => {
		put({ 1: { body: [lead()] } });
		expect(need(1)).toBe(
			"need=investigation round=1 returned=- department=core sha=- state=OPEN lead=body related=- priority=P2 job=- action=- pull=- sources=- branch=- kind=defect answer=- answer_id=-",
		);
	});
});

describe("case: failures", () => {
	test("an issue without a lead origin prints the clerk line and exits 0", () => {
		put({ 1: { body: ["no marker"] } });
		const r = call(BASE, ["case", "main", "1"]);
		expect(r.code).toBe(0);
		expect(r.out).toBe(
			"need=none round=- returned=- department=- sha=- state=OPEN lead=- related=- priority=P2 job=- action=- pull=- sources=- branch=- kind=- answer=- answer_id=-\n",
		);
	});

	test("an unknown issue exits 1", () => {
		put({ 1: { body: [lead()] } });
		expect(call(BASE, ["case", "main", "9"]).code).toBe(1);
	});

	test("an unknown precinct exits 1", () => {
		put({ 1: { body: [lead()] } });
		expect(call(BASE, ["case", "nope", "1"]).code).toBe(1);
	});

	test("a bad argument shape exits 1", () => {
		expect(call(BASE, ["case", "main"]).code).toBe(1);
		expect(call(BASE, ["case", "main", "x"]).code).toBe(1);
		expect(call(BASE, ["case", "main", "0"]).code).toBe(1);
	});
});

describe("due", () => {
	const due = (role: string) => {
		const r = call(BASE, ["due", "--role", role]);
		expect(r.code).toBe(0);
		return r.out;
	};

	test("an empty journal has nothing due", () => {
		expect(due("investigation")).toBe("");
		expect(due("prosecutor")).toBe("");
	});

	test("a lead without a case is due for the investigation", () => {
		put({ 3: { body: [lead()] } });
		expect(due("investigation")).toBe("main\t3\n");
		expect(due("prosecutor")).toBe("");
	});

	test("a case without a decision is due for the prosecutor", () => {
		put({ 3: { body: [lead()], comments: [[T(10), caseMark()]] } });
		expect(due("prosecutor")).toBe("main\t3\n");
		expect(due("investigation")).toBe("");
	});

	test("a charge leaves nothing due for the earlier roles, a decline nothing at all", () => {
		put({
			1: withLead(caseMark(), charge()),
			2: withLead(caseMark(), decline()),
		});
		expect(due("investigation")).toBe("");
		expect(due("prosecutor")).toBe("");
	});

	test("a charged open case is due for the defender only", () => {
		put({
			1: withLead(caseMark(), charge()),
		});
		expect(due("defender")).toBe("main\t1\n");
		expect(due("prosecutor")).toBe("");
	});

	test("a defended, refuted or closed case is not due for the defender", () => {
		put({
			1: withLead(caseMark(), charge(), defence()),
			2: withLead(caseMark(), charge(), refute()),
			3: {
				state: "CLOSED",
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), charge()],
				],
			},
		});
		expect(due("defender")).toBe("");
	});

	test("a closed issue leaves nothing due", () => {
		put({ 1: { state: "CLOSED", body: [lead()] } });
		expect(due("investigation")).toBe("");
	});

	test("a precinct of weight zero leaves nothing due", () => {
		put({ 1: { body: [lead()] } });
		expect(call(BASE, ["precinct", "set", "main", "--weight", "0"]).code).toBe(
			0,
		);
		expect(due("investigation")).toBe("");
	});

	test("an open order of the role silences the role only", () => {
		put({
			1: { body: [lead()] },
			2: { body: [lead()], comments: [[T(10), caseMark()]] },
		});
		order("investigation", 1, T(8), true);
		expect(due("investigation")).toBe("");
		expect(due("prosecutor")).toBe("main\t2\n");
	});

	test("an issue never ordered comes before one with an old order", () => {
		put({ 1: { body: [lead()] }, 2: { body: [lead()] } });
		order("investigation", 1, T(8));
		expect(due("investigation")).toBe("main\t2\n");
	});

	test("the oldest last order comes first", () => {
		put({ 1: { body: [lead()] }, 2: { body: [lead()] } });
		order("investigation", 1, T(8));
		order("investigation", 1, T(12));
		order("investigation", 2, T(10));
		expect(due("investigation")).toBe("main\t2\n");
	});

	test("an order of another role does not count", () => {
		put({ 1: { body: [lead()] }, 2: { body: [lead()] } });
		order("prosecutor", 2, T(8));
		order("investigation", 1, T(8));
		expect(due("investigation")).toBe("main\t2\n");
	});

	test("never-ordered issues sort by creation date, then number", () => {
		put({
			1: { body: [lead()], createdAt: T(12) },
			2: { body: [lead()], createdAt: T(10) },
			3: { body: [lead()], createdAt: T(10) },
		});
		expect(due("investigation")).toBe("main\t2\n");
	});

	test("a lead origin of the fingerprint form is due", () => {
		const fixture = issues.filter((i) => i.number === 19);
		const r = call(
			BASE,
			["sync", "main", "--author", TRUSTED],
			JSON.stringify(issuesForm(fixture)),
		);
		expect(r.code).toBe(0);
		expect(due("investigation")).toBe("main\t19\n");
	});

	test("a missing role exits 1", () => {
		expect(call(BASE, ["due"]).code).toBe(1);
	});
});

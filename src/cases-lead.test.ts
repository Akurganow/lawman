import { beforeEach, describe, expect, test } from "bun:test";
import { need, put, T, withLead } from "./cases-fixture";
import { addPrecincts, caseMark, lead, seed, tempDb } from "./test-helpers";

tempDb();

beforeEach(() => addPrecincts({ main: 1 }));

type Row = {
	ord: string;
	role: string;
	stage: string;
	department?: string | null;
	leadId?: string | null;
	fields?: Record<string, string>;
};

const ordOf = (hour: number, rank: number) =>
	`${T(hour)}|${String(rank).padStart(6, "0")}|000001`;

function addIssue(n: number, state = "OPEN") {
	seed((db) =>
		db.run(
			"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('main', ?, ?, 't', ?)",
			[n, state, T(9)],
		),
	);
}

const addMarker = (n: number, r: Row) =>
	seed((db) =>
		db.run("INSERT INTO markers VALUES ('main', ?, ?, ?, ?, ?, ?, ?, 'raw')", [
			n,
			r.ord,
			r.role,
			r.stage,
			r.department ?? null,
			r.leadId ?? null,
			JSON.stringify(r.fields ?? {}),
		]),
	);

const unitLead = (id: string): Row => ({
	ord: ordOf(10, 1),
	role: "response-unit",
	stage: "lead",
	department: "-",
	leadId: id,
});

const stage = (hour: number, role: string, name: string): Row => ({
	ord: ordOf(hour, 1),
	role,
	stage: name,
});

describe("case: lead origin", () => {
	test("a lead in a comment of the response unit with no department says lead=comment", () => {
		addIssue(1);
		addMarker(1, unitLead("src/a.rs::f::dead-code"));
		expect(need(1)).toBe(
			"need=investigation round=1 returned=- department=- sha=- state=OPEN lead=comment related=-",
		);
	});

	test("a lead of the patrol in the body says lead=body", () => {
		put({ 1: { body: [lead()] } });
		expect(need(1)).toBe(
			"need=investigation round=1 returned=- department=core sha=- state=OPEN lead=body related=-",
		);
	});

	test("the earliest lead marker decides where the origin sits", () => {
		put({ 1: { body: [lead()], comments: [[T(10), lead()]] } });
		expect(need(1)).toContain(" lead=body ");
	});

	test("a lead without a department walks the chain from the investigation to the clerk", () => {
		addIssue(1);
		addMarker(1, unitLead("src/a.rs::f::dead-code"));
		const steps = [
			["investigation", "case", "prosecutor"],
			["prosecutor", "charge", "defender"],
			["defender", "defence", "court"],
			["court", "conviction", "clerk"],
		] as const;
		steps.forEach(([role, name, next], i) => {
			addMarker(1, stage(11 + i, role, name));
			expect(need(1)).toStartWith(`need=${next} `);
		});
		expect(need(1)).toContain(" department=- ");
	});
});

describe("case: related issues", () => {
	const ID = "src/a.rs::f::dead-code";
	const related = (n: number) => need(n).split(" ").at(-1);

	test("lists the other issues with the same path and symbol in ascending order", () => {
		put({
			9: { body: [lead("", ID)] },
			3: { body: [lead("", "src/a.rs::f::unused-import")] },
			5: { body: [lead("", "src/b.rs::f::dead-code")] },
			7: { state: "CLOSED", body: [lead("", ID)] },
			1: { body: [lead("", ID)] },
		});
		expect(related(9)).toBe("related=1,3,7");
		expect(related(1)).toBe("related=3,7,9");
		expect(related(5)).toBe("related=-");
	});

	test("a lead without an id relates to nothing and nobody", () => {
		put({ 2: { body: [lead("", ID)] } });
		for (const n of [1, 3]) {
			addIssue(n);
			addMarker(n, { ...unitLead(""), ord: ordOf(10, 0), leadId: null });
		}
		addIssue(4);
		addMarker(4, { ...unitLead(""), ord: ordOf(10, 0), leadId: "" });
		expect(related(2)).toBe("related=-");
		expect(related(1)).toBe("related=-");
		expect(related(4)).toBe("related=-");
	});

	test("the case marker of other issues does not matter", () => {
		put({
			1: withLead(caseMark()),
			2: { body: [lead("", ID)] },
		});
		expect(related(2)).toBe("related=1");
	});
});

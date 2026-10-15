import { beforeEach, describe, expect, test } from "bun:test";
import {
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	decline,
	lead,
	returnTo,
	SHA,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

type Comment = [createdAt: string, body: string];
type Spec = { body?: string[]; comments?: Comment[]; state?: string };

const T = (hour: number) =>
	`2026-10-14T${String(hour).padStart(2, "0")}:00:00Z`;

function put(specs: Record<number, Spec>) {
	const data = Object.entries(specs).map(([n, s]) => ({
		number: Number(n),
		state: s.state ?? "OPEN",
		stateReason: null,
		title: `issue ${n}`,
		createdAt: T(9),
		closedAt: null,
		author: { login: TRUSTED },
		body: (s.body ?? []).join("\n"),
		comments: (s.comments ?? []).map(([createdAt, body]) => ({
			author: { login: TRUSTED },
			body,
			createdAt,
		})),
	}));
	const r = call(
		BASE,
		["sync", "main", "--author", TRUSTED],
		JSON.stringify(data),
	);
	expect(r.code).toBe(0);
}

const need = (n: number) => {
	const r = call(BASE, ["case", "main", String(n)]);
	expect(r.code).toBe(0);
	return r.out.trim();
};
const needOnly = (n: number) => need(n).split(" ")[0];

beforeEach(() => addPrecincts({ main: 1 }));

describe("case: stage", () => {
	test("a lead alone needs the investigation", () => {
		put({ 1: { body: [lead()] } });
		expect(needOnly(1)).toBe("need=investigation");
	});

	test("a case needs the prosecutor", () => {
		put({ 1: { body: [lead()], comments: [[T(10), caseMark()]] } });
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a charge after the case ends the work", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), charge()],
				],
			},
		});
		expect(needOnly(1)).toBe("need=none");
	});

	test("a decline after the case ends the work", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), decline()],
				],
			},
		});
		expect(needOnly(1)).toBe("need=none");
	});

	test("a return to the investigation needs the investigation", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), returnTo("investigation")],
				],
			},
		});
		expect(needOnly(1)).toBe("need=investigation");
	});

	test("a return to another role ends the case work", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), returnTo("patrol")],
				],
			},
		});
		expect(needOnly(1)).toBe("need=none");
	});

	test("a newer case after a return needs the prosecutor", () => {
		put({
			1: {
				body: [lead()],
				comments: [
					[T(10), caseMark()],
					[T(11), returnTo("investigation")],
					[T(12), caseMark()],
				],
			},
		});
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("a closed issue needs nobody", () => {
		put({ 1: { state: "CLOSED", body: [lead()] } });
		expect(need(1)).toBe(
			"need=none round=1 department=core sha=- state=CLOSED",
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
		expect(needOnly(1)).toBe("need=none");
		expect(needOnly(2)).toBe("need=investigation");
	});
});

describe("case: round, department, sha", () => {
	const roundOf = (n: number) => need(n).split(" ")[1];

	test("round counts the returns to the investigation plus one", () => {
		put({
			1: { body: [lead()] },
			2: { body: [lead()], comments: [[T(10), returnTo("investigation", 1)]] },
			3: {
				body: [lead()],
				comments: [
					[T(10), returnTo("investigation", 1)],
					[T(11), returnTo("investigation", 2)],
				],
			},
			4: {
				body: [lead()],
				comments: [
					[T(10), returnTo("investigation")],
					[T(11), returnTo("patrol")],
				],
			},
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
			`need=prosecutor round=1 department=core sha=${SHA} state=OPEN`,
		);
	});

	test("without a case the sha is a dash", () => {
		put({ 1: { body: [lead()] } });
		expect(need(1)).toBe(
			"need=investigation round=1 department=core sha=- state=OPEN",
		);
	});
});

describe("case: failures", () => {
	test("an issue without a lead origin exits 1", () => {
		put({ 1: { body: ["no marker"] } });
		const r = call(BASE, ["case", "main", "1"]);
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
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

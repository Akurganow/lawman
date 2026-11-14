import { describe, expect, test } from "bun:test";
import { CONFIG, installation, lines } from "./input-test-fixture";
import {
	BASE,
	call,
	later,
	order,
	precinct,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

const ISSUES = [1, 2, 3, 4, 5];

// one part holds the law and the orders, so the wake prints both
const WHOLE = "input_chars: 1000000\n";

function setUp(role: string, extra = "") {
	installation(`${CONFIG}${WHOLE}${extra}`);
	seed((d) => {
		precinct(d, "main");
		for (const [i, issue] of ISSUES.entries())
			order(d, "main", role, { issue, at: later(0, i) });
	});
}

const listed = (out: string) =>
	lines(out)
		.filter((l) => l.startsWith("order "))
		.map((l) => Number(l.split(" ")[5]));

describe("the role entry prints the jobs of the role", () => {
	test("a clerk lists 3 of 5 takeable orders by default, the oldest first", () => {
		setUp("clerk");
		const r = call(BASE, ["wake", "--role", "clerk"]);
		expect(r.code).toBe(0);
		expect(listed(r.out)).toEqual([1, 2, 3]);
	});

	test("jobs: clerk=1 lists one order", () => {
		setUp("clerk", "jobs: clerk=1\n");
		const r = call(BASE, ["wake", "--role", "clerk"]);
		expect(listed(r.out)).toEqual([1]);
	});
});

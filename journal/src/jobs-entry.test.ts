import { describe, expect, test } from "bun:test";
import { inprocAsync } from "./inproc";
import { CONFIG, config, installation, lines } from "./input-test-fixture";
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

// the orders of the whole group, which `tick input --role --part` prints part by part
function groupOrders(role: string, wake: string): number[] {
	const parts = Number(/ of (\d+)$/.exec(lines(wake)[0] ?? "")?.[1]);
	expect(parts).toBeGreaterThan(0);
	return Array.from({ length: parts }, (_, k) =>
		listed(
			call(BASE, ["tick", "input", "--role", role, "--part", String(k + 1)])
				.out,
		),
	).flat();
}

describe("the role entry prints the jobs of the role", () => {
	test("a clerk lists 3 of 5 takeable orders by default, the oldest first", () => {
		setUp("clerk");
		const r = call(BASE, ["wake", "--role", "clerk"]);
		expect(r.code).toBe(0);
		expect(listed(r.out)).toEqual([1, 2, 3]);
		expect(groupOrders("clerk", r.out)).toEqual([1, 2, 3]);
	});

	test("a group split in parts lists the same orders over all parts", () => {
		setUp("clerk");
		config(CONFIG);
		const r = call(BASE, ["wake", "--role", "clerk"]);
		expect(lines(r.out)[0]).not.toContain("part 1 of 1");
		expect(groupOrders("clerk", r.out)).toEqual([1, 2, 3]);
	});

	test("jobs: clerk=1 lists one order", () => {
		setUp("clerk", "jobs: clerk=1\n");
		const r = call(BASE, ["wake", "--role", "clerk"]);
		expect(listed(r.out)).toEqual([1]);
		expect(groupOrders("clerk", r.out)).toEqual([1]);
	});

	test("jobs: clerk=9 lists all five, and the pair of another role does not count", () => {
		setUp("clerk", "jobs: court=1 clerk=9\n");
		const r = call(BASE, ["wake", "--role", "clerk"]);
		expect(listed(r.out)).toEqual(ISSUES);
		expect(groupOrders("clerk", r.out)).toEqual(ISSUES);
	});

	test("a role without a pair keeps its default of 1", () => {
		setUp("court", "jobs: clerk=3\n");
		expect(listed(call(BASE, ["wake", "--role", "court"]).out)).toEqual([1]);
	});

	test("a change of the key acts at the next entry", () => {
		setUp("clerk");
		expect(listed(call(BASE, ["wake", "--role", "clerk"]).out).length).toBe(3);
		config(`${CONFIG}${WHOLE}jobs: clerk=2\n`);
		expect(listed(call(BASE, ["wake", "--role", "clerk"]).out).length).toBe(2);
	});

	test("the entry in process prints the same orders", async () => {
		setUp("clerk");
		const r = await inprocAsync(BASE, ["wake", "--role", "clerk"]);
		expect(listed(r.out)).toEqual([1, 2, 3]);
	});
});

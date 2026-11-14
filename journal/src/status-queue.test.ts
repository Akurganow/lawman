import { describe, expect, test } from "bun:test";
import { inproc } from "./inproc";
import { lines } from "./input-test-fixture";
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

describe("status queue lines", () => {
	test("one line per role with open orders, by role name, before the order lines", () => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "investigation", { issue: 5, at: later(2) });
			order(d, "main", "clerk", { issue: 2, at: later(1) });
			order(d, "main", "clerk", { issue: 1, at: BASE });
			order(d, "main", "clerk", { issue: 3, at: later(3), takenAt: later(4) });
			order(d, "main", "court", { issue: 9, at: BASE, outcome: "silent" });
		});
		const out = lines(call(BASE, ["status"]).out);
		const kinds = out.map((l) => l.split(" ")[0]);
		expect(out.filter((l) => l.startsWith("queue "))).toEqual([
			`queue clerk 3 oldest ${BASE}`,
			`queue investigation 1 oldest ${later(2)}`,
		]);
		const first = kinds.indexOf("order");
		expect(kinds.slice(0, first)).toContain("queue");
		expect(kinds.slice(first)).toEqual(Array(4).fill("order"));
	});

	test("no open order, no queue line", () => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "court", { issue: 9, outcome: "silent" });
		});
		expect(call(BASE, ["status"]).out).not.toContain("queue");
	});

	test("in process, status prints the queue line and intake needs --issue", () => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "clerk", { issue: 1, at: BASE });
		});
		expect(lines(inproc(BASE, ["status"]).out)).toContain(
			`queue clerk 1 oldest ${BASE}`,
		);
		const intake = inproc(BASE, ["intake", "main"]);
		expect(intake.code).toBe(1);
		expect(intake.err).toContain(
			"usage: journal intake <precinct> --issue <n>",
		);
	});
});

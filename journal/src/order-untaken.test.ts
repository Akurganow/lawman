import { describe, expect, test } from "bun:test";
import {
	alarm,
	BASE,
	later,
	order,
	precinct,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

const orderUntaken = (clock: string) =>
	alarm(clock)
		.out.split("\n")
		.filter((l) => l.includes("order-untaken"));

describe("the order-untaken alarm", () => {
	test.each([
		["a minute", later(0, 60)],
		["a day", later(24)],
		["a year", later(24 * 365)],
	])("an untaken order raises nothing after %s", (_age, clock) => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "clerk", { issue: 1 });
			order(d, "main", "patrol", { department: "claims" });
		});
		expect(orderUntaken(clock)).toEqual([]);
	});

	test("a taken order raises it only after more than 24 hours since the take", () => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "clerk", { issue: 1, takenAt: BASE });
		});
		expect(orderUntaken(later(23))).toEqual([]);
		expect(orderUntaken(later(24))).toEqual([]);
		expect(orderUntaken(later(24, 1))).toEqual([
			`ALARM order-untaken 1 main clerk taken ${BASE}`,
		]);
	});

	test("the alarm holds until the order is taken again or closed", () => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "clerk", { issue: 1, takenAt: BASE });
		});
		orderUntaken(later(25));
		expect(orderUntaken(later(26))).toEqual([]);
		expect(
			rows("SELECT cleared_at FROM alarms WHERE kind = 'order-untaken'"),
		).toEqual([{ cleared_at: null }]);
		seed((d) =>
			d.run("UPDATE dispatches SET taken_at = ? WHERE id = 1", [later(26)]),
		);
		orderUntaken(later(27));
		expect(
			rows("SELECT cleared_at FROM alarms WHERE kind = 'order-untaken'"),
		).toEqual([{ cleared_at: later(27) }]);
	});

	test("a closed order raises nothing however old its take", () => {
		seed((d) => {
			precinct(d, "main");
			order(d, "main", "clerk", { issue: 1, takenAt: BASE, outcome: "silent" });
		});
		expect(orderUntaken(later(100))).toEqual([]);
	});
});

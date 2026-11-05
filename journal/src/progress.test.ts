import { describe, expect, test } from "bun:test";
import { inprocAsync } from "./inproc";
import { CONFIG, config, installation } from "./input-test-fixture";
import {
	alarm,
	BASE,
	call,
	order,
	precinct,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

const DETAIL =
	"ALARM no-progress clerk checks found a takeable order and the role took none";
const OPEN = "SELECT checks FROM roles WHERE name = 'clerk'";

function setUp(extra = "", roleRow = true) {
	installation(`${CONFIG}${extra}`);
	seed((d) => {
		precinct(d, "main");
		order(d, "main", "clerk", { issue: 1 });
		if (roleRow)
			d.run("INSERT INTO roles (name, every_minutes) VALUES ('clerk', 30)");
	});
}

const wake = (role = "clerk") => inprocAsync(BASE, ["wake", "--role", role]);
async function wakes(n: number, role = "clerk") {
	for (let i = 0; i < n; i++) await wake(role);
}
const raised = () => alarm(BASE).out.includes(DETAIL);

describe("the no-progress alarm", () => {
	test("fires at 3 checks that found an order, not at 2", async () => {
		setUp();
		await wakes(2);
		expect(rows(OPEN)).toEqual([{ checks: 2 }]);
		expect(raised()).toBe(false);
		await wakes(1);
		expect(alarm(BASE).out).toBe(`${DETAIL}\n`);
	});

	test("the alarm stays open while the checks go on and prints once", async () => {
		setUp();
		await wakes(3);
		expect(raised()).toBe(true);
		await wakes(1);
		expect(alarm(BASE).out).toBe("");
		expect(
			rows("SELECT cleared_at FROM alarms WHERE kind = 'no-progress'"),
		).toEqual([{ cleared_at: null }]);
	});

	test("a check that finds no order resets the count", async () => {
		setUp();
		await wakes(2);
		seed((d) => d.run("UPDATE dispatches SET outcome = 'silent' WHERE id = 1"));
		await wakes(1);
		expect(rows(OPEN)).toEqual([{ checks: 0 }]);
		seed((d) => order(d, "main", "clerk", { issue: 2 }));
		await wakes(2);
		expect(raised()).toBe(false);
		await wakes(1);
		expect(raised()).toBe(true);
	});

	test("the take of an order resets the count and clears the alarm", async () => {
		setUp();
		await wakes(3);
		expect(raised()).toBe(true);
		const taken = await inprocAsync(BASE, [
			"tick",
			"start",
			"--role",
			"clerk",
			"--order",
			"1",
		]);
		expect(taken.code).toBe(0);
		expect(rows(OPEN)).toEqual([{ checks: 0 }]);
		expect(alarm(BASE).out).toBe("");
		expect(
			rows("SELECT cleared_at FROM alarms WHERE kind = 'no-progress'"),
		).toEqual([{ cleared_at: BASE }]);
	});

	test.each([
		["progress_checks: 2\n", 2],
		["progress_checks: 5\n", 5],
		["progress_checks: 0\n", 3],
		["progress_checks: many\n", 3],
	])("%p changes the count N to %p", async (line, n) => {
		setUp(line);
		await wakes(n - 1);
		expect(raised()).toBe(false);
		await wakes(1);
		expect(raised()).toBe(true);
	});

	test("the setting acts at the next calculation of the alarms", async () => {
		setUp();
		await wakes(2);
		config(`${CONFIG}progress_checks: 2\n`);
		expect(raised()).toBe(true);
	});

	test("the print of a part by tick input does not count", async () => {
		setUp();
		await wakes(2);
		for (let i = 0; i < 4; i++)
			expect(
				call(BASE, ["tick", "input", "--role", "clerk", "--part", "1"]).code,
			).toBe(0);
		expect(rows(OPEN)).toEqual([{ checks: 2 }]);
		expect(raised()).toBe(false);
	});

	test("the duty desk wake does not count", async () => {
		setUp();
		seed((d) =>
			d.run("INSERT INTO roles (name, every_minutes) VALUES ('duty-desk', 30)"),
		);
		await wakes(6, "duty-desk");
		expect(rows("SELECT checks FROM roles WHERE name = 'duty-desk'")).toEqual([
			{ checks: 0 },
		]);
		expect(alarm(BASE).out).not.toContain("no-progress");
	});

	test("a role without a row has no count and no alarm", async () => {
		setUp("", false);
		await wakes(5);
		expect(rows("SELECT * FROM roles")).toEqual([]);
		expect(alarm(BASE).out).toBe("");
	});
});

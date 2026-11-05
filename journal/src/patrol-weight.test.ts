import { describe, expect, test } from "bun:test";
import { inproc, inprocAsync, inprocFed } from "./inproc";
import { CONFIG, installation, lines } from "./input-test-fixture";
import { BASE, call, order, rows, seed, tempDb } from "./test-helpers";

tempDb();

// one part holds the law and the orders, so the wake prints both
const WHOLE = "input_chars: 1000000\n";
const WEIGHTS = { a: 4, b: 3, c: 2 };

function setUp(weights: Record<string, number>, more = "") {
	installation(`${CONFIG}${WHOLE}${more}`);
	seed((d) => {
		for (const [name, weight] of Object.entries(weights))
			d.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [
				name,
				`o/${name}`,
				weight,
			]);
	});
}

const orderLines = (out: string) =>
	lines(out).filter((l) => l.startsWith("order "));

// One visit as the harness runs it: wake, take the first order, end the tick with the order, write the next order.
async function visit(n: number): Promise<string> {
	const woke = await inprocAsync(BASE, ["wake", "--role", "patrol"]);
	const [id, precinct] = orderLines(woke.out)[0]?.split(" ").slice(1) ?? [];
	expect(id).toBeDefined();
	const started = await inprocAsync(BASE, [
		"tick",
		"start",
		"--role",
		"patrol",
		"--order",
		String(id),
	]);
	expect(started.code).toBe(0);
	expect(lines(started.out)[0]).toContain(`tick=${n}`);
	const ended = await inprocFed(
		BASE,
		["tick", "end", String(n), "--outcome", "silent", "--dispatch", String(id)],
		"report",
	);
	expect(ended.code).toBe(0);
	const next = inproc(BASE, [
		"dispatch",
		"add",
		"--precinct",
		String(precinct),
		"--role",
		"patrol",
		"--department",
		"claims",
	]);
	expect(next.code).toBe(0);
	return String(precinct);
}

describe("patrol takes by weight", () => {
	test("weights 4/3/2 over nine takes give each precinct 4, 3 and 2 visits", async () => {
		setUp(WEIGHTS);
		seed((d) => {
			for (const name of Object.keys(WEIGHTS))
				order(d, name, "patrol", { department: "claims" });
		});
		const picks: string[] = [];
		for (let n = 1; n <= 9; n++) picks.push(await visit(n));
		const tally = (list: string[]) =>
			Object.fromEntries(
				Object.keys(WEIGHTS).map((p) => [
					p,
					list.filter((x) => x === p).length,
				]),
			);
		expect(tally(picks)).toEqual(WEIGHTS);
		for (let n = 10; n <= 18; n++) picks.push(await visit(n));
		expect(tally(picks.slice(9))).toEqual(WEIGHTS);
		expect(
			rows(
				"SELECT precinct FROM dispatches WHERE outcome IS NULL ORDER BY precinct",
			),
		).toEqual([{ precinct: "a" }, { precinct: "b" }, { precinct: "c" }]);
	});

	test("the take moves the credit: every admitted precinct gains its weight, the taken one loses the sum", async () => {
		setUp(WEIGHTS);
		seed((d) => {
			for (const name of Object.keys(WEIGHTS))
				order(d, name, "patrol", { department: "claims" });
		});
		expect(await visit(1)).toBe("a");
		expect(rows("SELECT name, credit FROM precincts ORDER BY name")).toEqual([
			{ name: "a", credit: 4 - 9 },
			{ name: "b", credit: 3 },
			{ name: "c", credit: 2 },
		]);
	});
});

describe("patrol takes by credit plus weight", () => {
	// the names run against the weights, so neither the name nor the order id nor the credit alone gives the list
	test("the wake lists the precinct with the larger credit plus weight first, and its take moves the credit", () => {
		setUp({ a: 1, z: 4 }, "jobs: patrol=2\n");
		seed((d) => {
			order(d, "a", "patrol", { department: "claims" });
			order(d, "z", "patrol", { department: "claims" });
		});
		expect(rows("SELECT name, credit FROM precincts ORDER BY name")).toEqual([
			{ name: "a", credit: 0 },
			{ name: "z", credit: 0 },
		]);
		const woke = call(BASE, ["wake", "--role", "patrol"]);
		expect(orderLines(woke.out).map((l) => l.split(" ").slice(1, 3))).toEqual([
			["2", "z"],
			["1", "a"],
		]);
		const r = call(BASE, ["tick", "start", "--role", "patrol", "--order", "2"]);
		expect(r.code).toBe(0);
		expect(rows("SELECT name, credit FROM precincts ORDER BY name")).toEqual([
			{ name: "a", credit: 1 },
			{ name: "z", credit: 4 - 5 },
		]);
	});
});

describe("a patrol order of a precinct whose weight became 0", () => {
	function weightless() {
		setUp({ main: 1 });
		seed((d) => {
			order(d, "main", "patrol", { department: "claims" });
			order(d, "main", "investigation", { issue: 3 });
			d.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 30)");
			d.run("UPDATE roles SET checks = 2 WHERE name = 'patrol'");
		});
		expect(call(BASE, ["precinct", "set", "main", "--weight", "0"]).code).toBe(
			0,
		);
	}

	test("the wake does not list it, the group has no order of it and the wake resets the count", () => {
		weightless();
		const r = call(BASE, ["wake", "--role", "patrol"]);
		expect(r).toMatchObject({ code: 0, out: "" });
		expect(rows("SELECT checks FROM roles WHERE name = 'patrol'")).toEqual([
			{ checks: 0 },
		]);
		const group = call(BASE, [
			"tick",
			"input",
			"--role",
			"patrol",
			"--part",
			"1",
		]);
		expect(orderLines(group.out)).toEqual([]);
	});

	test("the start of the tick prints untakeable, takes nothing and writes no tick", () => {
		weightless();
		const r = call(BASE, ["tick", "start", "--role", "patrol", "--order", "1"]);
		expect(r).toMatchObject({ code: 0, out: "order 1 untakeable\n" });
		expect(
			rows("SELECT taken_at, outcome FROM dispatches WHERE id = 1"),
		).toEqual([{ taken_at: null, outcome: null }]);
		expect(rows("SELECT id FROM ticks")).toEqual([]);
	});

	test("an order of another role on that precinct is still takeable", () => {
		weightless();
		const woke = call(BASE, ["wake", "--role", "investigation"]);
		expect(orderLines(woke.out)).toEqual(["order 2 main o/main - 3"]);
		const r = call(BASE, [
			"tick",
			"start",
			"--role",
			"investigation",
			"--order",
			"2",
		]);
		expect(r.out).not.toContain("untakeable");
		expect(rows("SELECT taken_at FROM dispatches WHERE id = 2")).toEqual([
			{ taken_at: BASE },
		]);
	});
});

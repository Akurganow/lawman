import { beforeEach, describe, expect, test } from "bun:test";
import { cache, due, handed, human, order, put, T } from "./cases-fixture";
import { addPrecincts, mark, SHA, seed, tempDb } from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1, side: 1 }));

describe("due for the clerk", () => {
	test("an issue without a lead is a candidate", () => {
		put({ 1: human("OPEN") });
		cache([7, [1]]);
		expect(due("clerk")).toBe("main\t1\n");
	});
});

const priorityOnly = (priority: string) =>
	mark("court", "conviction", ` sha=${SHA} priority=${priority}`);
const pulls = (...rows: [number, number[], string, string?][]) =>
	seed((db) => {
		db.run("DELETE FROM pulls");
		for (const [number, issues, spec, work] of rows)
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec, work) VALUES ('main', ?, ?, ?, ?)",
				[number, issues.join(","), spec, work ?? "todo"],
			);
	});

const expectP0First = (role: string, spec: string) => {
	put({
		1: handed(7),
		2: handed(8, priorityOnly("P3")),
		3: handed(8, priorityOnly("P0")),
	});
	pulls([7, [1], spec], [8, [2, 3], spec]);
	expect(due(role)).toBe("main\t8\n");
};

describe("due for the spec-writer", () => {
	test("the best source priority puts P0 first", () => {
		expectP0First("spec-writer", "none");
	});
});

describe("due for the executor", () => {
	test("the two roles never pick each other's pull request", () => {
		put({ 1: handed(7), 2: handed(8) });
		pulls([7, [1], "none"], [8, [2], "up"]);
		expect(due("spec-writer")).toBe("main\t7\n");
		expect(due("executor")).toBe("main\t8\n");
	});

	test("spec-writer orders do not move the executor rotation and vice versa", () => {
		put({ 1: handed(7), 2: handed(8), 3: handed(9), 4: handed(10) });
		pulls([7, [1], "up"], [8, [2], "up"], [9, [3], "none"], [10, [4], "none"]);
		order("spec-writer", 9, T(8));
		expect(due("executor")).toBe("main\t7\n");
		expect(due("spec-writer")).toBe("main\t10\n");
		order("executor", 7, T(9));
		expect(due("executor")).toBe("main\t8\n");
		expect(due("spec-writer")).toBe("main\t10\n");
	});

	test("an open executor order does not silence the entry or the other role", () => {
		put({ 1: handed(7), 2: handed(8) });
		pulls([7, [1], "up"], [8, [2], "none"]);
		order("executor", 7, T(8), true);
		expect(due("executor")).toBe("main\t7\n");
		expect(due("spec-writer")).toBe("main\t8\n");
	});
});

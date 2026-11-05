import { beforeEach, describe, expect, test } from "bun:test";
import {
	cache,
	convicted,
	due,
	handed,
	human,
	order,
	put,
	T,
} from "./cases-fixture";
import { addPrecincts, lead, seed, tempDb } from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1, side: 1 }));

describe("due in process: issues", () => {
	test("an issue without a lead is a clerk candidate", () => {
		put({ 4: human("OPEN"), 5: human("OPEN") });
		cache([7, [4]]);
		expect(due("clerk")).toBe("main\t4\n");
	});

	test("the best conviction priority comes first, rotation breaks a tie", () => {
		put({ 1: convicted("P2"), 2: convicted("P0"), 3: convicted("P0") });
		expect(due("clerk")).toBe("main\t2\n");
		order("clerk", 2, T(8));
		expect(due("clerk")).toBe("main\t3\n");
	});

	test("an open order of the role does not silence the entry", () => {
		put({ 1: convicted("P2") });
		order("clerk", 1, T(8), true);
		expect(due("clerk")).toBe("main\t1\n");
	});

	test("another role reads the lead origin only", () => {
		put({ 1: { body: [lead()] }, 2: human("OPEN") });
		expect(due("investigation")).toBe("main\t1\n");
	});
});

describe("due in process: spec-writer", () => {
	test("a handed pull request without a spec vote is due", () => {
		put({ 1: handed(7) });
		cache([7, [1], "none"]);
		expect(due("spec-writer")).toBe("main\t7\n");
	});

	test("a pull request with a waiting spec is not due", () => {
		put({ 1: handed(7) });
		cache([7, [1], "waiting"]);
		expect(due("spec-writer")).toBe("");
	});

	test("an open spec-writer order does not silence the entry", () => {
		put({ 1: handed(7) });
		cache([7, [1], "down"]);
		order("spec-writer", 7, T(8), true);
		expect(due("spec-writer")).toBe("main\t7\n");
	});
});

describe("due in process: executor", () => {
	const approved = (...numbers: number[]) =>
		seed((db) => {
			db.run("DELETE FROM pulls");
			for (const number of numbers)
				db.run(
					"INSERT INTO pulls (precinct, number, issues, spec) VALUES ('main', ?, ?, 'up')",
					[number, String(number - 6)],
				);
		});

	test("an approved pull request with open work is due", () => {
		put({ 1: handed(7) });
		approved(7);
		expect(due("executor")).toBe("main\t7\n");
		expect(due("spec-writer")).toBe("");
	});

	test("an executor order rotates the role and an open one does not silence it", () => {
		put({ 1: handed(7), 2: handed(8) });
		approved(7, 8);
		order("executor", 7, T(8));
		expect(due("executor")).toBe("main\t8\n");
		order("executor", 8, T(9), true);
		expect(due("executor")).toBe("main\t7\n");
	});
});

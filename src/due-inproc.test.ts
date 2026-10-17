import { beforeEach, describe, expect, test } from "bun:test";
import {
	cache,
	convicted,
	dueOut,
	handed,
	human,
	order,
	put,
	T,
} from "./cases-fixture";
import { dueCommand } from "./due";
import { captured, inproc } from "./inproc";
import { addPrecincts, BASE, lead, tempDb } from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1, side: 1 }));

const dueIn = (role: string, ...exclude: string[]) =>
	dueOut((args) => inproc(BASE, args), role, exclude);

describe("due in process: issues", () => {
	test("an issue without a lead is a clerk candidate", () => {
		put({ 4: human("OPEN"), 5: human("OPEN") });
		cache([7, [4]]);
		expect(dueIn("clerk")).toBe("main\t4\n");
	});

	test("the best conviction priority comes first, rotation breaks a tie", () => {
		put({ 1: convicted("P2"), 2: convicted("P0"), 3: convicted("P0") });
		expect(dueIn("clerk")).toBe("main\t2\n");
		order("clerk", 2, T(8));
		expect(dueIn("clerk")).toBe("main\t3\n");
	});

	test("--exclude drops precincts and an open order silences the role", () => {
		put({ 1: convicted("P2") });
		expect(dueIn("clerk", "main")).toBe("");
		expect(dueIn("clerk", "side")).toBe("main\t1\n");
		order("clerk", 1, T(8), true);
		expect(dueIn("clerk")).toBe("");
	});

	test("another role reads the lead origin only", () => {
		put({ 1: { body: [lead()] }, 2: human("OPEN") });
		expect(dueIn("investigation")).toBe("main\t1\n");
	});

	test("a bad --exclude value or a missing one is a usage error", () => {
		expect(
			inproc(BASE, ["due", "--role", "clerk", "--exclude", "Bad"]).code,
		).toBe(1);
		expect(
			captured(BASE, () => dueCommand(["--role", "clerk", "--exclude"])).code,
		).toBe(1);
	});
});

describe("due in process: spec-writer", () => {
	test("a handed pull request without a spec vote is due", () => {
		put({ 1: handed(7) });
		cache([7, [1], "none"]);
		expect(dueIn("spec-writer")).toBe("main\t7\n");
		expect(dueIn("spec-writer", "main")).toBe("");
	});

	test("a pull request with a waiting spec is not due", () => {
		put({ 1: handed(7) });
		cache([7, [1], "waiting"]);
		expect(dueIn("spec-writer")).toBe("");
	});

	test("an open spec-writer order silences the role", () => {
		put({ 1: handed(7) });
		cache([7, [1], "down"]);
		order("spec-writer", 7, T(8), true);
		expect(dueIn("spec-writer")).toBe("");
	});
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
	cache,
	convicted,
	dueOut,
	handed,
	human,
	order,
	pairMark,
	put,
	T,
	withLead,
} from "./cases-fixture";
import {
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	conviction,
	defence,
	lead,
	mark,
	SHA,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1, side: 1 }));

const due = (role: string, ...exclude: string[]) =>
	dueOut((args) => call(BASE, args), role, exclude);

describe("due --role clerk", () => {
	test("an issue without a lead is a candidate", () => {
		put({ 1: human("OPEN") });
		cache([7, [1]]);
		expect(due("clerk")).toBe("main\t1\n");
	});

	test("the newest conviction priority puts P0 before a lower number", () => {
		put({ 1: convicted("P2"), 2: convicted("P0"), 3: convicted("P1") });
		expect(due("clerk")).toBe("main\t2\n");
	});

	test("P1 comes before P2 and P3", () => {
		put({ 1: convicted("P3"), 2: convicted("P2"), 3: convicted("P1") });
		expect(due("clerk")).toBe("main\t3\n");
	});

	test("a conviction without a priority reads P2", () => {
		put({
			1: convicted("P3"),
			2: withLead(caseMark(), charge(), defence(), conviction()),
		});
		expect(due("clerk")).toBe("main\t2\n");
	});

	test("rotation breaks a tie inside one priority", () => {
		put({ 1: convicted("P0"), 2: convicted("P0") });
		order("clerk", 1, T(8));
		expect(due("clerk")).toBe("main\t2\n");
	});

	test("the lowest number breaks the last tie", () => {
		put({ 3: convicted("P1"), 2: convicted("P1") });
		expect(due("clerk")).toBe("main\t2\n");
	});

	test("an open clerk order silences the role", () => {
		put({ 1: convicted("P0") });
		order("clerk", 1, T(8), true);
		expect(due("clerk")).toBe("");
	});

	test("one or several --exclude flags drop precincts", () => {
		put({ 1: convicted("P2") });
		expect(due("clerk", "main")).toBe("");
		expect(due("clerk", "side", "main")).toBe("");
		expect(due("clerk", "side")).toBe("main\t1\n");
	});

	test("--exclude applies to any role", () => {
		put({ 1: { body: [lead()] } });
		expect(due("investigation")).toBe("main\t1\n");
		expect(due("investigation", "main")).toBe("");
	});

	test("--exclude takes a precinct name only and needs a value", () => {
		expect(
			call(BASE, ["due", "--role", "clerk", "--exclude", "Bad"]).code,
		).toBe(1);
		expect(call(BASE, ["due", "--role", "clerk", "--exclude"]).code).toBe(1);
	});
});

const priorityOnly = (priority: string) =>
	mark("court", "conviction", ` sha=${SHA} priority=${priority}`);
const pulls = (...rows: [number, number[], string][]) =>
	seed((db) => {
		db.run("DELETE FROM pulls");
		for (const [number, issues, spec] of rows)
			db.run("INSERT INTO pulls VALUES ('main', ?, ?, ?)", [
				number,
				issues.join(","),
				spec,
			]);
	});

describe("due --role spec-writer", () => {
	test.each([
		["none", "main\t7\n"],
		["down", "main\t7\n"],
		["waiting", ""],
		["up", ""],
	])("spec %s", (spec, expected) => {
		put({ 1: handed(7) });
		pulls([7, [1], spec]);
		expect(due("spec-writer")).toBe(expected);
	});

	test.each([
		["a source whose pair marker names another pull request", handed(8)],
		[
			"a source whose base is not handed",
			human("OPEN", pairMark("shut", 7, "closed")),
		],
	])("%s does not count", (_name, source) => {
		put({ 1: source });
		pulls([7, [1], "none"]);
		expect(due("spec-writer")).toBe("");
	});

	test("one handed source among several is enough", () => {
		put({ 1: human("OPEN"), 2: handed(7) });
		pulls([7, [1, 2], "none"]);
		expect(due("spec-writer")).toBe("main\t7\n");
	});

	test("a kept marker leaves the base handed", () => {
		put({ 1: handed(7, pairMark("kept", 7, "open")) });
		pulls([7, [1], "none"]);
		expect(due("spec-writer")).toBe("main\t7\n");
	});

	test("a precinct of weight zero has no candidate", () => {
		put({ 1: handed(7) });
		pulls([7, [1], "none"]);
		expect(call(BASE, ["precinct", "set", "main", "--weight", "0"]).code).toBe(
			0,
		);
		expect(due("spec-writer")).toBe("");
	});

	test("the best source priority puts P0 first", () => {
		put({
			1: handed(7),
			2: handed(8, priorityOnly("P3")),
			3: handed(8, priorityOnly("P0")),
		});
		pulls([7, [1], "none"], [8, [2, 3], "none"]);
		expect(due("spec-writer")).toBe("main\t8\n");
	});

	test("rotation breaks a tie, then the lowest number", () => {
		put({ 1: handed(7), 2: handed(8), 3: handed(9) });
		pulls([9, [3], "none"], [8, [2], "none"], [7, [1], "none"]);
		expect(due("spec-writer")).toBe("main\t7\n");
		order("spec-writer", 7, T(8));
		expect(due("spec-writer")).toBe("main\t8\n");
	});

	test("an open spec-writer order silences the role", () => {
		put({ 1: handed(7) });
		pulls([7, [1], "none"]);
		order("spec-writer", 7, T(8), true);
		expect(due("spec-writer")).toBe("");
	});

	test("--exclude drops a precinct, one or several", () => {
		put({ 1: handed(7) });
		pulls([7, [1], "none"]);
		expect(due("spec-writer", "main")).toBe("");
		expect(due("spec-writer", "side", "main")).toBe("");
		expect(due("spec-writer", "side")).toBe("main\t7\n");
	});
});

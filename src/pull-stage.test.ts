import { beforeEach, describe, expect, test } from "bun:test";
import { handed, human, put } from "./cases-fixture";
import { inproc } from "./inproc";
import {
	addPrecincts,
	BASE,
	call,
	mark,
	SHA,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const pull = (...args: string[]) => call(BASE, ["pull", ...args]);
const cached = (number: number, issues: number[], spec: string) =>
	seed((db) =>
		db.run("INSERT INTO pulls VALUES ('main', ?, ?, ?)", [
			number,
			issues.join(","),
			spec,
		]),
	);
const priority = (value: string) =>
	mark("court", "conviction", ` sha=${SHA} priority=${value}`);

describe("pull", () => {
	test.each([
		["none", "spec-writer"],
		["down", "spec-writer"],
		["waiting", "none"],
		["up", "none"],
	])("a handed pull request with spec %s needs %s", (spec, need) => {
		put({ 3: handed(7), 4: handed(7) });
		cached(7, [3, 4], spec);
		expect(pull("main", "7")).toMatchObject({
			code: 0,
			out: `need=${need} spec=${spec} sources=3,4 priority=P2\n`,
		});
	});

	test("a pull request without a handed source needs nobody", () => {
		put({ 3: human("OPEN"), 4: handed(8) });
		cached(7, [3, 4], "none");
		expect(pull("main", "7").out).toBe(
			"need=none spec=none sources=3,4 priority=P2\n",
		);
	});

	test("a pull request without sources needs nobody and prints a dash", () => {
		cached(7, [], "none");
		expect(pull("main", "7").out).toBe(
			"need=none spec=none sources=- priority=P2\n",
		);
	});

	test("the priority is the best among the sources", () => {
		put({ 3: handed(7, priority("P3")), 4: human("OPEN", priority("P1")) });
		cached(7, [3, 4], "none");
		expect(pull("main", "7").out).toBe(
			"need=spec-writer spec=none sources=3,4 priority=P1\n",
		);
	});

	test("a precinct of weight zero needs nobody", () => {
		put({ 3: handed(7) });
		cached(7, [3], "none");
		call(BASE, ["precinct", "set", "main", "--weight", "0"]);
		expect(pull("main", "7").out).toStartWith("need=none spec=none");
	});

	test("a pull request missing from the cache is stale", () => {
		expect(pull("main", "9")).toMatchObject({
			code: 0,
			out: "need=none spec=- sources=- priority=P2\n",
		});
		expect(pull("nowhere", "9").out).toBe(
			"need=none spec=- sources=- priority=P2\n",
		);
	});

	test("bad arguments exit 1", () => {
		expect(pull("main").code).toBe(1);
		expect(pull("main", "7", "8").code).toBe(1);
		expect(pull("main", "x").code).toBe(1);
		expect(pull("main", "0").code).toBe(1);
		expect(pull("Main", "7").code).toBe(1);
	});
});

describe("pull in process", () => {
	const inPull = (...args: string[]) => inproc(BASE, ["pull", ...args]);

	test("a handed pull request needs the spec writer", () => {
		put({ 3: handed(7, priority("P1")) });
		cached(7, [3], "down");
		expect(inPull("main", "7")).toMatchObject({
			code: 0,
			out: "need=spec-writer spec=down sources=3 priority=P1\n",
		});
	});

	test("a settled spec, a missing pull request and no sources need nobody", () => {
		put({ 3: handed(7) });
		cached(7, [3], "up");
		cached(8, [], "none");
		expect(inPull("main", "7").out).toStartWith("need=none spec=up");
		expect(inPull("main", "8").out).toBe(
			"need=none spec=none sources=- priority=P2\n",
		);
		expect(inPull("main", "9").out).toBe(
			"need=none spec=- sources=- priority=P2\n",
		);
	});

	test("bad arguments exit 1", () => {
		expect(inPull("main").code).toBe(1);
		expect(inPull("main", "0").code).toBe(1);
		expect(inPull("Main", "7").code).toBe(1);
	});
});

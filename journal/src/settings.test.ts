import { describe, expect, test } from "bun:test";
import { jobsOf, PROGRESS_CHECKS, progressChecks } from "./settings";

const DEFAULT_JOBS: Record<string, number> = {
	patrol: 1,
	"response-unit": 2,
	investigation: 1,
	prosecutor: 1,
	defender: 1,
	court: 1,
	clerk: 3,
	"spec-writer": 1,
	executor: 1,
};

describe("jobsOf", () => {
	test.each([undefined, "none", "", "   "])(
		"%p gives every role its default",
		(value) => {
			for (const [role, n] of Object.entries(DEFAULT_JOBS))
				expect(jobsOf(value, role)).toBe(n);
		},
	);

	test("the pairs of the value set the roles they name, the rest keep their defaults", () => {
		const value = "clerk=5 court=2";
		expect(jobsOf(value, "clerk")).toBe(5);
		expect(jobsOf(value, "court")).toBe(2);
		expect(jobsOf(value, "patrol")).toBe(1);
		expect(jobsOf(value, "response-unit")).toBe(2);
	});

	test("the first readable pair of a role wins", () => {
		expect(jobsOf("clerk=2 clerk=5", "clerk")).toBe(2);
		expect(jobsOf("clerk=0 clerk=5", "clerk")).toBe(5);
		expect(jobsOf("clerk=x clerk=4 clerk=5", "clerk")).toBe(4);
	});

	test.each([
		"clerk=0",
		"clerk=-1",
		"clerk=01",
		"clerk=1.5",
		"clerk=x",
		"clerk=",
		"clerk",
		"=3",
		"clerk=2x",
	])("the pair %p is outside the class, the default stays", (value) => {
		expect(jobsOf(value, "clerk")).toBe(3);
	});

	test("a role outside the nine and __proto__ are not read", () => {
		expect(jobsOf("duty-desk=4 bogus=3 __proto__=5", "duty-desk")).toBe(1);
		expect(jobsOf("bogus=3", "bogus")).toBe(1);
		expect(jobsOf("__proto__=5 constructor=5", "__proto__")).toBe(1);
		expect(jobsOf("__proto__=5 constructor=5", "constructor")).toBe(1);
		expect(jobsOf("__proto__=5 clerk=2", "clerk")).toBe(2);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	test("the pairs split on any run of spaces", () => {
		expect(jobsOf("clerk=2   court=3", "court")).toBe(3);
	});
});

describe("progressChecks", () => {
	test.each([
		[undefined, PROGRESS_CHECKS],
		["5", 5],
		["12", 12],
		["0", PROGRESS_CHECKS],
		["x", PROGRESS_CHECKS],
	])("%p gives %p", (value, expected) => {
		expect(progressChecks(value)).toBe(expected);
	});

	test("the default is 3", () => {
		expect(PROGRESS_CHECKS).toBe(3);
	});
});

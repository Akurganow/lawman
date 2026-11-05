import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { captured } from "./inproc";
import { lawSync } from "./law-sync";
import {
	configOf,
	flags,
	lay,
	OLD_COMMIT,
	put,
	snapshot,
} from "./law-sync-test-fixture";
import { jobsOf, PROGRESS_CHECKS, progressChecks } from "./settings";
import { BASE, dir, tempDb } from "./test-helpers";

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
		["none", PROGRESS_CHECKS],
		["5", 5],
		["12", 12],
		["0", PROGRESS_CHECKS],
		["-2", PROGRESS_CHECKS],
		["2.5", PROGRESS_CHECKS],
		["03", PROGRESS_CHECKS],
		["x", PROGRESS_CHECKS],
	])("%p gives %p", (value, expected) => {
		expect(progressChecks(value)).toBe(expected);
	});

	test("the default is 3", () => {
		expect(PROGRESS_CHECKS).toBe(3);
	});
});

describe("law-sync writes the settings", () => {
	tempDb();
	const JOBS_LINE =
		"jobs: patrol=1 response-unit=2 investigation=1 prosecutor=1 defender=1 court=1 clerk=3 spec-writer=1 executor=1";

	const sync = (root: string, name = "a") => {
		const exe = put(root, `runs/${name}/journal`, "#!/bin/sh\necho new\n");
		const r = captured(BASE, () => lawSync(flags(root), exe));
		expect(r).toMatchObject({ code: 0, err: "" });
	};

	test("a config without the keys receives both with the defaults", () => {
		const root = join(dir, "installation");
		lay(root);
		sync(root);
		const config = configOf(root);
		expect(config).toContain(`\n${JOBS_LINE}\n`);
		expect(config).toContain("\nprogress_checks: 3\n");
		expect(config.indexOf("amended_law_commit")).toBeLessThan(
			config.indexOf(JOBS_LINE),
		);
	});

	test("values already in the config stay", () => {
		const root = join(dir, "installation");
		lay(root, {
			config: `law_commit: ${OLD_COMMIT}\njobs: clerk=9\nprogress_checks: 7\n`,
		});
		sync(root);
		const config = configOf(root);
		expect(config).toContain("\njobs: clerk=9\n");
		expect(config).toContain("\nprogress_checks: 7\n");
		expect(config).not.toContain(JOBS_LINE);
		expect(config.match(/^jobs:/gm)?.length).toBe(1);
		expect(config.match(/^progress_checks:/gm)?.length).toBe(1);
	});

	test("a second run changes nothing", () => {
		const root = join(dir, "installation");
		lay(root);
		sync(root, "a");
		const after = configOf(root);
		const files = snapshot(root);
		sync(root, "a");
		expect(configOf(root)).toBe(after);
		const { "runs/a/journal": _same, ...rest } = snapshot(root);
		const { "runs/a/journal": _was, ...before } = files;
		expect(rest).toEqual(before);
	});
});

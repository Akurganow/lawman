import { describe, expect, test } from "bun:test";
import { MIGRATIONS } from "./db";
import { captured, inproc } from "./inproc";
import { lawSync } from "./law-sync";
import { defineCases } from "./law-sync-test-cases";
import { flags, lay, put, type Runner } from "./law-sync-test-fixture";
import { BASE, dir, tempDb } from "./test-helpers";

const FIXTURE_EXECUTABLE = "#!/bin/sh\necho new journal\n";

// The fixture file stands in for the executable, so the swap never renames the runtime.
const runner: Runner = {
	exe: (root, name) => put(root, `runs/${name}/journal`, FIXTURE_EXECUTABLE),
	run(args, exe, path) {
		const saved = process.env.PATH;
		if (path !== undefined) process.env.PATH = path;
		try {
			return captured(BASE, () => lawSync(args, exe));
		} finally {
			if (saved === undefined) delete process.env.PATH;
			else process.env.PATH = saved;
		}
	},
};

describe("law-sync in process", () => {
	defineCases(runner);
});

describe("law-sync through the journal entry point", () => {
	tempDb();

	test("is a registered command that reports usage on a missing flag", () => {
		const result = inproc(BASE, ["law-sync"]);
		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).toContain(
			"usage: journal law-sync --tag <tag> --commit <commit> --installation <folder>",
		);
	});

	test("ends with the schema exit before it can touch the runtime", () => {
		lay(dir, { schemas: [MIGRATIONS.length + 1] });
		const result = inproc(BASE, ["law-sync", ...flags(dir)]);
		expect(result).toMatchObject({ code: 6, out: "" });
	});
});

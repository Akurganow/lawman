import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./test-helpers";

// The Hermes plugin scanner rates this inline-shell form high and blocks the
// update (read in the harness code). The class [`] keeps this file clean.
const INLINE_SHELL = /![`][^`\s][^`\n]*[`]/;

test("no shipped file holds the inline-shell form the scanner blocks", () => {
	const files = execFileSync("git", ["ls-files"], {
		cwd: ROOT,
		encoding: "utf8",
	})
		.split("\n")
		.filter((f) => f !== "");
	const hits = files.filter((f) =>
		INLINE_SHELL.test(readFileSync(join(ROOT, f), "utf8")),
	);
	expect(hits).toEqual([]);
});

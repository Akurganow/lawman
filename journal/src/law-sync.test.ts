import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defineCases } from "./law-sync-test-cases";
import {
	configOf,
	flags,
	lay,
	leftovers,
	type Runner,
} from "./law-sync-test-fixture";
import { dir, JOURNAL, tempDb } from "./test-helpers";

const COMPILE_TIMEOUT_MS = 120_000;
const scratch = mkdtempSync(join(tmpdir(), "lawman-compiled-"));
const compiled = join(scratch, "journal");

beforeAll(() => {
	const build = Bun.spawnSync(
		["bun", "build", "--compile", "src/journal.ts", "--outfile", compiled],
		{ cwd: JOURNAL },
	);
	expect(build.exitCode).toBe(0);
}, COMPILE_TIMEOUT_MS);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const env = (path = process.env.PATH ?? "") => ({ PATH: path });

// A copy of the compiled binary, so the swap renames the copy and never the runtime.
const runner: Runner = {
	exe(root, name) {
		const path = join(root, "runs", name, "journal");
		mkdirSync(dirname(path), { recursive: true });
		copyFileSync(compiled, path);
		return path;
	},
	run(args, exe, path) {
		const r = Bun.spawnSync([exe, "law-sync", ...args], { env: env(path) });
		return {
			code: r.exitCode,
			out: r.stdout.toString(),
			err: r.stderr.toString(),
		};
	},
};

describe("law-sync through the compiled binary", () => {
	defineCases(runner);
});

describe("law-sync, CLI only", () => {
	tempDb();

	test("two compiled copies run at once end in the state of one run", async () => {
		const root = join(dir, "installation");
		const reference = join(dir, "reference");
		lay(root);
		lay(reference);
		const copies = [runner.exe(root, "a"), runner.exe(root, "b")];
		const procs = copies.map((exe) =>
			Bun.spawn([exe, "law-sync", ...flags(root)], {
				env: env(),
				stdout: "pipe",
				stderr: "pipe",
			}),
		);
		expect(await Promise.all(procs.map((p) => p.exited))).toEqual([0, 0]);
		expect(runner.run(flags(reference), runner.exe(reference, "c")).code).toBe(
			0,
		);
		expect(configOf(root)).toBe(configOf(reference));
		expect(
			readFileSync(join(root, "bin", "journal")).equals(readFileSync(compiled)),
		).toBe(true);
		expect(leftovers(root)).toEqual([]);
	});

	test("the source names no network, version-control or process word", () => {
		const source = readFileSync(join(JOURNAL, "src", "law-sync.ts"), "utf8");
		expect(source).not.toMatch(/\b(fetch|http|git|gh|spawn|child_process)\b/i);
	});
});

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { EXIT, Fail, MIGRATIONS } from "./db";
import { inproc, inprocAsync } from "./inproc";
import { COMMANDS } from "./journal";
import { cli, dbFile, dir, harness, JOURNAL, tempDb } from "./test-helpers";

tempDb();

describe("cli", () => {
	test("--version prints the package version", () => {
		const r = cli(["--version"]);
		expect(r.code).toBe(0);
		expect(r.out).toBe(`${pkg.version}\n`);
	});

	test("unknown subcommand exits 1 with usage on stderr", () => {
		const r = cli(["frobnicate"]);
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
		expect(r.err).toContain("usage");
	});

	test("no subcommand exits 1", () => {
		expect(cli([]).code).toBe(1);
	});

	test("database newer than the binary makes a command exit 6", async () => {
		const newer = new Database(dbFile);
		newer.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
		newer.close();
		const p = harness({ LAWMAN_DB: dbFile });
		expect(await p.exited).toBe(6);
		expect(await new Response(p.stderr).text()).toContain("newer");
	});

	test("any command exits 1 when LAWMAN_NOW is set without LAWMAN_DB", () => {
		for (const args of [["--version"], ["probe"], ["frobnicate"]]) {
			const r = cli(args, { LAWMAN_NOW: "2026-01-01T00:00:00Z" });
			expect(r.code).toBe(1);
			expect(r.err.trim().split("\n")).toHaveLength(1);
			expect(r.err).toContain("LAWMAN_NOW");
		}
	});

	test("--version still works with both variables set", () => {
		const r = cli(["--version"], {
			LAWMAN_DB: dbFile,
			LAWMAN_NOW: "2026-01-01T00:00:00Z",
		});
		expect(r.code).toBe(0);
	});

	test("an unexpected error prints one journal line without a stack or source path", () => {
		const r = cli(["alarm"], {
			LAWMAN_DB: join(dir, "missing", "journal.sqlite"),
			LAWMAN_NOW: "2026-01-01T00:00:00Z",
		});
		expect(r.code).toBe(1);
		expect(r.err.trim().split("\n")).toHaveLength(1);
		expect(r.err).toStartWith("journal: ");
		expect(r.err).not.toMatch(/\/src\/journal\.ts/);
	});
});

describe("a command that finishes later", () => {
	const CLOCK = "2026-01-01T00:00:00Z";
	afterEach(() => {
		delete COMMANDS["test-later"];
	});

	test("ends with the exit code its promise resolves to", async () => {
		COMMANDS["test-later"] = async () => EXIT.LINT_BODY;
		expect(await inprocAsync(CLOCK, ["test-later"])).toMatchObject({
			code: EXIT.LINT_BODY,
			err: "",
		});
	});

	test.each([
		["a Fail", () => new Fail(EXIT.LINT_BODY, "boom"), EXIT.LINT_BODY],
		["an Error", () => new Error("boom"), EXIT.USAGE],
	])(
		"a rejection with %s maps to the exit code of the same error thrown",
		async (_, error, code) => {
			COMMANDS["test-later"] = () => {
				throw error();
			};
			const thrown = inproc(CLOCK, ["test-later"]);
			COMMANDS["test-later"] = () => Promise.reject(error());
			const rejected = await inprocAsync(CLOCK, ["test-later"]);
			expect(rejected).toEqual(thrown);
			expect(rejected).toMatchObject({ code, err: "journal: boom\n" });
		},
	);
});

describe("source constraints", () => {
	const LAUNCH = "launch.ts";
	const sources = readdirSync(join(JOURNAL, "src")).filter(
		(f) => f.endsWith(".ts") && !f.includes("test"),
	);
	const source = (file: string) =>
		readFileSync(join(JOURNAL, "src", file), "utf8");

	test("no module of the journal touches the network", () => {
		expect(sources).toContain("journal.ts");
		for (const file of sources)
			for (const banned of [
				"fetch(",
				"node:net",
				"node:http",
				"node:dgram",
				"node:tls",
				"WebSocket",
				"XMLHttpRequest",
				"Bun.connect",
				"Bun.listen",
				"Bun.serve",
			])
				expect(source(file)).not.toContain(banned);
	});

	test("only the launch module starts a process, and only the cleaning starts a worker", () => {
		expect(sources).toContain(LAUNCH);
		for (const file of sources.filter((f) => f !== LAUNCH))
			for (const banned of [
				"spawn",
				"Bun.$",
				"child_process",
				"exec(",
				"Worker(",
			])
				if (!(banned === "Worker(" && file === "clean-run.ts"))
					expect(source(file)).not.toContain(banned);
	});
});

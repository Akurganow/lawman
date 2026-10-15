import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";
import { MIGRATIONS } from "./journal";
import { cli, dbFile, dir, harness, ROOT, tempDb } from "./test-helpers";

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

describe("source constraints", () => {
	test("the journal never starts processes or touches the network", () => {
		const sources = readdirSync(join(ROOT, "src")).filter(
			(f) => f.endsWith(".ts") && !f.includes("test"),
		);
		expect(sources).toContain("journal.ts");
		for (const file of sources) {
			const src = readFileSync(join(ROOT, "src", file), "utf8");
			for (const banned of [
				"spawn",
				"Bun.$",
				"child_process",
				"fetch(",
				"exec(",
			]) {
				expect(src).not.toContain(banned);
			}
		}
	});
});

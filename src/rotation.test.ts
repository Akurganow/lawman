import { beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	cli,
	dbFile,
	dir,
	order,
	precinct,
	ROOT,
	seed,
	tempDb,
} from "./test-helpers";

const PRECINCT = "main";

tempDb();
beforeEach(() => seed((db) => precinct(db, PRECINCT)));

const rotation = (names: string[], role = "patrol") =>
	cli(
		["rotation", PRECINCT, "--role", role],
		{ LAWMAN_DB: dbFile },
		names.map((n) => `${n}\n`).join(""),
	);
const visit = (department: string, at: string, role = "patrol") =>
	seed((db) => order(db, PRECINCT, role, { department, at, outcome: "filed" }));
const lines = (r: { out: string }) => r.out.split("\n").filter((l) => l !== "");

describe("rotation", () => {
	test("unvisited departments come first by name, then the oldest visit first", () => {
		visit("web", "2026-10-01T00:00:00Z");
		visit("core", "2026-09-01T00:00:00Z");
		visit("api", "2026-10-05T00:00:00Z");
		const r = rotation(["web", "zeta", "api", "core", "beta"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual([
			"beta\t-",
			"zeta\t-",
			"core\t2026-09-01T00:00:00Z",
			"web\t2026-10-01T00:00:00Z",
			"api\t2026-10-05T00:00:00Z",
		]);
	});

	test("equal visit times fall back to the name", () => {
		visit("web", "2026-10-01T00:00:00Z");
		visit("api", "2026-10-01T00:00:00Z");
		expect(lines(rotation(["web", "api"]))).toEqual([
			"api\t2026-10-01T00:00:00Z",
			"web\t2026-10-01T00:00:00Z",
		]);
	});

	test("the latest patrol order of a department sets its age", () => {
		visit("web", "2026-10-09T00:00:00Z");
		visit("web", "2026-09-01T00:00:00Z");
		visit("core", "2026-10-03T00:00:00Z");
		expect(lines(rotation(["web", "core"]))).toEqual([
			"core\t2026-10-03T00:00:00Z",
			"web\t2026-10-09T00:00:00Z",
		]);
	});

	test("orders of other roles do not count as visits", () => {
		visit("web", "2026-10-01T00:00:00Z", "investigation");
		expect(lines(rotation(["web"]))).toEqual(["web\t-"]);
	});

	test("repeated names print once", () => {
		expect(lines(rotation(["web", "api", "web", "api"]))).toEqual([
			"api\t-",
			"web\t-",
		]);
	});

	test("a name outside the class exits 1 with empty stdout", () => {
		for (const bad of ["Web", "9lives", "a_b", "a b", "../x"]) {
			const r = rotation(["api", bad]);
			expect(r.code).toBe(1);
			expect(r.out).toBe("");
			expect(r.err).toContain("invalid department");
		}
	});

	test("empty input prints nothing and exits 0", () => {
		for (const input of [[], [""]]) {
			const r = rotation(input);
			expect(r.code).toBe(0);
			expect(r.out).toBe("");
		}
	});

	test("a missing role exits 1", () => {
		expect(
			cli(["rotation", PRECINCT], { LAWMAN_DB: dbFile }, "api\n").code,
		).toBe(1);
	});
});

describe("rotation fed by the page directory and the precinct lines", () => {
	const skill = readFileSync(
		join(ROOT, "skills", "duty-desk", "SKILL.md"),
		"utf8",
	);
	const COMMAND = (skill.split(/^### Step 6/m)[1] ?? "").split("```")[1] ?? "";

	function pipe(listed: string[] | null, precinctLines: string[] = []) {
		if (listed !== null) {
			const pages = join(dir, "lawman", "departments");
			mkdirSync(pages, { recursive: true });
			for (const file of listed) writeFileSync(join(pages, file), "");
		}
		const bin = join(dir, "bin");
		mkdirSync(bin);
		const shim = join(bin, "journal");
		writeFileSync(
			shim,
			`#!/bin/sh\nexec bun ${join(ROOT, "src", "journal.ts")} "$@"\n`,
		);
		chmodSync(shim, 0o755);
		const command = COMMAND.replace("<name>", PRECINCT).replace("<lines>", () =>
			precinctLines.join("\n"),
		);
		const r = Bun.spawnSync(["bash", "-c", command], {
			cwd: dir,
			env: { PATH: process.env.PATH ?? "", LAWMAN_DB: dbFile },
		});
		return { code: r.exitCode, out: r.stdout.toString() };
	}

	test("page files come out in rotation order without their suffix", () => {
		visit("core", "2026-09-01T00:00:00Z");
		visit("api", "2026-10-05T00:00:00Z");
		const r = pipe(["api.md", "core.md", "web.md"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual([
			"web\t-",
			"core\t2026-09-01T00:00:00Z",
			"api\t2026-10-05T00:00:00Z",
		]);
	});

	test("precinct line names join the page names", () => {
		visit("api", "2026-10-05T00:00:00Z");
		const r = pipe(["api.md"], ["billing", "audit"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual([
			"audit\t-",
			"billing\t-",
			"api\t2026-10-05T00:00:00Z",
		]);
	});

	test("a precinct line that repeats a page name prints once", () => {
		const r = pipe(["api.md", "web.md"], ["web", "billing"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual(["api\t-", "billing\t-", "web\t-"]);
	});

	test("a directory without page files gives only the precinct lines", () => {
		const none = pipe(["notes.txt"]);
		expect(none.code).toBe(0);
		expect(none.out).toBe("");
	});

	test("an empty directory gives empty output and exit 0", () => {
		const r = pipe([]);
		expect(r.code).toBe(0);
		expect(r.out).toBe("");
	});

	test("an empty directory still lists the precinct lines", () => {
		const r = pipe([], ["billing"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual(["billing\t-"]);
	});

	test("a missing page directory fails the pipeline", () => {
		const r = pipe(null, ["billing"]);
		expect(r.code).not.toBe(0);
		expect(r.out).toBe("");
	});
});

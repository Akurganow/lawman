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
let nextIssue = 1;
// a broken lead has the title prefix but no lead marker
const openLead = (department: string, broken = false) =>
	seed((db) => {
		const n = nextIssue++;
		db.run(
			"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES (?, ?, 'OPEN', ?, 't')",
			[PRECINCT, n, `[Lead] ${department}: x`],
		);
		if (!broken)
			db.run("INSERT INTO markers VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'raw')", [
				PRECINCT,
				n,
				"2026-10-14T09:00:00Z|000000|000001",
				"patrol",
				"lead",
				department,
				`src/f${n}.rs::f::dead-code`,
			]);
	});
const capOf = (department: string) =>
	cli(["cap", PRECINCT, "--department", department], { LAWMAN_DB: dbFile })
		.out.trim()
		.match(/^cap=(\d)/)?.[1];

describe("rotation", () => {
	test("unvisited departments come first by name, then the oldest visit first", () => {
		visit("web", "2026-10-01T00:00:00Z");
		visit("core", "2026-09-01T00:00:00Z");
		visit("api", "2026-10-05T00:00:00Z");
		const r = rotation(["web", "zeta", "api", "core", "beta"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual([
			"beta\t-\t3",
			"zeta\t-\t3",
			"core\t2026-09-01T00:00:00Z\t3",
			"web\t2026-10-01T00:00:00Z\t3",
			"api\t2026-10-05T00:00:00Z\t3",
		]);
	});

	test("equal visit times fall back to the name", () => {
		visit("web", "2026-10-01T00:00:00Z");
		visit("api", "2026-10-01T00:00:00Z");
		expect(lines(rotation(["web", "api"]))).toEqual([
			"api\t2026-10-01T00:00:00Z\t3",
			"web\t2026-10-01T00:00:00Z\t3",
		]);
	});

	test("the latest patrol order of a department sets its age", () => {
		visit("web", "2026-10-09T00:00:00Z");
		visit("web", "2026-09-01T00:00:00Z");
		visit("core", "2026-10-03T00:00:00Z");
		expect(lines(rotation(["web", "core"]))).toEqual([
			"core\t2026-10-03T00:00:00Z\t3",
			"web\t2026-10-09T00:00:00Z\t3",
		]);
	});

	test("orders of other roles do not count as visits", () => {
		visit("web", "2026-10-01T00:00:00Z", "investigation");
		expect(lines(rotation(["web"]))).toEqual(["web\t-\t3"]);
	});

	test("repeated names print once", () => {
		expect(lines(rotation(["web", "api", "web", "api"]))).toEqual([
			"api\t-\t3",
			"web\t-\t3",
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

	test.each([
		[0, "3"],
		[2, "3"],
		[3, "1"],
		[4, "1"],
		[5, "0"],
	])("%i open leads give the third field %s", (open, want) => {
		for (let i = 0; i < open; i++) openLead("core");
		expect(lines(rotation(["core"]))).toEqual([`core\t-\t${want}`]);
		expect(capOf("core")).toBe(want);
	});

	test("an open broken lead counts, other departments do not", () => {
		for (let i = 0; i < 2; i++) openLead("core");
		openLead("core", true);
		openLead("web");
		const r = lines(rotation(["core", "web", "idle"]));
		expect(r).toEqual(["core\t-\t1", "idle\t-\t3", "web\t-\t3"]);
		expect(capOf("core")).toBe("1");
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
			const pages = join(
				dir,
				"lawman",
				"skills",
				"lawman-law",
				"references",
				"departments",
			);
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
			"web\t-\t3",
			"core\t2026-09-01T00:00:00Z\t3",
			"api\t2026-10-05T00:00:00Z\t3",
		]);
	});

	test("precinct line names join the page names", () => {
		visit("api", "2026-10-05T00:00:00Z");
		const r = pipe(["api.md"], ["billing", "audit"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual([
			"audit\t-\t3",
			"billing\t-\t3",
			"api\t2026-10-05T00:00:00Z\t3",
		]);
	});

	test("a precinct line that repeats a page name prints once", () => {
		const r = pipe(["api.md", "web.md"], ["web", "billing"]);
		expect(r.code).toBe(0);
		expect(lines(r)).toEqual(["api\t-\t3", "billing\t-\t3", "web\t-\t3"]);
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
		expect(lines(r)).toEqual(["billing\t-\t3"]);
	});

	test("a missing page directory fails the pipeline", () => {
		const r = pipe(null, ["billing"]);
		expect(r.code).not.toBe(0);
		expect(r.out).toBe("");
	});
});

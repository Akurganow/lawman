import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { open } from "./db";
import { CAP_TABLE } from "./leads";
import { SYNC_LIMIT } from "./sync";
import { addPrecincts, dbFile, must, ROOT, run, tempDb } from "./test-helpers";

tempDb();

describe("leads, seen, cap and last", () => {
	const PRECINCT = "main";
	const ID = "src/a.rs::f::dead-code";
	const OTHER_KIND = "src/a.rs::f::unused-import";
	const cmd = (...args: string[]) => run(args);
	const lines = (r: { out: string }) =>
		r.out.split("\n").filter((l) => l !== "");
	let db: Database;

	type Origin = { department: string; id: string; ord?: string };
	function put(
		n: number,
		state: string,
		reason: string | null,
		origin?: Origin,
		title = `[Lead] x: ${n}`,
	) {
		db.run(
			"INSERT INTO issues (precinct, issue, state, state_reason, title, created_at) VALUES (?, ?, ?, ?, ?, 't')",
			[PRECINCT, n, state, reason, title],
		);
		if (origin)
			mark(
				n,
				"patrol",
				"lead",
				origin.ord ?? "2026-10-14T09:00:00Z|000000|000001",
				origin,
			);
	}
	function mark(
		n: number,
		role: string,
		stage: string,
		ord: string,
		origin?: Origin,
	) {
		db.run("INSERT INTO markers VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'raw')", [
			PRECINCT,
			n,
			ord,
			role,
			stage,
			origin?.department ?? null,
			origin?.id ?? null,
		]);
	}
	const lead = (department: string, id = ID): Origin => ({ department, id });
	const seen = (id: string) => cmd("seen", PRECINCT, "--id", id).out.trim();
	const cap = (department: string) =>
		cmd("cap", PRECINCT, "--department", department).out.trim();

	beforeEach(() => {
		addPrecincts({ [PRECINCT]: 1 });
		db = open(dbFile);
	});
	afterEach(() => db.close());

	describe("leads", () => {
		beforeEach(() => {
			put(3, "OPEN", null, lead("core", ID), "[Lead] core: three");
			put(1, "OPEN", null, lead("web", OTHER_KIND), "[Lead] web: one");
			put(
				2,
				"CLOSED",
				"NOT_PLANNED",
				lead("core", "src/b.rs::g::dead-code"),
				"[Lead] core: two",
			);
			put(4, "OPEN", null, undefined, "plain issue");
		});

		test("the default lists open origins by issue number as TSV", () => {
			const r = cmd("leads", PRECINCT);
			expect(r.code).toBe(0);
			expect(lines(r)).toEqual([
				`1\tOPEN\t\tweb\t${OTHER_KIND}\t[Lead] web: one`,
				`3\tOPEN\t\tcore\t${ID}\t[Lead] core: three`,
			]);
		});

		test("--department filters by the origin department", () => {
			expect(
				lines(cmd("leads", PRECINCT, "--department", "core")).map(
					(l) => l.split("\t")[0],
				),
			).toEqual(["3"]);
		});

		test("--state, a missing precinct or a malformed department exits 1", () => {
			for (const state of ["open", "all"]) {
				const r = cmd("leads", PRECINCT, "--state", state);
				expect(r.code).toBe(1);
				expect(r.out).toBe("");
			}
			expect(cmd("leads").code).toBe(1);
			expect(cmd("leads", PRECINCT, "--department", "Bad Dept").code).toBe(1);
		});

		test("another precinct is not listed", () => {
			expect(lines(cmd("leads", "elsewhere"))).toEqual([]);
		});

		test("the origin survives a later marker of another role", () => {
			mark(3, "investigation", "case", "2026-10-14T10:00:00Z|000001|000001");
			expect(
				lines(cmd("leads", PRECINCT, "--department", "core")).map(
					(l) => l.split("\t")[0],
				),
			).toEqual(["3"]);
			expect(cap("core")).toBe("cap=3 open=1");
		});

		test("the earliest lead marker is the origin", () => {
			mark(
				3,
				"patrol",
				"lead",
				"2026-10-14T11:00:00Z|000001|000001",
				lead("web", "src/z.rs::h::dead-code"),
			);
			expect(
				lines(cmd("leads", PRECINCT, "--department", "core")).map(
					(l) => l.split("\t")[0],
				),
			).toEqual(["3"]);
			expect(
				lines(cmd("leads", PRECINCT, "--department", "web")).map(
					(l) => l.split("\t")[0],
				),
			).toEqual(["1"]);
		});
	});

	describe("seen", () => {
		test("none when nothing matches", () => {
			expect(seen(ID)).toBe("none");
		});

		test("open when an open origin shares path::symbol, whatever kind or department", () => {
			put(5, "OPEN", null, lead("web", OTHER_KIND));
			expect(seen(ID)).toBe("open #5");
		});

		test.each([["NOT_PLANNED"], ["DUPLICATE"], [null]])(
			"declined for a closed origin with reason %p",
			(reason) => {
				put(6, "CLOSED", reason, lead("core", OTHER_KIND));
				expect(seen(ID)).toBe("declined #6");
			},
		);

		test("fixed for a COMPLETED closure with the exact id", () => {
			put(7, "CLOSED", "COMPLETED", lead("core"));
			expect(seen(ID)).toBe("fixed #7");
		});

		test("a COMPLETED closure of another kind is not fixed", () => {
			put(7, "CLOSED", "COMPLETED", lead("core", OTHER_KIND));
			expect(seen(ID)).toBe("none");
		});

		test("another path::symbol does not match", () => {
			put(8, "OPEN", null, lead("core", "src/a.rs::g::dead-code"));
			put(9, "OPEN", null, lead("core", "src/ab.rs::f::dead-code"));
			expect(seen(ID)).toBe("none");
		});

		test("open beats declined beats fixed", () => {
			put(10, "CLOSED", "COMPLETED", lead("core"));
			expect(seen(ID)).toBe("fixed #10");
			put(11, "CLOSED", "NOT_PLANNED", lead("core"));
			expect(seen(ID)).toBe("declined #11");
			put(12, "OPEN", null, lead("core"));
			expect(seen(ID)).toBe("open #12");
		});

		test("the lowest issue number wins inside a class", () => {
			put(22, "OPEN", null, lead("core"));
			put(21, "OPEN", null, lead("web"));
			put(32, "CLOSED", "NOT_PLANNED", lead("core"));
			put(31, "CLOSED", "DUPLICATE", lead("core"));
			expect(seen(ID)).toBe("open #21");
			db.run(
				"UPDATE issues SET state = 'CLOSED', state_reason = 'COMPLETED' WHERE issue IN (21, 22)",
			);
			expect(seen(ID)).toBe("declined #31");
		});

		test("the origin marker decides, not a later lead marker", () => {
			put(13, "OPEN", null, lead("core", "src/q.rs::f::dead-code"));
			mark(
				13,
				"patrol",
				"lead",
				"2026-10-15T00:00:00Z|000001|000001",
				lead("core", ID),
			);
			expect(seen(ID)).toBe("none");
		});

		test("a non-canonical id exits 1", () => {
			for (const bad of ["src/a.rs::f", "a::b::c::d", "a b::f::k", ""]) {
				const r = cmd("seen", PRECINCT, "--id", bad);
				expect(r.code).toBe(1);
				expect(r.out).toBe("");
			}
			expect(cmd("seen", PRECINCT).code).toBe(1);
		});
	});

	describe("cap", () => {
		const fill = (n: number, department = "core", from = 100) => {
			for (let i = 0; i < n; i++)
				put(
					from + i,
					"OPEN",
					null,
					lead(department, `src/f${from + i}.rs::f::dead-code`),
				);
		};

		test.each([
			[0, 3],
			[1, 3],
			[2, 3],
			[3, 1],
			[4, 1],
			[5, 0],
			[6, 0],
		])("%i open leads give cap %i", (open, want) => {
			fill(open);
			expect(cap("core")).toBe(`cap=${want} open=${open}`);
		});

		test("closed issues and other departments do not count", () => {
			fill(2);
			fill(5, "web", 200);
			put(300, "CLOSED", "COMPLETED", lead("core", "src/c.rs::f::dead-code"));
			expect(cap("core")).toBe("cap=3 open=2");
			expect(cap("web")).toBe("cap=0 open=5");
			expect(cap("idle")).toBe("cap=3 open=0");
		});

		test("an open broken lead without a marker counts by its title", () => {
			fill(2);
			put(400, "OPEN", null, undefined, "[Lead] core: broken");
			expect(cap("core")).toBe("cap=1 open=3");
			put(401, "CLOSED", null, undefined, "[Lead] core: closed broken");
			put(402, "OPEN", null, undefined, "[Lead] web: other department");
			put(403, "OPEN", null, undefined, "[Lead] corex: prefix only");
			put(404, "OPEN", null, undefined, "core: no prefix");
			expect(cap("core")).toBe("cap=1 open=3");
		});

		test("a lead with no department does not count for any department", () => {
			fill(2);
			put(600, "OPEN", null, lead("-", "src/u.rs::f::dead-code"));
			expect(cap("core")).toBe("cap=3 open=2");
		});

		test("an open lead whose title names another department counts for its origin", () => {
			put(500, "OPEN", null, lead("web"), "[Lead] core: mislabelled");
			expect(cap("core")).toBe("cap=3 open=0");
			expect(cap("web")).toBe("cap=3 open=1");
		});

		test("a missing department exits 1", () => {
			expect(cmd("cap", PRECINCT).code).toBe(1);
		});

		test("a malformed department exits 1 and the error names the department", () => {
			const r = cmd("cap", PRECINCT, "--department", "Bad Dept");
			expect(r.code).toBe(1);
			expect(r.err).toContain("department");
		});

		test("the sync ceiling equals the number in the law", () => {
			const law = readFileSync(join(ROOT, "law", "LAW.md"), "utf8");
			const m = law.match(/^The issue sync ceiling is (\d+) records\./m);
			expect(m).not.toBeNull();
			expect(SYNC_LIMIT).toBe(Number(must(m)[1]));
		});

		test("the code table equals the table in the law", () => {
			const law = readFileSync(join(ROOT, "law", "LAW.md"), "utf8").split("\n");
			const head = law.indexOf(
				"| Open leads of the department on the precinct | Maximum filings per tick |",
			);
			expect(head).toBeGreaterThan(-1);
			const rows: { upTo: number | null; cap: number }[] = [];
			for (const line of law.slice(head + 2)) {
				const m = line.match(/^\| (\d+) (?:to (\d+)|or more) \| (\d+) \|$/);
				if (!m) break;
				rows.push({
					upTo: m[2] === undefined ? null : Number(m[2]),
					cap: Number(m[3]),
				});
			}
			expect(rows.length).toBe(3);
			expect(CAP_TABLE).toEqual(rows);
		});
	});

	describe("last", () => {
		const dispatch = (
			department: string | null,
			at: string,
			role = "patrol",
			closed = true,
		) =>
			db.run(
				"INSERT INTO dispatches (at, precinct, role, department, outcome) VALUES (?, ?, ?, ?, ?)",
				[at, PRECINCT, role, department, closed ? "filed" : null],
			);

		test("no dispatches print nothing", () => {
			const r = cmd("last", PRECINCT, "--role", "patrol");
			expect(r.code).toBe(0);
			expect(r.out).toBe("");
		});

		test("departments come ascending by their latest at", () => {
			dispatch("web", "2026-10-01T00:00:00Z");
			dispatch("core", "2026-09-01T00:00:00Z");
			dispatch("api", "2026-10-05T00:00:00Z");
			expect(lines(cmd("last", PRECINCT, "--role", "patrol"))).toEqual([
				"core\t2026-09-01T00:00:00Z",
				"web\t2026-10-01T00:00:00Z",
				"api\t2026-10-05T00:00:00Z",
			]);
		});

		test("the latest at of a department wins, open or closed", () => {
			dispatch("web", "2026-10-01T00:00:00Z");
			dispatch("web", "2026-10-09T00:00:00Z", "patrol", false);
			dispatch("core", "2026-10-03T00:00:00Z");
			dispatch("core", "2026-09-03T00:00:00Z");
			expect(lines(cmd("last", PRECINCT, "--role", "patrol"))).toEqual([
				"core\t2026-10-03T00:00:00Z",
				"web\t2026-10-09T00:00:00Z",
			]);
		});

		test("other roles, other precincts and orders without a department are ignored", () => {
			dispatch("web", "2026-10-01T00:00:00Z", "judge");
			dispatch(null, "2026-10-02T00:00:00Z");
			expect(lines(cmd("last", PRECINCT, "--role", "patrol"))).toEqual([]);
			expect(lines(cmd("last", "elsewhere", "--role", "judge"))).toEqual([]);
		});

		test("a missing role exits 1", () => {
			expect(cmd("last", PRECINCT).code).toBe(1);
		});
	});
});

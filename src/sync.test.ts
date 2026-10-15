import { beforeEach, describe, expect, test } from "bun:test";
import { open } from "./db";
import { collectIssueMarkers } from "./markers";
import { SYNC_LIMIT } from "./sync";
import {
	addPrecincts,
	dbFile,
	env,
	issues,
	lead,
	must,
	ROOT,
	run,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

describe("sync", () => {
	const PRECINCT = "main";
	const syncArgs = (extra: string[] = []) => [
		"sync",
		PRECINCT,
		"--author",
		TRUSTED,
		...extra,
	];
	const feed = (input: string, args = syncArgs()) =>
		Bun.spawnSync(["bun", "src/journal.ts", ...args], {
			cwd: ROOT,
			env: env({ LAWMAN_DB: dbFile }),
			stdin: Buffer.from(input),
		});
	const sync = (data: unknown, extra: string[] = []) => {
		const r = feed(
			typeof data === "string" ? data : JSON.stringify(data),
			syncArgs(extra),
		);
		return {
			code: r.exitCode,
			out: r.stdout.toString(),
			err: r.stderr.toString(),
		};
	};
	const query = (sql: string) => {
		const db = open(dbFile);
		try {
			return db.query(sql).all() as Record<string, unknown>[];
		} finally {
			db.close();
		}
	};
	const snapshot = () => ({
		issues: query("SELECT * FROM issues ORDER BY issue"),
		markers: query("SELECT * FROM markers ORDER BY issue, ord"),
		synced: query("SELECT synced_at FROM precincts"),
	});
	const mine = (i: (typeof issues)[number]) =>
		i.author.login.toLowerCase() === TRUSTED;
	const lines = (i: (typeof issues)[number]) =>
		[i.body, ...i.comments.map((c) => c.body)].flatMap((t) => t.split("\n"));

	beforeEach(() => addPrecincts({ [PRECINCT]: 1 }));

	test("a fixture sync prints counts that match the fixture", () => {
		const kept = issues.filter(mine);
		const found = kept.map((i) => collectIssueMarkers(i, TRUSTED));
		const markers = found.reduce((n, f) => n + f.markers.length, 0);
		const legacy = found
			.flatMap((f) => f.markers)
			.filter((m) => m.marker.fields.legacy !== undefined).length;
		const shaped = kept
			.flatMap(lines)
			.filter((l) => l.startsWith("<!-- lawman:")).length;
		const r = sync(issues);
		expect(r.code).toBe(0);
		expect(r.out.trim()).toBe(
			`issues=${kept.length} leads=${found.filter((f) => f.leadOrigin).length} markers=${markers} invalid=${shaped - (markers - legacy)} skipped=${issues.length - kept.length}`,
		);
		expect(query("SELECT count(*) AS n FROM issues")).toEqual([
			{ n: kept.length },
		]);
		expect(query("SELECT count(*) AS n FROM markers")).toEqual([
			{ n: markers },
		]);
		expect(query("SELECT synced_at IS NOT NULL AS ok FROM precincts")).toEqual([
			{ ok: 1 },
		]);
	});

	test("rows keep the issue fields and the marker columns", () => {
		sync(issues);
		const one = query("SELECT * FROM issues WHERE issue = 17")[0];
		expect(one).toEqual({
			precinct: PRECINCT,
			issue: 17,
			state: "CLOSED",
			state_reason: "COMPLETED",
			title: "Later markers never displace the lead origin",
			created_at: "2026-10-14T09:00:00Z",
			closed_at: "2026-10-15T08:00:00Z",
		});
		expect(query("SELECT state_reason FROM issues WHERE issue = 2")).toEqual([
			{ state_reason: null },
		]);
		const rows = query("SELECT * FROM markers WHERE issue = 1 ORDER BY ord");
		const want = collectIssueMarkers(must(issues[0]), TRUSTED).markers;
		expect(rows.map((r) => r.ord)).toEqual(want.map((m) => m.ord));
		const first = must(rows[0]);
		expect(first).toMatchObject({
			role: "patrol",
			stage: "lead",
			department: "core",
			lead_id: "src/my%20file.rs::Foo%3A%3Abar::dead-code",
			raw: must(want[0]).marker.raw,
		});
		expect(JSON.parse(first.fields as string)).toEqual(
			must(want[0]).marker.fields,
		);
		expect(rows[1]).toMatchObject({
			stage: "return",
			department: null,
			lead_id: null,
		});
	});

	test("a second sync replaces the rows", () => {
		sync(issues);
		const first = snapshot();
		expect(sync(issues.slice(0, 3)).code).toBe(0);
		expect(query("SELECT issue FROM issues ORDER BY issue")).toEqual([
			{ issue: 1 },
			{ issue: 2 },
			{ issue: 3 },
		]);
		expect(query("SELECT DISTINCT issue FROM markers")).toEqual([{ issue: 1 }]);
		expect(sync(issues).code).toBe(0);
		expect(snapshot().issues).toEqual(first.issues);
		expect(snapshot().markers).toEqual(first.markers);
	});

	test("another precinct keeps its rows", () => {
		addPrecincts({ other: 1 });
		expect(
			feed(JSON.stringify(issues.slice(0, 2)), [
				"sync",
				"other",
				"--author",
				TRUSTED,
			]).exitCode,
		).toBe(0);
		sync(issues);
		expect(sync([], ["--reset"]).code).toBe(0);
		expect(
			query("SELECT count(*) AS n FROM issues WHERE precinct = 'other'"),
		).toEqual([{ n: 2 }]);
		expect(
			query("SELECT count(*) AS n FROM markers WHERE precinct = 'other'"),
		).toEqual([{ n: 2 }]);
	});

	test.each([
		["empty stdin", ""],
		["not json", "not json"],
		["truncated json", JSON.stringify(issues).slice(0, 200)],
		["a json object", "{}"],
		["a json string", '"x"'],
		["an element without a number", JSON.stringify([{ state: "OPEN" }])],
		["a fractional number", JSON.stringify([{ number: 1.5, state: "OPEN" }])],
		["an element without a state", JSON.stringify([{ number: 1 }])],
		["a null element", "[null]"],
	])("%s exits 4 and leaves the cache", (_name, input) => {
		sync(issues);
		const before = snapshot();
		const r = sync(input);
		expect(r.code).toBe(4);
		expect(r.err).toContain("journal:");
		expect(snapshot()).toEqual(before);
	});

	test("an empty array over a filled cache exits 4 and --reset clears it", () => {
		sync(issues);
		const before = snapshot();
		expect(sync([]).code).toBe(4);
		expect(snapshot()).toEqual(before);
		const r = sync([], ["--reset"]);
		expect(r.code).toBe(0);
		expect(r.out.trim()).toBe("issues=0 leads=0 markers=0 invalid=0 skipped=0");
		expect(query("SELECT count(*) AS n FROM issues")).toEqual([{ n: 0 }]);
		expect(query("SELECT count(*) AS n FROM markers")).toEqual([{ n: 0 }]);
	});

	test("an empty array over an empty cache succeeds", () => {
		expect(sync([]).code).toBe(0);
	});

	test("exactly the sync limit exits 3 and one fewer succeeds", () => {
		sync(issues);
		const before = snapshot();
		const minimal = (n: number) =>
			Array.from({ length: n }, (_, i) => ({
				number: i + 1,
				state: "OPEN",
				author: { login: TRUSTED },
			}));
		const r = sync(minimal(SYNC_LIMIT));
		expect(r.code).toBe(3);
		expect(snapshot()).toEqual(before);
		expect(sync(minimal(SYNC_LIMIT - 1)).code).toBe(0);
		expect(query("SELECT count(*) AS n FROM issues")).toEqual([
			{ n: SYNC_LIMIT - 1 },
		]);
	});

	test("a duplicate issue number fails with 4 and the old cache stays", () => {
		sync(issues);
		const before = snapshot();
		const twin = {
			number: 5,
			state: "OPEN",
			title: "x",
			author: { login: TRUSTED },
		};
		const r = sync([issues[0], twin, twin]);
		expect(r.code).toBe(4);
		expect(snapshot()).toEqual(before);
	});

	test("issues by another author are skipped and counted", () => {
		const foreign = {
			number: 50,
			state: "OPEN",
			title: "[Lead] foreign",
			author: { login: "bystander-fictional" },
			body: lead(),
			comments: [],
		};
		const r = sync([
			issues[0],
			foreign,
			{ number: 51, state: "OPEN", title: "ghost", author: null },
		]);
		expect(r.out.trim()).toBe("issues=1 leads=1 markers=2 invalid=0 skipped=2");
		expect(query("SELECT issue FROM issues")).toEqual([{ issue: 1 }]);
	});

	test("an unknown precinct exits 1 and a bad login exits 1", () => {
		expect(feed("[]", ["sync", "nowhere", "--author", TRUSTED]).exitCode).toBe(
			1,
		);
		expect(feed("[]", ["sync", PRECINCT, "--author", "-bad-"]).exitCode).toBe(
			1,
		);
		expect(feed("[]", ["sync", PRECINCT]).exitCode).toBe(1);
		expect(
			feed("[]", ["sync", PRECINCT, "--author", TRUSTED, "--reset", "--reset"])
				.exitCode,
		).toBe(1);
	});

	test("status counts the synced leads by department", () => {
		sync(issues);
		const want = new Map<string, number>();
		for (const i of issues.filter(mine).filter((x) => x.state === "OPEN")) {
			const dept = collectIssueMarkers(i, TRUSTED).leadOrigin?.marker.fields
				.department;
			if (dept !== undefined) want.set(dept, (want.get(dept) ?? 0) + 1);
		}
		expect(want.size).toBeGreaterThan(0);
		const got = run(["status"])
			.out.split("\n")
			.filter((l) => l.startsWith("leads "));
		expect(got).toEqual([...want].sort().map(([d, n]) => `leads ${d} ${n}`));
	});

	test("alarm raises broken-lead for an open [Lead] issue without a marker and not for a closed one", () => {
		const bare = (number: number, state: string) => ({
			number,
			state,
			title: "[Lead] no marker",
			author: { login: TRUSTED },
			body: "",
			comments: [],
		});
		sync([...issues, bare(101, "OPEN"), bare(102, "CLOSED")]);
		const r = run(["alarm"]);
		expect(r.out).toContain("ALARM broken-lead main#101");
		expect(r.out).not.toContain("main#102");
		expect(r.out).not.toContain("main#1 ");
	});
});

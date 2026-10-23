import { beforeEach, describe, expect, test } from "bun:test";
import { collectIssueMarkers } from "./markers";
import { SYNC_LIMIT } from "./sync";
import {
	addPrecincts,
	cli,
	dbFile,
	issues,
	lead,
	must,
	rows,
	run,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const CREATED = "2026-10-14T09:00:00Z";

const withTimes = (over: Record<string, unknown>) =>
	JSON.stringify([
		{
			number: 1,
			state: "OPEN",
			createdAt: CREATED,
			author: { login: TRUSTED },
			...over,
		},
	]);

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
		cli(args, { LAWMAN_DB: dbFile }, input);
	const sync = (data: unknown, extra: string[] = []) =>
		feed(
			typeof data === "string" ? data : JSON.stringify(data),
			syncArgs(extra),
		);
	const snapshot = () => ({
		issues: rows("SELECT * FROM issues ORDER BY issue"),
		markers: rows("SELECT * FROM markers ORDER BY issue, ord"),
		synced: rows("SELECT synced_at FROM precincts"),
	});
	const human = (i: (typeof issues)[number]) =>
		i.author.is_bot !== true && !i.author.login.startsWith("app/");
	const lines = (i: (typeof issues)[number]) =>
		[i.body, ...i.comments.map((c) => c.body)].flatMap((t) => t.split("\n"));

	beforeEach(() => addPrecincts({ [PRECINCT]: 1 }));

	test("a fixture sync prints counts that match the fixture", () => {
		const kept = issues.filter(human);
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
		expect(rows("SELECT count(*) AS n FROM issues")).toEqual([
			{ n: kept.length },
		]);
		expect(rows("SELECT count(*) AS n FROM markers")).toEqual([{ n: markers }]);
		expect(rows("SELECT synced_at IS NOT NULL AS ok FROM precincts")).toEqual([
			{ ok: 1 },
		]);
	});

	test("rows keep the issue fields and the marker columns", () => {
		sync(issues);
		const one = rows("SELECT * FROM issues WHERE issue = 17")[0];
		expect(one).toEqual({
			precinct: PRECINCT,
			issue: 17,
			state: "CLOSED",
			state_reason: "COMPLETED",
			title: "Later markers never displace the lead origin",
			created_at: "2026-10-14T09:00:00Z",
			closed_at: "2026-10-15T08:00:00Z",
			replied_at: null,
		});
		expect(rows("SELECT state_reason FROM issues WHERE issue = 2")).toEqual([
			{ state_reason: null },
		]);
		const stored = rows("SELECT * FROM markers WHERE issue = 1 ORDER BY ord");
		const want = collectIssueMarkers(must(issues[0]), TRUSTED).markers;
		expect(stored.map((r) => r.ord)).toEqual(want.map((m) => m.ord));
		const first = must(stored[0]);
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
		expect(stored[1]).toMatchObject({
			stage: "return",
			department: null,
			lead_id: null,
		});
	});

	test("every time is stored as UTC seconds with a Z", () => {
		const r = sync([
			{
				number: 70,
				state: "CLOSED",
				title: "x",
				createdAt: "2026-10-14T11:30:00.500+02:00",
				closedAt: "2026-10-15T05:00:00-04:00",
				author: { login: TRUSTED },
				comments: [
					{
						author: { login: TRUSTED },
						body: lead(),
						createdAt: "2026-10-14T12:00:00+02:00",
					},
				],
			},
		]);
		expect(r.code).toBe(0);
		expect(
			rows("SELECT created_at, closed_at FROM issues WHERE issue = 70"),
		).toEqual([
			{ created_at: "2026-10-14T09:30:00Z", closed_at: "2026-10-15T09:00:00Z" },
		]);
		expect(
			rows("SELECT ord FROM markers WHERE issue = 70").map((m) =>
				String(m.ord).slice(0, 20),
			),
		).toEqual(["2026-10-14T10:00:00Z"]);
	});

	test("a second sync replaces the rows", () => {
		sync(issues);
		const first = snapshot();
		expect(sync(issues.slice(0, 3)).code).toBe(0);
		expect(rows("SELECT issue FROM issues ORDER BY issue")).toEqual([
			{ issue: 1 },
			{ issue: 2 },
			{ issue: 3 },
		]);
		expect(rows("SELECT DISTINCT issue FROM markers")).toEqual([{ issue: 1 }]);
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
			]).code,
		).toBe(0);
		sync(issues);
		expect(sync([], ["--reset"]).code).toBe(0);
		expect(
			rows("SELECT count(*) AS n FROM issues WHERE precinct = 'other'"),
		).toEqual([{ n: 2 }]);
		expect(
			rows("SELECT count(*) AS n FROM markers WHERE precinct = 'other'"),
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
		[
			"an issue without createdAt",
			JSON.stringify([{ number: 1, state: "OPEN" }]),
		],
		[
			"an issue with a createdAt that is no time",
			withTimes({ createdAt: "soon" }),
		],
		["a closedAt that is no time", withTimes({ closedAt: "later" })],
		["a comment without createdAt", withTimes({ comments: [{ body: "x" }] })],
		["a lowercase state", withTimes({ state: "open" })],
		["a state outside the form", withTimes({ state: "opened" })],
		[
			"a lowercase stateReason",
			withTimes({ state: "CLOSED", stateReason: "completed" }),
		],
	])("%s exits 4 and leaves the cache", (_name, input) => {
		sync(issues);
		const before = snapshot();
		const r = sync(input);
		expect(r.code).toBe(4);
		expect(r.err).toContain("journal:");
		expect(snapshot()).toEqual(before);
	});

	test("an upper-case stateReason outside the form is stored", () => {
		const r = sync(
			withTimes({
				state: "CLOSED",
				stateReason: "DUPLICATE",
				closedAt: CREATED,
			}),
		);
		expect(r.code).toBe(0);
		expect(rows("SELECT state, state_reason FROM issues")).toEqual([
			{ state: "CLOSED", state_reason: "DUPLICATE" },
		]);
	});

	test("an empty array over a filled cache exits 4 and --reset clears it", () => {
		sync(issues);
		const before = snapshot();
		expect(sync([]).code).toBe(4);
		expect(snapshot()).toEqual(before);
		const r = sync([], ["--reset"]);
		expect(r.code).toBe(0);
		expect(r.out.trim()).toBe("issues=0 leads=0 markers=0 invalid=0 skipped=0");
		expect(rows("SELECT count(*) AS n FROM issues")).toEqual([{ n: 0 }]);
		expect(rows("SELECT count(*) AS n FROM markers")).toEqual([{ n: 0 }]);
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
				createdAt: CREATED,
				author: { login: TRUSTED },
			}));
		const r = sync(minimal(SYNC_LIMIT));
		expect(r.code).toBe(3);
		expect(r.err).toContain("the list may be truncated");
		expect(snapshot()).toEqual(before);
		expect(sync(minimal(SYNC_LIMIT - 1)).code).toBe(0);
		expect(rows("SELECT count(*) AS n FROM issues")).toEqual([
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
			createdAt: CREATED,
			author: { login: TRUSTED },
		};
		const r = sync([issues[0], twin, twin]);
		expect(r.code).toBe(4);
		expect(snapshot()).toEqual(before);
	});

	test("issues of other humans are stored and their markers do not count", () => {
		const foreign = {
			number: 50,
			state: "OPEN",
			title: "[Lead] foreign",
			createdAt: CREATED,
			author: { login: "bystander-fictional", is_bot: false },
			body: lead(),
			comments: [],
		};
		const r = sync([issues[0], foreign]);
		expect(r.out.trim()).toBe("issues=2 leads=1 markers=2 invalid=1 skipped=0");
		expect(rows("SELECT issue FROM issues ORDER BY issue")).toEqual([
			{ issue: 1 },
			{ issue: 50 },
		]);
		expect(rows("SELECT count(*) AS n FROM markers WHERE issue = 50")).toEqual([
			{ n: 0 },
		]);
	});

	test.each([
		["a bot flagged by is_bot", { login: "dependabot", is_bot: true }],
		["an app login", { login: "app/renovate", is_bot: false }],
		["an app login without the flag", { login: "app/renovate" }],
		["no author", null],
		["an empty login", { login: "" }],
	])("an issue by %s is skipped and counted", (_name, author) => {
		const r = sync([
			issues[0],
			{ number: 51, state: "OPEN", title: "x", createdAt: CREATED, author },
		]);
		expect(r.out.trim()).toBe("issues=1 leads=1 markers=2 invalid=0 skipped=1");
		expect(rows("SELECT issue FROM issues")).toEqual([{ issue: 1 }]);
	});

	test("an unknown precinct exits 1 and a bad login exits 1", () => {
		expect(feed("[]", ["sync", "nowhere", "--author", TRUSTED]).code).toBe(1);
		expect(feed("[]", ["sync", PRECINCT, "--author", "-bad-"]).code).toBe(1);
		expect(feed("[]", ["sync", PRECINCT]).code).toBe(1);
		expect(
			feed("[]", ["sync", PRECINCT, "--author", TRUSTED, "--reset", "--reset"])
				.code,
		).toBe(1);
	});

	test("status counts the synced leads by department", () => {
		sync(issues);
		const want = new Map<string, number>();
		for (const i of issues.filter(human).filter((x) => x.state === "OPEN")) {
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
			createdAt: CREATED,
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

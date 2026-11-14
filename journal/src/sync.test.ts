import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdirSync, rmSync } from "node:fs";
import { EXIT } from "./db";
import { formText } from "./form";
import { inprocAsync } from "./inproc";
import { collectIssueMarkers } from "./markers";
import {
	addPrecincts,
	BASE,
	cli,
	dbFile,
	dir,
	issueOf,
	issues,
	issuesForm,
	lead,
	must,
	rows,
	run,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const CREATED = "2026-10-14T09:00:00Z";

const withTimes = (over: Record<string, unknown>) => [
	{
		number: 1,
		state: "OPEN",
		createdAt: CREATED,
		author: { login: TRUSTED },
		...over,
	},
];

const EMPTY_FORM = JSON.stringify(issuesForm([]));
const OLD_FORM_REASON =
	"the issues form is one object with writers and issues. Run the assembly, finish any amendment it offers, then choose Host once to rewrite host.md.";

// readStdin reads file descriptor 0, so the test answers that read
const fed = async (
	stdin: unknown,
	args = ["sync", "main", "--author", TRUSTED],
) => {
	const spy = spyOn(fs, "readFileSync").mockReturnValue(
		typeof stdin === "string" ? stdin : JSON.stringify(stdin),
	);
	try {
		return await inprocAsync(BASE, args);
	} finally {
		spy.mockRestore();
	}
};
const reacted = () => ({ approvedBy: [], rejectedBy: [] });
const commented = (comment: Record<string, unknown>) => ({
	writers: [],
	issues: [
		{
			number: 1,
			state: "OPEN",
			createdAt: CREATED,
			author: { login: TRUSTED },
			comments: [{ createdAt: CREATED, ...comment }],
		},
	],
});
// the state one test got from the hooks: a new folder for the database
const fresh = () => {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir);
};

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
	// text goes in as it is, a list of issues goes in as the object form
	const sync = (data: unknown, extra: string[] = []) =>
		feed(
			typeof data === "string"
				? data
				: JSON.stringify(Array.isArray(data) ? issuesForm(data) : data),
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
			answer: null,
			answer_id: null,
			body: issueOf(17).body,
			url: null,
			raw_sha: expect.any(String),
			withheld: 0,
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
			feed(JSON.stringify(issuesForm(issues.slice(0, 2))), [
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

	test("%s exits 4 and leaves the cache", async () => {
		// Every case leaves the cache as it was, so the cache is filled once per
		// loop and each case checks it against the state before that case.
		// sync through the program
		fresh();
		addPrecincts({ [PRECINCT]: 1 });
		sync(issues);
		for (const [name, input] of [
			["empty stdin", ""],
			["not json", "not json"],
			["truncated json", JSON.stringify(issues).slice(0, 200)],
			["an empty json object", "{}"],
			["a json string", '"x"'],
			["an element without a number", [{ state: "OPEN" }]],
			["a fractional number", [{ number: 1.5, state: "OPEN" }]],
			["an element without a state", [{ number: 1 }]],
			["a null element", [null]],
			["an issue without createdAt", [{ number: 1, state: "OPEN" }]],
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
			[
				"a stateReason that is no string",
				withTimes({ state: "CLOSED", stateReason: 42 }),
			],
		] as [string, unknown][]) {
			const before = snapshot();
			const r = sync(input);
			expect([name, r.code, r.err]).toEqual([
				name,
				4,
				expect.stringContaining("journal:"),
			]);
			expect(snapshot()).toEqual(before);
		}
		// sync in process
		fresh();
		addPrecincts({ [PRECINCT]: 1 });
		await fed(issuesForm(issues));
		for (const [name, input] of [
			["no writers", { issues: [] }],
			["no issues", { writers: [] }],
			["writers that is no list", { writers: "maintainer", issues: [] }],
			["a writers entry that is no text", { writers: [1], issues: [] }],
			["issues that is no list", { writers: [], issues: {} }],
			["a comment without an id", commented({})],
			["a comment with an empty id", commented({ id: "", ...reacted() })],
			["a comment without approvedBy", commented({ id: "c1", rejectedBy: [] })],
			["a comment without rejectedBy", commented({ id: "c1", approvedBy: [] })],
			[
				"a comment with approvedBy that is no list",
				commented({ id: "c1", ...reacted(), approvedBy: "x" }),
			],
			[
				"a comment with a reactor that is no text",
				commented({ id: "c1", ...reacted(), rejectedBy: [7] }),
			],
		] as [string, unknown][]) {
			const before = rows("SELECT * FROM issues ORDER BY issue");
			const r = await fed(input);
			expect([name, r.code, r.err]).toEqual([
				name,
				EXIT.SYNC_INPUT,
				expect.stringContaining(formText("issues")),
			]);
			expect(rows("SELECT * FROM issues ORDER BY issue")).toEqual(before);
		}
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

	test("a bare list exits 4 with the old-form reason and the form, and leaves the cache", () => {
		sync(issues);
		const before = snapshot();
		for (const bare of [issues, [], [issues[0]]]) {
			const r = feed(JSON.stringify(bare));
			expect(r.code).toBe(4);
			expect(r.err).toContain(
				`journal: sync input rejected, cache untouched: ${OLD_FORM_REASON}\n\n${formText("issues")}`,
			);
			expect(snapshot()).toEqual(before);
		}
	});

	test("the object form is read with its writers", () => {
		const r = sync({
			writers: ["Maintainer-Fictional"],
			issues: issuesForm(issues).issues,
		});
		expect(r.code).toBe(0);
		expect(r.out).toContain("issues=");
	});

	test("an empty list of issues over a filled cache exits 4 and --reset clears it", () => {
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

	test("an empty list of issues over an empty cache succeeds", () => {
		expect(sync([]).code).toBe(0);
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
		expect(
			feed(EMPTY_FORM, ["sync", "nowhere", "--author", TRUSTED]).code,
		).toBe(1);
		expect(feed(EMPTY_FORM, ["sync", PRECINCT, "--author", "-bad-"]).code).toBe(
			1,
		);
		expect(feed(EMPTY_FORM, ["sync", PRECINCT]).code).toBe(1);
		expect(
			feed(EMPTY_FORM, [
				"sync",
				PRECINCT,
				"--author",
				TRUSTED,
				"--reset",
				"--reset",
			]).code,
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
});

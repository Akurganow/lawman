import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fields, human, pairMark, put, withLead } from "./cases-fixture";
import { inproc, inprocAsync } from "./inproc";
import { config } from "./input-test-fixture";
import { headerOf } from "./precedent-file";
import { BOT, hostPulls, READY, SPEC } from "./pulls-fixture";
import {
	addPrecincts,
	alarm,
	BASE,
	call,
	caseMark,
	charge,
	defence,
	dir,
	later,
	mark,
	rows,
	SHA,
	TRUSTED,
	tempDb,
	WAITS_WORK,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const WAITS = "pull request waits for a decision on its precedent";
const line = (ref: string, detail = WAITS) =>
	`ALARM decision-waiting ${ref} ${detail}\n`;
const clerk = (stage: string, pull: number) =>
	mark("clerk", stage, ` pull=${pull}`).replace(
		"09:30:00",
		`09:3${stage === "entry" ? 1 : 2}:00`,
	);
const syncPulls = (...pulls: Parameters<typeof hostPulls>[0]) =>
	expect(
		call(
			BASE,
			["sync", "main", "--pulls", "--author", BOT],
			JSON.stringify(hostPulls(pulls)),
		).code,
	).toBe(0);
const open = () =>
	rows("SELECT ref, cleared_at FROM alarms ORDER BY id") as {
		ref: string;
		cleared_at: string | null;
	}[];

describe("decision-waiting for a precedent pull request", () => {
	test("an open precedent pull request without sources alarms by its entry marker", () => {
		put({ 3: human("CLOSED", clerk("entry", 7)) });
		syncPulls({ number: 7 });
		expect(rows("SELECT issues FROM pulls")).toEqual([{ issues: "" }]);
		expect(alarm(BASE).out).toBe(line("main#7"));
	});

	test("a pull request that left the cache clears the alarm", () => {
		put({ 3: human("CLOSED", clerk("entry", 7)) });
		syncPulls({ number: 7 });
		alarm(BASE);
		syncPulls();
		expect(alarm(later(1)).out).toBe("");
		expect(open()).toEqual([{ ref: "main#7", cleared_at: later(1) }]);
	});

	test.each(["final", "kept"])(
		"a %s marker after the entry clears the alarm",
		(stage) => {
			put({ 3: human("CLOSED", clerk("entry", 7)) });
			syncPulls({ number: 7 });
			alarm(BASE);
			put({ 3: human("CLOSED", clerk("entry", 7), clerk(stage, 7)) });
			expect(alarm(later(1)).out).toBe("");
			expect(open()).toEqual([{ ref: "main#7", cleared_at: later(1) }]);
		},
	);

	test("an entry of another pull request or of the old form does not alarm", () => {
		put({
			3: human("CLOSED", clerk("entry", 8)),
			4: human("CLOSED", mark("clerk", "entry")),
		});
		syncPulls({ number: 7 });
		expect(alarm(BASE).out).toBe("");
	});

	test("a precinct of weight 0 does not alarm", () => {
		put({ 3: human("CLOSED", clerk("entry", 7)) });
		syncPulls({ number: 7 });
		call(BASE, ["precinct", "set", "main", "--weight", "0"]);
		expect(alarm(BASE).out).toBe("");
	});
});

describe("the conviction path on a fixture", () => {
	const ruling = [
		"Ruling.",
		"",
		"## Precedent",
		"",
		"- new no-panics: Never panic in a library.",
		"",
		mark("court", "conviction", ` sha=${SHA}`),
	].join("\n");

	test("the file rides the draft, which alarms only once the work is ready", async () => {
		const spec = withLead(caseMark(), charge(), defence(), ruling);
		put({ 1: spec });
		expect(fields(1)).toMatchObject({
			job: "open",
			branch: "lawman/execute-1-1",
		});
		config(`trusted_login: ${TRUSTED}\n`);
		const tree = join(dir, "tree");
		mkdirSync(tree);
		const r = await inprocAsync(BASE, [
			"precedent",
			"main",
			"--issue",
			"1",
			"--source",
			"https://git.example.com/o/main/issues/1#comment-3",
			"--tree",
			tree,
		]);
		expect(r.out).toBe("entry\t2026-10-14-no-panics\n");
		const file = join(tree, ".lawman", "precedents", "2026-10-14-no-panics.md");
		expect(headerOf(readFileSync(file, "utf8")).kind).toBe("condemns");

		const comments = spec.comments ?? [];
		put({
			1: {
				...spec,
				comments: [
					...comments,
					["2026-10-14T16:00:00Z", pairMark("handed", 9, "open")],
				],
			},
		});
		syncPulls({ number: 9, closes: [1] });
		expect(rows("SELECT work FROM pulls")).toEqual([{ work: "todo" }]);
		expect(alarm(BASE).out).toBe("");
		syncPulls({
			number: 9,
			closes: [1],
			comments: [
				{ body: `Spec\n\n${SPEC}`, id: "SPEC_1", up: ["maint-a"] },
				{ body: `Executor\n\n${READY}`, at: "2026-10-14T17:00:00Z" },
			],
		});
		expect(alarm(later(1)).out).toBe(line("main#9", WAITS_WORK));
	});
});

describe("case in process: the decision job", () => {
	const caseLine = () => inproc(BASE, ["case", "main", "3"]).out;
	const acquitted = (...more: string[]) =>
		withLead(
			caseMark(),
			charge(),
			defence(),
			mark("court", "acquittal"),
			...more,
		);

	test("an entry whose pull request left the cache gives the decision job", () => {
		put({ 3: acquitted(clerk("entry", 7)) });
		expect(caseLine()).toContain("need=clerk ");
		expect(caseLine()).toContain(
			"job=decision action=- pull=7 sources=- branch=-",
		);
	});

	test("while the pull request is open the case waits", () => {
		put({ 3: acquitted(clerk("entry", 7)) });
		syncPulls({ number: 7 });
		expect(caseLine()).toContain("job=- ");
	});

	test("a kept marker ends the job for good", () => {
		put({ 3: acquitted(clerk("entry", 7), clerk("kept", 7)) });
		expect(caseLine()).toContain("job=- ");
	});

	test("a declined case reaches the court in process", () => {
		put({ 3: withLead(caseMark(), mark("prosecutor", "decline")) });
		expect(caseLine()).toStartWith("need=court ");
	});
});

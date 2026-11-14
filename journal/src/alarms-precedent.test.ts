import { beforeEach, describe, expect, test } from "bun:test";
import {
	human,
	issuesJson,
	pairMark,
	type Spec,
	withLead,
} from "./cases-fixture";
import { inproc, inprocFed } from "./inproc";
import { BOT, hostPulls, READY, SPEC } from "./pulls-fixture";
import {
	BASE,
	caseMark,
	charge,
	defence,
	later,
	mark,
	precinct,
	alarm as reconciled,
	rows,
	SHA,
	seed,
	TRUSTED,
	tempDb,
	WAITS_WORK,
} from "./test-helpers";

tempDb();
beforeEach(() => seed((db) => precinct(db, "main")));

const WAITS = "pull request waits for a decision on its precedent";
const line = (ref: string, detail = WAITS) =>
	`ALARM decision-waiting ${ref} ${detail}\n`;
const clerk = (stage: string, pull: number, issue?: string) =>
	mark(
		"clerk",
		stage,
		` pull=${pull}${issue === undefined ? "" : ` issue=${issue}`}`,
	);
const alarm = (clock: string) => reconciled(clock).out;
async function put(specs: Record<number, Spec>) {
	const r = await inprocFed(
		BASE,
		["sync", "main", "--author", TRUSTED],
		issuesJson(specs),
	);
	expect(r.code).toBe(0);
}
async function syncPulls(...pulls: Parameters<typeof hostPulls>[0]) {
	const r = await inprocFed(
		BASE,
		["sync", "main", "--pulls", "--author", BOT],
		JSON.stringify(hostPulls(pulls)),
	);
	expect(r.code).toBe(0);
}
const open = () =>
	rows("SELECT ref, cleared_at FROM alarms ORDER BY id") as {
		ref: string;
		cleared_at: string | null;
	}[];
const caseLine = (n: number) => inproc(BASE, ["case", "main", String(n)]).out;

describe("decision-waiting for a precedent pull request", () => {
	test("an open precedent pull request without sources alarms by its entry marker, which carries the issue", async () => {
		await put({ 3: human("CLOSED", clerk("entry", 7, "closed")) });
		await syncPulls({ number: 7 });
		expect(rows("SELECT issues FROM pulls")).toEqual([{ issues: "" }]);
		expect(alarm(BASE)).toBe(line("main#7"));
	});

	test("a pull request that left the cache clears the alarm", async () => {
		await put({ 3: human("CLOSED", clerk("entry", 7)) });
		await syncPulls({ number: 7 });
		alarm(BASE);
		await syncPulls();
		expect(alarm(later(1))).toBe("");
		expect(open()).toEqual([{ ref: "main#7", cleared_at: later(1) }]);
	});

	test.each(["final", "kept"])(
		"a %s marker after the entry clears the alarm",
		async (stage) => {
			await put({ 3: human("CLOSED", clerk("entry", 7, "closed")) });
			await syncPulls({ number: 7 });
			alarm(BASE);
			await put({
				3: human(
					"CLOSED",
					clerk("entry", 7, "closed"),
					clerk(stage, 7, stage === "final" ? "closed" : undefined),
				),
			});
			expect(alarm(later(1))).toBe("");
			expect(open()).toEqual([{ ref: "main#7", cleared_at: later(1) }]);
		},
	);

	test("an entry of another pull request or of the old form does not alarm", async () => {
		await put({
			3: human("CLOSED", clerk("entry", 8)),
			4: human("CLOSED", mark("clerk", "entry")),
		});
		await syncPulls({ number: 7 });
		expect(alarm(BASE)).toBe("");
	});

	test("a precinct of weight 0 does not alarm", async () => {
		await put({ 3: human("CLOSED", clerk("entry", 7)) });
		await syncPulls({ number: 7 });
		inproc(BASE, ["precinct", "set", "main", "--weight", "0"]);
		expect(alarm(BASE)).toBe("");
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

	test("the draft of a conviction alarms only once the work is ready", async () => {
		const spec = withLead(caseMark(), charge(), defence(), ruling);
		await put({ 1: spec });
		expect(caseLine(1)).toContain(" job=open ");
		expect(caseLine(1)).toContain(" branch=lawman/execute-1-1 ");
		await put({
			1: {
				...spec,
				comments: [
					...(spec.comments ?? []),
					["2026-10-14T16:00:00Z", pairMark("handed", 9, "open")],
				],
			},
		});
		await syncPulls({ number: 9, closes: [1] });
		expect(rows("SELECT work FROM pulls")).toEqual([{ work: "todo" }]);
		expect(alarm(BASE)).toBe("");
		await syncPulls({
			number: 9,
			closes: [1],
			comments: [
				{ body: `Spec\n\n${SPEC}`, id: "SPEC_1", up: ["maint-a"] },
				{ body: `Executor\n\n${READY}`, at: "2026-10-14T17:00:00Z" },
			],
		});
		expect(alarm(later(1))).toBe(line("main#9", WAITS_WORK));
	});
});

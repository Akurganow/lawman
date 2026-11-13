import { beforeEach, describe, expect, test } from "bun:test";
import { lined, pairMark, put, ruled, withLead } from "./cases-fixture";
import { inproc } from "./inproc";
import { config } from "./input-test-fixture";
import {
	acquittal,
	addPrecincts,
	BASE,
	lead,
	mark,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const line = (issue: number) => {
	const r = inproc(BASE, ["case", "main", String(issue)]);
	expect(r.code).toBe(0);
	return r.out.trim();
};

const answered = (answer: string, id: string) =>
	seed((db) =>
		db.run(
			"UPDATE issues SET answer = ?, answer_id = ? WHERE precinct = 'main' AND issue = 1",
			[answer, id],
		),
	);

describe("case in process: the new fields", () => {
	test("an issue with a lead and no answer ends the line with dashes", () => {
		put({ 1: { body: [lead()] } });
		expect(line(1)).toEndWith(" branch=- kind=defect answer=- answer_id=-");
	});

	test("an issue with no lead ends the line with dashes", () => {
		put({ 1: { body: ["no marker"] } });
		expect(line(1)).toEndWith(" branch=- kind=- answer=- answer_id=-");
	});

	test("a comment answer prints its id", () => {
		put({ 1: { body: [lead()] } });
		answered("comment", "IC_9");
		expect(line(1)).toEndWith(" kind=defect answer=comment answer_id=IC_9");
	});

	test("a reaction answer prints a dash for the id", () => {
		put({ 1: { body: [lead()] } });
		answered("up", "-");
		expect(line(1)).toEndWith(" kind=defect answer=up answer_id=-");
	});

	test("a lead with no place relates to nothing", () => {
		put({
			1: { body: [lead("", "-::-::reported")] },
			2: { body: [lead("", "-::-::reported")] },
		});
		expect(line(1)).toContain(" related=- ");
	});
});

describe("case in process: the dismissal job", () => {
	const KEY = "2026-10-14T12:00:00Z";
	const since = (value = KEY) => config(`dismissals_since: ${value}\n`);
	const closeAs = (reason: string | null, at: string | null = KEY) =>
		seed((db) =>
			db.run(
				"UPDATE issues SET state = 'CLOSED', state_reason = ?, closed_at = ? WHERE precinct = 'main' AND issue = 1",
				[reason, at],
			),
		);
	const job = () => line(1).match(/ job=(\S+) /)?.[1];

	test.each(["NOT_PLANNED", null])(
		"a lead closed with reason %s on or after the key is due its dismissal",
		(reason) => {
			put({ 1: { body: [lead()] } });
			since();
			closeAs(reason);
			expect(line(1)).toStartWith("need=clerk ");
			expect(line(1)).toContain(
				" job=precedent action=- pull=- sources=- branch=lawman/precedent-1-1 ",
			);
		},
	);

	test("a close before the key leaves nothing", () => {
		put({ 1: { body: [lead()] } });
		since();
		closeAs("NOT_PLANNED", "2026-10-14T11:59:59Z");
		expect(job()).toBe("-");
	});

	test("a close as completed leaves nothing", () => {
		put({ 1: { body: [lead()] } });
		since();
		closeAs("COMPLETED");
		expect(job()).toBe("-");
	});

	test("a close with no time leaves nothing", () => {
		put({ 1: { body: [lead()] } });
		since();
		closeAs("NOT_PLANNED", null);
		expect(job()).toBe("-");
	});

	test.each([
		["is absent", () => undefined],
		["is not a time", () => since("yesterday")],
	])("a key that %s leaves nothing", (_name, set) => {
		put({ 1: { body: [lead()] } });
		set();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("-");
	});

	test("a lead with no canonical id leaves nothing", () => {
		put({ 1: { body: ["<!-- repo-audit-routine:no-id -->"] } });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("-");
	});

	test("an issue with no lead origin leaves nothing", () => {
		put({ 1: { body: ["no marker"] } });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("-");
	});

	test("a settled pair leaves nothing, whatever reason the host reports", () => {
		put({ 1: withLead(pairMark("settled", 7, "closed")) });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("-");
	});

	test("a clerk marker of the close ends the job", () => {
		put({ 1: withLead(pairMark("kept", 7, "closed")) });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("precedent");
		put({
			1: withLead(
				pairMark("kept", 7, "closed"),
				mark("clerk", "no-entry", " issue=closed"),
			),
		});
		closeAs("NOT_PLANNED");
		expect(job()).toBe("-");
	});

	test("an acquittal that holds a rule line leaves no dismissal once its files are recorded", () => {
		put({ 1: ruled(lined(acquittal)) });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("precedent");
		put({ 1: ruled(lined(acquittal), mark("clerk", "entry")) });
		closeAs("NOT_PLANNED");
		expect(job()).toBe("-");
	});

	test("an acquittal that only cancels is due its dismissal after the cancellation is recorded", () => {
		const cancels = lined(acquittal, "cancel 2026-10-01-old-rule");
		put({ 1: ruled(cancels, mark("clerk", "entry")) });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("precedent");
	});

	test("an acquittal with no rule line is due its dismissal", () => {
		put({ 1: ruled(acquittal) });
		since();
		closeAs("NOT_PLANNED");
		expect(job()).toBe("precedent");
	});
});

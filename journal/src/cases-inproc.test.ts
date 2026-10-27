import { beforeEach, describe, expect, test } from "bun:test";
import { put } from "./cases-fixture";
import { inproc } from "./inproc";
import { addPrecincts, BASE, lead, seed, tempDb } from "./test-helpers";

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

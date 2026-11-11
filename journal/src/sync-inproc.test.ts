import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { EXIT } from "./db";
import { formText } from "./form";
import { inprocAsync } from "./inproc";
import { readIssues } from "./sync-issues";
import {
	addPrecincts,
	BASE,
	issues,
	issuesForm,
	mark,
	minimalIssues,
	rows,
	SHA,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const CREATED = "2026-10-14T09:00:00Z";
const ARGS = ["sync", "main", "--author", TRUSTED];

// readStdin reads file descriptor 0, so the test answers that read
const fed = async (stdin: unknown, args = ARGS) => {
	const spy = spyOn(fs, "readFileSync").mockReturnValue(
		typeof stdin === "string" ? stdin : JSON.stringify(stdin),
	);
	try {
		return await inprocAsync(BASE, args);
	} finally {
		spy.mockRestore();
	}
};

const minimal = (n: number) => minimalIssues(n, CREATED);

beforeEach(() => addPrecincts({ main: 1 }));

describe("sync in process: the issues form", () => {
	test("the object form fills the cache", async () => {
		const r = await fed(issuesForm(issues, ["maintainer-fictional"]));
		expect(r).toMatchObject({ code: EXIT.OK, err: "" });
		expect(r.out).toMatch(
			/^issues=\d+ leads=\d+ markers=\d+ invalid=\d+ skipped=\d+\n$/,
		);
		expect(rows("SELECT count(*) AS n FROM issues")[0]?.n).toBeGreaterThan(0);
	});

	test("a bare list exits 4 with the reason and the form, and the cache stays", async () => {
		await fed(issuesForm(issues));
		const before = rows("SELECT * FROM issues ORDER BY issue");
		const r = await fed(issues);
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain(
			"sync input rejected, cache untouched: the issues form is one object with writers and issues. Run the assembly, finish any amendment it offers, then choose Host once to rewrite host.md.",
		);
		expect(r.err).toContain(formText("issues"));
		expect(rows("SELECT * FROM issues ORDER BY issue")).toEqual(before);
	});

	test("a list of 1000 issues in the object form succeeds", async () => {
		expect((await fed(issuesForm(minimal(1000)))).code).toBe(EXIT.OK);
	});

	test("an object without writers exits 4", async () => {
		const r = await fed({ issues: [] });
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain(formText("issues"));
	});
});

describe("the issues reader", () => {
	const commentOf = (extra: Record<string, unknown>) =>
		readIssues(
			JSON.stringify({
				writers: ["Maintainer-Fictional", "co-writer"],
				issues: [
					{
						number: 4,
						state: "OPEN",
						createdAt: CREATED,
						author: { login: "reporter-fictional" },
						comments: [
							{
								id: "IC_1",
								author: { login: TRUSTED },
								body: "text",
								createdAt: CREATED,
								approvedBy: ["Maintainer-Fictional"],
								rejectedBy: [],
								...extra,
							},
						],
					},
				],
			}),
		);

	test("keeps the comment id and both lists, logins in lower case", () => {
		const { writers, issues: read } = commentOf({
			rejectedBy: ["Co-Writer"],
		});
		expect([...writers]).toEqual(["maintainer-fictional", "co-writer"]);
		expect(read[0]?.comments[0]).toMatchObject({
			id: "IC_1",
			approvedBy: ["maintainer-fictional"],
			rejectedBy: ["co-writer"],
		});
	});

	test("a comment without an id or a list is rejected with the form", () => {
		for (const missing of ["id", "approvedBy", "rejectedBy"]) {
			expect(() => commentOf({ [missing]: undefined })).toThrow(
				formText("issues"),
			);
		}
	});

	test("a comment id that would split the case line is rejected", () => {
		for (const id of ["c 1", "c1\nneed=court", "c1\t"])
			expect(() => commentOf({ id })).toThrow(formText("issues"));
		expect(commentOf({ id: "IC_kwDO-1=" }).issues[0]?.comments[0]?.id).toBe(
			"IC_kwDO-1=",
		);
	});
});

describe("sync in process: the answer", () => {
	const referral = mark("court", "referral", ` sha=${SHA}`);
	const withComments = (comments: Record<string, unknown>[]) =>
		issuesForm(
			[
				{
					number: 1,
					state: "OPEN",
					createdAt: CREATED,
					author: { login: "reporter-fictional" },
					comments,
				},
			],
			["Maintainer-Fictional"],
		);
	const court = {
		id: "IC_court",
		author: { login: TRUSTED },
		body: referral,
		createdAt: "2026-10-14T10:00:00Z",
	};
	const stored = () =>
		rows("SELECT answer, answer_id FROM issues WHERE issue = 1")[0];

	test("a thumbs down of a writer in mixed case stores down and a dash", async () => {
		const r = await fed(
			withComments([
				{ ...court, approvedBy: [], rejectedBy: ["maintainer-fictional"] },
			]),
		);
		expect(r.code).toBe(EXIT.OK);
		expect(stored()).toEqual({ answer: "down", answer_id: "-" });
	});

	test("a comment of a writer stores comment and the comment id", async () => {
		await fed(
			withComments([
				{ ...court, approvedBy: [], rejectedBy: [] },
				{
					id: "IC_reply",
					author: { login: "MAINTAINER-fictional" },
					body: "go on",
					createdAt: "2026-10-14T11:00:00Z",
					approvedBy: [],
					rejectedBy: [],
				},
			]),
		);
		expect(stored()).toEqual({ answer: "comment", answer_id: "IC_reply" });
	});

	test("a later sync over the same issue resets a changed answer", async () => {
		await fed(
			withComments([
				{ ...court, approvedBy: ["maintainer-fictional"], rejectedBy: [] },
			]),
		);
		expect(stored()?.answer).toBe("up");
		await fed(withComments([{ ...court, approvedBy: [], rejectedBy: [] }]));
		expect(stored()).toEqual({ answer: null, answer_id: null });
	});

	test("an issue with no referral stores null in both columns", async () => {
		await fed(issuesForm(issues));
		expect(rows("SELECT DISTINCT answer, answer_id FROM issues")).toEqual([
			{ answer: null, answer_id: null },
		]);
	});
});

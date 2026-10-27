import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { EXIT } from "./db";
import { formText } from "./form";
import { inproc } from "./inproc";
import { SYNC_LIMIT } from "./sync";
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
const fed = (stdin: unknown, args = ARGS) => {
	const spy = spyOn(fs, "readFileSync").mockReturnValue(
		typeof stdin === "string" ? stdin : JSON.stringify(stdin),
	);
	try {
		return inproc(BASE, args);
	} finally {
		spy.mockRestore();
	}
};

const minimal = (n: number) => minimalIssues(n, CREATED);

beforeEach(() => addPrecincts({ main: 1 }));

describe("sync in process: the issues form", () => {
	test("the object form fills the cache", () => {
		const r = fed(issuesForm(issues, ["maintainer-fictional"]));
		expect(r).toMatchObject({ code: EXIT.OK, err: "" });
		expect(r.out).toMatch(
			/^issues=\d+ leads=\d+ markers=\d+ invalid=\d+ skipped=\d+\n$/,
		);
		expect(rows("SELECT count(*) AS n FROM issues")[0]?.n).toBeGreaterThan(0);
	});

	test("a bare list exits 4 with the reason and the form, and the cache stays", () => {
		fed(issuesForm(issues));
		const before = rows("SELECT * FROM issues ORDER BY issue");
		const r = fed(issues);
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain(
			"sync input rejected, cache untouched: the issues form is now one object with writers and issues. Run the assembly, finish any amendment it offers, then choose Host once to rewrite host.md.",
		);
		expect(r.err).toContain(formText("issues"));
		expect(rows("SELECT * FROM issues ORDER BY issue")).toEqual(before);
	});

	test("the ceiling exits 3 in the object form and one fewer succeeds", () => {
		const r = fed(issuesForm(minimal(SYNC_LIMIT)));
		expect(r.code).toBe(EXIT.SYNC_LIMIT);
		expect(r.err).toContain("the list may be truncated");
		expect(fed(issuesForm(minimal(SYNC_LIMIT - 1))).code).toBe(EXIT.OK);
	});

	test("an object without writers exits 4", () => {
		const r = fed({ issues: [] });
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain(formText("issues"));
	});
});

describe("sync in process: a malformed object", () => {
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

	test.each([
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
	])("%s exits 4 and leaves the cache", (_name, input) => {
		fed(issuesForm(issues));
		const before = rows("SELECT * FROM issues ORDER BY issue");
		const r = fed(input);
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain(formText("issues"));
		expect(rows("SELECT * FROM issues ORDER BY issue")).toEqual(before);
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

	test("a thumbs down of a writer in mixed case stores down and a dash", () => {
		const r = fed(
			withComments([
				{ ...court, approvedBy: [], rejectedBy: ["maintainer-fictional"] },
			]),
		);
		expect(r.code).toBe(EXIT.OK);
		expect(stored()).toEqual({ answer: "down", answer_id: "-" });
	});

	test("a comment of a writer stores comment and the comment id", () => {
		fed(
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

	test("a later sync over the same issue resets a changed answer", () => {
		fed(
			withComments([
				{ ...court, approvedBy: ["maintainer-fictional"], rejectedBy: [] },
			]),
		);
		expect(stored()?.answer).toBe("up");
		fed(withComments([{ ...court, approvedBy: [], rejectedBy: [] }]));
		expect(stored()).toEqual({ answer: null, answer_id: null });
	});

	test("an issue with no referral stores null in both columns", () => {
		fed(issuesForm(issues));
		expect(rows("SELECT DISTINCT answer, answer_id FROM issues")).toEqual([
			{ answer: null, answer_id: null },
		]);
	});
});

import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CleanFailed, printCached, WITHHELD } from "./cache-text";
import * as cleanHost from "./clean-host";
import * as db from "./db";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { renderAll } from "./input-parts";
import { command, configs } from "./operations-test-fixture";
import {
	addPrecincts,
	BASE,
	dbFile,
	issuesForm,
	minimalIssues,
	rows,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ a: 1, b: 1 }));

const HIDDEN = "seen <!-- unseen --> text\u200B";
const AT = "2026-10-14T09:00:00Z";
const LATER = "2026-10-14T10:00:00Z";

const issuesInput = (body = HIDDEN) =>
	JSON.stringify(
		issuesForm([
			{
				number: 1,
				state: "OPEN",
				createdAt: AT,
				author: { login: "reporter" },
				body,
				comments: [
					{ id: "IC_2", author: { login: "x" }, createdAt: LATER, body },
					{ id: "IC_1", author: null, createdAt: LATER, body: "first" },
				],
			},
		]),
	);
const pullsInput = () =>
	JSON.stringify({
		writers: [],
		pulls: [
			{
				number: 9,
				author: TRUSTED,
				body: HIDDEN,
				closes: [],
				comments: [
					{
						id: "PC_1",
						author: "",
						createdAt: AT,
						body: HIDDEN,
						approvedBy: [],
						rejectedBy: [],
					},
				],
				changesRequested: [],
			},
		],
	});

const sync = async (name: string, input: string, extra: string[] = []) => {
	const stdin = spyOn(db, "readStdin").mockReturnValue(input);
	try {
		return await inprocAsync(BASE, [
			"sync",
			name,
			"--author",
			TRUSTED,
			...extra,
		]);
	} finally {
		stdin.mockRestore();
	}
};

// the command prints a file of the same bytes that sync reads on stdin
const feeding = (precinct: string, operation: string, input: string) => {
	command(configs(precinct), operation, `cat ${operation}.json`);
	writeFileSync(join(configs(precinct), `${operation}.json`), input);
};
const run = (precinct: string, ...args: string[]) =>
	inprocAsync(BASE, ["run", precinct, ...args]);

const texts = (precinct: string) => ({
	issues: rows(
		`SELECT issue, body FROM issues WHERE precinct = '${precinct}' ORDER BY issue`,
	),
	pulls: rows(
		`SELECT number, body FROM pulls WHERE precinct = '${precinct}' ORDER BY number`,
	),
	comments: rows(
		`SELECT kind, number, id, author, at, body FROM comments WHERE precinct = '${precinct}' ORDER BY kind, id`,
	),
});

const printed = async (precinct: string, kind: "issue" | "pull", n: number) => {
	const opened = db.open(dbFile);
	try {
		const blocks = await printCached(opened, precinct, kind, n);
		return blocks === null ? null : renderAll(blocks);
	} finally {
		opened.close();
	}
};

describe("the texts in the cache", () => {
	test("sync on stdin and the issues command with the same bytes store the same texts", async () => {
		const input = issuesInput();
		const piped = await sync("a", input);
		feeding("b", "issues", input);
		const ran = await run("b", "issues", "--author", TRUSTED);
		expect(ran).toEqual({ ...piped, out: piped.out });
		expect(texts("b")).toEqual(texts("a"));
		expect(texts("a").issues).toEqual([{ issue: 1, body: "seen text" }]);
	});

	test("the pulls command and sync --pulls store the same texts", async () => {
		const piped = await sync("a", pullsInput(), ["--pulls"]);
		feeding("b", "pulls", pullsInput());
		expect(await run("b", "pulls", "--author", TRUSTED)).toEqual(piped);
		expect(piped.out).toBe("pulls=1\n");
		expect(texts("b")).toEqual(texts("a"));
	});

	test("an issue sync keeps the pull request comments, a pull sync the issue comments", async () => {
		feeding("a", "issues", issuesInput());
		feeding("a", "pulls", pullsInput());
		await run("a", "issues", "--author", TRUSTED);
		await run("a", "pulls", "--author", TRUSTED);
		const both = texts("a").comments;
		expect(both.map((c) => c.kind)).toEqual(["issue", "issue", "pull"]);
		await run("a", "issues", "--author", TRUSTED);
		expect(texts("a").comments).toEqual(both);
		await run("a", "pulls", "--author", TRUSTED);
		expect(texts("a").comments).toEqual(both);
	});

	test("a comment id that repeats on one issue has its own message", async () => {
		const repeated = issuesForm([
			{
				number: 1,
				state: "OPEN",
				createdAt: AT,
				author: { login: "reporter" },
				comments: [
					{ id: "IC_1", createdAt: AT },
					{ id: "IC_1", createdAt: LATER },
				],
			},
		]);
		const r = await sync("a", JSON.stringify(repeated));
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain("a comment id repeats on #1");
		expect(r.err).not.toContain("repeated number");
	});

	test("a list of 1000 issues is read, and an empty list over a cache is code 4", async () => {
		feeding("a", "issues", JSON.stringify(issuesForm(minimalIssues(1000, AT))));
		const big = await run("a", "issues", "--author", TRUSTED);
		expect(big.code).toBe(EXIT.OK);
		expect(big.out).toStartWith("issues=1000 ");
		feeding("a", "issues", issuesInput());
		await run("a", "issues", "--author", TRUSTED);
		feeding("a", "issues", JSON.stringify(issuesForm([])));
		const empty = await run("a", "issues", "--author", TRUSTED);
		expect(empty.code).toBe(EXIT.SYNC_INPUT);
		expect(empty.out).toContain("empty list over a filled cache needs --reset");
		expect(
			(await run("a", "issues", "--author", TRUSTED, "--reset")).code,
		).toBe(EXIT.OK);
	});

	test("a pulls form outside the shape prints the reader's message in the fence", async () => {
		feeding("a", "pulls", JSON.stringify({ writers: [], pulls: {} }));
		const r = await run("a", "pulls", "--author", TRUSTED);
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.out).toStartWith("pulls failed reason=form\n~~~error\n");
		expect(r.out).toContain("pulls is not a list");
	});

	test("a text the cleaning cannot process is stored as a placeholder and named, the rest is stored", async () => {
		const deep = "> ".repeat(12_800);
		const form = issuesForm([
			{
				number: 1,
				state: "OPEN",
				createdAt: AT,
				author: { login: "reporter" },
				body: deep,
				comments: [
					{ id: "IC_1", author: null, createdAt: AT, body: "fine" },
					{ id: "IC_2", author: null, createdAt: LATER, body: deep },
				],
			},
			{
				number: 2,
				state: "OPEN",
				createdAt: AT,
				author: { login: "reporter" },
				body: "seen <!-- unseen --> text",
			},
		]);
		const r = await sync("a", JSON.stringify(form));
		expect(r).toEqual({
			code: EXIT.OK,
			out: "issues=2 leads=0 markers=0 invalid=0 skipped=0 uncleaned=issue:1:body,issue:1:comment\n",
			err: "",
		});
		expect(texts("a")).toEqual({
			issues: [
				{ issue: 1, body: WITHHELD },
				{ issue: 2, body: "seen text" },
			],
			pulls: [],
			comments: [
				{
					kind: "issue",
					number: 1,
					id: "IC_1",
					author: null,
					at: AT,
					body: "fine",
				},
				{
					kind: "issue",
					number: 1,
					id: "IC_2",
					author: null,
					at: LATER,
					body: WITHHELD,
				},
			],
		});
		expect(await printed("a", "issue", 1)).toContain(WITHHELD);
		expect(await printed("a", "issue", 1)).not.toContain(">");
	});

	test("a pull request text that fails is withheld the same way, through the command", async () => {
		const pulls = JSON.parse(pullsInput());
		pulls.pulls[0].comments[0].body = "<div>".repeat(12_800);
		feeding("a", "pulls", JSON.stringify(pulls));
		const r = await run("a", "pulls", "--author", TRUSTED);
		expect(r).toEqual({
			code: EXIT.OK,
			out: "pulls=1 uncleaned=pull:9:comment\n",
			err: "",
		});
		expect(texts("a").pulls).toEqual([{ number: 9, body: "seen text" }]);
		expect(texts("a").comments).toEqual([
			{
				kind: "pull",
				number: 9,
				id: "PC_1",
				author: null,
				at: AT,
				body: WITHHELD,
			},
		]);
	});

	test("a library error never reaches the stored text or the line", async () => {
		const failing = spyOn(cleanHost, "cleanHostText").mockRejectedValue(
			new Error("the library quotes the input"),
		);
		try {
			const r = await sync("a", issuesInput());
			expect(r.code).toBe(EXIT.OK);
			expect(r.out + r.err).not.toContain("quotes");
			expect(texts("a").issues).toEqual([{ issue: 1, body: WITHHELD }]);
		} finally {
			failing.mockRestore();
		}
	});
});

describe("the link of an issue and a pull request", () => {
	test("the address the host reports is stored, and one that is no web address is dropped", async () => {
		const issues = JSON.parse(issuesInput());
		issues.issues[0].url = "https://git.example/o/a/issues/1";
		issues.issues.push({
			...issues.issues[0],
			number: 2,
			url: "javascript:alert(1)",
			comments: [],
		});
		issues.issues.push({
			...issues.issues[0],
			number: 3,
			url: "https://git.example/a b",
			comments: [],
		});
		issues.issues.push({ ...issues.issues[0], number: 4, comments: [] });
		delete issues.issues[3].url;
		expect((await sync("a", JSON.stringify(issues))).code).toBe(EXIT.OK);
		const pulls = JSON.parse(pullsInput());
		pulls.pulls[0].url = "http://git.example/o/a/pull/9";
		expect((await sync("a", JSON.stringify(pulls), ["--pulls"])).code).toBe(
			EXIT.OK,
		);
		expect(rows("SELECT issue, url FROM issues ORDER BY issue")).toEqual([
			{ issue: 1, url: "https://git.example/o/a/issues/1" },
			{ issue: 2, url: null },
			{ issue: 3, url: null },
			{ issue: 4, url: null },
		]);
		expect(rows("SELECT number, url FROM pulls")).toEqual([
			{ number: 9, url: "http://git.example/o/a/pull/9" },
		]);
	});
});

describe("printing from the cache", () => {
	test("prints the body, then each comment by time and id, every text cleaned again", async () => {
		seed((d) => {
			d.run(
				"INSERT INTO issues (precinct, issue, state, title, created_at, body) VALUES ('a', 1, 'OPEN', 't', ?, ?)",
				[AT, HIDDEN],
			);
			for (const [id, at, author] of [
				["IC_b", LATER, "x"],
				["IC_a", LATER, null],
				["IC_c", AT, "y"],
			] as [string, string, string | null][])
				d.run(
					"INSERT INTO comments (precinct, kind, number, id, author, at, body) VALUES ('a', 'issue', 1, ?, ?, ?, ?)",
					[id, author, at, HIDDEN],
				);
		});
		expect(await printed("a", "issue", 1)).toBe(
			[
				"~~~issue",
				"seen text",
				"~~~",
				`comment at=${AT}`,
				"~~~comment",
				'id="IC_c" author="y"',
				"seen text",
				"~~~",
				`comment at=${LATER}`,
				"~~~comment",
				'id="IC_a" author=null',
				"seen text",
				"~~~",
				`comment at=${LATER}`,
				"~~~comment",
				'id="IC_b" author="x"',
				"seen text",
				"~~~",
			].join("\n"),
		);
	});

	test("a comment without an author prints author=null in the issue and the pull form", async () => {
		await sync("a", issuesInput());
		await sync("a", pullsInput(), ["--pulls"]);
		expect(await printed("a", "issue", 1)).toContain('id="IC_1" author=null');
		expect(await printed("a", "pull", 9)).toContain('id="PC_1" author=null');
		expect(
			rows("SELECT count(*) AS n FROM comments WHERE author IS NULL"),
		).toEqual([{ n: 2 }]);
	});

	test("an issue the cache does not hold prints nothing", async () => {
		expect(await printed("a", "issue", 5)).toBeNull();
	});

	test("a failed cleaning throws CleanFailed", async () => {
		await sync("a", issuesInput());
		const failing = spyOn(cleanHost, "cleanHostText").mockRejectedValue(
			new Error("x"),
		);
		try {
			await expect(printed("a", "issue", 1)).rejects.toBeInstanceOf(
				CleanFailed,
			);
		} finally {
			failing.mockRestore();
		}
	});
});

import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { printCached } from "./cache-text";
import * as cleanHost from "./clean-host";
import { cleanEach, WITHHELD } from "./clean-run";
import * as db from "./db";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { renderAll } from "./input-parts";
import { command, configs } from "./operations-test-fixture";
import {
	addPrecincts,
	alarm,
	BASE,
	dbFile,
	issuesForm,
	rows,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ a: 1, b: 1 }));

// the cleaning fails for a text that holds the word FAULT and cleans every other text
async function onlyFaultFails<T>(run: () => Promise<T>): Promise<T> {
	const real = cleanHost.cleanHostText;
	const spy = spyOn(cleanHost, "cleanHostText").mockImplementation((t) =>
		t.includes("FAULT")
			? Promise.reject(new Error("the library quotes"))
			: real(t),
	);
	try {
		return await run();
	} finally {
		spy.mockRestore();
	}
}

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

	test("an empty list over a cache is code 4", async () => {
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

	test("a text the cleaning cannot process is stored as a placeholder, and the rest is stored", async () => {
		const form = issuesForm([
			{
				number: 1,
				state: "OPEN",
				createdAt: AT,
				author: { login: "reporter" },
				body: "FAULT in this text",
				comments: [
					{ id: "IC_1", author: null, createdAt: AT, body: "fine" },
					{ id: "IC_2", author: null, createdAt: LATER, body: "FAULT" },
				],
			},
		]);
		const r = await onlyFaultFails(() => sync("a", JSON.stringify(form)));
		expect(r.out).toBe(
			"issues=1 leads=0 markers=0 invalid=0 skipped=0 withheld=2\n",
		);
		expect(texts("a").issues).toEqual([{ issue: 1, body: WITHHELD }]);
		expect(texts("a").comments.map((c) => c.body)).toEqual(["fine", WITHHELD]);
	});

	test("a pull request text that fails is withheld the same way, through the command", async () => {
		const pulls = JSON.parse(pullsInput());
		pulls.pulls[0].comments[0].body = "FAULT in this text";
		feeding("a", "pulls", JSON.stringify(pulls));
		const r = await onlyFaultFails(() =>
			run("a", "pulls", "--author", TRUSTED),
		);
		expect(r.out).toBe("pulls=1 withheld=1\n");
		expect(texts("a").comments.map((c) => c.body)).toEqual([WITHHELD]);
	});
});

describe("printing from the cache", () => {
	test("prints the body, then each comment by time and id", async () => {
		seed((d) => {
			d.run(
				"INSERT INTO issues (precinct, issue, state, title, created_at, body) VALUES ('a', 1, 'OPEN', 't', ?, ?)",
				[AT, "seen text"],
			);
			for (const [id, at, author] of [
				["IC_b", LATER, "x"],
				["IC_a", LATER, null],
				["IC_c", AT, "y"],
			] as [string, string, string | null][])
				d.run(
					"INSERT INTO comments (precinct, kind, number, id, author, at, body) VALUES ('a', 'issue', 1, ?, ?, ?, ?)",
					[id, author, at, "seen text"],
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
});

describe("cleaning once", () => {
	const calls = async (run: () => Promise<unknown>) => {
		const spy = spyOn(cleanHost, "cleanHostText");
		try {
			await run();
			return spy.mock.calls.length;
		} finally {
			spy.mockRestore();
		}
	};

	test("a sync of texts that did not change cleans nothing, and a changed text is cleaned again", async () => {
		expect(await calls(() => sync("a", issuesInput()))).toBeGreaterThan(0);
		expect(await calls(() => sync("a", issuesInput()))).toBe(0);
		expect(await calls(() => sync("a", issuesInput("seen text\n!")))).toBe(1);
		expect(texts("a").issues).toEqual([{ issue: 1, body: "seen text\n!" }]);
	});

	test("a text that passes its time budget is withheld", async () => {
		const long = `${"word ".repeat(100)}end`;
		const done = await cleanEach([long], 1);
		expect(done.get(long)).toEqual({ text: WITHHELD, withheld: true });
		expect((await cleanEach([long])).get(long)?.withheld).toBe(false);
	});
});

describe("the alarm of withheld texts", () => {
	test("one alarm names the count and the first texts with their links, and clears with the text", async () => {
		const form = (body: string) => {
			const f = JSON.parse(issuesInput(body));
			f.issues[0].url = "https://git.example/o/a/issues/1";
			return JSON.stringify(f);
		};
		await onlyFaultFails(() => sync("a", form("FAULT")));
		await onlyFaultFails(() => sync("a", form("FAULT")));
		expect(rows("SELECT withheld FROM issues")).toEqual([{ withheld: 1 }]);
		expect(alarm(AT).out).toBe(
			"ALARM withheld-text a 2 texts are withheld, because the journal could not clean them: issue #1 https://git.example/o/a/issues/1; comment IC_2 on issue #1 https://git.example/o/a/issues/1. Edit or delete each on the host.\n",
		);
		await sync("a", form("fixed"));
		expect(alarm(LATER).out).toBe("");
		expect(rows("SELECT cleared_at FROM alarms")).toEqual([
			{ cleared_at: LATER },
		]);
	});

	test("a body that holds the fixed sentence raises no alarm", async () => {
		await sync("a", issuesInput(WITHHELD));
		expect(alarm(AT).out).toBe("");
	});
});

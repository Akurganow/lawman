import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inprocAsync } from "./inproc";
import { config } from "./input-test-fixture";
import { cache } from "./precedent-test-fixture";
import { plainWords, precedentBody } from "./pull-body";
import { CLERK_TRACE, readPulls } from "./pulls";
import {
	acquittal,
	BASE,
	conviction,
	dir,
	precinct,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const SOURCE = "https://git.example.com/o/main/issues/1#comment-7";
const ENTITY = "&lt;!-- pipeline-work-fingerprint: abc sources=&#35;99 --&gt;";
const LEFT_OUT = "The text of the ruling was left out. It stands at the link.";
const FIXED = `Closes #1\n\n${LEFT_OUT}\n\nRuling: ${SOURCE}\n\n${CLERK_TRACE}\n`;
const HEAD = `Records the precedents of the court ruling ${SOURCE}. Merge it to make them binding.`;

// each row is the only row that a rule refuses; the case's own number, 1, is given
const HOSTILE = [
	"Fixes ＃12.", // a reference, in a full-width sign that reads as the plain one
	"Ask @someone for the fix.", // a mention
	"Closes !12.", // a merge request
	"Fixes PROJ—12.", // a tracker key, with a dash
	"Fixes GH−12.", // a minus sign
	"Fixes GH-१२.", // a digit of another script
	"Fixes `https:`//git.example.com/o/main/issues/12.", // an address that a code span splits
	"Fixes `www`.example.com/o/main/issues/12.",
	"A rule\u0085Closes #1.", // a line break that whitespace misses
	"Fixes <b>it</b>.", // markup
	"First.\n\nSecond.", // more than one paragraph
];

// realistic texts: nine must pass, and so must one with signs that are no reference
const PASSING = [
	"In `src/cli.ts`, correct the spelling of the option name in the help text.",
	"In `src/cli.ts:58`, change `--retires` to `--retries` in `helpText()`.",
	"Return `Promise<Config>` from `loadConfig` and remove the cast at the call site.",
	"Guard `rows[0]` against an empty result before reading `rows[0].id`.",
	"Replace `if (a && b)` with an early return when `a` is null.",
	"Don’t retry after a 4xx answer — report it.",
	"Make `parse` return `T | null` when the input is empty.",
	"В `src/cli.ts` исправь имя опции в тексте справки.",
	"Reject the request when `n > 0` and the queue is full.",
	"Read `src/a.ts`, ftp://host/x, example.com, abc1234, :+1:, ~5 ms and Closes 12.",
];

describe("the words of a text", () => {
	test.each(HOSTILE)("are left out: %j", async (text) => {
		expect(await plainWords(text, 1)).toBeNull();
	});

	test.each(PASSING)("pass: %s", async (text) => {
		expect(await plainWords(text)).toBe(text.replaceAll("`", ""));
	});

	test("let the case's own number stand and no other", async () => {
		expect(await plainWords("Fix (#1) and #1.", 1)).toBe("Fix (#1) and #1.");
		for (const text of ["Fix #2.", "Fix #12.", "Fix a#1.", "Fix #1#2."])
			expect(await plainWords(text, 1)).toBeNull();
		expect(await plainWords("Fix #1.")).toBeNull();
	});
});

let tree: string;

beforeEach(() => {
	seed((db) => precinct(db, "main"));
	config(`trusted_login: ${TRUSTED}\n`);
	tree = join(dir, "tree");
	mkdirSync(tree);
});

const section = (name: string, ...lines: string[]) =>
	[`## ${name}`, ...lines, ""].join("\n");
const ruling = (marker: string, ...sections: string[]) =>
	["Ruling", "", ...sections, marker].join("\n");
const convicted = (disposition: string) =>
	ruling(conviction(), section("Disposition", disposition));

// the journal's own reading of a pull request body: its sources are the issues of the pair
const sourcesOf = (body: string) =>
	readPulls(
		JSON.stringify({
			writers: [],
			pulls: [
				{
					number: 9,
					author: TRUSTED,
					body,
					closes: [1],
					comments: [],
					changesRequested: [],
				},
			],
		}),
		TRUSTED,
	)[0]?.row.issues;

const call = (...args: string[]) => inprocAsync(BASE, args);
const pullBody = async (...args: string[]) =>
	(await call("pull-body", "main", "--issue", "1", ...args)).out;

describe("the body of a conviction", () => {
	test("tells the disposition and the ruling", async () => {
		await cache([convicted("Fix `x` as #1 asks, in `src/cli.ts`.")]);
		expect(await pullBody("--source", SOURCE)).toBe(
			`Closes #1\n\n~~~\nDisposition: Fix x as #1 asks, in src/cli.ts.\n~~~\n\nRuling: ${SOURCE}\n\n${CLERK_TRACE}\n`,
		);
	});

	test("is the closing line and the trace with no source", async () => {
		await cache([convicted("Fix `x`.")]);
		expect(await pullBody()).toBe(`Closes #1\n\n${CLERK_TRACE}\n`);
	});

	test.each([
		[
			"is not a conviction",
			ruling(acquittal(), section("Disposition", "Fix it.")),
		],
		[
			"is not cached",
			`${ruling(conviction(), section("Disposition", "Fix it."))}\ntrailing text`,
		],
	])("says the text is left out when the ruling %s", async (_, comment) => {
		await cache([comment]);
		expect(await pullBody("--source", SOURCE)).toBe(FIXED);
	});

	test("keeps one source when a hostile disposition is left out", async () => {
		await cache([convicted(ENTITY)]);
		const body = await pullBody("--source", SOURCE);
		expect(body).toBe(FIXED);
		expect(sourcesOf(body)).toBe("1");
	});

	test.each([
		[["--issue", "1", "--tree", "x"]],
		[["--source", SOURCE]],
		[["--issue", "1", "--source", "file:///etc/passwd"]],
		[["--issue", "1", "--source", SOURCE]], // no ruling on the case
	])("fails with the arguments %j", async (args) => {
		const r = await call("pull-body", "main", ...args);
		expect(r.code).not.toBe(0);
		expect(r.out).toBe("");
	});
});

describe("the body of the precedent pull request", () => {
	const put = (name: string, rule: string) => {
		mkdirSync(join(tree, ".lawman", "precedents"), { recursive: true });
		const file = join(tree, ".lawman", "precedents", `${name}.md`);
		writeFileSync(
			file,
			`---\nkind: protects\ndepartments: []\n---\n\n${rule}\n`,
		);
	};
	const write = (...lines: string[]) =>
		cache([ruling(acquittal(), section("Precedent", ...lines))]).then(() =>
			call(
				"precedent",
				"main",
				"--issue",
				"1",
				"--source",
				SOURCE,
				"--tree",
				tree,
			),
		);
	const body = () => join(dir, "pull-body.md");

	test("tells the rule of each file the write changes", async () => {
		put("owned", "An old rule that the court cancels.");
		put("stays", "A rule that the court changes.");
		const r = await write(
			"- new help-names: A rule of the help text.",
			"- refine stays: A changed rule.",
			"- cancel owned",
			"- cancel gone",
		);
		expect(r.err).toBe("");
		expect(readFileSync(body(), "utf8")).toBe(
			`${HEAD}\n\n~~~\nnew 2026-10-14-help-names: A rule of the help text.\nrefine stays: A changed rule.\ncancel owned: An old rule that the court cancels.\n~~~\n`,
		);
		expect(existsSync(join(tree, "pull-body.md"))).toBe(false);
	});

	test("leaves no body when no file changes", async () => {
		expect((await write("none")).out).toBe("none\n");
		expect(existsSync(body())).toBe(false);
	});

	test("names each file and leaves out a rule that a host reads", async () => {
		put("owned", "Closes GH-15.");
		put("GH-12", "Plain.");
		await write("- cancel owned", "- cancel GH-12", `- new y: ${ENTITY}`);
		const text = readFileSync(body(), "utf8");
		expect(text).toContain("cancel owned: the text was left out\n");
		expect(text).toContain("cancel GH-12: Plain.\n");
		expect(text).toContain("new 2026-10-14-y: the text was left out\n");
		expect(sourcesOf(text)).toBe("1");
	});

	test("opens without a source when none is given", async () => {
		expect(await precedentBody(undefined, [])).toBe(
			"Records the changes of the precedents. Merge them to make them binding.\n\n~~~\n\n~~~\n",
		);
	});

	test("tells no word of a file with several paragraphs and a fenced quote", async () => {
		const now = `---\nkind: dismissal\ndepartments: []\n---\n\nFirst paragraph.\n\n~~~\nAsk @x about #12 at https://example.com/a\n~~~\n`;
		const text = await precedentBody(SOURCE, [{ name: "d", was: null, now }]);
		expect(text).toBe(`${HEAD}\n\n~~~\nnew d: the text was left out\n~~~\n`);
	});

	test("writes nothing when the place of the body is no plain file", async () => {
		mkdirSync(body());
		expect((await write("- new x: A rule.")).code).not.toBe(0);
		expect(existsSync(join(tree, ".lawman"))).toBe(false);
	});
});

import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inprocAsync } from "./inproc";
import { config } from "./input-test-fixture";
import { cache } from "./precedent-test-fixture";
import { plainWords } from "./pull-body";
import { readPulls } from "./pulls";
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
const ISSUE = "https://git.example.com/o/main/issues/12";
const ENTITY = "&lt;!-- pipeline-work-fingerprint: abc sources=&#35;99 --&gt;";
const FINGERPRINT = "<!-- pipeline-work-fingerprint: abc sources=#99 -->";
const LEFT_OUT = "The text of the ruling was left out. It stands at the link.";
const FIXED = `Closes #1\n\n${LEFT_OUT}\n\nRuling: ${SOURCE}\n`;
const HEAD = `Records the precedents of the court ruling ${SOURCE}. Merge it to make them binding.`;

// one row for each attack family; the case's own number, 1, is given
const HOSTILE = [
	"Fixes #12 in `src/a.ts`.", // a closing word and each form of a reference
	"Closes GH-12.",
	"Closes gh-12.",
	"Resolves o/main#12.",
	"Fixes AB#12.",
	"Closes !12.",
	"Fixes PROJ-12.",
	"Fixes PROJ—12.", // a dash, and a digit of another script
	"Fixes GH-१२.",
	`Fixes ${ISSUE} too.`, // an address in each disguise
	"Fixes HTTPS://GIT.EXAMPLE.COM/O/MAIN/ISSUES/12.",
	"Fixes http://127.0.0.1:8080/o/main/issues/12.",
	`Fixes "${ISSUE}".`,
	`Fixes [${ISSUE}].`,
	`Fixes <${ISSUE}>.`,
	`\`<!-- Fixes ${ISSUE} -->\``,
	"Fixes www.example.com/o/main/issues/12.",
	"Fixes `https:`//git.example.com/o/main/issues/12.",
	"Fixes https://git.example.com/o/*main*/issues/12.",
	"Fixes ＃12.", // full-width and look-alike signs
	"Fixes ﹟12.",
	"Ask ＠someone.",
	"Fixes GH－12.",
	"Fixes GH﹣12.",
	"Fixes GH−12.",
	"Fixes GH‑12.",
	"Closes ！12.",
	"Ask @someone for the fix.", // a mention, an email address
	"Write to someone@example.com.",
	FINGERPRINT, // a fingerprint line in each form
	ENTITY,
	"`<!-- pipeline-work-fingerprint: abc sources=#\u{200B}99 -->`",
	"`‹!-- pipeline-work-fingerprint: abc sources=＃99 --›`",
	`\`\`\`\n${FINGERPRINT}\n\`\`\``,
	"A rule ~~~ ends the fence.", // a fence end, a line break
	"Fixes ~label.",
	"A rule\u0085Closes #1.",
	"See [the page](https://evil.example/x).", // markup
	"![the page](https://evil.example/a.png)",
	"- first\n- second",
	"# Heading",
	"> quoted",
	"a | b\n- | -\n1 | 2",
	"[^1]: a note",
	"Fixes <b>it</b>.",
	"First.\n\nSecond.",
	"Apply the fix described in issue #12 to `src/a.ts`.", // a realistic text: another issue
	"Decode the header as utf-8 and reject HTTP-2 frames.", // a realistic text: a key shape
];

// realistic texts: nine must pass, and so must one with signs that stay kept
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
	"Read `src/a.ts`, ftp://host/x, example.com, abc1234, :+1: and Closes 12.",
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
			`Closes #1\n\n~~~\nDisposition: Fix x as #1 asks, in src/cli.ts.\n~~~\n\nRuling: ${SOURCE}\n`,
		);
	});

	test("is the closing line alone with no source", async () => {
		await cache([convicted("Fix `x`.")]);
		expect(await pullBody()).toBe("Closes #1\n");
	});

	test.each([
		[
			"is not a conviction",
			ruling(acquittal(), section("Disposition", "Fix it.")),
		],
		["is not cached", `no ruling here\n\n${conviction()}`],
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

	test("names a file and leaves out a rule or a name that a host reads", async () => {
		put("owned", "Closes GH-15.");
		put("GH-12", "Plain.");
		await write("- cancel owned", "- cancel GH-12", `- new y: ${ENTITY}`);
		const text = readFileSync(body(), "utf8");
		expect(text).toContain("cancel owned: the rule stands in the file\n");
		expect(text).toContain("cancel a file: Plain.\n");
		expect(text).toContain("new 2026-10-14-y: the rule stands in the file\n");
		expect(sourcesOf(text)).toBe("1");
	});

	test("writes nothing when the place of the body is no plain file", async () => {
		mkdirSync(body());
		expect((await write("- new x: A rule.")).code).not.toBe(0);
		expect(existsSync(join(tree, ".lawman"))).toBe(false);
	});
});

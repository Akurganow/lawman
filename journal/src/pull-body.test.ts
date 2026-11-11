import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripInvisible } from "./clean";
import { inprocAsync } from "./inproc";
import { config } from "./input-test-fixture";
import { lintBody } from "./lint-body";
import { cache } from "./precedent-test-fixture";
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
const DATE = "2026-10-14";
const VERDICT =
	"Conviction, priority P3: every ground of the charge stands at the analysed commit.";
const DISPOSITION =
	"In `src/cli.ts`, correct the spelling of the option name in the help text.";
const FIXED_CONVICTION = `Closes #1\n\nRuling: ${SOURCE}\n`;
const FIXED_PRECEDENT = `Records the precedents of the court ruling ${SOURCE}. Merge it to make them binding.\n`;
const FINGERPRINT = "<!-- pipeline-work-fingerprint: abc sources=#99 -->";

let tree: string;

beforeEach(() => {
	seed((db) => precinct(db, "main"));
	config(`trusted_login: ${TRUSTED}\n`);
	tree = join(dir, "tree");
	mkdirSync(tree);
});

const put = (name: string, text: string) => {
	mkdirSync(join(tree, ".lawman", "precedents"), { recursive: true });
	writeFileSync(join(tree, ".lawman", "precedents", `${name}.md`), text);
};
const oldFile = (rule: string) =>
	`---\nkind: protects\ndepartments: []\n---\n\n${rule}\n`;

const ruling = (marker: string, ...sections: string[]) =>
	["Ruling", "", ...sections, "", marker].join("\n");
const section = (name: string, ...lines: string[]) => [
	`## ${name}`,
	...lines,
	"",
];
const convicted = (verdict: string, disposition: string[]) =>
	ruling(
		conviction(),
		...section("Verdict", verdict),
		...section("Disposition", ...disposition),
	);

async function body(args: string[] = []) {
	const r = await inprocAsync(BASE, [
		"precedent",
		"main",
		"--issue",
		"1",
		"--body",
		SOURCE,
		...args,
	]);
	expect(r.err).toBe("");
	return r.out;
}
const precedentBody = () => body(["--tree", tree]);

// the journal's own reading of a pull request body: its sources are the issues of the pair
const sourcesOf = (text: string) =>
	readPulls(
		JSON.stringify({
			writers: [],
			pulls: [
				{
					number: 9,
					author: TRUSTED,
					body: text,
					closes: [1],
					comments: [],
					changesRequested: [],
				},
			],
		}),
		TRUSTED,
	)[0]?.row.issues;

describe("the body of a conviction", () => {
	test("tells the verdict and the disposition", async () => {
		await cache([convicted(VERDICT, [DISPOSITION])]);
		expect(await body()).toBe(
			[
				"Closes #1",
				"",
				"~~~",
				`Verdict: ${VERDICT}`,
				"Disposition: In src/cli.ts, correct the spelling of the option name in the help text.",
				"~~~",
				"",
				`Ruling: ${SOURCE}`,
				"",
			].join("\n"),
		);
	});

	test("keeps the fixed body when the ruling is not cached", async () => {
		await cache([["no ruling here", "", conviction()].join("\n")]);
		expect(await body()).toBe(FIXED_CONVICTION);
	});

	test("keeps the fixed body for an acquittal", async () => {
		await cache([ruling(acquittal(), ...section("Verdict", VERDICT))]);
		expect(await body()).toBe(FIXED_CONVICTION);
	});

	// each text reaches the journal as the cache stores it, so a hostile text is one that the cache lets through
	const HOSTILE: [string, string[]][] = [
		["a fingerprint line, bare", [FINGERPRINT]],
		[
			"a fingerprint line as a character reference",
			[FINGERPRINT.replace("<", "&lt;")],
		],
		["a fingerprint line in a fence", ["```", FINGERPRINT, "```"]],
		["a closing word and an issue", ["Fixes #15 as well."]],
		["a closing word and a shorthand", ["Closes GH-15 as well."]],
		["a mention", ["Ask @someone for the fix."]],
		["a link", ["See [the page](https://evil.example/x)."]],
		["an address", ["Fixes https://git.example.com/o/main/issues/15 too."]],
		[
			"an address that code spans split",
			["Fixes `https:`//git.example.com/o/main/issues/15."],
		],
		["an image", ["![the page](https://evil.example/a.png)"]],
		["a list", ["- first", "- second"]],
	];

	test.each(HOSTILE)("leaves out %s", async (_, lines) => {
		await cache([convicted(VERDICT, lines)]);
		const text = await body();
		expect(text).toBe(
			`Closes #1\n\n~~~\nVerdict: ${VERDICT}\n~~~\n\nRuling: ${SOURCE}\n`,
		);
		expect(sourcesOf(text)).toBe("1");
		expect(await lintBody(text, false)).toEqual([]);
	});

	test("keeps the fixed body when nothing of the ruling is plain", async () => {
		await cache([convicted("Closes #15.", ["Fixes #15 as well."])]);
		const text = await body();
		expect(text).toBe(FIXED_CONVICTION);
		expect(sourcesOf(text)).toBe("1");
	});
});

describe("the body of the precedent pull request", () => {
	const RULE =
		"A help text that names an option the parser does not accept is a violation.";

	test("tells the rule of each file the call would write or cancel", async () => {
		put("owned", oldFile("An old rule that the court cancels."));
		put("stays", oldFile("A rule the court leaves alone."));
		await cache([
			ruling(
				acquittal(),
				...section(
					"Precedent",
					`- new help-names: ${RULE}`,
					"- refine stays: A rule the court leaves alone.",
					"- cancel owned",
					"- cancel gone",
				),
			),
		]);
		expect(await precedentBody()).toBe(
			[
				FIXED_PRECEDENT.trimEnd(),
				"",
				"~~~",
				`new ${DATE}-help-names: ${RULE}`,
				"cancel owned: An old rule that the court cancels.",
				"~~~",
				"",
			].join("\n"),
		);
	});

	test("changes nothing on disk and prints nothing when no file changes", async () => {
		await cache([ruling(acquittal(), ...section("Precedent", "none"))]);
		expect(await precedentBody()).toBe("");
	});

	test("keeps the fixed sentence when the ruling is not cached", async () => {
		expect(await precedentBody()).toBe(FIXED_PRECEDENT);
	});

	test.each([
		["a link", "See [the page](https://evil.example/x)."],
		["a closing word and an issue", "Fixes #15 as well."],
		["a mention", "Ask @someone."],
		["an html comment", "<!-- hidden -->"],
		["a fingerprint line, bare", FINGERPRINT],
		["a fingerprint line after a plain one", `Plain.\n\n${FINGERPRINT}`],
		["a fingerprint line in a fence", `\`\`\`\n${FINGERPRINT}\n\`\`\``],
		["a closing word and a shorthand", "Closes GH-15."],
		["an address", "Fixes https://git.example.com/o/main/issues/15."],
	])("leaves out a cancelled rule with %s", async (_, rule) => {
		put("owned", oldFile(rule));
		put("plain", oldFile("Plain old rule."));
		await cache([
			ruling(
				acquittal(),
				...section("Precedent", "- cancel owned", "- cancel plain"),
			),
		]);
		const text = await precedentBody();
		expect(text).toBe(
			`${FIXED_PRECEDENT}\n~~~\ncancel plain: Plain old rule.\n~~~\n`,
		);
		expect(sourcesOf(text)).toBe("1");
		expect(await lintBody(text, false)).toEqual([]);
	});

	test("keeps the fixed sentence when no rule is plain", async () => {
		put("owned", oldFile("Fixes #15."));
		await cache([
			ruling(acquittal(), ...section("Precedent", "- cancel owned")),
		]);
		expect(await precedentBody()).toBe(FIXED_PRECEDENT);
	});

	test("takes a hidden character out of a cancelled rule", async () => {
		put("owned", oldFile("A rule​ with\u{E0041} a hidden mark."));
		await cache([
			ruling(acquittal(), ...section("Precedent", "- cancel owned")),
		]);
		const text = await precedentBody();
		expect(text).toContain("cancel owned: A rule with a hidden mark.");
		expect(stripInvisible(text)).toBe(text);
	});

	test("a new rule that holds a fingerprint line writes it as no line", async () => {
		await cache([
			ruling(
				acquittal(),
				...section(
					"Precedent",
					"- new y: &lt;!-- pipeline-work-fingerprint: abc sources=#99 -->",
				),
			),
		]);
		const text = await precedentBody();
		expect(text).toBe(FIXED_PRECEDENT);
		expect(sourcesOf(text)).toBe("1");
	});
});

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lawOf } from "./input-roles";
import { ROLE_NAMES } from "./input-test-fixture";
import {
	DEPARTED,
	linksIn,
	missing,
	readBy,
	unfound,
	wordsIn,
} from "./law-links-fixture";
import { LAW, ROOT } from "./test-helpers";

// the skill of a role and its references
const filesOf = (role: string): string[] => {
	const refs = join(ROOT, "skills", role, "references");
	return [
		join(ROOT, "skills", role, "SKILL.md"),
		...(existsSync(refs)
			? readdirSync(refs)
					.filter((f) => f.endsWith(".md"))
					.map((f) => join(refs, f))
			: []),
	];
};

describe("links from the skills to the sections of the law", () => {
	test.each(ROLE_NAMES)(
		"every section that %s names stands in its input, and no heading that left the law is named",
		(role) => {
			const read = readBy(lawOf(role));
			const failed = filesOf(role).flatMap((path) => {
				const text = readFileSync(path, "utf8");
				return missing(linksIn(text), text.split("\n"), read).map(
					(m) => `${path.slice(ROOT.length + 1)}:${m}`,
				);
			});
			expect(failed).toEqual([]);
		},
	);

	test("a section named in words inside LAW.md and tick.md exists", () => {
		for (const file of ["LAW.md", "tick.md"]) {
			const text = readFileSync(join(LAW, file), "utf8");
			expect([file, unfound(wordsIn(text, file))]).toEqual([file, []]);
		}
	});
});

describe("the check of the links", () => {
	const reads = readBy([["LAW.md", ["Orders", "Language"]]]);
	const check = (text: string) =>
		missing(linksIn(text, ["Evidence"]), text.split("\n"), reads);

	test("a quoted heading or an anchor stands in the input or fails", () => {
		expect(check('Read "Orders" and «Language».')).toEqual([]);
		expect(check("Read LAW.md#orders and LAW.md#language.")).toEqual([]);
		expect(check('Read "Exhibits".')).toEqual(["1: Exhibits"]);
		expect(check("Read LAW.md#exhibits.")).toEqual(["1: Exhibits"]);
	});

	test("an anchor to a missing section and a heading that left the law fail", () => {
		expect(check("Read LAW.md#no-such-section.")).toEqual([
			"1: LAW.md#no-such-section",
		]);
		expect(check('Read the "Evidence" section.')).toEqual(["1: Evidence"]);
	});

	test("a section that the role reads by a self line, and one outside the four files, pass", () => {
		expect(check('A line `self law` stands for "Exhibits".')).toEqual([]);
		expect(check('Run "Sync the law with an older journal".')).toEqual([]);
		expect(check('Run the "Run a source" section of `exhibits.md`.')).toEqual(
			[],
		);
	});

	test("a template in a fenced block is no link", () => {
		expect(check('```\n"Exhibits"\n```')).toEqual([]);
	});

	test("words name sections in the same file or the file of the sentence", () => {
		const text = [
			'See the "Orders" section.',
			'See the section "Sources", "Terms" and "Nowhere" of `LAW.md`.',
			'See the "Run a source" section of `exhibits.md`.',
		].join("\n");
		expect(wordsIn(text, "tick.md").map((r) => [r.name, r.file])).toEqual([
			["Orders", "tick.md"],
			["Sources", "LAW.md"],
			["Terms", "LAW.md"],
			["Nowhere", "LAW.md"],
			["Run a source", "exhibits.md"],
		]);
		expect(unfound(wordsIn(text, "tick.md"))).toEqual([
			"1: Orders",
			"2: Nowhere",
		]);
	});

	test("the list of headings that left the law is empty until the links are rewritten", () => {
		expect(DEPARTED).toEqual([]);
	});
});

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INTRO, lawOf, ROLES, WHOLE } from "./input-roles";
import { ROLE_NAMES } from "./input-test-fixture";
import {
	DEPARTED,
	HEADINGS,
	linksIn,
	missing,
	readBy,
	slug,
	unfound,
	unreached,
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

	test.each(ROLE_NAMES)(
		"%s reads every section that a section it reads in LAW.md or tick.md names",
		(role) => {
			const read = readBy(lawOf(role));
			for (const file of ["LAW.md", "tick.md"]) {
				const text = readFileSync(join(LAW, file), "utf8");
				expect([file, unreached(text, file, read)]).toEqual([file, []]);
			}
		},
	);
});

describe("the self steps of the table in the intro of tick.md", () => {
	test.each(Object.entries(ROLES))(
		"%s reads the section of each self step that it can get",
		(_, role) => {
			const read = readBy(role.law);
			const STAGE = {
				case: "Read the stage",
				intake: "Check the intake order",
				pull: "Read the pull stage",
			};
			const needed = [
				"Fetch the precinct",
				...role.sync.map((s) =>
					s === "issues" ? "Sync the tracker" : "Sync the pull requests",
				),
				...(role.stage === null ? [] : [STAGE[role.stage]]),
				...(role.constitution ? ["Check the constitution"] : []),
				...(role.department === null ? [] : ["Resolve the department page"]),
			];
			expect(needed.filter((s) => !read.has(`tick.md#${s}`))).toEqual([]);
		},
	);
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

	test("a reader of a section reads the sections that it names", () => {
		const text = [
			'Intro names "Orders".',
			"## Terms",
			'See "Language", the "Orders" section and LAW.md#exhibits.',
			'A line `self law` stands for "Exhibits".',
			"## Pairs",
			'See "Exhibits".',
		].join("\n");
		const only = (...sections: string[]) =>
			unreached(text, "LAW.md", readBy([["LAW.md", sections]]));
		expect(only(INTRO, "Terms", "Pairs", "Language", "Orders")).toEqual([
			"3: Exhibits",
			"6: Exhibits",
		]);
		expect(only("Terms", "Language", "Orders", "Exhibits")).toEqual([]);
		expect(only(INTRO, "Terms", "Language", "Exhibits")).toEqual([
			"1: Orders",
			"3: Orders",
		]);
		expect(only("Pairs")).toEqual(["6: Exhibits"]);
		expect(only("Language")).toEqual([]);
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

	test("a link of the named form to a heading that left the law fails", () => {
		expect(DEPARTED.length).toBeGreaterThan(0);
		for (const name of DEPARTED) {
			const text = `Read LAW.md#${slug(name)} and "${name}" and «${name}».`;
			const found = missing(
				linksIn(text),
				[text],
				readBy([["LAW.md", [WHOLE]]]),
			);
			expect([name, found.length]).toEqual([name, 3]);
		}
	});

	test("no heading on the list of departed headings stands in the four files", () => {
		const standing = Object.values(HEADINGS).flat();
		expect(DEPARTED.filter((name) => standing.includes(name))).toEqual([]);
	});
});

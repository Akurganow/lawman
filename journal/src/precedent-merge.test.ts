import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "./db";
import { inproc } from "./inproc";
import { mergePrecedents, precedent } from "./precedent";
import { BASE, call, dir, tempDb } from "./test-helpers";

const FRONT = [
	"---",
	"contract_version: 3",
	"---",
	"# Constitution of o/r",
	"",
];
const BODY = [
	"## Read first",
	"",
	"- README.md",
	"",
	"## Departments",
	"",
	"none",
	"",
	"## Fence",
	"",
	"none",
	"",
	"## Regression proof",
	"",
	"none",
	"",
	"## Not judged",
	"",
	"none",
	"",
	"## Execution",
	"",
	"none",
	"",
	"## Executor loads",
	"",
	"none",
	"",
	"## Labels",
	"",
	"none",
	"",
];
const page = (...section: string[]) =>
	[...FRONT, ...BODY, "## Precedents", "", ...section, ""].join("\n");
const pageFirst = (...section: string[]) =>
	[...FRONT, "## Precedents", "", ...section, "", ...BODY].join("\n");
const v1 = (text: string) =>
	text
		.replace("contract_version: 3", "contract_version: 1")
		.replace("## Labels\n\nnone\n\n", "");
const withMargin = (text: string, ...lines: string[]) =>
	`${text}\n## Margin\n\n${lines.join("\n")}\n`;
const row = (n: number, text = `ruling ${n}`) => `- 2026-10-01 #${n}: ${text}`;
const merge = (base: string, ours: string, theirs: string) =>
	mergePrecedents(base, ours, theirs);
const reason = (base: string, ours: string, theirs: string) => {
	const result = merge(base, ours, theirs);
	return result.kind === "unresolved" ? result.reason : result.kind;
};

describe("precedent merge core", () => {
	test("a collision renumbers after the highest number of the default branch", () => {
		const base = page(row(1));
		const ours = page(row(1), row(2, "ours"));
		const theirs = page(row(1), row(2, "theirs"), row(3, "theirs too"));
		expect(merge(base, ours, theirs)).toEqual({
			kind: "merged",
			moves: ["#2->#4"],
			page: page(
				row(1),
				row(2, "theirs"),
				row(3, "theirs too"),
				row(4, "ours"),
			),
		});
	});

	test("only the number changes, even when the ruling quotes numbers", () => {
		const text = "see #2: x, `#9` and (http://example.test/a#3: b)";
		const result = merge(
			page(row(1)),
			page(row(1), row(2, text)),
			page(row(1)),
		);
		expect(result).toMatchObject({
			kind: "merged",
			moves: ["#2->#2"],
			page: page(row(1), row(2, text)),
		});
	});

	test("several added lines keep their order after the highest number", () => {
		const base = page(row(1));
		const ours = page(row(1), row(2, "a"), row(3, "b"));
		const theirs = page(row(1), row(2, "theirs"), row(5, "five"));
		expect(merge(base, ours, theirs)).toEqual({
			kind: "merged",
			moves: ["#2->#6", "#3->#7"],
			page: page(
				row(1),
				row(2, "theirs"),
				row(5, "five"),
				row(6, "a"),
				row(7, "b"),
			),
		});
	});

	test("the first line replaces none, and a theirs none is replaced too", () => {
		const base = page("none");
		const ours = page(row(1, "ours"));
		expect(merge(base, ours, base)).toEqual({
			kind: "merged",
			moves: ["#1->#1"],
			page: ours,
		});
		const taken = page(row(1, "theirs"));
		expect(merge(base, ours, taken)).toMatchObject({
			kind: "merged",
			moves: ["#1->#2"],
			page: page(row(1, "theirs"), row(2, "ours")),
		});
	});

	test("a none kept by the branch next to its added line still merges", () => {
		const base = page("none");
		expect(merge(base, page("none", row(1)), base)).toMatchObject({
			kind: "merged",
			page: page(row(1)),
		});
	});

	test("CRLF pages merge and keep the line endings of the default branch", () => {
		const crlf = (text: string) => text.replaceAll("\n", "\r\n");
		const base = crlf(page(row(1)));
		const ours = crlf(page(row(1), row(2, "ours")));
		const theirs = crlf(page(row(1), row(2, "theirs")));
		expect(merge(base, ours, theirs)).toEqual({
			kind: "merged",
			moves: ["#2->#3"],
			page: crlf(page(row(1), row(2, "theirs"), row(3, "ours"))),
		});
	});

	test("a CRLF branch merges into an LF default branch", () => {
		const crlf = (text: string) => text.replaceAll("\n", "\r\n");
		const result = merge(
			crlf(page(row(1))),
			crlf(page(row(1), row(2, "ours"))),
			page(row(1), row(2, "theirs")),
		);
		expect(result).toMatchObject({
			kind: "merged",
			page: page(row(1), row(2, "theirs"), row(3, "ours")),
		});
	});

	test("fenced numbered lines are not counted by numbering", () => {
		const fenced = ["```", row(9, "example"), "```"];
		const theirs = page(row(1), ...fenced);
		const result = merge(page(row(1)), page(row(1), row(2, "ours")), theirs);
		expect(result).toMatchObject({ kind: "merged", moves: ["#2->#2"] });
		expect(
			precedent(theirs, "## Precedent\n- 2026-10-16: r", "u"),
		).toMatchObject({ kind: "entry", number: 2 });
	});

	test("an added line inside a fence is not a precedent line", () => {
		const base = page("```", "```");
		const ours = page("```", row(2), "```");
		expect(reason(base, ours, base)).toBe("other-change");
	});

	test("an unclosed fence hides the lines to the end of the page", () => {
		const base = page(row(1));
		const ours = page(row(1), "```", row(2));
		expect(reason(base, ours, base)).toBe("other-change");
	});

	test.each([
		["a changed line", (p: string) => p.replace("README.md", "OTHER.md")],
		["a removed line", (p: string) => p.replace("- README.md\n", "")],
		["an added heading", (p: string) => `${p}## Extra\n\ntext\n`],
		[
			"an added line outside Precedents",
			(p: string) => p.replace("## Fence", "extra\n## Fence"),
		],
		["an edited precedent", (p: string) => p.replace("ruling 1", "edited")],
		["an added blank line", (p: string) => `${p}\n`],
	])("unresolved other-change: %s", (_name, change) => {
		const base = page(row(1));
		const ours = change(page(row(1), row(2, "ours")));
		expect(reason(base, ours, page(row(1), row(2, "theirs")))).toBe(
			"other-change",
		);
	});

	test.each([
		["no date", "- ruling"],
		["no number", "- 2026-10-02: ruling"],
		["a short date", "- 2026-10-2 #2: ruling"],
		["an empty ruling", "- 2026-10-02 #2: "],
		["plain text", "just words"],
	])("unresolved bad-line: %s", (_name, line) => {
		const base = page(row(1));
		expect(reason(base, page(row(1), line), base)).toBe("bad-line");
	});

	test("unresolved other-change: the added line has no Precedents heading", () => {
		expect(reason("# T\n", `# T\n${row(1)}\n`, page())).toBe("other-change");
	});

	test("unresolved no-base: an empty base", () => {
		expect(reason("", page(row(1)), page())).toBe("no-base");
	});

	test("unresolved no-added-lines: the branch added nothing", () => {
		const base = page(row(1));
		expect(reason(base, base, base)).toBe("no-added-lines");
	});

	test("the section may stand before the other sections", () => {
		const result = merge(
			pageFirst(row(1)),
			pageFirst(row(1), row(2, "ours")),
			pageFirst(row(1), row(2, "theirs")),
		);
		expect(result).toEqual({
			kind: "merged",
			moves: ["#2->#3"],
			page: pageFirst(row(1), row(2, "theirs"), row(3, "ours")),
		});
	});

	test("an unknown section after Precedents keeps its place and its numbers", () => {
		const base = withMargin(page(row(1)), "note");
		const ours = withMargin(page(row(1), row(2, "ours")), "note");
		const theirs = withMargin(page(row(1)), row(9, "stray"));
		expect(merge(base, ours, theirs)).toEqual({
			kind: "merged",
			moves: ["#2->#2"],
			page: withMargin(page(row(1), row(2, "ours")), row(9, "stray")),
		});
	});

	test("unresolved other-change: an added line inside a later unknown section", () => {
		const base = withMargin(page(row(1)), "note");
		const ours = withMargin(page(row(1)), "note", row(2, "stray"));
		expect(reason(base, ours, base)).toBe("other-change");
	});

	test("a version 1 base and branch merge into a version 3 default branch", () => {
		const base = v1(page(row(1)));
		const ours = v1(page(row(1), row(2, "ours")));
		const theirs = page(row(1), row(2, "theirs"));
		expect(merge(base, ours, theirs)).toEqual({
			kind: "merged",
			moves: ["#2->#3"],
			page: page(row(1), row(2, "theirs"), row(3, "ours")),
		});
	});

	test("unresolved bad-page: the result fails the constitution check", () => {
		const base = page(row(1));
		const ours = page(row(1), row(2));
		expect(reason(base, ours, "# no frontmatter\n\n## Precedents\n")).toBe(
			"bad-page",
		);
	});
});

describe("precedent-merge command", () => {
	tempDb();
	const run = (args: string[]) => call(BASE, ["precedent-merge", ...args]);
	const file = (name: string, text: string) => {
		const path = join(dir, name);
		writeFileSync(path, text);
		return path;
	};
	const flags = (base: string, ours: string, theirs: string, out: string) => [
		"--base",
		base,
		"--ours",
		ours,
		"--theirs",
		theirs,
		"--out",
		out,
	];

	test("merged prints the pairs and writes the page", () => {
		const out = join(dir, "out.md");
		const r = run(
			flags(
				file("base.md", page(row(1))),
				file("ours.md", page(row(1), row(2, "a"), row(3, "b"))),
				file("theirs.md", page(row(1), row(2, "t"))),
				out,
			),
		);
		expect([r.code, r.out]).toEqual([EXIT.OK, "merged\t#2->#3,#3->#4\n"]);
		expect(readFileSync(out, "utf8")).toBe(
			page(row(1), row(2, "t"), row(3, "a"), row(4, "b")),
		);
	});

	test("unresolved prints the reason, exits 0 and writes nothing", () => {
		const out = join(dir, "never.md");
		const base = file("base.md", page(row(1)));
		const r = run(flags(base, file("ours.md", "changed\n"), base, out));
		expect([r.code, r.out]).toEqual([EXIT.OK, "unresolved\tother-change\n"]);
		expect(existsSync(out)).toBe(false);
	});

	test("a missing base file is unresolved no-base", () => {
		const out = join(dir, "never.md");
		const ours = file("ours.md", page(row(1)));
		const r = run(flags(join(dir, "absent.md"), ours, ours, out));
		expect([r.code, r.out]).toEqual([EXIT.OK, "unresolved\tno-base\n"]);
		expect(existsSync(out)).toBe(false);
	});

	test("argument errors and unreadable pages exit with the usage code", () => {
		const f = file("a.md", page(row(1)));
		const out = join(dir, "out.md");
		for (const args of [
			[],
			["--base", f, "--ours", f, "--theirs", f],
			[...flags(f, f, f, out), "--extra", "x"],
			flags(f, f, f, out).slice(0, -1),
			flags(f, join(dir, "absent.md"), f, out),
			flags(f, f, join(dir, "absent.md"), out),
		]) {
			expect(run(args).code).toBe(EXIT.USAGE);
		}
	});

	test("the command is listed in the journal usage", () => {
		const r = call(BASE, ["no-such-command"]);
		expect(r.err).toContain("precedent-merge");
	});
});

describe("precedent-merge command in process", () => {
	tempDb();
	const file = (name: string, text: string) => {
		const path = join(dir, name);
		writeFileSync(path, text);
		return path;
	};
	const run = (base: string, ours: string, theirs: string, out: string) =>
		inproc(BASE, [
			"precedent-merge",
			"--base",
			file("base.md", base),
			"--ours",
			file("ours.md", ours),
			"--theirs",
			file("theirs.md", theirs),
			"--out",
			out,
		]);

	test("a version 1 branch merges into a version 3 default branch", () => {
		const out = join(dir, "out.md");
		const r = run(
			v1(page(row(1))),
			v1(page(row(1), row(2, "ours"))),
			page(row(1), row(2, "theirs")),
			out,
		);
		expect([r.code, r.out]).toEqual([EXIT.OK, "merged\t#2->#3\n"]);
		expect(readFileSync(out, "utf8")).toBe(
			page(row(1), row(2, "theirs"), row(3, "ours")),
		);
	});

	test("a line added inside a later unknown section is unresolved", () => {
		const out = join(dir, "never.md");
		const base = withMargin(page(row(1)), "note");
		const r = run(base, withMargin(page(row(1)), "note", row(2)), base, out);
		expect([r.code, r.out]).toEqual([EXIT.OK, "unresolved\tother-change\n"]);
		expect(existsSync(out)).toBe(false);
	});

	test("the section before the other sections takes the renumbered line", () => {
		const out = join(dir, "out.md");
		const r = run(
			pageFirst(row(1)),
			pageFirst(row(1), row(2, "ours")),
			pageFirst(row(1), row(2, "theirs")),
			out,
		);
		expect(r.out).toBe("merged\t#2->#3\n");
		expect(readFileSync(out, "utf8")).toBe(
			pageFirst(row(1), row(2, "theirs"), row(3, "ours")),
		);
	});

	test("a missing base file is unresolved no-base", () => {
		const ours = file("ours.md", page(row(1)));
		const r = inproc(BASE, [
			"precedent-merge",
			...["--base", join(dir, "absent.md"), "--ours", ours],
			...["--theirs", ours, "--out", join(dir, "never.md")],
		]);
		expect([r.code, r.out]).toEqual([EXIT.OK, "unresolved\tno-base\n"]);
	});

	test("a missing page is a usage error", () => {
		const ours = file("ours.md", page(row(1)));
		const r = inproc(BASE, [
			"precedent-merge",
			...["--base", ours, "--ours", join(dir, "absent.md")],
			...["--theirs", ours, "--out", join(dir, "never.md")],
		]);
		expect(r.code).toBe(EXIT.USAGE);
	});
});

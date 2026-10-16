import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "./db";
import { precedent } from "./precedent";
import { acquittal, BASE, call, dir, tempDb } from "./test-helpers";

const SOURCE = "https://github.com/o/r/issues/7#issuecomment-99";
const PAGE = "# Constitution of o/r\n\n## Precedents\n\nnone\n";
const decision = (...section: string[]) =>
	["Ruling: acquitted.", "", ...section, "", acquittal()].join("\n");
const entry = (text: string, page = PAGE) => precedent(page, text, SOURCE);
const reason = (text: string) => {
	const result = entry(decision(...text.split("\n")));
	return result.kind === "no-entry" ? result.reason : result.kind;
};

describe("precedent core", () => {
	test("the new line ends with the source link in parentheses", () => {
		const result = entry(decision("## Precedent", "- 2026-10-16: a ruling"));
		expect(result).toEqual({
			kind: "entry",
			number: 1,
			page: `# Constitution of o/r\n\n## Precedents\n\n- 2026-10-16 #1: a ruling (${SOURCE})\n`,
		});
	});

	test("a none section is replaced by the first numbered line", () => {
		const result = entry(decision("## Precedent", "- 2026-10-16: a ruling"));
		expect(result.kind === "entry" && result.page).not.toContain("none");
	});

	test("the number is the largest prefix number plus one, other lines untouched", () => {
		const page =
			"## Precedents\n\n- 2026-01-01 #1: one\n- 2026-01-02 #7: seven, see #40: x\n- 2026-01-03 #2: two\n";
		const result = entry(
			decision("## Precedent", "- 2026-10-16: a ruling"),
			page,
		);
		expect(result).toEqual({
			kind: "entry",
			number: 8,
			page: `${page}- 2026-10-16 #8: a ruling (${SOURCE})\n`,
		});
	});

	test("the section ends at the next heading or at a valid marker", () => {
		expect(
			entry(decision("## Precedent", "- 2026-10-16: r", "", "## Notes", "x")),
		).toMatchObject({ kind: "entry" });
		const text = `## Precedent\n- 2026-10-16: r\n${acquittal()}\ntrailing`;
		expect(entry(text)).toMatchObject({ kind: "entry" });
	});

	test("CRLF decisions are read and the ruling is copied byte for byte", () => {
		const ruling = "uses `ticks`, #5 and юникод — кавычки «ё»";
		const text = `## Precedent\r\n- 2026-10-16: ${ruling}\r\n`;
		const result = entry(text);
		expect(result.kind === "entry" && result.page).toContain(
			`- 2026-10-16 #1: ${ruling} (${SOURCE})\n`,
		);
	});

	test("a decision of none yields none", () => {
		expect(entry(decision("## Precedent", "none"))).toEqual({ kind: "none" });
	});

	test("a page without a trailing newline gets one before the new line", () => {
		const page = "## Precedents\n\n- 2026-01-01 #1: one";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result.kind === "entry" && result.page).toBe(
			`${page}\n- 2026-10-16 #2: r (${SOURCE})`,
		);
	});

	test("an example heading inside a fence is not the page section", () => {
		const page =
			"# T\n\n```\n## Precedents\n- 2026-01-01 #3: x\n```\n\n## Precedents\n\n- 2026-01-01 #1: a\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result).toEqual({
			kind: "entry",
			number: 2,
			page: `${page}- 2026-10-16 #2: r (${SOURCE})\n`,
		});
	});

	test("a decision heading indented 3 spaces is read", () => {
		const result = entry(decision("   ## Precedent", "- 2026-10-16: r"));
		expect(result).toMatchObject({ kind: "entry", number: 1 });
	});

	test("an owner line with a hash number is not counted", () => {
		const page =
			"## Precedents\n\n- 2026-01-01 #1: a\n- 2026-01-02: see #40: x\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result).toMatchObject({ kind: "entry", number: 2 });
	});

	test("none next to a numbered line is kept", () => {
		const page = "## Precedents\n\nnone\n- 2026-01-01 #1: a\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result).toEqual({
			kind: "entry",
			number: 2,
			page: `${page}- 2026-10-16 #2: r (${SOURCE})\n`,
		});
	});

	test("a CRLF page keeps CRLF when none is replaced", () => {
		const page = "## Precedents\r\n\r\nnone\r\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result).toEqual({
			kind: "entry",
			number: 1,
			page: `## Precedents\r\n\r\n- 2026-10-16 #1: r (${SOURCE})\r\n`,
		});
	});

	test("a CRLF page keeps CRLF on an appended line", () => {
		const page = "## Precedents\r\n\r\n- 2026-01-01 #1: a\r\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result).toEqual({
			kind: "entry",
			number: 2,
			page: `${page}- 2026-10-16 #2: r (${SOURCE})\r\n`,
		});
	});

	test("a page without a Precedents heading still gets the line as number 1", () => {
		const page = "# T\n\ntext\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result).toEqual({
			kind: "entry",
			number: 1,
			page: `${page}- 2026-10-16 #1: r (${SOURCE})\n`,
		});
	});

	test("a lone none line without a Precedents heading is not replaced", () => {
		const page = "none\n";
		const result = entry(decision("## Precedent", "- 2026-10-16: r"), page);
		expect(result.kind === "entry" && result.page).toBe(
			`${page}- 2026-10-16 #1: r (${SOURCE})\n`,
		);
	});

	test("a ruling ending in a link is copied before the source link", () => {
		const ruling = "see (http://example.test/a)";
		const result = entry(decision("## Precedent", `- 2026-10-16: ${ruling}`));
		expect(result.kind === "entry" && result.page).toContain(
			`- 2026-10-16 #1: ${ruling} (${SOURCE})\n`,
		);
	});

	test("an empty decision has no section", () => {
		expect(entry("")).toEqual({ kind: "no-entry", reason: "no-section" });
	});

	test.each([
		["no heading", "Ruling only.", "no-section"],
		[
			"heading only in a fence",
			"```\n## Precedent\n- 2026-10-16: r\n```",
			"no-section",
		],
		[
			"Precedents is not Precedent",
			"## Precedents\n- 2026-10-16: r",
			"no-section",
		],
		[
			"two headings",
			"## Precedent\n- 2026-10-16: r\n## Precedent\nnone",
			"several-sections",
		],
		["empty section", "## Precedent\n\n", "empty-section"],
		[
			"two lines",
			"## Precedent\n- 2026-10-16: a\n- 2026-10-16: b",
			"several-lines",
		],
		["no date", "## Precedent\n- a ruling", "bad-line"],
		["wrong date form", "## Precedent\n- 16.10.2026: a ruling", "bad-line"],
		["short month and day", "## Precedent\n- 2026-1-6: r", "bad-line"],
		["no space after colon", "## Precedent\n- 2026-10-16:r", "bad-line"],
		[
			"heading indented 4 spaces",
			"    ## Precedent\n- 2026-10-16: r",
			"no-section",
		],
		["text around", "## Precedent\nsee - 2026-10-16: a ruling", "bad-line"],
		["empty text", "## Precedent\n- 2026-10-16: ", "bad-line"],
		["None", "## Precedent\nNone", "bad-line"],
		["numbered line", "## Precedent\n- 2026-10-16 #3: a ruling", "bad-line"],
	])("no-entry: %s", (_name, section, expected) => {
		expect(reason(section)).toBe(expected);
	});
});

describe("precedent command", () => {
	tempDb();
	const run = (args: string[], stdin: string) => call(BASE, args, stdin);
	const pageFile = (text: string) => {
		const path = join(dir, "constitution.md");
		writeFileSync(path, text);
		return path;
	};

	test("entry rewrites the page in place and prints one line", () => {
		const path = pageFile(PAGE);
		const r = run(
			["precedent", "--page", path, "--source", SOURCE],
			decision("## Precedent", "- 2026-10-16: a ruling"),
		);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toBe("entry\t1\n");
		expect(readFileSync(path, "utf8")).toBe(
			`# Constitution of o/r\n\n## Precedents\n\n- 2026-10-16 #1: a ruling (${SOURCE})\n`,
		);
	});

	test("none and no-entry leave the file alone and exit 0", () => {
		const path = pageFile(PAGE);
		const args = ["precedent", "--page", path, "--source", SOURCE];
		const none = run(args, decision("## Precedent", "none"));
		expect([none.code, none.out]).toEqual([0, "none\n"]);
		const bad = run(args, "no section here");
		expect([bad.code, bad.out]).toEqual([0, "no-entry\tno-section\n"]);
		expect(readFileSync(path, "utf8")).toBe(PAGE);
	});

	test("argument errors and an unreadable page exit 1", () => {
		const path = pageFile(PAGE);
		const missing = join(dir, "missing.md");
		for (const args of [
			["precedent"],
			["precedent", "--page", path],
			["precedent", "--source", SOURCE],
			["precedent", "--page", path, "--source", SOURCE, "--extra", "x"],
			["precedent", "--page", missing, "--source", SOURCE],
		]) {
			expect(run(args, decision("## Precedent", "none")).code).toBe(1);
		}
	});
});

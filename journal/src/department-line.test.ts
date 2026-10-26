import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDepartmentLine } from "./department-line";
import { lintPage } from "./lint";
import { cli, JOURNAL } from "./test-helpers";

describe("department-line", () => {
	const VALID = readFileSync(
		join(JOURNAL, "src", "fixtures", "pages", "constitution-valid.md"),
		"utf8",
	);
	const LAST_LINE = "- docs-drift: judged by none\n";
	const NEW_LINE = "- security: judged by docs/review/security.md\n";
	const NONE_SECTION = VALID.replace(
		/## Departments\n\n(- .*\n)+/,
		"## Departments\n\nnone\n",
	);
	const crlf = (text: string) => text.replaceAll("\n", "\r\n");
	const run = (text: string, ...args: string[]) =>
		cli(["department-line", ...args], {}, text);
	const insert = (text: string) =>
		withDepartmentLine(text, "security", "docs/review/security.md");

	test("a new name goes at the end of the Departments section", () => {
		expect(insert(VALID)).toBe(VALID.replace(LAST_LINE, LAST_LINE + NEW_LINE));
	});

	test("a line of the same name is replaced in place", () => {
		expect(withDepartmentLine(VALID, "docs-drift", "docs/drift.md")).toBe(
			VALID.replace(LAST_LINE, "- docs-drift: judged by docs/drift.md\n"),
		);
	});

	test("a lone none standing for the section is removed", () => {
		expect(NONE_SECTION).not.toBe(VALID);
		expect(insert(NONE_SECTION)).toBe(
			NONE_SECTION.replace("none\n\n## Fence", `${NEW_LINE}\n## Fence`),
		);
	});

	test("a none that sits beside other lines stays", () => {
		const text = VALID.replace(LAST_LINE, `${LAST_LINE}none\n`);
		expect(insert(text)).toBe(
			text.replace("none\n\n## Fence", `none\n${NEW_LINE}\n## Fence`),
		);
	});

	test("CRLF input keeps CRLF on every line", () => {
		expect(insert(crlf(VALID))).toBe(crlf(insert(VALID)));
		expect(insert(crlf(NONE_SECTION))).toBe(crlf(insert(NONE_SECTION)));
	});

	test("a Departments heading inside a code fence is not the section", () => {
		const fenced = VALID.replace(
			"- README.md\n",
			"- README.md\n\n```\n## Departments\n```\n",
		);
		expect(insert(fenced)).toBe(
			fenced.replace(LAST_LINE, LAST_LINE + NEW_LINE),
		);
	});

	test("an unknown section after Departments bounds the section", () => {
		const margin = "## Margin\n\n- docs-drift: judged by elsewhere\n\n";
		const text = VALID.replace("## Fence", `${margin}## Fence`);
		expect(insert(text)).toBe(text.replace(LAST_LINE, LAST_LINE + NEW_LINE));
		expect(withDepartmentLine(text, "docs-drift", "docs/drift.md")).toBe(
			text.replace(LAST_LINE, "- docs-drift: judged by docs/drift.md\n"),
		);
	});

	test("a lone none before an unknown section is replaced", () => {
		const text = NONE_SECTION.replace(
			"## Fence",
			"## Margin\n\nnone\n\n## Fence",
		);
		expect(insert(text)).toBe(
			text.replace("none\n\n## Margin", `${NEW_LINE}\n## Margin`),
		);
	});

	test("an edit leaves an unknown section untouched", () => {
		const margin = "## Margin\n\n- security: judged by nowhere\n\n";
		const text = VALID.replace("## Read first", `${margin}## Read first`);
		const result = insert(text);
		expect(result).toContain(margin);
		expect(lintPage("constitution", result).reasons).toEqual([]);
	});

	test("Departments after another listed section is found", () => {
		const [head, ...sections] = VALID.split(/^(?=## )/m);
		const text = [head, ...sections.reverse()].join("");
		expect(text.indexOf("## Departments")).toBeGreaterThan(
			text.indexOf("## Fence"),
		);
		const result = insert(text);
		expect(result).toBe(text.replace(LAST_LINE, LAST_LINE + NEW_LINE));
		expect(lintPage("constitution", result).reasons).toEqual([]);
	});

	test("the result passes the constitution check", () => {
		expect(lintPage("constitution", insert(VALID)).reasons).toEqual([]);
	});

	test("the subcommand prints the edited text", () => {
		const r = run(
			VALID,
			"--name",
			"security",
			"--judged-by",
			"docs/review/security.md",
		);
		expect(r.code).toBe(0);
		expect(r.out).toBe(insert(VALID));
		expect(r.err).toBe("");
	});

	test("a repeated call changes nothing", () => {
		const once = run(VALID, "--name", "security", "--judged-by", "none").out;
		const twice = run(once, "--name", "security", "--judged-by", "none").out;
		expect(twice).toBe(once);
	});

	test("a page that fails the check exits 8 with reasons and no stdout", () => {
		const broken = VALID.replace("contract_version: 3", "contract_version: 2");
		const r = run(broken, "--name", "security", "--judged-by", "none");
		expect(r.code).toBe(8);
		expect(r.out).toBe("");
		expect(r.err).toContain("contract_version must be 3");
	});

	test("a path the check rejects exits 8 with empty stdout", () => {
		const r = run(VALID, "--name", "security", "--judged-by", "../outside.md");
		expect(r.code).toBe(8);
		expect(r.out).toBe("");
		expect(r.err).toContain("path holds ..");
	});

	test("empty input exits 8", () => {
		const r = run("", "--name", "security", "--judged-by", "none");
		expect(r.code).toBe(8);
		expect(r.out).toBe("");
	});

	test("a name outside its class exits 1 with empty stdout", () => {
		for (const args of [
			["--name", "Security", "--judged-by", "none"],
			["--name", "a b", "--judged-by", "none"],
		]) {
			const r = run(VALID, ...args);
			expect(r.code).toBe(1);
			expect(r.out).toBe("");
		}
	});

	test("a missing flag exits 1", () => {
		expect(run(VALID, "--name", "security").code).toBe(1);
	});
});

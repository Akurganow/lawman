import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as db from "./db";
import { EXIT } from "./db";
import { inproc } from "./inproc";
import { BASE, JOURNAL } from "./test-helpers";

const pages = join(JOURNAL, "src", "fixtures", "pages");
const CONSTITUTION = readFileSync(join(pages, "constitution-valid.md"), "utf8");
const DEPARTMENT = readFileSync(join(pages, "department-valid.md"), "utf8");
const SECURITY = DEPARTMENT.replace(
	"## Proof\n",
	"## Proof\nAlarm check: look for a secret and print positions only.\n\n",
);
const PAIRS =
	"abstraction\tdocs/review/abstractions.md\ndead-code\tdocs/review/dead-code.md\ndocs-drift\tnone\n";

const lint = (input: string, ...args: string[]) => {
	const stdin = spyOn(db, "readStdin").mockReturnValue(input);
	try {
		return inproc(BASE, ["lint-page", ...args]);
	} finally {
		stdin.mockRestore();
	}
};

describe("lint-page command in process", () => {
	test("a constitution prints its department lines, then a note for each unknown section", () => {
		const text = `${CONSTITUTION}\n## Margin\n\n- ../not/a/path\n`;
		const line = text.split("\n").indexOf("## Margin") + 1;
		expect(lint(text, "constitution")).toEqual({
			code: EXIT.OK,
			out: `${PAIRS}# ${line}: unknown section "Margin"\n`,
			err: "",
		});
	});

	test("a failing page prints reasons only, even with a heading that names a version", () => {
		const text = CONSTITUTION.replace("## Fence", "## Fense").concat(
			"\n## contract_version notes\n\nx\n",
		);
		const last = text.split("\n").length - 1;
		expect(lint(text, "constitution")).toEqual({
			code: EXIT.LINT_PAGE,
			out: `${last}: missing heading "Fence"\n`,
			err: "",
		});
	});

	test("a wrong version is a reason on the first lines", () => {
		const text = CONSTITUTION.replace(
			"contract_version: 2",
			"contract_version: 1",
		);
		expect(lint(text, "constitution")).toEqual({
			code: EXIT.LINT_PAGE,
			out: "2: contract_version must be 2\n",
			err: "",
		});
	});

	test("a department page prints the alarm-check line and no note", () => {
		expect(lint(SECURITY, "department", "--name", "fixtures")).toEqual({
			code: EXIT.OK,
			out: "alarm-check\n",
			err: "",
		});
	});

	test("a department page with an unknown heading exits 8", () => {
		const text = DEPARTMENT.concat("## Tail\ny\n");
		const line = text.split("\n").indexOf("## Tail") + 1;
		expect(lint(text, "department")).toEqual({
			code: EXIT.LINT_PAGE,
			out: `${line}: extra heading "Tail"\n`,
			err: "",
		});
	});

	test("bad arguments are a usage error with an empty stdout", () => {
		for (const args of [
			[],
			["page"],
			["constitution", "--name", "x"],
			["department", "--name"],
			["department", "--name", "Bad"],
		]) {
			const r = lint("", ...args);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.out).toBe("");
		}
	});
});

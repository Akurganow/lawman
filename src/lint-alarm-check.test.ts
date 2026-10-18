import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "./db";
import { hasAlarmCheck } from "./lint";
import { cli, ROOT } from "./test-helpers";

const PAGES = join(ROOT, "departments");
const VALID = readFileSync(
	join(ROOT, "src", "fixtures", "pages", "department-valid.md"),
	"utf8",
);
const ALARM = "Alarm check: look for a secret and print positions only.";
const ALARM_PAGE = "security";
const lintDepartment = (text: string) =>
	cli(["lint-page", "department"], {}, text);
const lintConstitution = (text: string) =>
	cli(["lint-page", "constitution"], {}, text);
const withProof = (proof: string) =>
	VALID.replace(
		/## Proof\n[\s\S]*?## Anchors/,
		`## Proof\n${proof}\n## Anchors`,
	);

describe("lint-page alarm-check line", () => {
	test("the shipped security page prints it and no other shipped page does", () => {
		for (const file of readdirSync(PAGES)) {
			const name = file.slice(0, -".md".length);
			const r = cli(
				["lint-page", "department", "--name", name],
				{},
				readFileSync(join(PAGES, file), "utf8"),
			);
			expect([name, r.code]).toEqual([name, 0]);
			expect([name, r.out]).toEqual([
				name,
				name === ALARM_PAGE ? "alarm-check\n" : "",
			]);
		}
	});

	test("a paragraph after a blank line prints it", () => {
		const r = lintDepartment(withProof(`Count references.\n\n${ALARM}\nMore.`));
		expect([r.code, r.out]).toEqual([0, "alarm-check\n"]);
	});

	test("a paragraph right after the heading prints it", () => {
		const r = lintDepartment(withProof(ALARM));
		expect([r.code, r.out]).toEqual([0, "alarm-check\n"]);
	});

	test.each([
		["inside a fence", `Count.\n\n\`\`\`\n${ALARM}\n\`\`\``],
		["in a fence right after the heading", `\`\`\`\n${ALARM}\n\`\`\``],
		["in the middle of a line", `Count. ${ALARM}`],
		["in the middle of a paragraph", `Count.\n${ALARM}`],
		["quoted in a sentence", "A page may hold an `Alarm check:` paragraph."],
		["with another case", "alarm check: look"],
	])("a mention %s prints nothing", (_label, proof) => {
		const r = lintDepartment(withProof(proof));
		expect([r.code, r.out]).toEqual([0, ""]);
	});

	test("a paragraph outside the Proof section prints nothing", () => {
		const text = VALID.replace("## Anchors\n", `## Anchors\n\n${ALARM}\n`);
		const r = lintDepartment(text);
		expect([r.code, r.out]).toEqual([0, ""]);
	});

	test("a failing page prints reasons only", () => {
		const r = lintDepartment(
			withProof(ALARM).replace("## Mission", "## Mission\n\n## Extra"),
		);
		expect(r.code).toBe(EXIT.LINT_PAGE);
		expect(r.out).not.toContain("alarm-check");
		expect(r.out).not.toBe("");
	});

	test("a constitution page with such a paragraph prints nothing", () => {
		const text = readFileSync(
			join(ROOT, "src", "fixtures", "pages", "constitution-valid.md"),
			"utf8",
		).replace("## Fence\n", `## Fence\n\n${ALARM}\n`);
		const r = lintConstitution(text);
		expect(r.out).not.toContain("alarm-check");
	});

	test("text without a Proof heading has no alarm check", () => {
		const lines = ["## Mission", ALARM];
		expect(
			hasAlarmCheck(lines, [false, false], [{ name: "Mission", line: 1 }]),
		).toBe(false);
	});
});

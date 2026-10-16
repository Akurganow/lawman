import { check, parseArgs } from "./args";
import { EXIT, Fail, readStdin } from "./db";
import { DEPARTMENT_LINE, HEADING, lintPage, readFrontmatter } from "./lint";
import { fencedLines, stripCr } from "./markers";

const DEPARTMENT_LINE_USAGE =
	"department-line --name <department> --judged-by <path|none> (stdin: the constitution)";
const DEPARTMENTS = "Departments";
const NONE = "none";

function sectionOf(plain: string[]): { heading: number; end: number } | null {
	const hidden = fencedLines(plain);
	const start = readFrontmatter(plain)?.end ?? 0;
	const headings = plain.flatMap((line, i) => {
		const [, title] = (!hidden[i] && i >= start && line.match(HEADING)) || [];
		return title === undefined ? [] : [{ title, line: i }];
	});
	const k = headings.findIndex((h) => h.title === DEPARTMENTS);
	const heading = headings[k];
	return heading === undefined
		? null
		: { heading: heading.line, end: headings[k + 1]?.line ?? plain.length };
}

export function withDepartmentLine(
	text: string,
	name: string,
	judgedBy: string,
): string {
	const lines = text.split("\n");
	const plain = lines.map(stripCr);
	const section = sectionOf(plain);
	if (section === null) return text;
	const hidden = fencedLines(plain);
	const body = Array.from(
		{ length: section.end - section.heading - 1 },
		(_, j) => section.heading + 1 + j,
	).filter((i) => !hidden[i] && plain[i]?.trim() !== "");
	const same = body.find((i) => plain[i]?.match(DEPARTMENT_LINE)?.[1] === name);
	const [only] = body.length === 1 ? body : [];
	const lone = only !== undefined && plain[only] === NONE ? only : undefined;
	const replaced = same ?? lone;
	const anchor = replaced ?? body.at(-1) ?? section.heading;
	const ending = lines[anchor]?.endsWith("\r") ? "\r" : "";
	lines.splice(
		replaced ?? anchor + 1,
		replaced === undefined ? 0 : 1,
		`- ${name}: judged by ${judgedBy}${ending}`,
	);
	return lines.join("\n");
}

export function departmentLineCommand(args: string[]): number {
	const { opt } = parseArgs(
		args,
		0,
		["name", "judged-by"],
		DEPARTMENT_LINE_USAGE,
	);
	const name = check("department", opt.name);
	const judgedBy = check("judgedBy", opt["judged-by"]);
	const result = withDepartmentLine(readStdin(), name, judgedBy);
	const { reasons } = lintPage("constitution", result);
	if (reasons.length > 0) throw new Fail(EXIT.LINT_PAGE, reasons.join("\n"));
	process.stdout.write(result);
	return EXIT.OK;
}

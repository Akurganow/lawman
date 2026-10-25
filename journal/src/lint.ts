import { check, parseArgs, usage } from "./args";
import { EXIT, out, readStdin } from "./db";
import { fencedLines, NAME, stripCr } from "./markers";

export const CONSTITUTION_HEADINGS = [
	"Read first",
	"Departments",
	"Fence",
	"Regression proof",
	"Not judged",
	"Execution",
	"Executor loads",
	"Labels",
	"Precedents",
];
export const DEPARTMENT_HEADINGS = [
	"Mission",
	"Kinds",
	"Where to look",
	"Not findings",
	"Proof",
	"Anchors",
	"Judged by",
	"Lead body",
	"Identity",
];

const LINT_PAGE_USAGE =
	"lint-page <constitution|department> [--name <expected>] (stdin: the page)";
type PageKind = "constitution" | "department";
const PAGE_HEADINGS: Record<PageKind, string[]> = {
	constitution: CONSTITUTION_HEADINGS,
	department: DEPARTMENT_HEADINGS,
};
const PAGE_VERSION: Record<PageKind, string> = {
	constitution: "2",
	department: "1",
};
const isPageKind = (kind: string): kind is PageKind =>
	Object.hasOwn(PAGE_HEADINGS, kind);
const PATH_SECTIONS = [
	"Read first",
	"Departments",
	"Not judged",
	"Executor loads",
];
const FRONTMATTER_FENCE = "---";
const FRONTMATTER_KEY = /^([a-z_]+):\s*(.*?)\s*$/;
export const HEADING = /^ {0,3}## +(\S.*?) *$/;
const TITLE_LINE = /^# Constitution of [A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
export const DEPARTMENT_LINE = /^- ([a-z][a-z0-9-]*): judged by (none|[^\s]+)$/;

const PATH_RULES: [string, (path: string) => boolean][] = [
	["path holds ..", (path) => path.includes("..")],
	["path starts with a slash", (path) => path.startsWith("/")],
	["path holds a backslash", (path) => path.includes("\\")],
];

type FrontKeys = Map<string, { value: string; line: number }>;
type Heading = { name: string; line: number };
export type PageLint = {
	reasons: string[];
	departments: [string, string][];
	alarmCheck?: true;
	notes?: string[];
};

export function readFrontmatter(
	lines: string[],
): { keys: FrontKeys; end: number } | null {
	const close =
		lines[0] === FRONTMATTER_FENCE ? lines.indexOf(FRONTMATTER_FENCE, 1) : -1;
	if (close < 0) return null;
	const keys: FrontKeys = new Map();
	lines.slice(1, close).forEach((line, i) => {
		const [, key, value] = line.match(FRONTMATTER_KEY) ?? [];
		if (key !== undefined) keys.set(key, { value: value ?? "", line: i + 2 });
	});
	return { keys, end: close + 1 };
}

function frontmatterReasons(
	keys: FrontKeys | null,
	kind: PageKind,
	expectedName?: string,
): string[] {
	if (keys === null) return ["1: frontmatter missing or not closed"];
	const reasons: string[] = [];
	const version = keys.get("contract_version");
	if (!version) reasons.push("1: contract_version missing");
	else if (version.value !== PAGE_VERSION[kind])
		reasons.push(
			`${version.line}: contract_version must be ${PAGE_VERSION[kind]}`,
		);
	if (kind !== "department") return reasons;
	const name = keys.get("name");
	if (!name) reasons.push("1: name missing");
	else if (!NAME.test(name.value))
		reasons.push(`${name.line}: name must match [a-z][a-z0-9-]*`);
	else if (expectedName !== undefined && name.value !== expectedName)
		reasons.push(`${name.line}: name differs from the file name`);
	return reasons;
}

const isListed = (kind: PageKind, h: Heading) =>
	PAGE_HEADINGS[kind].includes(h.name);

function headingReasons(
	kind: PageKind,
	found: Heading[],
	total: number,
): string[] {
	const names = found.map((h) => h.name);
	const extra =
		kind === "department"
			? found
					.filter((h) => !isListed(kind, h))
					.map((h) => `${h.line}: extra heading "${h.name}"`)
			: [];
	const repeated = found
		.filter((h, i) => isListed(kind, h) && names.indexOf(h.name) < i)
		.map((h) => `${h.line}: repeated heading "${h.name}"`);
	const missing = PAGE_HEADINGS[kind]
		.filter((name) => !names.includes(name))
		.map((name) => `${total}: missing heading "${name}"`);
	return [...extra, ...repeated, ...missing];
}

const sectionEnd = (found: Heading[], k: number, total: number) =>
	(found[k + 1]?.line ?? total + 1) - 1;

const ALARM_CHECK = "Alarm check:";

// the paragraph opens the Proof section or follows a blank line, outside a fence
export function hasAlarmCheck(
	lines: string[],
	hidden: boolean[],
	found: Heading[],
): boolean {
	const k = found.findIndex((h) => h.name === "Proof");
	if (k < 0) return false;
	const from = found[k]?.line ?? 0;
	return lines
		.slice(from, sectionEnd(found, k, lines.length))
		.some(
			(line, j) =>
				line.startsWith(ALARM_CHECK) &&
				!hidden[from + j] &&
				(j === 0 || (lines[from + j - 1] ?? "").trim() === ""),
		);
}

function emptySections(
	kind: PageKind,
	lines: string[],
	found: Heading[],
): string[] {
	return found.flatMap((h, k) => {
		if (kind === "constitution" && !isListed(kind, h)) return [];
		const end = sectionEnd(found, k, lines.length);
		return lines.slice(h.line, end).every((l) => l.trim() === "")
			? [`${h.line}: section "${h.name}" is empty, write none`]
			: [];
	});
}

function pathReasons(path: string, line: number): string[] {
	return PATH_RULES.filter(([, bad]) => bad(path)).map(
		([reason]) => `${line}: ${reason}`,
	);
}

function listedLine(
	text: string,
	line: number,
	section: string,
	page: PageLint,
): void {
	if (section !== "Departments") {
		if (text.startsWith("- "))
			page.reasons.push(
				...pathReasons(text.slice(2).split(/\s/)[0] ?? "", line),
			);
		return;
	}
	const [, name, judgedBy] = text.match(DEPARTMENT_LINE) ?? [];
	if (name !== undefined && judgedBy !== undefined) {
		page.reasons.push(...pathReasons(judgedBy, line));
		page.departments.push([name, judgedBy]);
	} else if (text !== "none") {
		page.reasons.push(
			`${line}: department line must read "- <name>: judged by <path or none>"`,
		);
	}
}

function constitutionLists(
	lines: string[],
	found: Heading[],
	hidden: boolean[],
	page: PageLint,
): void {
	found.forEach((h, k) => {
		if (!PATH_SECTIONS.includes(h.name)) return;
		const end = sectionEnd(found, k, lines.length);
		lines.slice(h.line, end).forEach((line, j) => {
			const i = h.line + j;
			if (!hidden[i] && line.trim() !== "")
				listedLine(line, i + 1, h.name, page);
		});
	});
}

export function lintPage(
	kind: PageKind,
	text: string,
	expectedName?: string,
): PageLint {
	const lines = text.split("\n").map(stripCr);
	if (lines.at(-1) === "") lines.pop();
	const parsed = readFrontmatter(lines);
	const hidden = fencedLines(lines);
	const found: Heading[] = [];
	lines.forEach((line, i) => {
		const [, name] =
			(!hidden[i] && i >= (parsed?.end ?? 0) && line.match(HEADING)) || [];
		if (name !== undefined) found.push({ name, line: i + 1 });
	});
	const page: PageLint = {
		reasons: frontmatterReasons(parsed?.keys ?? null, kind, expectedName),
		departments: [],
	};
	page.reasons.push(
		...headingReasons(kind, found, lines.length),
		...emptySections(kind, lines, found),
	);
	if (kind === "constitution") {
		const start = parsed?.end ?? 0;
		const titleEnd = found[0] ? found[0].line - 1 : lines.length;
		if (
			!lines
				.slice(start, titleEnd)
				.some((l, i) => !hidden[start + i] && TITLE_LINE.test(l))
		) {
			page.reasons.push(
				`${start + 1}: title line "# Constitution of <owner>/<repo>" missing`,
			);
		}
		constitutionLists(lines, found, hidden, page);
	}
	page.reasons.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
	if (page.reasons.length > 0)
		return { reasons: page.reasons, departments: [] };
	if (kind === "department" && hasAlarmCheck(lines, hidden, found))
		page.alarmCheck = true;
	const unknown = found.filter((h) => !isListed(kind, h));
	if (unknown.length > 0)
		page.notes = unknown.map((h) => `# ${h.line}: unknown section "${h.name}"`);
	return page;
}

export function lintPageCommand(args: string[]): number {
	const { pos, opt } = parseArgs(args, 1, [], LINT_PAGE_USAGE, ["name"]);
	const kind = pos[0];
	if (!isPageKind(kind) || (opt.name !== undefined && kind !== "department"))
		throw usage(LINT_PAGE_USAGE);
	const expected =
		opt.name === undefined ? undefined : check("department", opt.name);
	const page = lintPage(kind, readStdin(), expected);
	for (const reason of page.reasons) out(reason);
	for (const [name, judgedBy] of page.departments) out(name, judgedBy);
	if (page.alarmCheck) out("alarm-check");
	for (const note of page.notes ?? []) out(note);
	return page.reasons.length > 0 ? EXIT.LINT_PAGE : EXIT.OK;
}

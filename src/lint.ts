import { EXIT, out, readStdin } from "./db";
import { check, parseArgs, usage } from "./args";
import { NAME, fencedLines, parseMarker, stripCr } from "./markers";

export const BODY_MAX_BYTES = 64 * 1024;
export const CONSTITUTION_HEADINGS = [
  "Read first",
  "Departments",
  "Fence",
  "Regression proof",
  "Not judged",
  "Execution",
  "Executor loads",
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

const LINT_BODY_USAGE = "lint-body (stdin: the issue title, a blank line, then the body)";
const LINT_PAGE_USAGE = "lint-page <constitution|department> [--name <expected>] (stdin: the page)";
const PAGE_HEADINGS: Record<string, string[]> = { constitution: CONSTITUTION_HEADINGS, department: DEPARTMENT_HEADINGS };
const PATH_SECTIONS = ["Read first", "Departments", "Not judged", "Executor loads"];
const FRONTMATTER_FENCE = "---";
const FRONTMATTER_KEY = /^([a-z_]+):\s*(.*?)\s*$/;
const HEADING = /^ {0,3}## +(\S.*?) *$/;
const TITLE_LINE = /^# Constitution of [A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const DEPARTMENT_LINE = /^- ([a-z][a-z0-9-]*): judged by (none|[^\s]+)$/;
const CODE_SPAN = /(`+).+?\1/g;
const MENTION = /@[A-Za-z0-9]/;
const TITLE_SHELL = /['`$\\]/;

const BODY_RULES: [string, RegExp][] = [
  [
    "home or installation path",
    /(?<![A-Za-z0-9_.-])\/(?:Users|home)\/[^\s/]|~\/|\$\{?HOME\b|(?<![A-Za-z0-9_.-])\.lawman(?![A-Za-z0-9_.-])(?!\/departments\/)/,
  ],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/],
  ["image embed", /!\[|<(?:img|picture)/i],
];

const PATH_RULES: [string, (path: string) => boolean][] = [
  ["path holds ..", (path) => path.includes("..")],
  ["path starts with a slash", (path) => path.startsWith("/")],
  ["path holds a backslash", (path) => path.includes("\\")],
];

function lineReasons(line: string, fenced: boolean): string[] {
  const reasons = BODY_RULES.filter(([, re]) => re.test(line)).map(([reason]) => reason);
  if (!fenced && MENTION.test(line.replace(CODE_SPAN, ""))) reasons.push("@ mention");
  return reasons;
}

// reasons name the rule only, never the matched text
export function lintBody(input: string): string[] {
  const lines = input.split("\n").map(stripCr);
  const titled = lines.length > 1 && lines[1] !== "";
  const reasons = lineReasons(lines[0], false).map((r) => `title: ${r}`);
  if (lines[0].trim() === "") reasons.push("title: empty title");
  if (TITLE_SHELL.test(lines[0])) reasons.push("title: shell character");
  if (titled) reasons.push("title: no blank line after the title");
  const body = lines.slice(titled ? 1 : 2);
  if (Buffer.byteLength(body.join("\n")) > BODY_MAX_BYTES) reasons.push(`1: body exceeds ${BODY_MAX_BYTES} bytes`);
  const fenced = fencedLines(body);
  body.forEach((line, i) => reasons.push(...lineReasons(line, fenced[i]).map((r) => `${i + 1}: ${r}`)));
  const lastText = body.findLastIndex((l) => l.trim() !== "");
  if (lastText >= 0 && fenced[lastText]) reasons.push(`${lastText + 1}: last line is inside a fenced block`);
  else if (lastText < 0 || !parseMarker(body[lastText])) reasons.push(`${Math.max(lastText, 0) + 1}: last line is not a valid marker`);
  return reasons;
}

export function lintBodyCommand(args: string[]): number {
  if (args.length > 0) throw usage(LINT_BODY_USAGE);
  const reasons = lintBody(readStdin());
  for (const reason of reasons) out(reason);
  return reasons.length > 0 ? EXIT.LINT_BODY : EXIT.OK;
}

type Frontmatter = { keys: Map<string, { value: string; line: number }> };
type Heading = { name: string; line: number };
export type PageLint = { reasons: string[]; departments: [string, string][] };

function readFrontmatter(lines: string[]): { front: Frontmatter; end: number } | null {
  const close = lines[0] === FRONTMATTER_FENCE ? lines.indexOf(FRONTMATTER_FENCE, 1) : -1;
  if (close < 0) return null;
  const keys: Frontmatter["keys"] = new Map();
  lines.slice(1, close).forEach((line, i) => {
    const m = line.match(FRONTMATTER_KEY);
    if (m) keys.set(m[1], { value: m[2], line: i + 2 });
  });
  return { front: { keys }, end: close + 1 };
}

function frontmatterReasons(front: Frontmatter | null, kind: string, expectedName?: string): string[] {
  if (front === null) return ["1: frontmatter missing or not closed"];
  const reasons: string[] = [];
  const version = front.keys.get("contract_version");
  if (!version) reasons.push("1: contract_version missing");
  else if (version.value !== "1") reasons.push(`${version.line}: contract_version must be 1`);
  if (kind !== "department") return reasons;
  const name = front.keys.get("name");
  if (!name) reasons.push("1: name missing");
  else if (!NAME.test(name.value)) reasons.push(`${name.line}: name must match [a-z][a-z0-9-]*`);
  else if (expectedName !== undefined && name.value !== expectedName) reasons.push(`${name.line}: name differs from the file name`);
  return reasons;
}

function firstMismatch(found: Heading[], expected: string[]): number {
  for (let i = 0; i < Math.max(found.length, expected.length); i++) if (found[i]?.name !== expected[i]) return i;
  return -1;
}

function headingReasons(found: Heading[], expected: string[], total: number): string[] {
  const i = firstMismatch(found, expected);
  if (i < 0) return [];
  const got = found[i];
  if (!got) return [`${total}: missing heading "${expected[i]}"`];
  const names = found.map((h) => h.name);
  if (i >= expected.length || !expected.includes(got.name) || names.indexOf(got.name) < i) {
    return [`${got.line}: extra heading "${got.name}"`];
  }
  if (!names.includes(expected[i])) return [`${got.line}: missing heading "${expected[i]}"`];
  return [`${got.line}: heading "${got.name}" is out of order, expected "${expected[i]}"`];
}

function emptySections(lines: string[], found: Heading[]): string[] {
  return found.flatMap((h, k) => {
    const end = found[k + 1] ? found[k + 1].line - 1 : lines.length;
    return lines.slice(h.line, end).every((l) => l.trim() === "") ? [`${h.line}: section "${h.name}" is empty, write none`] : [];
  });
}

function pathReasons(path: string, line: number): string[] {
  return PATH_RULES.filter(([, bad]) => bad(path)).map(([reason]) => `${line}: ${reason}`);
}

function listedLine(text: string, line: number, section: string, page: PageLint): void {
  if (section !== "Departments") {
    if (text.startsWith("- ")) page.reasons.push(...pathReasons(text.slice(2).split(/\s/)[0], line));
    return;
  }
  const m = text.match(DEPARTMENT_LINE);
  if (m) {
    page.reasons.push(...pathReasons(m[2], line));
    page.departments.push([m[1], m[2]]);
  } else if (text !== "none") {
    page.reasons.push(`${line}: department line must read "- <name>: judged by <path or none>"`);
  }
}

function constitutionLists(lines: string[], found: Heading[], hidden: boolean[], page: PageLint): void {
  found.forEach((h, k) => {
    if (!PATH_SECTIONS.includes(h.name)) return;
    const end = found[k + 1] ? found[k + 1].line - 1 : lines.length;
    for (let i = h.line; i < end; i++) {
      if (!hidden[i] && lines[i].trim() !== "") listedLine(lines[i], i + 1, h.name, page);
    }
  });
}

export function lintPage(kind: string, text: string, expectedName?: string): PageLint {
  const lines = text.split("\n").map(stripCr);
  if (lines.at(-1) === "") lines.pop();
  const parsed = readFrontmatter(lines);
  const hidden = fencedLines(lines);
  const found: Heading[] = [];
  lines.forEach((line, i) => {
    const m = !hidden[i] && i >= (parsed?.end ?? 0) ? line.match(HEADING) : null;
    if (m) found.push({ name: m[1], line: i + 1 });
  });
  const page: PageLint = { reasons: frontmatterReasons(parsed?.front ?? null, kind, expectedName), departments: [] };
  page.reasons.push(...headingReasons(found, PAGE_HEADINGS[kind], lines.length), ...emptySections(lines, found));
  if (kind === "constitution") {
    const start = parsed?.end ?? 0;
    const titleEnd = found[0] ? found[0].line - 1 : lines.length;
    if (!lines.slice(start, titleEnd).some((l, i) => !hidden[start + i] && TITLE_LINE.test(l))) {
      page.reasons.push(`${start + 1}: title line "# Constitution of <owner>/<repo>" missing`);
    }
    constitutionLists(lines, found, hidden, page);
  }
  page.reasons.sort((a, b) => parseInt(a) - parseInt(b));
  if (page.reasons.length > 0) page.departments = [];
  return page;
}

export function lintPageCommand(args: string[]): number {
  const { pos, opt } = parseArgs(args, 1, [], LINT_PAGE_USAGE, ["name"]);
  const kind = pos[0];
  if (!Object.hasOwn(PAGE_HEADINGS, kind) || (opt.name !== undefined && kind !== "department")) throw usage(LINT_PAGE_USAGE);
  const expected = opt.name === undefined ? undefined : check("department", opt.name);
  const page = lintPage(kind, readStdin(), expected);
  for (const reason of page.reasons) out(reason);
  for (const [name, judgedBy] of page.departments) out(name, judgedBy);
  return page.reasons.length > 0 ? EXIT.LINT_PAGE : EXIT.OK;
}

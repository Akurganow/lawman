import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "./args";
import { EXIT, Fail, out, readStdin } from "./db";
import { fencedLines, parseMarker, stripCr } from "./markers";

const PRECEDENT_USAGE =
	"precedent --page <path> --source <ruling comment URL> (stdin: the ruling comment)";
const SECTION_HEADING = /^ {0,3}## +Precedent *$/;
const ANY_HEADING = /^ {0,3}#{1,6} +\S/;
const PAGE_HEADING = /^ {0,3}## +Precedents *$/;
const RULING_LINE = /^- (\d{4}-\d{2}-\d{2}): (.*\S.*)$/;
const NUMBERED_LINE = /^- \S+ #(\d+):/;
const NONE = "none";

export type PrecedentResult =
	| { kind: "entry"; number: number; page: string }
	| { kind: "none" }
	| { kind: "no-entry"; reason: string };

const noEntry = (reason: string): PrecedentResult => ({
	kind: "no-entry",
	reason,
});
const isBlank = (line: string) => line.trim() === "";

function sectionBounds(lines: string[], hidden: boolean[]): number[][] {
	const bounds: number[][] = [];
	lines.forEach((line, i) => {
		if (hidden[i] || !SECTION_HEADING.test(line)) return;
		let end = i + 1;
		while (
			end < lines.length &&
			(hidden[end] ||
				!(ANY_HEADING.test(lines[end] ?? "") || parseMarker(lines[end] ?? "")))
		)
			end++;
		bounds.push([i + 1, end]);
	});
	return bounds;
}

function readRuling(
	text: string,
): { date: string; ruling: string } | PrecedentResult {
	const lines = text.split("\n").map(stripCr);
	const bounds = sectionBounds(lines, fencedLines(lines));
	const [first, ...more] = bounds;
	if (first === undefined) return noEntry("no-section");
	if (more.length > 0) return noEntry("several-sections");
	const body = lines.slice(first[0], first[1]);
	const start = body.findIndex((l) => !isBlank(l));
	if (start < 0) return noEntry("empty-section");
	const content = body.slice(start, body.findLastIndex((l) => !isBlank(l)) + 1);
	if (content.length > 1) return noEntry("several-lines");
	if (content[0] === NONE) return { kind: "none" };
	const [, date, ruling] = content[0]?.match(RULING_LINE) ?? [];
	return date === undefined || ruling === undefined
		? noEntry("bad-line")
		: { date, ruling };
}

function nextNumber(sectionLines: string[]): number {
	const numbers = sectionLines.map((l) => Number(l.match(NUMBERED_LINE)?.[1]));
	return Math.max(0, ...numbers.filter(Number.isFinite)) + 1;
}

function addLine(
	page: string,
	build: (number: number) => string,
): { page: string; number: number } {
	const lines = page.split("\n");
	const hidden = fencedLines(lines);
	const heading = lines.findIndex(
		(l, i) => !hidden[i] && PAGE_HEADING.test(stripCr(l)),
	);
	const section = lines.slice(heading + 1);
	const number = nextNumber(section);
	const filled = section.filter((l) => !isBlank(l));
	const noneAt =
		heading >= 0 && filled.length === 1 && stripCr(filled[0] ?? "") === NONE
			? lines.indexOf(filled[0] ?? "", heading + 1)
			: -1;
	const at = noneAt >= 0 ? noneAt : lines.findLastIndex((l) => !isBlank(l)) + 1;
	const cr = lines[noneAt >= 0 ? noneAt : at - 1]?.endsWith("\r") ? "\r" : "";
	lines.splice(at, noneAt >= 0 ? 1 : 0, build(number) + cr);
	return { page: lines.join("\n"), number };
}

export function precedent(
	page: string,
	decision: string,
	source: string,
): PrecedentResult {
	const ruled = readRuling(decision);
	if ("kind" in ruled) return ruled;
	const added = addLine(
		page,
		(n) => `- ${ruled.date} #${n}: ${ruled.ruling} (${source})`,
	);
	return { kind: "entry", ...added };
}

function readPage(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new Fail(EXIT.USAGE, `cannot read the page: ${JSON.stringify(path)}`);
	}
}

export function precedentCommand(args: string[]): void {
	const { opt } = parseArgs(args, 0, ["page", "source"], PRECEDENT_USAGE);
	const result = precedent(readPage(opt.page), readStdin(), opt.source);
	if (result.kind === "entry") {
		writeFileSync(opt.page, result.page);
		out("entry", String(result.number));
	} else if (result.kind === "none") {
		out(NONE);
	} else {
		out("no-entry", result.reason);
	}
}

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "./args";
import { EXIT, Fail, out, readStdin } from "./db";
import { HEADING, lintPage } from "./lint";
import { fencedLines, parseMarker, stripCr } from "./markers";

const PRECEDENT_USAGE =
	"precedent --page <path> --source <ruling comment URL> (stdin: the ruling comment)";
const MERGE_USAGE =
	"precedent-merge --base <file> --ours <file> --theirs <file> --out <file>";
const SECTION_HEADING = /^ {0,3}## +Precedent *$/;
const ANY_HEADING = /^ {0,3}#{1,6} +\S/;
const PAGE_HEADING = /^ {0,3}## +Precedents *$/;
const RULING_LINE = /^- (\d{4}-\d{2}-\d{2}): (.*\S.*)$/;
const NUMBERED_LINE = /^- \S+ #(\d+):/;
const ADDED_LINE = /^(- \d{4}-\d{2}-\d{2} )#(\d+)(: \S.*)$/;
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

function nextNumber(sectionLines: string[], hidden: boolean[]): number {
	const numbers = sectionLines.map((l, i) =>
		hidden[i] ? Number.NaN : Number(l.match(NUMBERED_LINE)?.[1]),
	);
	return Math.max(0, ...numbers.filter(Number.isFinite)) + 1;
}

type Section = { heading: number; end: number };

// ends at the next `##` heading; a page without the heading is one section to its end
function precedentsSection(lines: string[], hidden: boolean[]): Section {
	const heading = lines.findIndex(
		(l, i) => !hidden[i] && PAGE_HEADING.test(stripCr(l)),
	);
	const next = lines.findIndex(
		(l, i) => i > heading && !hidden[i] && HEADING.test(stripCr(l)),
	);
	return { heading, end: heading < 0 || next < 0 ? lines.length : next };
}

// the index of the lone `none` line in the section, or -1
function placeholderAt(lines: string[], { heading, end }: Section): number {
	if (heading < 0) return -1;
	const filled = lines.flatMap((l, i) =>
		i > heading && i < end && !isBlank(l) ? [i] : [],
	);
	const only = filled[0];
	return filled.length === 1 &&
		only !== undefined &&
		stripCr(lines[only] ?? "") === NONE
		? only
		: -1;
}

function addLine(
	page: string,
	build: (number: number) => string,
): { page: string; number: number } {
	const lines = page.split("\n");
	const hidden = fencedLines(lines);
	const section = precedentsSection(lines, hidden);
	const from = section.heading + 1;
	const number = nextNumber(
		lines.slice(from, section.end),
		hidden.slice(from, section.end),
	);
	const noneAt = placeholderAt(lines, section);
	const top = Math.max(section.heading, 0);
	const last =
		top + lines.slice(top, section.end).findLastIndex((l) => !isBlank(l));
	const at = noneAt >= 0 ? noneAt : last + 1;
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

export type MergeResult =
	| { kind: "merged"; page: string; moves: string[] }
	| { kind: "unresolved"; reason: string };

const unresolved = (reason: string): MergeResult => ({
	kind: "unresolved",
	reason,
});

// indices of `ours` lines left over once `base` is matched in order, or null when base is not a subsequence
function insertedLines(base: string[], ours: string[]): number[] | null {
	const added: number[] = [];
	let matched = 0;
	ours.forEach((line, i) => {
		if (line === base[matched]) matched++;
		else added.push(i);
	});
	return matched === base.length ? added : null;
}

function withoutPlaceholder(lines: string[]): string[] {
	const at = placeholderAt(lines, precedentsSection(lines, fencedLines(lines)));
	return lines.filter((_, i) => i !== at);
}

export function mergePrecedents(
	base: string,
	ours: string,
	theirs: string,
): MergeResult {
	if (isBlank(base)) return unresolved("no-base");
	const baseLines = base.split("\n").map(stripCr);
	const oursLines = ours.split("\n").map(stripCr);
	const hidden = fencedLines(oursLines);
	const section = precedentsSection(oursLines, hidden);
	const added =
		insertedLines(baseLines, oursLines) ??
		insertedLines(withoutPlaceholder(baseLines), oursLines);
	if (added === null) return unresolved("other-change");
	const lines = added.map((i) => oursLines[i] ?? "");
	if (
		added.some(
			(i, k) =>
				hidden[i] ||
				section.heading < 0 ||
				i <= section.heading ||
				i >= section.end ||
				isBlank(lines[k] ?? ""),
		)
	)
		return unresolved("other-change");
	if (lines.length === 0) return unresolved("no-added-lines");
	let merged = theirs;
	const moves: string[] = [];
	for (const line of lines) {
		const [, prefix, old, rest] = line.match(ADDED_LINE) ?? [];
		if (prefix === undefined || old === undefined || rest === undefined)
			return unresolved("bad-line");
		const placed = addLine(merged, (n) => `${prefix}#${n}${rest}`);
		merged = placed.page;
		moves.push(`#${old}->#${placed.number}`);
	}
	return lintPage("constitution", merged).reasons.length > 0
		? unresolved("bad-page")
		: { kind: "merged", page: merged, moves };
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

function readBase(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

export function precedentMergeCommand(args: string[]): void {
	const { opt } = parseArgs(
		args,
		0,
		["base", "ours", "theirs", "out"],
		MERGE_USAGE,
	);
	const result = mergePrecedents(
		readBase(opt.base),
		readPage(opt.ours),
		readPage(opt.theirs),
	);
	if (result.kind === "merged") {
		writeFileSync(opt.out, result.page);
		out("merged", result.moves.join(","));
	} else {
		out("unresolved", result.reason);
	}
}

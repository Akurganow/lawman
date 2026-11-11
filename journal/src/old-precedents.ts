import { readFileSync } from "node:fs";
import { check, parseArgs, usage } from "./args";
import { CleanFailed, cleaning } from "./cache-text";
import { cleanCharacters } from "./clean";
import { EXIT, Fail, out, readStdin } from "./db";
import { type Block, fencedBlock, renderAll } from "./input-parts";
import { hasCommand, precinctPlace } from "./launch";
import { collectIssueMarkers } from "./markers";
import { output, Refused, refusal, registered } from "./operations";
import {
	KIND_OF,
	type OldItem,
	oldItems,
	oldLineToFile,
	trustedLogin,
} from "./precedent";
import { PRECEDENT_KINDS } from "./precedent-file";
import { type IssuesInput, readIssues } from "./sync-issues";

const USAGE =
	"old-precedent list|old-precedent added --base <file> --head <file>|old-precedent check <precinct> <line>[:<issue>]...|old-precedent move <precinct> --tree <folder> --line <n> --gist <gist> [--issue <n>] [--kind protects|condemns]";
const PAIR = /^([1-9][0-9]*)(?::([1-9][0-9]*))?$/;

// the value of `reason=` in `ask reason=<reason>`: why a line gets a question
// instead of a kind. A refused run of the issues command is no such answer; it
// prints as the refusal of that command.
const WHY = [
	"no-issue",
	"absent",
	"repeated",
	"no-ruling",
	"mixed",
	"form",
	"ceiling",
] as const;
type Why = (typeof WHY)[number];
type Verdict = { kind: string } | { why: Why };
type Issues = { issues: IssuesInput } | { why: Why } | { refused: Refused };

const NO_ISSUE: Verdict = { why: "no-issue" };

// the rule is the owner's or the court's text, so it prints in a fence
async function itemBlocks(items: OldItem[]): Promise<Block[]> {
	const blocks: Block[] = [];
	for (const i of items) {
		if (i.line === undefined) {
			blocks.push({ line: `outside position=${i.position}` });
			continue;
		}
		const { number, date, link, rule } = i.line;
		const text = await cleaning(() => cleanCharacters(rule));
		blocks.push(
			fencedBlock(
				"rule",
				text,
				`line ${number} date=${date} link=${link === undefined ? "no" : "yes"} position=${i.position}`,
			),
		);
	}
	return blocks;
}

async function printItems(items: OldItem[]): Promise<number> {
	try {
		out(items.length === 0 ? "none" : renderAll(await itemBlocks(items)));
	} catch (e) {
		if (e instanceof CleanFailed)
			throw new Fail(EXIT.COMMAND, "the cleaning library failed");
		throw e;
	}
	return EXIT.OK;
}

const readPage = (path: string) => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		throw new Fail(EXIT.USAGE, `cannot read ${JSON.stringify(path)}`);
	}
};

// The numbered lines of the head page whose number the page at the merge base
// lacks, and the HTML blocks that hide such a line and that the base lacks. An
// edited line keeps its number, and a free note is no old line.
function added(base: string, head: string): OldItem[] {
	const was = oldItems(base);
	const numbers = new Set(was.map((i) => i.line?.number));
	const blocks = new Set(was.filter((i) => i.hidden).map((i) => i.text));
	return oldItems(head).filter((i) =>
		i.line === undefined
			? i.hidden === true && !blocks.has(i.text)
			: !numbers.has(i.line.number),
	);
}

// The issues form, read without the cache: the precinct's command gives it,
// or standard input when the precinct has none.
async function issuesForm(precinct: string): Promise<Issues> {
	const place = precinctPlace(precinct);
	let text: string;
	try {
		text = hasCommand(place, "issues")
			? await output(place, "issues", [])
			: readStdin();
	} catch (e) {
		if (!(e instanceof Refused)) throw e;
		return e.reason === "form" ? { why: "form" } : { refused: e };
	}
	try {
		return { issues: readIssues(text) };
	} catch (e) {
		if (!(e instanceof Fail)) throw e;
		return { why: e.code === EXIT.SYNC_LIMIT ? "ceiling" : "form" };
	}
}

// One kind only when every counted court ruling on the issue gives it.
function judged(
	read: Exclude<Issues, { refused: Refused }>,
	issue: number,
	login: string,
): Verdict {
	if ("why" in read) return read;
	const found = read.issues.issues.filter((i) => i.number === issue);
	const [one] = found;
	if (one === undefined) return { why: "absent" };
	if (found.length > 1) return { why: "repeated" };
	const kinds = new Set(
		collectIssueMarkers(one, login)
			.markers.filter((m) => m.marker.role === "court")
			.flatMap((m) => KIND_OF.get(m.marker.stage) ?? []),
	);
	const [kind] = kinds;
	if (kind === undefined) return { why: "no-ruling" };
	return kinds.size > 1 ? { why: "mixed" } : { kind };
}

async function failed(refused: Refused): Promise<number> {
	const { code, blocks } = await refusal("issues", refused);
	out(renderAll(blocks));
	return code;
}

const verdictLine = (line: number, v: Verdict) =>
	"kind" in v
		? `line ${line} kind=${v.kind}`
		: `line ${line} ask reason=${v.why}`;

async function checkCommand(args: string[]): Promise<number> {
	const [precinct, ...rest] = args;
	if (precinct === undefined || rest.length === 0) throw usage(USAGE);
	const pairs = rest.map((a) => {
		const m = a.match(PAIR);
		if (m === null) throw usage(USAGE);
		return {
			line: Number(m[1]),
			issue: m[2] === undefined ? null : Number(m[2]),
		};
	});
	registered(check("precinct", precinct));
	const login = trustedLogin();
	// the form is read once, and only when a line names an issue
	let read: Issues | undefined;
	const verdicts: Verdict[] = [];
	for (const { issue } of pairs) {
		if (issue === null) {
			verdicts.push(NO_ISSUE);
			continue;
		}
		read ??= await issuesForm(precinct);
		if ("refused" in read) return failed(read.refused);
		verdicts.push(judged(read, issue, login));
	}
	pairs.forEach(({ line }, i) => {
		out(verdictLine(line, verdicts[i] ?? NO_ISSUE));
	});
	return EXIT.OK;
}

async function moveCommand(args: string[]): Promise<number> {
	const { pos, opt } = parseArgs(args, 1, ["tree", "line", "gist"], USAGE, [
		"issue",
		"kind",
	]);
	const precinct = check("precinct", pos[0]);
	const line = Number(check("number", opt.line));
	const issue =
		opt.issue === undefined ? null : Number(check("number", opt.issue));
	if (opt.kind !== undefined && !PRECEDENT_KINDS.includes(opt.kind))
		throw usage(USAGE);
	registered(precinct);
	const login = trustedLogin();
	let verdict = NO_ISSUE;
	if (issue !== null) {
		const read = await issuesForm(precinct);
		if ("refused" in read) return failed(read.refused);
		verdict = judged(read, issue, login);
	}
	// the user's kind counts only where the rulings give none
	const chosen: Verdict =
		"why" in verdict && opt.kind !== undefined ? { kind: opt.kind } : verdict;
	if ("why" in chosen) {
		out(`ask reason=${chosen.why}`);
		return EXIT.OK;
	}
	const name = oldLineToFile({
		tree: opt.tree,
		number: line,
		gist: opt.gist,
		kind: chosen.kind,
	});
	out(`entry ${name}`);
	return EXIT.OK;
}

// The move of the numbered lines of an old Precedents section into files.
export async function oldPrecedentCommand(args: string[]): Promise<number> {
	const [mode, ...rest] = args;
	if (mode === "list") {
		if (rest.length > 0) throw usage(USAGE);
		return printItems(oldItems(readStdin()));
	}
	if (mode === "added") {
		const { opt } = parseArgs(rest, 0, ["base", "head"], USAGE);
		return printItems(added(readPage(opt.base), readPage(opt.head)));
	}
	if (mode === "check") return checkCommand(rest);
	if (mode === "move") return moveCommand(rest);
	throw usage(USAGE);
}

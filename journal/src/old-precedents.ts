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

type Ask = { ask: string };
type Form = IssuesInput | Ask;

const ask = (reason: string): Ask => ({ ask: reason });

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

// the items the head page holds and the page at the merge base does not
function added(base: string, head: string): OldItem[] {
	const before = new Set(oldItems(base).map((i) => i.text));
	return oldItems(head).filter((i) => !before.has(i.text));
}

// The issues form, read without the cache: the precinct's command gives it,
// or standard input when the precinct has none.
async function issuesForm(precinct: string): Promise<Form | Refused> {
	const place = precinctPlace(precinct);
	let text: string;
	try {
		text = hasCommand(place, "issues")
			? await output(place, "issues", [])
			: readStdin();
	} catch (e) {
		if (e instanceof Refused) return e.reason === "form" ? ask("form") : e;
		throw e;
	}
	try {
		return readIssues(text);
	} catch (e) {
		if (!(e instanceof Fail)) throw e;
		return ask(e.code === EXIT.SYNC_LIMIT ? "ceiling" : "form");
	}
}

// One kind only when every counted court ruling on the issue gives it.
export function kindOf(form: Form, issue: number, login: string): string | Ask {
	if ("ask" in form) return form;
	const found = form.issues.filter((i) => i.number === issue);
	const [one] = found;
	if (one === undefined) return ask("absent");
	if (found.length > 1) return ask("repeated");
	const kinds = new Set(
		collectIssueMarkers(one, login)
			.markers.filter((m) => m.marker.role === "court")
			.flatMap((m) => KIND_OF.get(m.marker.stage) ?? []),
	);
	const [kind] = kinds;
	if (kind === undefined) return ask("no-ruling");
	return kinds.size > 1 ? ask("mixed") : kind;
}

async function failed(refused: Refused): Promise<number> {
	const { code, blocks } = await refusal("issues", refused);
	out(renderAll(blocks));
	return code;
}

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
	// the form is read only when a line names an issue
	const form = pairs.some((p) => p.issue !== null)
		? await issuesForm(precinct)
		: null;
	if (form instanceof Refused) return failed(form);
	for (const { line, issue } of pairs) {
		const kind =
			issue === null || form === null
				? ask("no-issue")
				: kindOf(form, issue, login);
		out(
			typeof kind === "string"
				? `line ${line} kind=${kind}`
				: `line ${line} ask reason=${kind.ask}`,
		);
	}
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
	let kind: string | Ask = ask("no-issue");
	if (issue !== null) {
		const form = await issuesForm(precinct);
		if (form instanceof Refused) return failed(form);
		kind = kindOf(form, issue, login);
	}
	// the user's kind counts only where the rulings give none
	const chosen = typeof kind === "string" ? kind : opt.kind;
	if (chosen === undefined) {
		out(`ask reason=${typeof kind === "string" ? "" : kind.ask}`);
		return EXIT.OK;
	}
	const name = oldLineToFile({
		tree: opt.tree,
		number: line,
		gist: opt.gist,
		kind: chosen,
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

import type { Database } from "bun:sqlite";
import {
	lstatSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RootContent } from "mdast";
import { check, checkLink, fits, parseArgs, usage } from "./args";
import { caseStage } from "./cases";
import { cleanCharacters } from "./clean";
import { consents, jevAllowed, licensesAllowed } from "./consent";
import { EXIT, Fail, out, readStdin, withDb } from "./db";
import {
	departmentNames,
	departmentPage,
	listSharedPages,
	type PageRead,
} from "./department-page";
import { readConfig } from "./input-files";
import { jevNone, replyOf } from "./jev";
import { utf8 } from "./launch";
import { sectionNodes, sectionWords, sliceOf } from "./law-sections";
import { configValue } from "./law-sync";
import { lintPage } from "./lint";
import { extractMarkers, stripCr } from "./markers";
import {
	ALL,
	asksJev,
	type Candidate,
	caseList,
	DEPARTMENTS_THRESHOLD,
	decide,
	departmentsAnswer,
	departmentsBody,
	departmentsState,
	droppedNames,
	type Named,
	originalList,
} from "./precedent-departments";
import {
	buildPrecedent,
	departmentsField,
	headerOf,
	NO_VALUE,
	PRECEDENT_KINDS,
	splitPrecedent,
	withDepartments,
} from "./precedent-file";

const USAGE =
	"precedent <precinct> --issue <n> --source <ruling comment URL> --tree <folder>|precedent <precinct> --issue <n> --tree <folder> --request <name>|precedent <precinct> --issue <n> --tree <folder> --answer <name>";
const CONSTITUTION = "LAWMAN.md";
const SECTION = "Precedent";
const OLD_SECTION = "Precedents";
const NONE = "none";
const GIST = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// the names stand before the first colon, so no character of the rule reads as a name
const NEW_LINE = /^new ([^\s:]+)(?: for ([^:]*))?: (.+)$/;
const REFINE_LINE = /^refine ([^\s:]+): (.+)$/;
const CANCEL_LINE = /^cancel (\S+)$/;
const OLD_LINE = /^(\d{4}-\d{2}-\d{2}) #([1-9][0-9]*): (.+)$/;
const OLD_SOURCE = /^(.+) \((\S+)\)$/;
// a Map, so a stage named like an object member gives no kind
export const KIND_OF = new Map([
	["conviction", "condemns"],
	["acquittal", "protects"],
]);

// an underlined heading never applies as written
type Item = { text: string; bad: boolean };

function itemsOf(text: string, nodes: RootContent[]): Item[] {
	return nodes.flatMap((node): Item[] => {
		if (node.type === "html" || node.type === "thematicBreak") return [];
		if (node.type === "list")
			return node.children.flatMap((li) => {
				const t = sliceOf(text, li.children[0], li.children.at(-1));
				return t === "" ? [] : [{ text: t, bad: false }];
			});
		if (
			node.type === "heading" &&
			text[node.position?.start.offset ?? 0] !== "#"
		)
			return [
				{
					text: sliceOf(text, node.children[0], node.children.at(-1)),
					bad: true,
				},
			];
		const t = sliceOf(text, node, node);
		return t === "" ? [] : [{ text: t, bad: false }];
	});
}

type EntryKind = "absent" | "file" | "dir" | "other";

function entryKind(path: string): EntryKind {
	try {
		const stat = lstatSync(path);
		return stat.isFile() ? "file" : stat.isDirectory() ? "dir" : "other";
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return "absent";
		throw e;
	}
}

const unsafe = (path: string) =>
	new Fail(
		EXIT.USAGE,
		`not a plain file or folder, nothing written: ${JSON.stringify(path)}`,
	);

// The precinct clone is foreign: no link is followed, and nothing is written
// until every path checks out.
class Folder {
	private readonly dir: string;
	// every name this call wrote, in the order of its first write
	private readonly state = new Map<string, string | null>();

	constructor(tree: string) {
		const lawman = join(tree, ".lawman");
		this.dir = join(lawman, "precedents");
		for (const path of [lawman, this.dir])
			if (!["absent", "dir"].includes(entryKind(path))) throw unsafe(path);
	}

	private path = (name: string) => join(this.dir, `${name}.md`);

	private disk(name: string): string | null {
		const kind = entryKind(this.path(name));
		if (kind === "dir" || kind === "other") throw unsafe(this.path(name));
		return kind === "file" ? readFileSync(this.path(name), "utf8") : null;
	}

	current(name: string): string | null {
		return this.state.has(name)
			? (this.state.get(name) ?? null)
			: this.disk(name);
	}

	set(name: string, text: string | null): void {
		this.state.set(name, text);
	}

	free(base: string): string {
		for (let k = 1; ; k++) {
			const name = k === 1 ? base : `${base}-${k}`;
			if (!this.state.has(name) && entryKind(this.path(name)) === "absent")
				return name;
		}
	}

	// the names whose final text differs from the disk, written only when all are safe
	commit(): string[] {
		const changed = [...this.state].filter(
			([name, text]) => text !== this.disk(name),
		);
		if (changed.length > 0) mkdirSync(this.dir, { recursive: true });
		for (const [name, text] of changed)
			if (text === null) unlinkSync(this.path(name));
			else writeFileSync(this.path(name), text);
		return changed.map(([name]) => name);
	}
}

// A file of the clone, read without following a link. A path that is no plain
// file or folder is a failed read, which is data. A plain file that cannot be
// read is a fault of the journal and throws.
function treeFile(tree: string, parts: string[]): PageRead {
	let at = tree;
	for (const [i, part] of parts.entries()) {
		at = join(at, part);
		const kind = entryKind(at);
		if (kind === "absent") return { kind: "none" };
		if (kind !== (i === parts.length - 1 ? "file" : "dir"))
			return { kind: "failed" };
	}
	try {
		return { kind: "page", text: readFileSync(at, "utf8") };
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code ?? "unknown";
		throw new Error(`cannot read ${parts.join("/")} in the tree: ${code}`);
	}
}

type Line =
	| { type: "new"; gist: string; rule: string; named: Named }
	| { type: "refine"; name: string; update: string }
	| { type: "cancel"; name: string | null }
	| { type: "none" }
	| { type: "bad" };

// one item of a Precedent section, as both the write and the admission read it
function classify({ text, bad }: Item): Line {
	const single = !bad && !text.includes("\n");
	const [, gist, namesPart, rule] = (single && text.match(NEW_LINE)) || [];
	const [, refined, update] = (single && text.match(REFINE_LINE)) || [];
	const [, cancelled] = (single && text.match(CANCEL_LINE)) || [];
	const named = namesPart?.split(",").map((n) => n.trim());
	if (
		gist !== undefined &&
		rule !== undefined &&
		GIST.test(gist) &&
		!named?.includes("")
	)
		return {
			type: "new",
			gist,
			rule: rule.trim(),
			named: named === undefined ? null : named.includes(ALL) ? ALL : named,
		};
	if (
		refined !== undefined &&
		update !== undefined &&
		fits("precedent", refined)
	)
		return { type: "refine", name: refined, update: update.trim() };
	if (cancelled !== undefined)
		return {
			type: "cancel",
			name: fits("precedent", cancelled) ? cancelled : null,
		};
	return single && text === NONE ? { type: "none" } : { type: "bad" };
}

type Ruling = {
	precedentKind: string;
	date: string;
	issue: number;
	source: string;
};

// What a write call did: the printed lines; the files that a new line created
// under its own name and no later line changed, each with its original list; and
// every file a new line created that exists after the commit, with the court's names.
type Applied = {
	lines: string[];
	fresh: { name: string; original: string[] }[];
	kept: { name: string; named: Named }[];
};

// originalOf gives the list of a new file; it reads nothing that can fail after
// the first write, because the folder writes only at its commit.
function apply(
	items: Item[],
	ruling: Ruling,
	folder: Folder,
	originalOf: (named: Named) => string[],
): Applied {
	const reasons = new Map<string, string>();
	const lines: string[] = [];
	const fresh = new Map<string, string[]>();
	const created = new Map<string, Named>();
	const create = (
		base: string,
		text: string,
		named: Named,
		reason?: string,
	) => {
		const name = folder.free(base);
		const why = reason ?? (name === base ? undefined : "name-taken");
		const original = originalOf(named);
		folder.set(
			name,
			buildPrecedent(
				{
					kind: ruling.precedentKind,
					departments: original,
					issue: ruling.issue,
					date: ruling.date,
					ruling: ruling.source,
				},
				text,
			),
		);
		if (why !== undefined) reasons.set(name, why);
		created.set(name, named);
		return { name, original };
	};
	const keep = `${ruling.date}-issue-${ruling.issue}`;
	for (const item of items) {
		const line = classify(item);
		if (line.type === "new") {
			const base = `${ruling.date}-${line.gist}`;
			const made = create(base, line.rule, line.named);
			if (made.name === base) fresh.set(base, made.original);
		} else if (line.type === "refine") {
			fresh.delete(line.name);
			const was = folder.current(line.name);
			const split = was === null ? null : splitPrecedent(was);
			if (split === null) create(keep, line.update, null, "refine-missing");
			else if (split.body.trim() !== line.update)
				folder.set(line.name, `${split.header}\n\n${line.update}\n`);
		} else if (line.type === "cancel") {
			if (line.name !== null) fresh.delete(line.name);
			if (line.name !== null && folder.current(line.name) !== null)
				folder.set(line.name, null);
			else lines.push(`cancel\t${line.name ?? NO_VALUE}\tmissing`);
		} else if (line.type === "bad") create(keep, item.text, null, "bad-line");
	}
	const written = folder.commit();
	for (const name of written) {
		const reason = reasons.get(name);
		lines.push(
			folder.current(name) === null
				? `cancel\t${name}`
				: ["entry", name, ...(reason === undefined ? [] : [reason])].join("\t"),
		);
	}
	return {
		lines,
		fresh: written.flatMap((name) => {
			const original = fresh.get(name);
			return original === undefined ? [] : [{ name, original }];
		}),
		kept: [...created]
			.filter(([name]) => folder.current(name) !== null)
			.map(([name, named]) => ({ name, named })),
	};
}

type Stored = { stage: string; fields: string; raw: string };

// the newest court marker of the case, which must be a ruling
function rulingMarker(db: Database, precinct: string, issue: number): Stored {
	const row = db
		.query(
			"SELECT stage, fields, raw FROM markers WHERE precinct = ? AND issue = ? AND role = 'court' ORDER BY ord DESC LIMIT 1",
		)
		.get(precinct, issue) as Stored | null;
	if (row === null || !KIND_OF.has(row.stage))
		throw new Fail(EXIT.USAGE, `no court ruling on ${precinct} #${issue}`);
	return row;
}

// the counted marker on the last non-empty line of the text, if any
function markerAtEnd(text: string, author: string | null, login: string) {
	const at = text
		.split("\n")
		.map(stripCr)
		.findLastIndex((l) => l.trim() !== "");
	return extractMarkers(
		{ text, createdAt: "", rank: 1, author: author ?? "" },
		login,
	).find((f) => f.line === at + 1)?.marker;
}

// the cached ruling comment: its last line is the newest ruling marker of the case
function rulingText(
	db: Database,
	precinct: string,
	issue: number,
	raw: string,
	login: string,
): string {
	const comments = db
		.query(
			"SELECT author, body FROM comments WHERE precinct = ? AND kind = 'issue' AND number = ? ORDER BY at DESC, rowid DESC",
		)
		.all(precinct, issue) as { author: string | null; body: string }[];
	const ruling = comments.find(
		(c) => markerAtEnd(c.body, c.author, login)?.raw === raw,
	);
	if (ruling === undefined)
		throw new Fail(
			EXIT.USAGE,
			`no cached comment carries the court ruling of ${precinct} #${issue}`,
		);
	return ruling.body;
}

export function trustedLogin(): string {
	const login = configValue(readConfig() ?? "", "trusted_login");
	if (login === undefined || !fits("login", login))
		throw new Fail(EXIT.USAGE, "config.yaml has no trusted_login");
	return login;
}

function summary(sections: Item[][], lines: string[]): string[] {
	const changed = lines.some((l) => !l.endsWith("\tmissing"));
	if (changed) return lines;
	const items = sections.flat();
	const end =
		sections.length === 0
			? "no-entry\tno-section"
			: items.some((i) => i.bad || i.text !== NONE)
				? "no-entry\tno-change"
				: items.length > 0
					? NONE
					: "no-entry\tempty-section";
	return [...lines, end];
}

// the newest ruling of the case and its cached comment
function rulingOf(precinct: string, issue: number) {
	const login = trustedLogin();
	const { marker, text } = withDb((db) => {
		const m = rulingMarker(db, precinct, issue);
		return { marker: m, text: rulingText(db, precinct, issue, m.raw, login) };
	});
	const at = (JSON.parse(marker.fields) as Record<string, string>).at ?? "";
	return {
		precedentKind: KIND_OF.get(marker.stage) ?? NO_VALUE,
		date: at.slice(0, 10),
		text,
	};
}

const itemsOfRuling = (text: string) =>
	sectionNodes(text, SECTION).map((s) => itemsOf(text, s));

const caseListOf = (db: Database, precinct: string, issue: number) =>
	caseList(caseStage(db, precinct, issue).department);

// The raw sources of the candidate departments. precinctRead reads the page of a
// department at the precinct place; the installation holds the other places.
export type Sources = {
	constitution: string | null;
	shared: string[];
	licenseConsent: boolean;
	precinctRead: (d: string) => () => Promise<PageRead>;
};

// The departments a precedent may serve, each with its Mission, in order: the
// shared pages of the law, then the lines of the constitution. A page that is
// absent, no plain file, fails its check or has no Mission gives no candidate.
export async function readCandidates(s: Sources): Promise<Candidate[]> {
	if (s.constitution === null) return [];
	const lint = lintPage("constitution", s.constitution);
	if (lint.reasons.length > 0) return [];
	const found: Candidate[] = [];
	const names = departmentNames(
		s.shared,
		lint.departments.map(([d]) => d),
	);
	for (const name of names) {
		if (!fits("department", name)) continue;
		const page = await departmentPage(name, s.precinctRead(name));
		if (page.kind !== "page" || page.lint.reasons.length > 0) continue;
		if (!licensesAllowed(name, page.page.place, s.licenseConsent)) continue;
		const mission = sectionWords(
			await cleanCharacters(page.page.text),
			"Mission",
		);
		if (mission !== null) found.push({ name, mission });
	}
	return found;
}

// The clerk's sources: the tree for the precinct place, the installation for the
// others. A failed listing of the shared pages is a fault, so no shared department
// is lost.
function treeSources(
	tree: string,
	config: string | null,
	precinct: string,
): Sources {
	const constitution = treeFile(tree, [CONSTITUTION]);
	return {
		constitution: constitution.kind === "page" ? constitution.text : null,
		shared: listSharedPages(),
		licenseConsent: consents(config, precinct, "license_precincts"),
		precinctRead: (d) => async () =>
			treeFile(tree, [".lawman", "departments", `${d}.md`]),
	};
}

// a gate that does not let a file through; any other error is a fault of the journal
class Refusal extends Fail {
	constructor(why: string) {
		super(EXIT.USAGE, why);
	}
}

// a refusal names its cause on stderr; any other error goes on as a fault
const reportRefusal = (e: unknown) => {
	if (!(e instanceof Refusal)) throw e;
	process.stderr.write(`journal: ${e.message}\n`);
};

type Admitted = {
	text: string;
	rule: string;
	ruling: { precedentKind: string; text: string };
	original: string[];
	candidateNames: string[];
	asked: Candidate[];
};

// The gate of the request and the adding step, which run apart from the write:
// the file of a new line of the newest ruling, as written, in a precinct allowed
// to use Jev, whose list leaves a candidate out.
async function admitted(
	precinct: string,
	issue: number,
	tree: string,
	name: string,
): Promise<Admitted> {
	if (!fits("precedent", name))
		throw new Refusal(`invalid precedent: ${JSON.stringify(name)}`);
	const ruling = rulingOf(precinct, issue);
	const file = treeFile(tree, [".lawman", "precedents", `${name}.md`]);
	if (file.kind === "none") throw new Refusal(`no precedent file: ${name}`);
	if (file.kind === "failed")
		throw new Refusal(`not a plain precedent file: ${name}`);
	const body = splitPrecedent(file.text)?.body.trim();
	const line = itemsOfRuling(ruling.text)
		.flat()
		.map(classify)
		.find(
			(l) =>
				l.type === "new" &&
				`${ruling.date}-${l.gist}` === name &&
				l.rule === body,
		);
	if (body === undefined || line?.type !== "new")
		throw new Refusal(`the file is not one new line of the ruling: ${name}`);
	const config = readConfig();
	if (!jevAllowed(config, precinct))
		throw new Refusal(`Jev is not allowed for ${precinct}`);
	const candidates = await readCandidates(treeSources(tree, config, precinct));
	const candidateNames = candidates.map((c) => c.name);
	const original = originalList(line.named, candidateNames, () =>
		withDb((db) => caseListOf(db, precinct, issue)),
	);
	if (!asksJev(original, candidateNames))
		throw new Refusal(`no candidate department to add: ${name}`);
	return {
		text: file.text,
		rule: body,
		ruling,
		original,
		candidateNames,
		asked: candidates.filter((c) => !original.includes(c.name)),
	};
}

const sameList = (a: string[], b: string[]) =>
	a.length === b.length && a.every((d, i) => d === b[i]);

async function requestBody(
	precinct: string,
	issue: number,
	tree: string,
	name: string,
): Promise<string> {
	const a = await admitted(precinct, issue, tree, name);
	return departmentsBody(
		await departmentsState({
			rule: a.rule,
			ruling: a.ruling.text,
			precedentKind: a.ruling.precedentKind,
			asked: a.asked,
		}),
	);
}

const UNCHANGED_LINE = "jev unchanged";

// The adding step: it reads the reply once and writes only the departments of a
// file that still holds its original list. Its reason brief means no usable
// request: empty input, or a file the gate refuses.
async function augmented(
	precinct: string,
	issue: number,
	tree: string,
	name: string,
	input: string,
): Promise<string> {
	if (input.trim() === "") return jevNone("brief");
	let a: Admitted;
	try {
		a = await admitted(precinct, issue, tree, name);
	} catch (e) {
		reportRefusal(e);
		return jevNone("brief");
	}
	const current = headerOf(a.text).departments;
	if (current === null || !sameList(current, a.original)) return UNCHANGED_LINE;
	const reply = replyOf(input);
	if ("none" in reply) return reply.none;
	let answer: ReturnType<typeof departmentsAnswer>;
	try {
		answer = departmentsAnswer(
			reply.body,
			a.asked.map((c) => c.name),
		);
	} catch {
		return jevNone("bad-answer");
	}
	const list = decide(
		a.original,
		a.candidateNames,
		answer.scored,
		DEPARTMENTS_THRESHOLD,
	);
	if (list === null) return UNCHANGED_LINE;
	const folder = new Folder(tree);
	folder.set(name, withDepartments(a.text, list));
	folder.commit();
	return `jev model=${answer.model} departments=${departmentsField(list)}`;
}

// a new line needs the candidates when the court named departments, or when Jev
// may add to its list
const needsCandidates = (lines: Line[], allowed: boolean) =>
	lines.some(
		(l) =>
			l.type === "new" &&
			(Array.isArray(l.named) || (allowed && l.named !== ALL)),
	);

// The write call. Every read comes before the first write, so a read fault
// writes nothing; the ask lines come from what the write did.
async function writePrecedents(
	precinct: string,
	issue: number,
	tree: string,
	source: string,
): Promise<void> {
	const { precedentKind, date, text } = rulingOf(precinct, issue);
	const sections = itemsOfRuling(text);
	const items = sections.flat();
	const config = readConfig();
	const allowed = jevAllowed(config, precinct);
	// without a need nobody reads them: no name can be known and Jev asks nothing
	const candidateNames = needsCandidates(items.map(classify), allowed)
		? (await readCandidates(treeSources(tree, config, precinct))).map(
				(c) => c.name,
			)
		: [];
	let theCase: string[] | undefined;
	const caseOf = () => {
		theCase ??= withDb((db) => caseListOf(db, precinct, issue));
		return theCase;
	};
	const { lines, fresh, kept } = apply(
		items,
		{ precedentKind, date, issue, source },
		new Folder(tree),
		(named) => originalList(named, candidateNames, caseOf),
	);
	for (const line of summary(sections, lines)) out(line);
	for (const { name, named } of kept)
		for (const d of droppedNames(named, candidateNames, (n) =>
			fits("department", n),
		))
			out("drop", name, d === null ? NO_VALUE : await cleanCharacters(d));
	// a precinct without Jev is a normal state: it asks nothing and says nothing
	if (allowed)
		for (const f of fresh)
			if (asksJev(f.original, candidateNames)) out("ask", f.name);
}

export async function precedentCommand(args: string[]): Promise<number> {
	const { pos, opt } = parseArgs(args, 1, ["issue", "tree"], USAGE, [
		"source",
		"request",
		"answer",
	]);
	const precinct = check("precinct", pos[0]);
	const issue = Number(check("number", opt.issue));
	const modes = (["source", "request", "answer"] as const).filter(
		(m) => opt[m] !== undefined,
	);
	const [mode] = modes;
	const value = mode === undefined ? undefined : opt[mode];
	if (modes.length !== 1 || value === undefined) throw usage(USAGE);
	if (mode === "request")
		process.stdout.write(await requestBody(precinct, issue, opt.tree, value));
	else if (mode === "answer")
		out(await augmented(precinct, issue, opt.tree, value, readStdin()));
	else await writePrecedents(precinct, issue, opt.tree, checkLink(value));
	return EXIT.OK;
}

// One item of an old Precedents section with its place in the page. A
// numbered line of the old form carries its date, number, rule and link.
export type OldItem = {
	position: number;
	start: number;
	end: number;
	text: string;
	line?: { date: string; number: number; rule: string; link?: string };
};

function oldLine(text: string): OldItem["line"] {
	const [, date, number, rest] = text.match(OLD_LINE) ?? [];
	if (date === undefined || number === undefined || rest === undefined)
		return undefined;
	// a tail in parentheses is a link only when it passes the link class;
	// otherwise it stays part of the rule, the same in the list and in the file
	const [, rule, tail] = rest.match(OLD_SOURCE) ?? [];
	const link = tail === undefined ? undefined : linkOf(tail);
	return link === undefined || rule === undefined
		? { date, number: Number(number), rule: rest }
		: { date, number: Number(number), rule, link };
}

// every item of the old sections except `none`, numbered from 1 in page order
export function oldItems(page: string): OldItem[] {
	const nodes = sectionNodes(page, OLD_SECTION).flat();
	const parts = nodes.flatMap((node) =>
		node.type === "list"
			? node.children.map((li) => ({
					node: li,
					item: itemsOf(page, [{ ...node, children: [li] }]),
				}))
			: [{ node, item: itemsOf(page, [node]) }],
	);
	return parts
		.flatMap(({ node, item }) =>
			item.map((i) => ({
				...i,
				start: node.position?.start.offset ?? 0,
				end: node.position?.end.offset ?? 0,
			})),
		)
		.filter((i) => i.text !== NONE)
		.map((i, k) => {
			const line = i.bad || i.text.includes("\n") ? undefined : oldLine(i.text);
			return {
				position: k + 1,
				start: i.start,
				end: i.end,
				text: i.text,
				...(line === undefined ? {} : { line }),
			};
		});
}

// The page without the item's lines. A section left with no item reads `none`.
function withoutItem(page: string, item: OldItem): string {
	const from = page.lastIndexOf("\n", item.start - 1) + 1;
	const next = page.indexOf("\n", item.end);
	const to = next < 0 ? page.length : next + 1;
	const ending = page.slice(from, to).endsWith("\r\n") ? "\r\n" : "\n";
	const cut = page.slice(0, from) + page.slice(to);
	if (oldItems(cut).length > 0) return cut;
	return `${page.slice(0, from)}${NONE}${next < 0 ? "" : ending}${page.slice(to)}`;
}

export type OldLine = {
	tree: string;
	number: number;
	gist: string;
	kind: string;
};

// One numbered line of an old Precedents section becomes a file, and the line
// leaves LAWMAN.md of the tree. Both stand, or neither does: the page changes by
// one rename, and a failed rename takes the file and the folders it made away.
export function oldLineToFile(o: OldLine): string {
	if (!GIST.test(o.gist))
		throw new Fail(EXIT.USAGE, `invalid gist: ${JSON.stringify(o.gist)}`);
	if (!PRECEDENT_KINDS.includes(o.kind))
		throw new Fail(EXIT.USAGE, `invalid kind: ${JSON.stringify(o.kind)}`);
	const path = join(o.tree, CONSTITUTION);
	if (treeFile(o.tree, [CONSTITUTION]).kind !== "page") throw unsafe(path);
	const text = utf8(readFileSync(path));
	if (text === null)
		throw new Fail(EXIT.USAGE, `${CONSTITUTION} is not UTF-8, nothing written`);
	const found = oldItems(text).filter((i) => i.line?.number === o.number);
	const [item] = found;
	if (item?.line === undefined || found.length > 1)
		throw new Fail(EXIT.USAGE, `no single precedent line #${o.number}`);
	const { date, rule, link } = item.line;
	const folder = new Folder(o.tree);
	const name = folder.free(`${date}-${o.gist}`);
	folder.set(
		name,
		buildPrecedent(
			{
				kind: o.kind,
				departments: [],
				date,
				...(link === undefined ? {} : { ruling: link }),
			},
			rule,
		),
	);
	const page = withoutItem(text, item);
	const lawman = join(o.tree, ".lawman");
	const made = [lawman, join(lawman, "precedents")].filter(
		(dir) => entryKind(dir) === "absent",
	);
	// "wx" refuses a name that exists, a planted link included
	const temp = join(o.tree, `.${CONSTITUTION}.move`);
	let wrote = false;
	try {
		folder.commit();
		writeFileSync(temp, page, { flag: "wx" });
		wrote = true;
		renameSync(temp, path);
	} catch (e) {
		try {
			if (wrote) unlinkSync(temp);
			folder.set(name, null);
			folder.commit();
			for (const dir of made.reverse()) rmdirSync(dir);
		} catch {
			// the first error is the one to report; the rule still stands in the page
		}
		throw e;
	}
	return name;
}

const linkOf = (value: string) => {
	try {
		return checkLink(value);
	} catch {
		return undefined;
	}
};

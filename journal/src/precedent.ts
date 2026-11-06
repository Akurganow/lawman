import type { Database } from "bun:sqlite";
import {
	lstatSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Nodes, RootContent } from "mdast";
import { EXIT as STOP, visit } from "unist-util-visit";
import { check, checkLink, fits, parseArgs, usage } from "./args";
import { caseStage } from "./cases";
import { cleanCharacters } from "./clean";
import { consents, jevAllowed, licensesAllowed } from "./consent";
import { EXIT, Fail, out, readStdin, withDb } from "./db";
import { sharedPages } from "./duty-desk";
import { readConfig } from "./input-files";
import {
	DEPARTMENTS_THRESHOLD,
	type DepartmentsState,
	departmentsAnswer,
	departmentsBody,
	jevNone,
	replyOf,
	shown,
} from "./jev";
import { sectionNodes } from "./law-sections";
import { configValue } from "./law-sync";
import { lintPage } from "./lint";
import { extractMarkers, stripCr } from "./markers";
import {
	buildPrecedent,
	departmentsField,
	type Fields,
	headerOf,
	KINDS,
	NO_VALUE,
	splitPrecedent,
	withDepartments,
} from "./precedent-file";
import {
	departmentPage,
	installationRead,
	LAW_CLONE_PLACE,
	type PageRead,
	type PlaceRead,
} from "./tick-start";

const USAGE =
	"precedent <precinct> --issue <n> --source <ruling comment URL> --tree <folder>|precedent <precinct> --issue <n> --tree <folder> --request <name>|precedent <precinct> --issue <n> --tree <folder> --answer <name>";
const CONSTITUTION = "LAWMAN.md";
const SECTION = "Precedent";
const OLD_SECTION = "Precedents";
const NONE = "none";
const GIST = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// the names stand before the first colon, so no character of the rule reads as a name
const NEW_LINE = /^new ([^\s:]+)(?: for ([^:]*))?: (.+)$/;
const ALL = "all";
const REFINE_LINE = /^refine ([^\s:]+): (.+)$/;
const CANCEL_LINE = /^cancel (\S+)$/;
const OLD_LINE = /^(\d{4}-\d{2}-\d{2}) #([1-9][0-9]*): (.+)$/;
const OLD_SOURCE = /^(.+) \((\S+)\)$/;
// a Map, so a stage named like an object member gives no kind
const KIND_OF = new Map([
	["conviction", "condemns"],
	["acquittal", "protects"],
]);

// an underlined heading never applies as written
type Item = { text: string; bad: boolean };

const sliceOf = (text: string, first?: RootContent, last?: RootContent) =>
	text
		.slice(first?.position?.start.offset ?? 0, last?.position?.end.offset ?? 0)
		.trim();

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

// html whose parent holds a line of text is inline; any other html is a block
const INLINE_PARENTS = new Set([
	"paragraph",
	"heading",
	"emphasis",
	"strong",
	"link",
	"linkReference",
]);

// a code block, or block html, at any depth
function holdsBlock(node: Nodes): boolean {
	let found = false;
	visit(node, (n, _i, parent) => {
		found =
			n.type === "code" ||
			(n.type === "html" && !INLINE_PARENTS.has(parent?.type ?? ""));
		return found ? STOP : undefined;
	});
	return found;
}

// The court's words of every `## <name>` section, in order and one blank line apart:
// each top-level node and list item without code or block html, as written.
// Null for no section, an empty one or `none`.
export function sectionWords(text: string, name: string): string | null {
	const words = sectionNodes(text, name)
		.flat()
		.flatMap((node) =>
			node.type === "list"
				? node.children
						.filter((li) => !holdsBlock(li))
						.map((li) => sliceOf(text, li.children[0], li.children.at(-1)))
				: holdsBlock(node)
					? []
					: [sliceOf(text, node, node)],
		)
		.filter((t) => t !== "")
		.join("\n\n");
	return words === "" || words === NONE ? null : words;
}

type Kind = "absent" | "file" | "dir" | "other";

function kindAt(path: string): Kind {
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
			if (!["absent", "dir"].includes(kindAt(path))) throw unsafe(path);
	}

	private path = (name: string) => join(this.dir, `${name}.md`);

	private disk(name: string): string | null {
		const kind = kindAt(this.path(name));
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
			if (!this.state.has(name) && kindAt(this.path(name)) === "absent")
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
	try {
		let at = tree;
		for (const [i, part] of parts.entries()) {
			at = join(at, part);
			const kind = kindAt(at);
			if (kind === "absent") return { kind: "none" };
			if (kind !== (i === parts.length - 1 ? "file" : "dir"))
				return { kind: "failed" };
		}
		return { kind: "page", text: readFileSync(at, "utf8") };
	} catch {
		throw new Error(`cannot read ${parts.join("/")} in the tree`);
	}
}

// the court's names of a new line: listed, the word all, or none written
type Names = string[] | typeof ALL | null;

type Line =
	| { type: "new"; gist: string; rule: string; names: Names }
	| { type: "refine"; name: string; update: string }
	| { type: "cancel"; name: string | null }
	| { type: "none" }
	| { type: "bad" };

// one item of a Precedent section, as both the write and the admission read it
function classify({ text, bad }: Item): Line {
	const single = !bad && !text.includes("\n");
	const [, gist, named, rule] = (single && text.match(NEW_LINE)) || [];
	const [, refined, update] = (single && text.match(REFINE_LINE)) || [];
	const [, cancelled] = (single && text.match(CANCEL_LINE)) || [];
	const names = named?.split(",").map((n) => n.trim());
	if (
		gist !== undefined &&
		rule !== undefined &&
		GIST.test(gist) &&
		!names?.includes("")
	)
		return {
			type: "new",
			gist,
			rule: rule.trim(),
			names: names === undefined ? null : names.includes(ALL) ? ALL : names,
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

type Ruling = { kind: string; date: string; issue: number; source: string };

// The printed lines, the files that a new line created under its own name and no
// later line of the call changed, and the court's dropped names of each new file.
// original gives the list of a file, the case list asked only when needed.
function apply(
	items: Item[],
	ruling: Ruling,
	folder: Folder,
	original: (names: Names) => string[],
	dropped: (names: Names) => string[],
): { lines: string[]; fresh: string[]; drops: string[] } {
	const fields = (names: Names): Fields => ({
		kind: ruling.kind,
		departments: original(names),
		issue: ruling.issue,
		date: ruling.date,
		ruling: ruling.source,
	});
	const reasons = new Map<string, string>();
	const lines: string[] = [];
	const fresh = new Set<string>();
	const drops = new Map<string, string[]>();
	const create = (
		base: string,
		text: string,
		names: Names,
		reason?: string,
	) => {
		const name = folder.free(base);
		const why = reason ?? (name === base ? undefined : "name-taken");
		folder.set(name, buildPrecedent(fields(names), text));
		if (why !== undefined) reasons.set(name, why);
		drops.set(name, dropped(names));
		return name;
	};
	const keep = `${ruling.date}-issue-${ruling.issue}`;
	for (const item of items) {
		const line = classify(item);
		if (line.type === "new") {
			const base = `${ruling.date}-${line.gist}`;
			if (create(base, line.rule, line.names) === base) fresh.add(base);
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
	// a name is reported only for a file that exists after the commit
	const kept = [...drops].filter(([name]) => folder.current(name) !== null);
	return {
		lines,
		fresh: written.filter((name) => fresh.has(name)),
		drops: kept.flatMap(([name, ds]) => ds.map((d) => `drop\t${name}\t${d}`)),
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

function trustedLogin(): string {
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
		kind: KIND_OF.get(marker.stage) ?? NO_VALUE,
		date: at.slice(0, 10),
		text,
	};
}

const itemsOfRuling = (text: string) =>
	sectionNodes(text, SECTION).map((s) => itemsOf(text, s));

// the fallback list of a case department: the department, or all for `-`
export const fallbackList = (department: string) =>
	department === NO_VALUE ? [] : [department];

const fallbackOf = (db: Database, precinct: string, issue: number) =>
	fallbackList(caseStage(db, precinct, issue).department);

// The raw sources of the candidate departments. read gives the page of one
// department at one place.
export type Sources = {
	constitution: string | null;
	shared: string[];
	licenses: boolean;
	read: (d: string) => PlaceRead;
};

// The departments a precedent may serve, each with its Mission, in order: the
// shared pages of the law, then the lines of the constitution. A page that cannot
// be read, fails its check or has no Mission gives no candidate.
export async function candidates(s: Sources): Promise<[string, string][]> {
	if (s.constitution === null) return [];
	const lint = lintPage("constitution", s.constitution);
	if (lint.reasons.length > 0) return [];
	const names = [
		...new Set([...s.shared, ...lint.departments.map(([d]) => d)]),
	];
	const found: [string, string][] = [];
	for (const d of names) {
		if (!fits("department", d)) continue;
		const page = await departmentPage(d, s.read(d));
		if (page.kind !== "page" || page.lint.reasons.length > 0) continue;
		if (!licensesAllowed(d, page.page.place === LAW_CLONE_PLACE, s.licenses))
			continue;
		const mission = sectionWords(
			await cleanCharacters(page.page.text),
			"Mission",
		);
		if (mission !== null) found.push([d, mission]);
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
	const failed: string[] = [];
	const shared = sharedPages(failed);
	if (failed[0] !== undefined) throw new Error(failed[0]);
	return {
		constitution: constitution.kind === "page" ? constitution.text : null,
		shared,
		licenses: consents(config, precinct, "license_precincts"),
		read: (d) => async (place) =>
			place === "precinct"
				? treeFile(tree, [".lawman", "departments", `${d}.md`])
				: installationRead(d, place),
	};
}

// The state of the request from raw texts: each passes the character layer
// before its sections are read.
export async function departmentsState(
	rule: string,
	ruling: string,
	kind: string,
	missions: [string, string][],
): Promise<DepartmentsState> {
	const clean = await cleanCharacters(ruling);
	return {
		rule: await cleanCharacters(rule),
		kind,
		verdict: sectionWords(clean, "Verdict"),
		grounds: sectionWords(clean, "Grounds"),
		missions,
	};
}

// a gate that does not let a file through; any other error is a fault of the journal
class Refusal extends Fail {
	constructor(why: string) {
		super(EXIT.USAGE, why);
	}
}

const refusedOn = (e: unknown) => {
	if (!(e instanceof Refusal)) throw e;
	process.stderr.write(`journal: ${e.message}\n`);
};

// The list a file is written with: empty for the word all; else the court's names
// that are candidates, in candidate order, empty when they cover every candidate;
// else the case list, as is. caseList is asked only in that last case.
export function originalList(
	names: Names,
	candidates: string[],
	caseList: () => string[],
): string[] {
	if (names === ALL) return [];
	const named = candidates.filter((d) => names?.includes(d));
	if (named.length === 0) return caseList();
	return named.length === candidates.length ? [] : named;
}

// Jev has something to add only to a named list that leaves a candidate out.
export const asksJev = (original: string[], candidates: string[]) =>
	original.length > 0 && candidates.some((d) => !original.includes(d));

// The court's names that are no candidate, each once. A name outside the class
// shows as NO_VALUE, so the output never repeats foreign text.
const droppedNames = (names: Names, candidates: string[]) =>
	names === null || names === ALL
		? []
		: [...new Set(names)]
				.filter((n) => !candidates.includes(n))
				.map((n) => (fits("department", n) ? n : NO_VALUE));

const namesGiven = (items: Item[]) =>
	items.some((i) => {
		const l = classify(i);
		return l.type === "new" && Array.isArray(l.names);
	});

type Admitted = {
	text: string;
	rule: string;
	ruling: { kind: string; text: string };
	original: string[];
	candidates: string[];
	asked: [string, string][];
};

// The gate of a request: the file of a new line of the newest ruling, as written,
// in a precinct allowed to use Jev, whose list leaves a candidate out.
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
	const missions = await candidates(treeSources(tree, config, precinct));
	const names = missions.map(([d]) => d);
	const original = originalList(line.names, names, () =>
		withDb((db) => fallbackOf(db, precinct, issue)),
	);
	if (!asksJev(original, names))
		throw new Refusal(`no candidate department to add: ${name}`);
	return {
		text: file.text,
		rule: body,
		ruling,
		original,
		candidates: names,
		asked: missions.filter(([d]) => !original.includes(d)),
	};
}

const sameList = (a: string[], b: string[]) =>
	a.length === b.length && a.every((d, i) => d === b[i]);

// The list to write, or null for no change. A department outside the original
// list is added when its probability, read with two decimals as the evidence
// prints it, reaches the threshold; nothing leaves the original list. A list
// that covers every candidate is written empty, which also serves departments
// added later.
export function decide(
	original: string[],
	candidates: string[],
	scored: [department: string, probability: number][],
	threshold: number,
	current: string[] | null,
): string[] | null {
	const added = scored
		.filter(([d, p]) => !original.includes(d) && Number(shown(p)) >= threshold)
		.map(([d]) => d);
	if (added.length === 0) return null;
	const kept = new Set([...original, ...added]);
	const list = [
		...original.filter((d) => !candidates.includes(d)),
		...candidates.filter((d) => kept.has(d)),
	];
	const written = candidates.every((d) => kept.has(d)) ? [] : list;
	return current !== null && sameList(written, current) ? null : written;
}

async function requestBody(
	precinct: string,
	issue: number,
	tree: string,
	name: string,
): Promise<string> {
	const a = await admitted(precinct, issue, tree, name);
	return departmentsBody(
		await departmentsState(a.rule, a.ruling.text, a.ruling.kind, a.asked),
	);
}

const UNCHANGED_LINE = "jev unchanged";

// The adding step: it reads the reply once and writes only the departments of a
// file that still holds its original list.
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
		refusedOn(e);
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
			a.asked.map(([d]) => d),
		);
	} catch {
		return jevNone("bad-answer");
	}
	const list = decide(
		a.original,
		a.candidates,
		answer.scored,
		DEPARTMENTS_THRESHOLD,
		current,
	);
	if (list === null) return UNCHANGED_LINE;
	const text = withDepartments(a.text, list);
	if (text === null) return jevNone("brief");
	const folder = new Folder(tree);
	folder.set(name, text);
	folder.commit();
	return `jev model=${answer.model} departments=${departmentsField(list)}`;
}

export async function precedentCommand(args: string[]): Promise<number> {
	const { pos, opt } = parseArgs(args, 1, ["issue", "tree"], USAGE, [
		"source",
		"request",
		"answer",
	]);
	const modes = [opt.source, opt.request, opt.answer];
	const only = (mode: string | undefined): mode is string =>
		mode !== undefined && modes.filter((m) => m !== undefined).length === 1;
	const precinct = check("precinct", pos[0]);
	const issue = Number(check("number", opt.issue));
	if (only(opt.request)) {
		process.stdout.write(
			await requestBody(precinct, issue, opt.tree, opt.request),
		);
		return EXIT.OK;
	}
	if (only(opt.answer)) {
		out(await augmented(precinct, issue, opt.tree, opt.answer, readStdin()));
		return EXIT.OK;
	}
	if (!only(opt.source)) throw usage(USAGE);
	const source = checkLink(opt.source);
	const { kind, date, text } = rulingOf(precinct, issue);
	const sections = itemsOfRuling(text);
	const items = sections.flat();
	const config = readConfig();
	const allowed = jevAllowed(config, precinct);
	// candidates are read before any write, so a read fault writes nothing
	const names =
		namesGiven(items) || allowed
			? (await candidates(treeSources(opt.tree, config, precinct))).map(
					([d]) => d,
				)
			: [];
	let caseList: string[] | undefined;
	const folder = new Folder(opt.tree);
	const { lines, fresh, drops } = apply(
		items,
		{ kind, date, issue, source },
		folder,
		(given) =>
			originalList(given, names, () => {
				caseList ??= withDb((db) => fallbackOf(db, precinct, issue));
				return caseList;
			}),
		(given) => droppedNames(given, names),
	);
	for (const line of [...summary(sections, lines), ...drops]) out(line);
	// a precinct without Jev is a normal state: it asks nothing and says nothing
	if (fresh.length === 0 || !allowed) return EXIT.OK;
	for (const name of fresh) {
		// a list that is empty or covers every candidate is a normal state: Jev adds nothing
		const list = headerOf(folder.current(name) ?? "").departments ?? [];
		if (!asksJev(list, names)) continue;
		try {
			await admitted(precinct, issue, opt.tree, name);
			out("ask", name);
		} catch (e) {
			refusedOn(e);
		}
	}
	return EXIT.OK;
}

export type OldLine = {
	page: string;
	number: number;
	gist: string;
	login: string;
	comment?: { body: string; author: string | null };
	kind?: string;
	tree: string;
};
export type Moved = { result: "ask" } | { result: "entry"; name: string };

const linkOf = (value: string) => {
	try {
		return checkLink(value);
	} catch {
		return undefined;
	}
};

// One numbered line of an old Precedents section becomes a file. Without a
// counted court ruling marker and without a kind from the user, the user is asked.
export function oldLineToFile(o: OldLine): Moved {
	if (!GIST.test(o.gist))
		throw new Fail(EXIT.USAGE, `invalid gist: ${JSON.stringify(o.gist)}`);
	const line = sectionNodes(o.page, OLD_SECTION)
		.flatMap((nodes) => itemsOf(o.page, nodes))
		.map((i) => i.text.match(OLD_LINE))
		.find((m) => m !== null && Number(m[2]) === o.number);
	const [, date, , rest] = line ?? [];
	if (date === undefined || rest === undefined)
		throw new Fail(EXIT.USAGE, `no precedent line #${o.number}`);
	const marker =
		o.comment && markerAtEnd(o.comment.body, o.comment.author, o.login);
	const kind =
		(marker?.role === "court" ? KIND_OF.get(marker.stage) : undefined) ??
		(o.kind !== undefined && KINDS.includes(o.kind) ? o.kind : undefined);
	if (kind === undefined) return { result: "ask" };
	const [, rule = rest, link] = rest.match(OLD_SOURCE) ?? [];
	const ruling = link === undefined ? undefined : linkOf(link);
	const folder = new Folder(o.tree);
	const name = folder.free(`${date}-${o.gist}`);
	folder.set(
		name,
		buildPrecedent(
			{
				kind,
				departments: [],
				date,
				...(ruling === undefined ? {} : { ruling }),
			},
			ruling === undefined ? rest : rule,
		),
	);
	folder.commit();
	return { result: "entry", name };
}

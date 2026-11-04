import type { Database } from "bun:sqlite";
import {
	lstatSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RootContent } from "mdast";
import { check, checkLink, fits, parseArgs } from "./args";
import { EXIT, Fail, out, withDb } from "./db";
import { readConfig } from "./input-files";
import { sectionNodes } from "./law-sections";
import { configValue } from "./law-sync";
import { extractMarkers, stripCr } from "./markers";
import {
	buildPrecedent,
	type Fields,
	NO_VALUE,
	splitPrecedent,
} from "./precedent-file";

const USAGE =
	"precedent <precinct> --issue <n> --source <ruling comment URL> --tree <folder>";
const SECTION = "Precedent";
const OLD_SECTION = "Precedents";
const NONE = "none";
const GIST = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NEW_LINE = /^new ([^\s:]+): (.+)$/;
const REFINE_LINE = /^refine ([^\s:]+): (.+)$/;
const CANCEL_LINE = /^cancel (\S+)$/;
const OLD_LINE = /^(\d{4}-\d{2}-\d{2}) #([1-9][0-9]*): (.+)$/;
const OLD_SOURCE = /^(.+) \((\S+)\)$/;
const KIND_OF: Record<string, string> = {
	conviction: "condemns",
	acquittal: "protects",
};

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
				return li.children.length > 0 && t !== ""
					? [{ text: t, bad: false }]
					: [];
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

type Kind = "absent" | "file" | "other";

function kindAt(path: string): Kind {
	try {
		return lstatSync(path).isFile() ? "file" : "other";
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
	private readonly state = new Map<string, string | null>();
	private readonly taken = new Set<string>();

	constructor(tree: string) {
		const lawman = join(tree, ".lawman");
		this.dir = join(lawman, "precedents");
		for (const path of [lawman, this.dir]) {
			const kind = kindAt(path);
			if (
				kind === "file" ||
				(kind === "other" && !lstatSync(path).isDirectory())
			)
				throw unsafe(path);
		}
	}

	private path = (name: string) => join(this.dir, `${name}.md`);

	private disk(name: string): string | null {
		const kind = kindAt(this.path(name));
		if (kind === "other") throw unsafe(this.path(name));
		return kind === "file" ? readFileSync(this.path(name), "utf8") : null;
	}

	current(name: string): string | null {
		return this.state.has(name)
			? (this.state.get(name) ?? null)
			: this.disk(name);
	}

	set(name: string, text: string | null): void {
		this.state.set(name, text);
		this.taken.add(name);
	}

	free(base: string): string {
		for (let k = 1; ; k++) {
			const name = k === 1 ? base : `${base}-${k}`;
			if (!this.taken.has(name) && kindAt(this.path(name)) === "absent")
				return name;
		}
	}

	// the names whose final text differs from the disk, written only when all are safe
	commit(): Set<string> {
		const changed = [...this.state].filter(
			([name, text]) => text !== this.disk(name),
		);
		if (changed.length > 0) mkdirSync(this.dir, { recursive: true });
		for (const [name, text] of changed)
			if (text === null) unlinkSync(this.path(name));
			else writeFileSync(this.path(name), text);
		return new Set(changed.map(([name]) => name));
	}
}

type Ruling = { kind: string; date: string; issue: number; source: string };
type Change = { name: string; reason?: string };

function apply(items: Item[], ruling: Ruling, folder: Folder): string[] {
	const fields = (): Fields => ({
		kind: ruling.kind,
		departments: [],
		issue: ruling.issue,
		date: ruling.date,
		ruling: ruling.source,
	});
	const written: Change[] = [];
	const lines: string[] = [];
	const create = (base: string, text: string, reason?: string) => {
		const name = folder.free(base);
		const why = reason ?? (name === base ? undefined : "name-taken");
		folder.set(name, buildPrecedent(fields(), text));
		written.push({ name, ...(why === undefined ? {} : { reason: why }) });
	};
	const keep = `${ruling.date}-issue-${ruling.issue}`;
	for (const { text, bad } of items) {
		const single = !bad && !text.includes("\n");
		const [, gist, rule] = (single && text.match(NEW_LINE)) || [];
		const [, refined, update] = (single && text.match(REFINE_LINE)) || [];
		const [, cancelled] = (single && text.match(CANCEL_LINE)) || [];
		if (gist !== undefined && rule !== undefined && GIST.test(gist)) {
			create(`${ruling.date}-${gist}`, rule.trim());
		} else if (
			refined !== undefined &&
			update !== undefined &&
			fits("precedent", refined)
		) {
			const was = folder.current(refined);
			const split = was === null ? null : splitPrecedent(was);
			if (split === null) create(keep, update.trim(), "refine-missing");
			else if (split.body.trim() !== update.trim()) {
				folder.set(refined, `${split.header}\n\n${update.trim()}\n`);
				written.push({ name: refined });
			}
		} else if (cancelled !== undefined) {
			const name = fits("precedent", cancelled) ? cancelled : null;
			if (name !== null && folder.current(name) !== null) {
				folder.set(name, null);
				written.push({ name });
			} else lines.push(`cancel\t${name ?? NO_VALUE}\tmissing`);
		} else if (!(single && text === NONE)) create(keep, text, "bad-line");
	}
	const changed = folder.commit();
	const seen = new Set<string>();
	for (const c of written) {
		if (!changed.has(c.name) || seen.has(c.name)) continue;
		seen.add(c.name);
		lines.push(
			folder.current(c.name) === null
				? `cancel\t${c.name}`
				: ["entry", c.name, ...(c.reason ? [c.reason] : [])].join("\t"),
		);
	}
	return lines;
}

type Stored = { stage: string; fields: string; raw: string };

// the newest court marker of the case, which must be a ruling
function rulingMarker(db: Database, precinct: string, issue: number): Stored {
	const row = db
		.query(
			"SELECT stage, fields, raw FROM markers WHERE precinct = ? AND issue = ? AND role = 'court' ORDER BY ord DESC LIMIT 1",
		)
		.get(precinct, issue) as Stored | null;
	if (row === null || KIND_OF[row.stage] === undefined)
		throw new Fail(EXIT.USAGE, `no court ruling on ${precinct} #${issue}`);
	return row;
}

const lastLine = (text: string) =>
	text
		.split("\n")
		.map(stripCr)
		.findLast((l) => l.trim() !== "");

// true when the last non-empty line of the text is a counted marker equal to raw
function endsWith(
	text: string,
	author: string | null,
	login: string,
	raw?: string,
): ReturnType<typeof extractMarkers>[number] | undefined {
	const lines = text.split("\n").map(stripCr);
	const at = lines.findLastIndex((l) => l.trim() !== "");
	const found = extractMarkers(
		{ text, createdAt: "", rank: 1, author: author ?? "" },
		login,
	).find((f) => f.line === at + 1);
	return found !== undefined && (raw === undefined || found.marker.raw === raw)
		? found
		: undefined;
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
		(c) => lastLine(c.body) === raw && endsWith(c.body, c.author, login, raw),
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

export function precedentCommand(args: string[]): number {
	const { pos, opt } = parseArgs(args, 1, ["issue", "source", "tree"], USAGE);
	const precinct = check("precinct", pos[0]);
	const issue = Number(check("number", opt.issue));
	const source = checkLink(opt.source);
	const login = trustedLogin();
	const { marker, text } = withDb((db) => {
		const m = rulingMarker(db, precinct, issue);
		return { marker: m, text: rulingText(db, precinct, issue, m.raw, login) };
	});
	const at = (JSON.parse(marker.fields) as Record<string, string>).at ?? "";
	const ruling = {
		kind: KIND_OF[marker.stage] ?? NO_VALUE,
		date: at.slice(0, 10),
		issue,
		source,
	};
	const sections = sectionNodes(text, SECTION).map((s) => itemsOf(text, s));
	const folder = new Folder(opt.tree);
	for (const line of summary(sections, apply(sections.flat(), ruling, folder)))
		out(line);
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
// counted ruling marker and without a kind from the user, the user is asked.
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
	const stage =
		o.comment &&
		endsWith(o.comment.body, o.comment.author, o.login)?.marker.stage;
	const kind =
		(stage && KIND_OF[stage]) ??
		(o.kind !== undefined && Object.values(KIND_OF).includes(o.kind)
			? o.kind
			: undefined);
	if (kind === undefined) return { result: "ask" };
	const [, rule, link] = rest.match(OLD_SOURCE) ?? [];
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
			ruling === undefined ? rest : (rule ?? rest),
		),
	);
	folder.commit();
	return { result: "entry", name };
}

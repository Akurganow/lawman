import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { check, count, parseArgs, subcommand, usage } from "./args";
import { recordAnswer, recordRequest } from "./catalog-record";
import { dbPath, EXIT, Fail, out, readStdin, withDb } from "./db";
import { leadOrigins, seenLine } from "./leads";
import { encodeIdPart } from "./markers";

export const UNRESOLVED_VERSION = "-";

// The classes keep foreign lines from shaping a request: ASCII only, no whitespace, control, hidden or quoting bytes.
const MAX_PLACE = 512;
const MAX_ECOSYSTEM = 32;
const MAX_NAME = 214;
const MAX_VERSION = 64;
const MAX_RECORD = 64;

const SEGMENT = /^[A-Za-z0-9._@+-]+$/;
const ECOSYSTEM = new RegExp(
	`^[A-Za-z][A-Za-z0-9._:-]{0,${MAX_ECOSYSTEM - 1}}$`,
);
const NAME = new RegExp(`^[A-Za-z0-9@][A-Za-z0-9._@:/+-]{0,${MAX_NAME - 1}}$`);
const VERSION = new RegExp(
	`^[A-Za-z0-9][A-Za-z0-9._+~:!-]{0,${MAX_VERSION - 1}}$`,
);
const RECORD = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]{0,${MAX_RECORD - 1}}$`);
const SOURCE_LINE = /^Source: catalog (\S+) (\S+)$/;

export const isPlace = (v: string) =>
	v.length <= MAX_PLACE &&
	v.split("/").every((s) => s !== "." && s !== ".." && SEGMENT.test(s));
export const isEcosystem = (v: string) => ECOSYSTEM.test(v);
export const isPackageName = (v: string) => NAME.test(v);
export const isVersion = (v: string) => VERSION.test(v);
export const isRecordId = (v: string) => RECORD.test(v);

export type Entry = {
	number: number;
	place: string;
	ecosystem: string;
	name: string;
	version: string;
};

export type ParsedList = {
	entries: Entry[];
	refused: number[];
	unresolved: number[];
};

const FIELD_COUNT = 4;

export function parseList(input: string): ParsedList {
	const parsed: ParsedList = { entries: [], refused: [], unresolved: [] };
	const lines = input.split("\n").filter((line) => line !== "");
	lines.forEach((line, i) => {
		const number = i + 1;
		const fields = line.split("\t");
		const [place = "", ecosystem = "", name = "", version = ""] = fields;
		const identified =
			fields.length === FIELD_COUNT &&
			isPlace(place) &&
			isEcosystem(ecosystem) &&
			isPackageName(name);
		if (!identified) parsed.refused.push(number);
		else if (version === UNRESOLVED_VERSION) parsed.unresolved.push(number);
		else if (!isVersion(version)) parsed.refused.push(number);
		else parsed.entries.push({ number, place, ecosystem, name, version });
	});
	return parsed;
}

// The package token is `<ecosystem>/<name>`. An ecosystem holds no `/`, so the first `/` splits it.
export const packageToken = (ecosystem: string, name: string) =>
	`${ecosystem}/${name}`;

export function splitPackageToken(
	token: string,
): { ecosystem: string; name: string } | null {
	const cut = token.indexOf("/");
	const [ecosystem, name] = [token.slice(0, cut), token.slice(cut + 1)];
	return cut > 0 && isEcosystem(ecosystem) && isPackageName(name)
		? { ecosystem, name }
		: null;
}

export const sourceLine = (id: string, ecosystem: string, name: string) =>
	`Source: catalog ${id} ${packageToken(ecosystem, name)}`;

export function parseSourceLine(
	line: string,
): { id: string; ecosystem: string; name: string } | null {
	const [, id = "", token = ""] = line.match(SOURCE_LINE) ?? [];
	const pkg = splitPackageToken(token);
	return pkg !== null && isRecordId(id) ? { id, ...pkg } : null;
}

export const leadIdentity = (
	place: string,
	id: string,
	ecosystem: string,
	name: string,
) =>
	[
		encodeIdPart(place),
		`${encodeIdPart(id)}/${encodeIdPart(packageToken(ecosystem, name))}`,
		"advisory",
	].join("::");

export const LIST_FORM = `catalog, for catalog request. A list with one entry per line, fields separated by a tab:
  place: the path, relative to the repository, of the file that lists the dependency. No leading "/" or "./", no "." or ".." segment, no empty segment, no trailing "/"
  ecosystem: the ecosystem name as the catalog names it
  package: the package name as the catalog names it
  version: the pinned version, or ${UNRESOLVED_VERSION} when the reading way did not resolve one. An entry with ${UNRESOLVED_VERSION} is not sent
A field has ASCII letters, digits and a few punctuation marks only. A field with whitespace, quotes, backticks or any other byte is refused. The journal names a refused entry by its number, counted from 1 over the non-empty lines, and never prints its text`;

export const LIST_EXAMPLE = [
	["package-lock.json", "npm", "lodash", "4.17.15"],
	["services/api/requirements.txt", "PyPI", "django", "2.2.0"],
	["services/web/Cargo.lock", "crates.io", "smallvec", UNRESOLVED_VERSION],
]
	.map((fields) => fields.join("\t"))
	.join("\n");

const USAGE = "catalog <request|answer> --kind <batch|record>";

// The catalog's batch endpoint takes at most 1000 queries in one request (its documented limit).
export const BATCH_LIMIT = 1000;

type Hit = { at: number; id: string };
type Part = {
	phase: "unprinted" | "printed" | "answered";
	failed: string | null;
	hits: Hit[];
};
type State = {
	precinct: string;
	entries: Entry[];
	refused: number[];
	unresolved: number[];
	parts: Part[];
};

export function cutParts(entries: Entry[]): Entry[][] {
	const parts: Entry[][] = [];
	for (let at = 0; at < entries.length; at += BATCH_LIMIT)
		parts.push(entries.slice(at, at + BATCH_LIMIT));
	return parts;
}

const batchBody = (part: Entry[]) =>
	JSON.stringify({
		queries: part.map((e) => ({
			package: { name: e.name, ecosystem: e.ecosystem },
			version: e.version,
		})),
	});

const numbers = (list: number[]) => (list.length > 0 ? list.join(",") : "none");

function stateFile(tick: number): string {
	const db = dbPath();
	if (!statSync(db, { throwIfNoEntry: false })?.isFile())
		throw new Fail(EXIT.USAGE, "the database is not a file");
	return join(dirname(db), "runs", String(tick), "catalog.json");
}

function readState(file: string): State {
	try {
		return JSON.parse(readFileSync(file, "utf8")) as State;
	} catch {
		throw new Fail(EXIT.USAGE, "catalog has no list for this tick");
	}
}

function writeState(file: string, state: State): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(state));
}

function startState(precinct: string, input: string): State {
	const { entries, refused, unresolved } = parseList(input);
	if (entries.length === 0)
		throw new Fail(
			EXIT.USAGE,
			`catalog none entries=${entries.length + refused.length + unresolved.length} refused=${numbers(refused)} not-sent=${numbers(unresolved)}`,
		);
	const parts = cutParts(entries).map(
		(): Part => ({ phase: "unprinted", failed: null, hits: [] }),
	);
	return { precinct, entries, refused, unresolved, parts };
}

function printNext(file: string, state: State): string {
	const part = state.parts.find((p) => p.phase === "unprinted");
	if (part === undefined)
		throw new Fail(EXIT.USAGE, "catalog has no part left to print");
	part.phase = "printed";
	writeState(file, state);
	const at = state.parts.indexOf(part);
	return batchBody(cutParts(state.entries)[at] ?? []);
}

function requestBatch(args: string[], input: string): string {
	const { opt } = parseArgs(args, 0, ["kind", "tick"], USAGE, ["precinct"]);
	const file = stateFile(count(opt.tick, "tick", 1));
	const state =
		opt.precinct === undefined
			? readState(file)
			: startState(check("precinct", opt.precinct), input);
	return printNext(file, state);
}

const STATUS = /^[0-9]{3}$/;
const NO_REPLY_STATUS = "000";
const BAD_ANSWER = "bad-answer";

function idsOf(result: unknown): string[] {
	const found = result as { vulns?: unknown; next_page_token?: unknown } | null;
	const vulns = found?.vulns ?? [];
	if (
		typeof found !== "object" ||
		found === null ||
		Array.isArray(found) ||
		found.next_page_token !== undefined ||
		!Array.isArray(vulns)
	)
		throw new Error(BAD_ANSWER);
	return vulns.map((v: { id?: unknown } | null) => {
		if (typeof v?.id !== "string" || !isRecordId(v.id))
			throw new Error(BAD_ANSWER);
		return v.id;
	});
}

// the reply is positional: result i answers query i, and a result count that differs from the part's means it is partial
function positionalIds(body: string, size: number): string[][] {
	const root = JSON.parse(body);
	const results: unknown = root?.results;
	if (
		!Array.isArray(results) ||
		results.length !== size ||
		root.next_page_token !== undefined
	)
		throw new Error(BAD_ANSWER);
	return results.map(idsOf);
}

function readReply(input: string, size: number): Pick<Part, "failed" | "hits"> {
	const failed = (reason: string) => ({ failed: reason, hits: [] });
	// the request may end the status line with a newline of its own
	const text = input.replace(/\s+$/, "");
	const cut = text.lastIndexOf("\n");
	const status = text.slice(cut + 1);
	if (!STATUS.test(status) || status === NO_REPLY_STATUS)
		return failed("no-reply");
	if (status !== "200") return failed(`status-${status}`);
	try {
		const ids = positionalIds(text.slice(0, Math.max(cut, 0)), size);
		return {
			failed: null,
			hits: ids.flatMap((list, at) => list.map((id) => ({ at, id }))),
		};
	} catch {
		return failed(BAD_ANSWER);
	}
}

const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Match = { place: string; id: string; ecosystem: string; name: string };

function matchesOf(state: State): Match[] {
	const parts = cutParts(state.entries);
	const found = new Map<string, Match>();
	state.parts.forEach((part, k) => {
		for (const { at, id } of part.hits) {
			const e = parts[k]?.[at];
			if (e === undefined) continue;
			const { place, ecosystem, name } = e;
			found.set(leadIdentity(place, id, ecosystem, name), {
				place,
				id,
				ecosystem,
				name,
			});
		}
	});
	return [...found.values()].sort(
		(a, b) =>
			byteOrder(a.place, b.place) ||
			byteOrder(
				packageToken(a.ecosystem, a.name),
				packageToken(b.ecosystem, b.name),
			) ||
			byteOrder(a.id, b.id),
	);
}

const failedLine = (n: number, reason: string) =>
	`catalog part ${n} failed reason=${reason}`;

function printedResult(state: State): string {
	const origins = withDb((db) => leadOrigins(db, state.precinct));
	const tally = { open: 0, declined: 0, new: 0, fixed: 0 };
	const rows: string[] = [];
	for (const m of matchesOf(state)) {
		const identity = leadIdentity(m.place, m.id, m.ecosystem, m.name);
		const seen = seenLine(origins, identity);
		const label =
			seen === "none" ? "new" : (seen.split(" ")[0] as keyof typeof tally);
		tally[label]++;
		if (label === "new" || label === "fixed")
			rows.push(
				[
					label === "new" ? label : seen,
					identity,
					sourceLine(m.id, m.ecosystem, m.name),
				].join("\t"),
			);
	}
	const failed = state.parts.flatMap((p, k) =>
		p.failed === null ? [] : [failedLine(k + 1, p.failed)],
	);
	return [
		...rows,
		`catalog entries=${state.entries.length} parts=${state.parts.length} failed=${failed.length} open=${tally.open} declined=${tally.declined} new=${tally.new} fixed=${tally.fixed}`,
		`catalog refused=${numbers(state.refused)} not-sent=${numbers(state.unresolved)}`,
		...failed,
	].join("\n");
}

function answerBatch(args: string[], input: string): string {
	const { opt } = parseArgs(args, 0, ["kind", "tick"], USAGE);
	const file = stateFile(count(opt.tick, "tick", 1));
	const state = readState(file);
	const at = state.parts.findIndex((p) => p.phase === "printed");
	const part = state.parts[at];
	if (part === undefined)
		throw new Fail(
			EXIT.USAGE,
			"catalog has no printed part waiting for a reply",
		);
	const size = cutParts(state.entries)[at]?.length ?? 0;
	Object.assign(part, readReply(input, size), { phase: "answered" });
	writeState(file, state);
	if (state.parts.every((p) => p.phase === "answered"))
		return printedResult(state);
	return [
		...(part.failed === null ? [] : [failedLine(at + 1, part.failed)]),
		"catalog next",
	].join("\n");
}

function kindOf(args: string[]): string {
	const { opt } = parseArgs(args, 0, ["kind"], USAGE, [
		"tick",
		"precinct",
		"id",
	]);
	if (opt.kind !== "batch" && opt.kind !== "record") throw usage(USAGE);
	return opt.kind;
}

export function catalogOutput(
	args: string[],
	input: string,
): string | Promise<string> {
	const { run, rest } = subcommand(
		{
			request: (more: string[]) =>
				kindOf(more) === "batch"
					? requestBatch(more, input)
					: recordRequest(more, input),
			answer: (more: string[]) =>
				kindOf(more) === "batch"
					? answerBatch(more, input)
					: recordAnswer(more, input),
		},
		args,
		USAGE,
	);
	return run(rest);
}

export async function catalog(args: string[]): Promise<void> {
	// a later request carries no list, so stdin stays untouched
	const reads =
		args.includes("--precinct") ||
		args.includes("record") ||
		args[0] === "answer";
	out(await catalogOutput(args, reads ? readStdin() : ""));
}

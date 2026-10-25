import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { check, count, parseArgs, subcommand, usage } from "./args";
import {
	type Entry,
	isRecordId,
	leadIdentity,
	packageToken,
	parseList,
	sourceLine,
} from "./catalog-entries";
import { recordAnswer, recordRequest } from "./catalog-record";
import { dbPath, EXIT, Fail, out, readStdin, withDb } from "./db";
import { leadOrigins, seenLine } from "./leads";
import { isNoReply, splitReply } from "./reply-status";

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
	// a part printed and not answered goes out again, so a reply lands on the part it was sent for
	const at = state.parts.findIndex((p) => p.phase !== "answered");
	const part = state.parts[at];
	if (part === undefined)
		throw new Fail(EXIT.USAGE, "catalog has no part left to print");
	if (part.phase === "unprinted") {
		part.phase = "printed";
		writeState(file, state);
	}
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
	const { body, status } = splitReply(input);
	if (isNoReply(status)) return failed("no-reply");
	if (status !== "200") return failed(`status-${status}`);
	try {
		const ids = positionalIds(body, size);
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
	// the result is built before the last state write, so a failed lookup leaves the part waiting
	const last = state.parts.every((p) => p.phase === "answered");
	const result = last ? printedResult(state) : "";
	writeState(file, state);
	if (last) return result;
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

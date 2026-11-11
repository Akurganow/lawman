import { check, fits, parseArgs, usage } from "./args";
import { CleanFailed, cleaning } from "./cache-text";
import { cleanCharacters } from "./clean";
import { EXIT, Fail, out, withDb } from "./db";
import { decide } from "./decider";
import { type Block, fencedBlock, renderAll } from "./input-parts";
import {
	commandFolder,
	hasCommand,
	INSTALLATION_OPERATIONS,
	installationPlace,
	launch,
	PRECINCT_OPERATIONS,
	precinctPlace,
	type Ran,
	utf8,
} from "./launch";
import { syncPulls } from "./pulls";
import { syncIssues } from "./sync";

export type Operation = (typeof PRECINCT_OPERATIONS)[number];
export type Reason = "argument" | "start" | "exit" | "form" | "clean";
type Slot = "revision" | "path" | "number" | "word";
export type Call = { args: string[]; author: string; reset: boolean };

const COMMANDS_USAGE = "commands [<precinct>]";
const RUN_USAGE =
	"run <precinct> <fetch|identity|files <revision>|file <revision> <path>|decider <issue|pull> <number>|issues --author <login> [--reset]|pulls --author <login>>";
const RESET = "--reset";
const WORDS = ["issue", "pull"];
const SLOTS: Record<Operation, Slot[]> = {
	fetch: [],
	identity: [],
	issues: [],
	pulls: [],
	decider: ["word", "number"],
	file: ["revision", "path"],
	files: ["revision"],
};

export class Refused {
	constructor(
		readonly reason: Reason,
		readonly code: number,
		readonly detail = "",
	) {}
}

const formRefused = (why: string) => new Refused("form", EXIT.SYNC_INPUT, why);

export function registered(name: string): void {
	withDb((db) => {
		if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(name))
			throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
	});
}

export function commandsCommand(args: string[]): number {
	const [name] = args;
	if (args.length > 1) throw usage(COMMANDS_USAGE);
	if (name !== undefined) registered(check("precinct", name));
	const [place, operations] =
		name === undefined
			? [installationPlace(), INSTALLATION_OPERATIONS]
			: [precinctPlace(name), PRECINCT_OPERATIONS];
	out(`folder ${commandFolder()}`);
	for (const operation of operations)
		out(`${operation} ${hasCommand(place, operation) ? "command" : "empty"}`);
	return EXIT.OK;
}

const isOperation = (name: string | undefined): name is Operation =>
	PRECINCT_OPERATIONS.some((operation) => operation === name);

// the journal's own flags of issues and pulls, as sync takes them
function parseCall(operation: Operation, rest: string[]): Call {
	if (operation !== "issues" && operation !== "pulls") {
		if (rest.length !== SLOTS[operation].length) throw usage(RUN_USAGE);
		return { args: rest, author: "", reset: false };
	}
	const flags = operation === "issues" ? rest.filter((a) => a !== RESET) : rest;
	if (rest.length - flags.length > 1) throw usage(RUN_USAGE);
	const { opt } = parseArgs(flags, 0, ["author"], RUN_USAGE);
	return {
		args: [],
		author: check("login", opt.author),
		reset: flags.length < rest.length,
	};
}

const fitsSlot = (slot: Slot, value: string) =>
	slot === "word" ? WORDS.includes(value) : fits(slot, value);

const characters = (text: string) => cleaning(() => cleanCharacters(text));

function oneLine(text: string, kind: "revision" | "login"): string {
	const line = text.replace(/\r?\n$/, "");
	if (/[\r\n]/.test(line) || !fits(kind, line))
		throw formRefused(`the output is not one line that holds a ${kind}`);
	return line;
}

const READERS: Record<
	Operation,
	(text: string, name: string, call: Call) => Promise<string>
> = {
	fetch: async (text) => `revision=${oneLine(text, "revision")}`,
	identity: async (text) => `login=${oneLine(text, "login")}`,
	issues: (text, name, call) => syncIssues(name, call.author, text, call.reset),
	pulls: (text, name, call) => syncPulls(name, call.author, text),
	decider: async (text) => decide(text),
	file: async (text) =>
		renderAll([fencedBlock("file", await characters(text))]),
	files: async (text) =>
		renderAll([fencedBlock("files", await characters(text))]),
};

// the standard output of a file that ran and exited 0
export function ranOutput(ran: Ran | null): Uint8Array {
	if (ran === null) throw new Refused("start", EXIT.COMMAND);
	if (!ran.ok)
		throw new Refused(
			"exit",
			EXIT.COMMAND,
			new TextDecoder().decode(ran.stderr),
		);
	return ran.stdout;
}

export async function output(
	place: string,
	operation: Operation,
	args: string[],
) {
	const text = utf8(ranOutput(await launch(place, operation, args)));
	if (text === null) throw formRefused("the output is not UTF-8");
	return text;
}

async function read(
	name: string,
	operation: Operation,
	call: Call,
	text: string,
) {
	try {
		return await READERS[operation](text, name, call);
	} catch (e) {
		if (e instanceof CleanFailed) throw new Refused("clean", EXIT.COMMAND);
		if (e instanceof Fail) throw new Refused("form", e.code, e.message);
		throw e;
	}
}

// the error fence holds the command's own words, so they pass the character layer
export async function refusal(operation: string, refused: Refused) {
	let { reason, code, detail } = refused;
	try {
		detail = await cleanCharacters(detail);
	} catch {
		[reason, code, detail] = ["clean", EXIT.COMMAND, ""];
	}
	return {
		code,
		blocks: [
			{ line: `${operation} failed reason=${reason}` },
			fencedBlock("error", detail),
		],
	};
}

export type Operated = {
	code: number;
	blocks: Block[];
	// the command's own output, when it ran and its reader accepted it
	text: string | null;
};

// One operation as `run` does it: what it prints and its exit code.
export async function operate(
	name: string,
	operation: Operation,
	call: Call,
): Promise<Operated> {
	try {
		if (
			!SLOTS[operation].every((slot, i) => fitsSlot(slot, call.args[i] ?? ""))
		)
			throw new Refused("argument", EXIT.COMMAND);
		if (!hasCommand(precinctPlace(name), operation))
			return {
				code: EXIT.OK,
				blocks: [{ line: `${operation} empty` }],
				text: null,
			};
		const text = await output(precinctPlace(name), operation, call.args);
		const line = await read(name, operation, call, text);
		return { code: EXIT.OK, blocks: [{ line }], text };
	} catch (e) {
		if (e instanceof Refused)
			return { ...(await refusal(operation, e)), text: null };
		throw e;
	}
}

export async function runCommand(args: string[]): Promise<number> {
	const [name, operation, ...rest] = args;
	if (name === undefined || !isOperation(operation)) throw usage(RUN_USAGE);
	const call = parseCall(operation, rest);
	registered(check("precinct", name));
	const { code, blocks } = await operate(name, operation, call);
	out(renderAll(blocks));
	return code;
}

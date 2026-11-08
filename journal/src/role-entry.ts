import { join } from "node:path";
import { check, fits, parseArgs, parsePart, partOutOfRange } from "./args";
import { EXIT, Fail, now, out, withDb } from "./db";
import { type Taken, takeableOrders } from "./dispatch";
import {
	inputChars,
	orderLine,
	REFERENCES,
	readConfig,
	readText,
} from "./input-files";
import { type Block, framed, pack } from "./input-parts";
import { DUTY_DESK, HARNESS_SECTIONS, inputOf, lawOf } from "./input-roles";
import { commandFolder } from "./launch";
import { sectionsOf } from "./law-sections";
import { configValue } from "./law-sync";
import { jobsOf } from "./settings";

const UNNAMED_HARNESS = "<harness>";

const selfLine = (kind: string, path: string, section: string): Block => ({
	line: `self ${kind} ${path} ${section}`.trimEnd(),
});

// A file or a section the journal cannot give stands as a step the role does itself.
function fileBlocks(kind: string, path: string, wanted: string[]): Block[] {
	const text = readText(join(commandFolder(), REFERENCES, path));
	if (text === null) return wanted.map((s) => selfLine(kind, path, s));
	const head = `${kind} ${path}`;
	const blocks = sectionsOf(text, wanted).map(
		(lines, i): Block =>
			lines === null ? selfLine(kind, path, wanted[i] ?? "") : { law: lines },
	);
	// the file's line stays with its first section, so no part ends on it
	const [first, ...rest] = blocks;
	return first !== undefined && "law" in first
		? [{ head, law: first.law }, ...rest]
		: [{ line: head }, ...blocks];
}

function harnessBlocks(config: string | null): Block[] {
	const name = configValue(config ?? "", "harness");
	// the value becomes a path, so it passes the class of a department name first
	const safe = name !== undefined && fits("department", name);
	const path = join("harnesses", `${safe ? name : UNNAMED_HARNESS}.md`);
	if (!safe) return HARNESS_SECTIONS.map((s) => selfLine("harness", path, s));
	return fileBlocks("harness", path, HARNESS_SECTIONS);
}

// Split, the orders take parts of their own at the end, so the parts of the
// law and the page stay the same while the orders change.
export function roleParts(
	role: string,
	orders: Taken[],
	config: string | null,
): string[][] {
	const size = inputChars(config);
	const law = [
		...lawOf(role).flatMap(([path, wanted]) => fileBlocks("law", path, wanted)),
		...harnessBlocks(config),
	];
	// the role takes up to its number of orders per session, so the group lists that many
	const jobs = jobsOf(configValue(config ?? "", "jobs"), role);
	const listed: Block[] =
		role === DUTY_DESK
			? []
			: orders.slice(0, jobs).map((o) => ({ line: orderLine(o) }));
	const whole = pack([...law, ...listed], size);
	if (whole.length === 1 || listed.length === 0) return whole;
	return [...pack(law, size), ...pack(listed, size)];
}

export function printWake(role: string, stamp: string, orders: Taken[]) {
	const config = readConfig();
	const parts = roleParts(role, orders, config);
	out(framed(parts, () => `role=${role} at=${stamp}`)[0] ?? "");
	return EXIT.OK;
}

const PART_USAGE = "tick input --role <r> --part <k>";

export function rolePartCommand(args: string[]): number {
	const { opt } = parseArgs(args, 0, ["role", "part"], PART_USAGE);
	const role = check("role", opt.role);
	if (role !== DUTY_DESK && inputOf(role) === undefined)
		throw new Fail(EXIT.USAGE, `no input for role ${role}`);
	const k = parsePart(opt.part, PART_USAGE);
	const orders = withDb((db) => takeableOrders(db, role, now()));
	const parts = framed(
		roleParts(role, orders, readConfig()),
		() => `role=${role}`,
	);
	const part = parts[k - 1];
	if (part === undefined) throw partOutOfRange(k, parts.length);
	out(part);
	return EXIT.OK;
}

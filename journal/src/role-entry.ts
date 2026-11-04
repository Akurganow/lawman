import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, count, fits, parseArgs } from "./args";
import { EXIT, Fail, now, out, withDb } from "./db";
import { type Taken, takeableOrders } from "./dispatch";
import { type Block, DEFAULT_INPUT_CHARS, framed, pack } from "./input-parts";
import { DUTY_DESK, HARNESS_SECTIONS, lawOf } from "./input-roles";
import { commandFolder } from "./launch";
import { sectionsOf } from "./law-sections";
import { configValue } from "./law-sync";

export const REFERENCES = join("lawman", "skills", "lawman-law", "references");
const UNNAMED_HARNESS = "<harness>";

export function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

export const readConfig = () => readText(join(commandFolder(), "config.yaml"));

// read only when there is something to print, so a bad value never touches an idle check
export function inputChars(config: string | null): number {
	const value = configValue(config ?? "", "input_chars");
	if (value === undefined) return DEFAULT_INPUT_CHARS;
	if (!fits("number", value))
		throw new Fail(
			EXIT.USAGE,
			`invalid input_chars in config.yaml: ${JSON.stringify(value)}`,
		);
	return Number(value);
}

const selfLine = (kind: string, path: string, section: string): Block => ({
	line: `self ${kind} ${path} ${section}`.trimEnd(),
});

// A file or a section the journal cannot give stands as a step the role does itself.
function fileBlocks(kind: string, path: string, wanted: string[]): Block[] {
	const text = readText(join(commandFolder(), REFERENCES, path));
	if (text === null) return wanted.map((s) => selfLine(kind, path, s));
	return [
		{ line: `${kind} ${path}` },
		...sectionsOf(text, wanted).map(
			(lines, i): Block =>
				lines === null ? selfLine(kind, path, wanted[i] ?? "") : { law: lines },
		),
	];
}

function harnessBlocks(config: string | null): Block[] {
	const name = configValue(config ?? "", "harness");
	// the value becomes a path, so it passes the class of a department name first
	const safe = name !== undefined && fits("department", name);
	const path = join("harnesses", `${safe ? name : UNNAMED_HARNESS}.md`);
	if (!safe) return HARNESS_SECTIONS.map((s) => selfLine("harness", path, s));
	return fileBlocks("harness", path, HARNESS_SECTIONS);
}

export const orderLine = (o: Taken) =>
	`order ${o.id} ${o.precinct} ${o.repo} ${o.department ?? "-"} ${o.issue ?? "-"}`;

// Split, the orders take parts of their own at the end, so the parts of the
// law and the page stay the same while the orders change.
function roleParts(
	role: string,
	orders: Taken[],
	config: string | null,
): string[][] {
	const size = inputChars(config);
	const law = [
		...lawOf(role).flatMap(([path, wanted]) => fileBlocks("law", path, wanted)),
		...harnessBlocks(config),
	];
	const listed: Block[] =
		role === DUTY_DESK ? [] : orders.map((o) => ({ line: orderLine(o) }));
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
	const k = count(opt.part, "part", 1);
	const orders = withDb((db) => takeableOrders(db, role, now()));
	const parts = framed(
		roleParts(role, orders, readConfig()),
		() => `role=${role}`,
	);
	const part = parts[k - 1];
	if (part === undefined)
		throw new Fail(EXIT.USAGE, `no part ${k}: the group has ${parts.length}`);
	out(part);
	return EXIT.OK;
}

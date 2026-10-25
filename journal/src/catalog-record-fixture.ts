import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordAnswer, recordRequest } from "./catalog-record";
import { capturedAsync } from "./inproc";
import { cli, dbFile, JOURNAL } from "./test-helpers";

export const FIXTURES = join(JOURNAL, "src", "fixtures", "catalog");
export const fixture = (name: string) =>
	JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
export const FOUND = fixture("record.found.json");
export const UNKNOWN = fixture("record.unknown.json");
export const ID: string = FOUND.reply.id;
export const CLOCK = "2026-10-25T10:00:00Z";
export const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join(
	"",
);
export const ZWSP = "\u200B";

type Output = { code: number | null; out: string; err: string };
type Run = (args: string[], stdin: string) => Promise<Output>;

export const REQUEST = ["--kind", "record"];
export const ANSWER = ["--kind", "record", "--id", ID];

export const inProcess =
	(command: (args: string[], input: string) => string | Promise<string>): Run =>
	(args, stdin) =>
		capturedAsync(CLOCK, async () => {
			process.stdout.write(`${await command(args, stdin)}\n`);
		});
const throughCli =
	(sub: string): Run =>
	async (args, stdin) =>
		cli(
			["catalog", sub, ...args],
			{ LAWMAN_DB: dbFile, LAWMAN_NOW: CLOCK },
			stdin,
		);

export const RUNNERS: [string, Run, Run][] = [
	["cli", throughCli("request"), throughCli("answer")],
	["in process", inProcess(recordRequest), inProcess(recordAnswer)],
];

export const reply = (record: unknown, status: number | string = 200) =>
	`${JSON.stringify(record)}\n${status}`;
export const withSummary = (summary: unknown) =>
	reply({ ...FOUND.reply, summary }, FOUND.status);
export const withField = (field: string, value: unknown) =>
	reply({ ...FOUND.reply, [field]: value }, FOUND.status);
export const line = (tail: string, dropped = "") =>
	`catalog record id=${ID} severity=MODERATE modified=${FOUND.reply.modified} read=${CLOCK}${dropped} ${tail}\n`;
export const none = (reason: string) => `catalog none reason=${reason}\n`;
export const SUMMARY = `summary=${FOUND.reply.summary}`;

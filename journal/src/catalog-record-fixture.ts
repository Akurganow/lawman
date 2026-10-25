import { expect } from "bun:test";
import { recordAnswer, recordRequest } from "./catalog-record";
import {
	CLOCK,
	fixture,
	inProcessAsync,
	type Output,
	reply,
	throughCli,
} from "./catalog-test-run";
import { extractMarkers } from "./markers";
import { cli, lead } from "./test-helpers";

export const FOUND = fixture("record.found.json");
export const UNKNOWN = fixture("record.unknown.json");
export const ID: string = FOUND.reply.id;
export const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join(
	"",
);
export const ZWSP = "\u200B";

type Run = (args: string[], stdin: string) => Promise<Output>;

export const REQUEST = ["--kind", "record"];
export const ANSWER = ["--kind", "record", "--id", ID];

const record =
	(sub: string): Run =>
	async (args, stdin) =>
		throughCli([sub, ...args], stdin);

export const RUNNERS: [string, Run, Run][] = [
	["cli", record("request"), record("answer")],
	["in process", inProcessAsync(recordRequest), inProcessAsync(recordAnswer)],
];

export const withSummary = (summary: unknown) =>
	reply({ ...FOUND.reply, summary }, FOUND.status);
export const withField = (field: string, value: unknown) =>
	reply({ ...FOUND.reply, [field]: value }, FOUND.status);
export const line = (tail: string, dropped = "") =>
	`catalog record id=${ID} severity=MODERATE modified=${FOUND.reply.modified} read=${CLOCK}${dropped} ${tail}\n`;
export const none = (reason: string) => `catalog none reason=${reason}\n`;
export const SUMMARY = `summary=${FOUND.reply.summary}`;

// a printed line must pass the body check and plant no marker, alone or beside a lead comment
export function expectCleanComment(out: string) {
	const comment = `${out}${lead()}`;
	expect(cli(["lint-body"], {}, comment)).toEqual({
		code: 0,
		out: comment,
		err: "",
	});
	const carrier = { text: out, createdAt: CLOCK, rank: 0, author: "t" };
	expect(extractMarkers(carrier, "t")).toEqual([]);
	return { comment, carrier };
}

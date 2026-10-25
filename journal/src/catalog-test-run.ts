import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogOutput } from "./catalog";
import { captured, capturedAsync } from "./inproc";
import { cli, dbFile, JOURNAL } from "./test-helpers";

export type Output = { code: number | null; out: string; err: string };
export type Run = (args: string[], stdin?: string) => Output;

export const CLOCK = "2026-10-25T10:00:00Z";
export const inProcess: Run = (args, stdin = "") =>
	captured(CLOCK, () => {
		process.stdout.write(`${catalogOutput(args, stdin)}\n`);
	});
export const throughCli: Run = (args, stdin) =>
	cli(["catalog", ...args], { LAWMAN_DB: dbFile, LAWMAN_NOW: CLOCK }, stdin);
// the record answer is asynchronous, so its runner settles later
export const inProcessAsync =
	(
		command: (args: string[], input: string) => string | Promise<string>,
	): ((args: string[], stdin: string) => Promise<Output>) =>
	(args, stdin) =>
		capturedAsync(CLOCK, async () => {
			process.stdout.write(`${await command(args, stdin)}\n`);
		});
export const RUNNERS: [string, Run][] = [
	["cli", throughCli],
	["in process", inProcess],
];

export const prepare = () => writeFileSync(dbFile, "");

export const entry = (
	i: number,
	version = "1.0.0",
	place = "dir/package-lock.json",
) => [place, "npm", `pkg-${i}`, version].join("\t");
export const list = (n: number) =>
	Array.from({ length: n }, (_, i) => entry(i)).join("\n");

export const FIXTURES = join(JOURNAL, "src", "fixtures", "catalog");
export const fixture = (name: string) =>
	JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

export const reply = (record: unknown, status: number | string = 200) =>
	`${JSON.stringify(record)}\n${status}`;
// the reply of a batch: result i lists the identifiers found for query i
export const resultsReply = (
	results: string[][],
	status: number | string = 200,
) =>
	reply(
		{
			results: results.map((ids) =>
				ids.length === 0
					? {}
					: {
							vulns: ids.map((id) => ({
								id,
								modified: "2026-01-01T00:00:00Z",
							})),
						},
			),
		},
		status,
	);

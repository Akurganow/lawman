import { writeFileSync } from "node:fs";
import { catalogOutput } from "./catalog";
import { captured } from "./inproc";
import { cli, dbFile } from "./test-helpers";

export type Output = { code: number | null; out: string; err: string };
export type Run = (args: string[], stdin?: string) => Output;

const CLOCK = "2026-10-25T10:00:00Z";
export const inProcess: Run = (args, stdin = "") =>
	captured(CLOCK, () => {
		process.stdout.write(`${catalogOutput(args, stdin)}\n`);
	});
export const throughCli: Run = (args, stdin) =>
	cli(["catalog", ...args], { LAWMAN_DB: dbFile }, stdin);
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

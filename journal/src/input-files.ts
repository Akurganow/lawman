import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fits } from "./args";
import { EXIT, Fail } from "./db";
import type { Taken } from "./dispatch";
import { DEFAULT_INPUT_CHARS } from "./input-parts";
import { commandFolder } from "./launch";
import { configValue } from "./law-sync";

export const REFERENCES = join("lawman", "skills", "lawman-law", "references");

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

export const orderLine = (o: Taken) =>
	`order ${o.id} ${o.precinct} ${o.repo} ${o.department ?? "-"} ${o.issue ?? "-"}`;

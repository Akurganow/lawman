import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fits } from "./args";
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

// a value that is no whole number above zero reads as the default, as `jobs` does
export function inputChars(config: string | null): number {
	const value = configValue(config ?? "", "input_chars");
	return value !== undefined && fits("number", value)
		? Number(value)
		: DEFAULT_INPUT_CHARS;
}

export const orderLine = (o: Taken) =>
	`order ${o.id} ${o.precinct} ${o.repo} ${o.department ?? "-"} ${o.issue ?? "-"}`;

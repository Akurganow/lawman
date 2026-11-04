import { readFileSync } from "node:fs";
import { join } from "node:path";
import { count } from "./args";
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
	return value === undefined
		? DEFAULT_INPUT_CHARS
		: count(value, "input_chars in config.yaml", 1);
}

export const orderLine = (o: Taken) =>
	`order ${o.id} ${o.precinct} ${o.repo} ${o.department ?? "-"} ${o.issue ?? "-"}`;

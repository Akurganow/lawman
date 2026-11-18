import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fits } from "./args";
import { EXIT, Fail } from "./db";
import type { Taken } from "./dispatch";
import { DEFAULT_INPUT_CHARS } from "./input-parts";
import { commandFolder } from "./launch";
import { configValue } from "./law-sync";
import { asciiLower } from "./markers";

export const REFERENCES = join("lawman", "skills", "lawman-law", "references");

export function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

export const readConfig = () => readText(join(commandFolder(), "config.yaml"));

// the whole token <precinct>=<login>,<login> in the line of the key; an absent key holds no exclusions
export function excludedAuthors(
	config: string | null,
	precinct: string,
): Set<string> {
	const line = configValue(config ?? "", "excluded_authors") ?? "";
	const token = line.split(/\s+/).find((t) => t.startsWith(`${precinct}=`));
	const logins = token?.slice(precinct.length + 1) ?? "";
	return new Set(logins.split(",").filter(Boolean).map(asciiLower));
}

// the trusted login and the earlier logins of the key; an absent key names none
export function countedLogins(
	config: string | null,
	login: string,
): Set<string> {
	const earlier = configValue(config ?? "", "earlier_logins") ?? "";
	return new Set(
		[login, ...earlier.split(",")].filter(Boolean).map(asciiLower),
	);
}

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

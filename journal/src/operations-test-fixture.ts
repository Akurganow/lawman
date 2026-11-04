import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dir } from "./test-helpers";

export const configs = (precinct: string) => join(dir, "configs", precinct);
export const shared = () => join(dir, "shared");

// a command file beside the test database, the place the journal reads
export function command(
	place: string,
	operation: string,
	body: string,
	mode = 0o755,
): string {
	mkdirSync(place, { recursive: true });
	const file = join(place, operation);
	writeFileSync(file, `#!/bin/sh\n${body}\n`);
	chmodSync(file, mode);
	return file;
}

// the command writes the fact of its start beside itself
export const RECORDS = "started";
export const recording = (body: string) =>
	`printf '%s\\n' "$0" >> ${RECORDS}\n${body}`;

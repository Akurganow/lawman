import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REFERENCES } from "./input-files";
import { command, shared } from "./operations-test-fixture";
import { dir, ROOT, TRUSTED } from "./test-helpers";

// the commit the configs record, and the one the law-version command reads
export const LAW_COMMIT = "1".repeat(40);
export const CONFIG = `harness: hermes\ntrusted_login: ${TRUSTED}\nlaw_commit: ${LAW_COMMIT}\n`;

// the law-version command of the installation, at the given commit
export const lawVersion = (revision = LAW_COMMIT, changed = "no") =>
	command(
		shared(),
		"law-version",
		`printf 'revision=%s\\nchanged=%s\\ntag=\\n' '${revision}' '${changed}'`,
	);
export const ROLE_NAMES = [
	"patrol",
	"response-unit",
	"investigation",
	"prosecutor",
	"defender",
	"court",
	"clerk",
	"spec-writer",
	"executor",
	"duty-desk",
];

export const config = (text: string) =>
	writeFileSync(join(dir, "config.yaml"), text);

// a copy of this commit's law beside the test database, the place the journal reads,
// and a law-version command that finds it at law_commit
export function installation(text: string | null = CONFIG): void {
	cpSync(
		join(ROOT, "skills", "lawman-law"),
		join(dir, "lawman", "skills", "lawman-law"),
		{
			recursive: true,
		},
	);
	lawVersion();
	if (text !== null) config(text);
}

export const references = (...path: string[]) => join(dir, REFERENCES, ...path);

export const lines = (out: string) => out.replace(/\n$/, "").split("\n");

// the content of a part: its lines without the first and the last
export const content = (part: string) => lines(part).slice(1, -1);

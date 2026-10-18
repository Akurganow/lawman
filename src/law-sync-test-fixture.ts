import { createHash } from "node:crypto";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Result } from "./inproc";

// Both law-sync test files run the same cases through a runner of their own.
export type Runner = {
	// A fresh executable at <root>/runs/<name>/journal.
	exe(root: string, name: string): string;
	run(args: string[], exe: string, path?: string): Result;
};

export const TAG = "v0.14.0";
export const LAW_COMMIT = "c".repeat(40);
export const OLD_COMMIT = "b".repeat(40);
export const OLD_BINARY = "old journal\n";
export const TYPESAFE_ENV = "environment variable TYPESAFE_API_KEY";

export const CONFIG = `# Installation config, edited by hand.
harness: hermes
law_commit: ${OLD_COMMIT}
unknown_key: kept as it is

# the login of the scheduled session
trusted_login: octocat-lawman
typesafe: yes
contract_version: 2
`;

export const constitution = (version: string) => `---
contract_version: ${version}
---

# Contract of the constitution

An example below the frontmatter:

\`\`\`
---
contract_version: 1
---
\`\`\`
`;

export type Layout = {
	config?: string | null;
	contract?: string;
	schemas?: number[];
};

export function put(root: string, relative: string, text: string): string {
	const path = join(root, relative);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
	return path;
}

export function lay(root: string, layout: Layout = {}): void {
	const { config = CONFIG, contract = "2", schemas = [3, 4, 5, 6] } = layout;
	put(root, "bin/journal", OLD_BINARY);
	if (config !== null) put(root, "config.yaml", config);
	put(
		root,
		"lawman/skills/lawman-law/references/constitution.md",
		constitution(contract),
	);
	schemas.forEach((n, i) => {
		put(
			root,
			`lawman/skills/role${i}/SKILL.md`,
			`Step 0.\n\n   bin/journal probe --schema ${n}\n`,
		);
	});
}

export const flags = (root: string) => [
	"--tag",
	TAG,
	"--commit",
	LAW_COMMIT,
	"--installation",
	root,
];

export const configOf = (root: string) =>
	readFileSync(join(root, "config.yaml"), "utf8");

export const shasum = (path: string) =>
	createHash("sha256").update(readFileSync(path)).digest("hex");

const UNREADABLE = "unreadable";

function digest(path: string): string {
	try {
		return String(Bun.hash(readFileSync(path)));
	} catch {
		return UNREADABLE;
	}
}

// Every file under root with a hash of its bytes, so a test sees any change.
export function snapshot(root: string): Record<string, string> {
	const files = readdirSync(root, { recursive: true, encoding: "utf8" })
		.filter((name) => statSync(join(root, name)).isFile())
		.sort();
	return Object.fromEntries(
		files.map((name) => [name, digest(join(root, name))]),
	);
}

export const leftovers = (root: string) =>
	readdirSync(root).filter((name) => name.startsWith("config.yaml."));

export const noDatabase = (root: string) =>
	readdirSync(root, { recursive: true, encoding: "utf8" }).filter((name) =>
		name.includes(".sqlite"),
	);

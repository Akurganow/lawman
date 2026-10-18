import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs, usage } from "./args";
import { EXIT, Fail, out, requireSchema } from "./db";

const USAGE = "law-sync --tag <tag> --commit <commit> --installation <folder>";
const TAG = /^[A-Za-z0-9._-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SCHEMA_REFERENCE = /probe --schema (\d+)/g;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const CONSTITUTION = join(
	"lawman",
	"skills",
	"lawman-law",
	"references",
	"constitution.md",
);
const EXECUTABLE_MODE = 0o755;
const PERMISSION_BITS = 0o777;
const TYPESAFE_ENVIRONMENT = "environment variable TYPESAFE_API_KEY";
const ABSENT = "none";

type Options = { tag: string; commit: string; installation: string };
type Release = { tag: string; commit: string; sum: string };
type Default = [key: string, value: (config: string) => string];

const lineOf = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, "m");

function configValue(text: string, key: string): string | undefined {
	return text.match(lineOf(key))?.[1]?.trim() || undefined;
}

// The defaults of this release, in the order the config receives them.
// A later release adds its own keys here. The values read the config before the rewrite.
const DEFAULTS: Default[] = [
	[
		"typesafe_key",
		(config) =>
			configValue(config, "typesafe") === "yes" ? TYPESAFE_ENVIRONMENT : ABSENT,
	],
	["amended_law_commit", (config) => configValue(config, "law_commit") ?? ""],
];

function rewriteConfig(config: string, release: Release): string {
	let next = config;
	const appended: string[] = [];
	const keyed: [string, string][] = [
		["law_commit", release.commit],
		["release_tag", release.tag],
		["journal_sha256", release.sum],
	];
	for (const [key, value] of keyed)
		if (lineOf(key).test(next))
			next = next.replace(lineOf(key), () => `${key}: ${value}`);
		else appended.push(`${key}: ${value}`);
	for (const [key, value] of DEFAULTS)
		if (!lineOf(key).test(next)) appended.push(`${key}: ${value(config)}`);
	const gap = next === "" || next.endsWith("\n") ? "" : "\n";
	return `${next}${appended.length === 0 ? "" : gap}${appended.map((line) => `${line}\n`).join("")}`;
}

function contractVersion(installation: string): string {
	const text = readFileSync(join(installation, CONSTITUTION), "utf8");
	const version = configValue(
		text.match(FRONTMATTER)?.[1] ?? "",
		"contract_version",
	);
	if (version === undefined)
		throw new Fail(
			EXIT.USAGE,
			"constitution.md has no contract_version in its frontmatter",
		);
	return version;
}

function highestSchema(installation: string): number {
	const skills = join(installation, "lawman", "skills");
	const numbers = readdirSync(skills)
		.map((name) => join(skills, name, "SKILL.md"))
		.filter((file) => existsSync(file))
		.flatMap((file) =>
			[...readFileSync(file, "utf8").matchAll(SCHEMA_REFERENCE)].map((m) =>
				Number(m[1]),
			),
		);
	return Math.max(0, ...numbers);
}

// The rename keeps a reader from ever seeing a half-written file.
function writeAtomic(path: string, text: string, mode: number): void {
	const temp = `${path}.${process.pid}.${randomUUID()}`;
	try {
		writeFileSync(temp, text, { mode });
		chmodSync(temp, mode);
		renameSync(temp, path);
	} catch (e) {
		rmSync(temp, { force: true });
		throw e;
	}
}

const contractAlarm = (law: string, config: string | undefined) =>
	law === config
		? []
		: [
				`ALARM contract-changed installation constitution contract ${law}, precincts at ${config ?? ABSENT}, run the assembly to amend`,
			];

// Everything before the swap only reads, so a failure there leaves the installation as it was.
function sync(opt: Options, execPath: string): string[] {
	const root = resolve(opt.installation);
	const configPath = join(root, "config.yaml");
	const config = readFileSync(configPath, "utf8");
	if (configValue(config, "law_commit") === undefined)
		throw new Fail(EXIT.USAGE, "config.yaml has no law_commit value");
	const law = contractVersion(root);
	requireSchema(highestSchema(root));
	const sum = createHash("sha256").update(readFileSync(execPath)).digest("hex");
	const next = rewriteConfig(config, { tag: opt.tag, commit: opt.commit, sum });
	const mode = statSync(configPath).mode & PERMISSION_BITS;
	chmodSync(execPath, EXECUTABLE_MODE);
	renameSync(execPath, join(root, "bin", "journal"));
	writeAtomic(configPath, next, mode);
	return [
		...contractAlarm(law, configValue(config, "contract_version")),
		`synced ${opt.tag}`,
	];
}

export function lawSync(
	args: string[],
	execPath: string = process.execPath,
): void {
	const { opt } = parseArgs(args, 0, ["tag", "commit", "installation"], USAGE);
	if (!TAG.test(opt.tag) || !COMMIT.test(opt.commit)) throw usage(USAGE);
	for (const line of sync(opt, execPath)) out(line);
}

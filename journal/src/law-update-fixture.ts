import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { assetName } from "./law-update";
import { command } from "./operations-test-fixture";
import { dir } from "./test-helpers";

export const ROLE = "patrol";
export const REVISION = "a".repeat(40);
export const CONFIG_COMMIT = "b".repeat(40);
export const REPO = "owner/law-release";
export const TAG = "v1.2.3";
export const OLD_BINARY = "old journal\n";

import { DIRTY, DRIFT } from "./law-version";

export { DIRTY, DRIFT };

export const HERE = { os: process.platform, arch: process.arch };
export const ASSET = assetName(HERE) ?? "journal-bun-linux-x64";

export const stop = (reason: string, token = DRIFT) =>
	`stop ${token} ${reason}\n`;

const shared = () => join(dir, "shared");
const logFile = () => join(dir, "calls.log");
const assetLog = () => join(dir, "asset.log");
const quoted = (path: string) => `'${path}'`;

export const upstream = () => join(dir, "upstream");
export const law = () => join(dir, "lawman");
export const configFile = () => join(dir, "config.yaml");
export const binaryFile = () => join(dir, "bin", "journal");
export const runsFolder = () => join(dir, "runs");
export const releaseFolder = (role = ROLE, revision = REVISION) =>
	join(runsFolder(), `sync-${role}-${revision.slice(0, 7)}`);

export const config = (commit = CONFIG_COMMIT, repo = REPO) =>
	`harness: hermes\nlaw_commit: ${commit}\nrelease_repo: ${repo}\n`;

export type Lay = { config?: string | null };
export let originalConfig: string | null = null;

// the installation: a config, the running binary and a law folder without .git
export function lay(over: Lay = {}): void {
	const text = over.config === undefined ? config() : over.config;
	originalConfig = text;
	mkdirSync(join(dir, "bin"), { recursive: true });
	writeFileSync(binaryFile(), OLD_BINARY);
	if (text !== null) writeFileSync(configFile(), text);
	mkdirSync(join(law(), "skills"), { recursive: true });
	writeFileSync(join(law(), "skills", "role.md"), "the law\n");
}

export const configText = () =>
	existsSync(configFile()) ? readFileSync(configFile(), "utf8") : null;
export const binaryText = () => readFileSync(binaryFile(), "utf8");

// each call of a fixture command, as "<name> <arguments>"
export function calls(name?: string): string[] {
	const all = existsSync(logFile())
		? readFileSync(logFile(), "utf8").split("\n").filter(Boolean)
		: [];
	return name === undefined
		? all
		: all.filter((line) => line.startsWith(`${name} `));
}

export const assetRuns = (): string[] =>
	existsSync(assetLog())
		? readFileSync(assetLog(), "utf8").split("\n").filter(Boolean)
		: [];

const record = (name: string) =>
	`printf '%s\\n' "${name} $*" >> ${quoted(logFile())}`;

export const facts = (
	revision = REVISION,
	changed = "no",
	tag = TAG,
	end = "\n",
) => `revision=${revision}${end}changed=${changed}${end}tag=${tag}${end}`;

// law-version prints the given text as it is and records its call
export function versionCommand(
	output: string = facts(),
	tail = "",
	mode = 0o755,
): void {
	const text = join(dir, "law-version.out");
	writeFileSync(text, output);
	command(
		shared(),
		"law-version",
		`${record("law-version")}\ncat ${quoted(text)}\n${tail}`,
		mode,
	);
}

// release copies what the test published into the named folder
export function releaseCommand(tail = "", mode = 0o755): void {
	command(
		shared(),
		"release",
		`${record("release")}\ncp -RP ${quoted(upstream())}/. "$3"/\n${tail}`,
		mode,
	);
}

// the asset must still be without its execute bit and not yet run
export const fixtureCheck = () =>
	`test ! -x "$1" && test ! -e ${quoted(assetLog())}`;

export function verifyCommand(body?: string, mode = 0o755): void {
	command(
		shared(),
		"verify",
		`${record("verify")}\n${body ?? fixtureCheck()}`,
		mode,
	);
}

export function allCommands(): void {
	versionCommand();
	releaseCommand();
	verifyCommand();
}

export type Claim = { digest: string; signer: string; commit: string };
export const statement = (c: Claim) =>
	`digest=${c.digest}\nsigner=${c.signer}\ncommit=${c.commit}\n`;

// A fixture check: it compares the claim lying at the provenance place with
// the digest of the file and with the repository and commit it was given.
// No real signing method stands behind it.
export const fixtureVerifier = () => `${fixtureCheck()}
if command -v sha256sum >/dev/null 2>&1; then d=$(sha256sum "$1"); else d=$(shasum -a 256 "$1"); fi
d=\${d%% *}
grep -qx "digest=$d" "$2" && grep -qx "signer=$3" "$2" && grep -qx "commit=$4" "$2"`;

export const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");

export type Publish = {
	asset?: string;
	// the shell body of the asset after it records its arguments
	body?: string;
	// the whole file, for an asset that cannot start
	raw?: string;
	claim?: Partial<Claim>;
	// the lines of SHA256SUMS, from the real hash and the asset name
	sums?: (hash: string, asset: string) => string;
};

export const SYNCED = `echo synced ${TAG}`;

// the files of one release, the way the release host holds them
export function publish(over: Publish = {}): { hash: string; asset: string } {
	const asset = over.asset ?? ASSET;
	const body = over.body ?? SYNCED;
	const text =
		over.raw ??
		`#!/bin/sh\nprintf '%s\\n' "$*" >> ${quoted(assetLog())}\n${body}\n`;
	const hash = sha256(text);
	mkdirSync(upstream(), { recursive: true });
	const path = join(upstream(), asset);
	writeFileSync(path, text);
	chmodSync(path, 0o644);
	const claim = {
		digest: hash,
		signer: REPO,
		commit: REVISION,
		...over.claim,
	};
	writeFileSync(`${path}.sigstore.json`, statement(claim));
	writeFileSync(
		join(upstream(), "SHA256SUMS"),
		over.sums === undefined ? `${hash}  ${asset}\n` : over.sums(hash, asset),
	);
	return { hash, asset };
}

// a complete installation that updates with all three commands
export function ready(over: Publish = {}): void {
	lay();
	allCommands();
	publish(over);
}

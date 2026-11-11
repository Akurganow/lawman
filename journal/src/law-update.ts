import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	lstatSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { check, parseArgs, usage } from "./args";
import { cleanCharacters } from "./clean";
import { EXIT, out } from "./db";
import { readConfig } from "./input-files";
import {
	commandFolder,
	freshFolder,
	hasCommand,
	installationPlace,
	launch,
	runRelease,
	runVerify,
} from "./launch";
import { configValue } from "./law-sync";
import {
	COMMAND_FAILED,
	COMMIT,
	DIRTY,
	DIRTY_REASON,
	DRIFT,
	type LawFacts,
	lawVersion,
	UNSAFE,
	UNSAFE_TAG,
} from "./law-version";

const USAGE =
	"law-update <role> [--revision <revision> --state clean|changed [--tag <tag>]|--revision unreadable] [--release done|missing|failed] [--verify passed|failed|not-run|declined|unnamed]";
const OPTIONS = ["revision", "state", "tag", "release", "verify"] as const;
const WORDS: Partial<Record<(typeof OPTIONS)[number], string[]>> = {
	state: ["clean", "changed"],
	release: ["done", "missing", "failed"],
	verify: ["passed", "failed", "not-run", "declined", "unnamed"],
};
const UNREADABLE = "unreadable";
export const TAG = /^(?!-)(?!\.{1,2}$)[A-Za-z0-9._-]+$/;
export const REPO =
	/^(?!-)(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const OS = ["darwin", "linux"];
const ARCH = ["x64", "arm64"];
const NOT_READY = "binary not ready";
const DOWNLOAD_FAILED = "the release download failed";
const CHECK_FAILED = "the provenance check failed";
const CHECK_NOT_RUN = "the check could not run";
const BINARY_FAILED = "the new binary failed";
const DID_NOT_START = "the new binary did not start";
const ALARM = "ALARM contract-changed";
// exit 2 of the release command: the release or one of its files is missing
const MISSING = 2;
const NO_FACTS =
	"the law folder gives no facts: put a `law-version` command in `shared/`, form in docs/journal.md";
const VERIFY_STOPS: Record<string, string> = {
	failed: CHECK_FAILED,
	"not-run": CHECK_NOT_RUN,
	unnamed: "the host notes name neither a verifier nor a refusal",
};

type Options = Partial<Record<(typeof OPTIONS)[number], string>>;
type Platform = { os: string; arch: string };

class Stopped {
	constructor(
		readonly reason: string,
		readonly token = DRIFT,
	) {}
}

// the asset of this platform, null when the release builds none for it
export function assetName(p: Platform): string | null {
	return OS.includes(p.os) && ARCH.includes(p.arch)
		? `journal-bun-${p.os}-${p.arch}`
		: null;
}

function parse(args: string[]): { role: string; opt: Options } {
	const { pos, opt } = parseArgs(args, 1, [], USAGE, [...OPTIONS]);
	for (const [name, words] of Object.entries(WORDS)) {
		const value = opt[name as keyof Options];
		if (value !== undefined && !words.includes(value)) throw usage(USAGE);
	}
	const facts = opt.state !== undefined || opt.tag !== undefined;
	const named = opt.revision !== undefined && opt.revision !== UNREADABLE;
	// a named revision needs its state; no revision, or an unreadable one, takes no facts
	if (named && opt.state === undefined) throw usage(USAGE);
	if (!named && facts) throw usage(USAGE);
	return { role: check("role", pos[0]), opt };
}

// the facts of the law folder, or the line that asks the role for them
async function facts(opt: Options): Promise<LawFacts | "self"> {
	const got = await lawVersion();
	if (got === "failed") throw new Stopped(COMMAND_FAILED);
	if (got !== "absent") return got;
	if (opt.revision === undefined) return "self";
	if (opt.revision === UNREADABLE) throw new Stopped(NO_FACTS);
	return {
		revision: opt.revision,
		changed: opt.state === "changed",
		tag: opt.tag ?? "",
	};
}

// a regular file in its own place, never a link or a folder
function regular(path: string): boolean {
	try {
		return lstatSync(path).isFile();
	} catch {
		return false;
	}
}

// a release file the journal cannot read is a release that is not ready
function read(path: string): Buffer {
	try {
		return readFileSync(path);
	} catch {
		throw new Stopped(NOT_READY);
	}
}

function checksum(asset: string, path: string, sums: string): void {
	const rows = read(sums)
		.toString("utf8")
		.split("\n")
		.map((line) => line.replace(/\r$/, "").match(/^([^ ]*) +(.*)$/))
		.filter((m) => m !== null && m[2]?.replace(/^\*/, "") === asset);
	const hash = rows.length === 1 ? rows[0]?.[1] : undefined;
	const actual = createHash("sha256").update(read(path)).digest("hex");
	if (hash === undefined || !/^[0-9a-f]{64}$/.test(hash) || hash !== actual)
		throw new Stopped("the checksum failed");
}

async function clean(line: string): Promise<string | null> {
	try {
		return await cleanCharacters(line);
	} catch {
		return null;
	}
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

// the new binary swaps itself over bin/journal and rewrites the config
async function swap(
	folder: string,
	asset: string,
	tag: string,
	revision: string,
) {
	try {
		chmodSync(join(folder, asset), 0o755);
	} catch {
		throw new Stopped(DID_NOT_START);
	}
	const ran = await launch(folder, asset, [
		"law-sync",
		"--tag",
		tag,
		"--commit",
		revision,
		"--installation",
		commandFolder(),
	]);
	if (ran === null) throw new Stopped(DID_NOT_START);
	if (!ran.ok) {
		const first = decode(ran.stderr).split("\n")[0] ?? "";
		const reason = ((await clean(first)) ?? "").trim();
		throw new Stopped(reason === "" ? BINARY_FAILED : reason);
	}
	const lines = decode(ran.stdout)
		.split("\n")
		.map((line) => line.replace(/\r$/, ""));
	if (!lines.includes(`synced ${tag}`))
		throw new Stopped("the new binary did not confirm the update");
	const alarms = await Promise.all(
		lines
			.filter((l) => l.startsWith(`${ALARM} `))
			.map(async (l) => (await clean(l)) ?? ALARM),
	);
	return [...alarms, `synced ${tag}`];
}

// a folder the journal cannot remove or make is a release it cannot download
function rebuild(folder: string): void {
	if (!freshFolder(folder)) throw new Stopped(DOWNLOAD_FAILED);
}

function remove(folder: string): void {
	try {
		rmSync(folder, { recursive: true, force: true });
	} catch {
		// the next pass that builds the folder removes it again
	}
}

// Gets the release files, checks the checksum and the signature, and runs the
// new binary; or prints the self step the role does instead.
async function update(
	role: string,
	opt: Options,
	f: LawFacts,
	repo: string,
	asset: string,
): Promise<string[]> {
	const shared = installationPlace();
	const hasRelease = hasCommand(shared, "release");
	const hasVerify = hasCommand(shared, "verify");
	// the self lines name the paths from the installation folder, so no field holds a space
	const name = join("runs", `sync-${role}-${f.revision.slice(0, 7)}`);
	const folder = join(commandFolder(), name);
	const assetPath = join(folder, asset);
	const provenance = `${assetPath}.sigstore.json`;
	// an answer counts only while its operation has no file
	const releaseAnswered = !hasRelease && opt.release !== undefined;
	const verifyAnswered = !hasVerify && opt.verify !== undefined;
	try {
		// A pass with an answer builds nothing: it checks the files already in the
		// folder, so the answer about the signature covers the bytes that run.
		if (releaseAnswered || verifyAnswered) {
			if (releaseAnswered && opt.release === "missing")
				throw new Stopped(NOT_READY);
			if (releaseAnswered && opt.release === "failed")
				throw new Stopped(DOWNLOAD_FAILED);
			if (!existsSync(folder)) throw new Stopped(NOT_READY);
		} else {
			rebuild(folder);
			// the folder stays for the role, and the pass with its answer checks it
			if (!hasRelease)
				return [`self release ${repo} ${f.tag} ${name} ${asset}`];
			const ran = await runRelease(repo, f.tag, folder, asset);
			if (ran === null) throw new Stopped(DOWNLOAD_FAILED);
			if (ran.code === MISSING) throw new Stopped(NOT_READY);
			if (!ran.ok) throw new Stopped(DOWNLOAD_FAILED);
		}
		const sums = join(folder, "SHA256SUMS");
		if (![assetPath, provenance, sums].every(regular))
			throw new Stopped(NOT_READY);
		checksum(asset, assetPath, sums);
		if (hasVerify) {
			const ran = await runVerify(assetPath, provenance, repo, f.revision);
			if (ran === null) throw new Stopped(CHECK_NOT_RUN);
			if (!ran.ok) throw new Stopped(CHECK_FAILED);
		} else if (opt.verify === undefined) {
			const files = join(name, asset);
			return [
				`self verify ${files} ${files}.sigstore.json ${repo} ${f.revision}`,
			];
		} else {
			const stop = VERIFY_STOPS[opt.verify];
			if (stop !== undefined)
				throw new Stopped(
					stop,
					opt.verify === "unnamed" ? "stopped-no-verifier" : DRIFT,
				);
		}
		return await swap(folder, asset, f.tag, f.revision);
	} catch (e) {
		remove(folder);
		throw e;
	}
}

async function pass(
	role: string,
	opt: Options,
	platform: Platform,
): Promise<string[]> {
	const config = readConfig() ?? "";
	const commit = configValue(config, "law_commit");
	const repo = configValue(config, "release_repo");
	if (commit === undefined || repo === undefined)
		throw new Stopped(
			"config.yaml cannot give law_commit or release_repo",
			"stopped-law-config",
		);
	const f = await facts(opt);
	if (f === "self") return ["self law-version"];
	if (!COMMIT.test(f.revision) || !COMMIT.test(commit))
		throw new Stopped(UNSAFE);
	if (f.revision === commit) return ["law current"];
	if (!REPO.test(repo)) throw new Stopped(UNSAFE);
	if (f.changed) throw new Stopped(DIRTY_REASON, DIRTY);
	if (f.tag === "") throw new Stopped("the law is not on a release");
	if (!TAG.test(f.tag)) throw new Stopped(UNSAFE_TAG);
	const asset = assetName(platform);
	if (asset === null) throw new Stopped("no binary for this platform");
	return update(role, opt, f, repo, asset);
}

// One pass of the law update. A stop is an answer with exit 0; a non-zero
// exit is a failure of the command itself.
export async function lawUpdate(
	args: string[],
	platform: Platform = { os: process.platform, arch: process.arch },
): Promise<number> {
	const { role, opt } = parse(args);
	try {
		for (const line of await pass(role, opt, platform)) out(line);
	} catch (e) {
		if (!(e instanceof Stopped)) throw e;
		out(`stop ${e.token} ${e.reason}`);
	}
	return EXIT.OK;
}

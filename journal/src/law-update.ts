import { createHash } from "node:crypto";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { check, parseArgs, usage } from "./args";
import { cleanCharacters } from "./clean";
import { EXIT, out } from "./db";
import { readConfig } from "./input-files";
import { commandFolder, hasCommand, installationPlace, launch } from "./launch";
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
const TAG = /^(?!-)(?!\.{1,2}$)[A-Za-z0-9._-]+$/;
const REPO =
	/^(?!-)(?!(?:.*\/)?\.{1,2}(?:\/|$))[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const OS = ["darwin", "linux"];
const ARCH = ["x64", "arm64"];
const NOT_READY = "binary not ready";
const DOWNLOAD_FAILED = "the release download failed";
const CHECK_FAILED = "the provenance check failed";
const CHECK_NOT_RUN = "the check could not run";
const BINARY_FAILED = "the new binary failed";
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
	if (named ? opt.state === undefined : facts) throw usage(USAGE);
	return { role: check("role", pos[0]), opt };
}

// the facts of the law folder, or the line that asks the role for them
async function facts(opt: Options): Promise<LawFacts | "self"> {
	const got = await lawVersion();
	if (got === null) throw new Stopped(COMMAND_FAILED);
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

function checksum(asset: string, path: string, sums: string): void {
	const rows = readFileSync(sums, "utf8")
		.split("\n")
		.map((line) => line.replace(/\r$/, "").match(/^([^ ]*) +(.*)$/))
		.filter((m) => m !== null && m[2]?.replace(/^\*/, "") === asset);
	const hash = rows.length === 1 ? rows[0]?.[1] : undefined;
	const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
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
	chmodSync(join(folder, asset), 0o755);
	const ran = await launch(folder, asset, [
		"law-sync",
		"--tag",
		tag,
		"--commit",
		revision,
		"--installation",
		commandFolder(),
	]);
	if (ran === null) throw new Stopped("the new binary did not start");
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

// Steps 9 to 12: the release files, their checks and the swap, or the step the role does
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
	const folder = join(
		commandFolder(),
		"runs",
		`sync-${role}-${f.revision.slice(0, 7)}`,
	);
	const assetPath = join(folder, asset);
	const provenance = `${assetPath}.sigstore.json`;
	try {
		const answered =
			(!hasRelease && opt.release !== undefined) ||
			(!hasVerify && opt.verify !== undefined);
		if (answered) {
			if (!hasRelease && opt.release === "missing")
				throw new Stopped(NOT_READY);
			if (!hasRelease && opt.release === "failed")
				throw new Stopped(DOWNLOAD_FAILED);
			if (!existsSync(folder)) throw new Stopped(NOT_READY);
		} else {
			rmSync(folder, { recursive: true, force: true });
			mkdirSync(folder, { recursive: true });
			if (!hasRelease)
				return [`self release ${repo} ${f.tag} ${folder} ${asset}`];
			const ran = await launch(shared, "release", [repo, f.tag, folder, asset]);
			if (ran === null) throw new Stopped(DOWNLOAD_FAILED);
			if (ran.code === MISSING) throw new Stopped(NOT_READY);
			if (!ran.ok) throw new Stopped(DOWNLOAD_FAILED);
		}
		const sums = join(folder, "SHA256SUMS");
		if (![assetPath, provenance, sums].every(regular))
			throw new Stopped(NOT_READY);
		checksum(asset, assetPath, sums);
		if (hasVerify) {
			const ran = await launch(shared, "verify", [
				assetPath,
				provenance,
				repo,
				f.revision,
			]);
			if (ran === null) throw new Stopped(CHECK_NOT_RUN);
			if (!ran.ok) throw new Stopped(CHECK_FAILED);
		} else if (opt.verify === undefined)
			return [`self verify ${assetPath} ${provenance} ${repo} ${f.revision}`];
		else {
			const stop = VERIFY_STOPS[opt.verify];
			if (stop !== undefined) throw new Stopped(stop);
		}
		return await swap(folder, asset, f.tag, f.revision);
	} catch (e) {
		if (e instanceof Stopped) rmSync(folder, { recursive: true, force: true });
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
	if (commit === undefined || repo === undefined) return ["law current"];
	const f = await facts(opt);
	if (f === "self") return ["self law-version"];
	if (!COMMIT.test(f.revision) || !COMMIT.test(commit))
		throw new Stopped(UNSAFE);
	if (f.revision === commit) return ["law current"];
	if (!REPO.test(repo)) throw new Stopped(UNSAFE);
	if (f.changed) throw new Stopped(DIRTY_REASON, DIRTY);
	if (f.tag === "") throw new Stopped("the law is not on a release");
	if (!TAG.test(f.tag)) throw new Stopped("the tag is not safe");
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

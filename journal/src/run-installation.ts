import { lstatSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fits, usage } from "./args";
import { EXIT, Fail, out } from "./db";
import { renderAll } from "./input-parts";
import {
	commandFolder,
	hasCommand,
	INSTALLATION_OPERATIONS,
	installationPlace,
	LAW_VERSION,
	launch,
} from "./launch";
import { assetName, REPO, TAG } from "./law-update";
import { COMMAND_FAILED, COMMIT, FORM, lawFolder, UNSAFE } from "./law-version";
import { Refused, refusal } from "./operations";

type Installation = (typeof INSTALLATION_OPERATIONS)[number];
type Platform = { os: string; arch: string };

const USAGE =
	"run-installation <release <repo> <tag>|verify <asset> <provenance> <repo> <commit>|law-version>";
const ARITY: Record<Installation, number> = {
	release: 2,
	verify: 4,
	[LAW_VERSION]: 0,
};
// the journal builds this folder for every run of release, as law-update builds its own
export const RELEASE_FOLDER = "runs/installation-release";

class Stop {
	constructor(readonly reason: string) {}
}

const isInstallation = (name: string | undefined): name is Installation =>
	INSTALLATION_OPERATIONS.some((operation) => operation === name);

// a plain file under runs/ of the database folder, with no link on the way
function inRuns(path: string): boolean {
	if (!fits("path", path)) return false;
	const parts = path.split("/").filter((part) => part !== "" && part !== ".");
	if (parts[0] !== "runs" || parts.length < 2) return false;
	let at = commandFolder();
	for (const [i, part] of parts.entries()) {
		at = join(at, part);
		try {
			const stat = lstatSync(at);
			if (i === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
				return false;
		} catch {
			return false;
		}
	}
	return true;
}

const CLASSES: Record<Installation, ((value: string) => boolean)[]> = {
	release: [(v) => REPO.test(v), (v) => TAG.test(v)],
	verify: [inRuns, inRuns, (v) => REPO.test(v), (v) => COMMIT.test(v)],
	[LAW_VERSION]: [],
};

function rebuild(folder: string): void {
	try {
		rmSync(folder, { recursive: true, force: true });
		mkdirSync(folder, { recursive: true });
	} catch {
		throw new Fail(EXIT.COMMAND, `cannot make the folder ${RELEASE_FOLDER}`);
	}
}

// the three facts, each in its class, or the stop the tick start would give
function facts(text: string): string[] {
	const m = text.match(FORM);
	if (m === null) throw new Stop(COMMAND_FAILED);
	const [revision = "", changed = "", tag = ""] = m.slice(1);
	if (!COMMIT.test(revision)) throw new Stop(UNSAFE);
	if (tag !== "" && !TAG.test(tag)) throw new Stop("the tag is not safe");
	return [`revision=${revision}`, `changed=${changed}`, `tag=${tag}`];
}

// the standard output of a run that ended with exit 0
async function started(place: string, operation: string, args: string[]) {
	const ran = await launch(place, operation, args);
	if (ran === null) throw new Refused("start", EXIT.COMMAND);
	if (!ran.ok)
		throw new Refused(
			"exit",
			EXIT.COMMAND,
			new TextDecoder().decode(ran.stderr),
		);
	return ran.stdout;
}

function decoded(bytes: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			bytes,
		);
	} catch {
		throw new Stop(COMMAND_FAILED);
	}
}

async function ran(
	operation: Installation,
	args: string[],
	platform: Platform,
): Promise<string[]> {
	const place = installationPlace();
	if (operation === "release") {
		const asset = assetName(platform);
		if (asset === null)
			throw new Fail(EXIT.COMMAND, "no binary for this platform");
		const folder = join(commandFolder(), RELEASE_FOLDER);
		rebuild(folder);
		await started(place, operation, [...args, folder, asset]);
		return [`release done folder=${RELEASE_FOLDER} asset=${asset}`];
	}
	if (operation === "verify") {
		const [asset = "", provenance = "", ...rest] = args;
		const root = commandFolder();
		await started(place, operation, [
			join(root, asset),
			join(root, provenance),
			...rest,
		]);
		return ["verify passed"];
	}
	return facts(decoded(await started(place, operation, [lawFolder()])));
}

// One operation of the installation through the journal, as the update runs it.
// The journal prints the outcome and no word of the command's output.
export async function runInstallationCommand(
	args: string[],
	platform: Platform = { os: process.platform, arch: process.arch },
): Promise<number> {
	const [operation, ...rest] = args;
	if (!isInstallation(operation) || rest.length !== ARITY[operation])
		throw usage(USAGE);
	try {
		if (!CLASSES[operation].every((fit, i) => fit(rest[i] ?? "")))
			throw new Refused("argument", EXIT.COMMAND);
		if (!hasCommand(installationPlace(), operation)) {
			out(`${operation} empty`);
			return EXIT.OK;
		}
		for (const line of await ran(operation, rest, platform)) out(line);
		return EXIT.OK;
	} catch (e) {
		if (e instanceof Stop) {
			out(`${operation} stop ${e.reason}`);
			return EXIT.COMMAND;
		}
		if (!(e instanceof Refused)) throw e;
		const { code, blocks } = await refusal(operation, e);
		out(renderAll(blocks));
		return code;
	}
}

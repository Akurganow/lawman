import { lstatSync } from "node:fs";
import { join } from "node:path";
import { fits, usage } from "./args";
import { EXIT, Fail, out } from "./db";
import { renderAll } from "./input-parts";
import {
	commandFolder,
	freshFolder,
	hasCommand,
	INSTALLATION_OPERATIONS,
	installationPlace,
	LAW_VERSION,
	runLawVersion,
	runRelease,
	runVerify,
} from "./launch";
import { assetName, REPO, TAG } from "./law-update";
import {
	COMMAND_FAILED,
	COMMIT,
	readFacts,
	UNSAFE,
	UNSAFE_TAG,
} from "./law-version";
import { Refused, ranOutput, refusal } from "./operations";

type Installation = (typeof INSTALLATION_OPERATIONS)[number];
type Platform = { os: string; arch: string };

const USAGE =
	"run-installation <release <repo> <tag>|verify <asset> <provenance> <repo> <commit>|law-version>";
// the journal builds this folder for every run of release, as law-update builds its own
export const RELEASE_FOLDER = "runs/installation-release";

// a stop of law-version: exit 5 here, where law-update answers with exit 0
class FactsStop {
	constructor(readonly text: string) {}
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

// the classes of each argument; their number is the number of arguments
const CLASSES: Record<Installation, ((value: string) => boolean)[]> = {
	release: [(v) => REPO.test(v), (v) => TAG.test(v)],
	verify: [inRuns, inRuns, (v) => REPO.test(v), (v) => COMMIT.test(v)],
	[LAW_VERSION]: [],
};

// Every class failure prints, since here no law_commit is compared first.
function factLines(stdout: Uint8Array): string[] {
	const f = readFacts(stdout);
	if (f === null) throw new FactsStop(COMMAND_FAILED);
	if (!COMMIT.test(f.revision)) throw new FactsStop(UNSAFE);
	if (f.tag !== "" && !TAG.test(f.tag)) throw new FactsStop(UNSAFE_TAG);
	return [
		`revision=${f.revision}`,
		`changed=${f.changed ? "yes" : "no"}`,
		`tag=${f.tag}`,
	];
}

async function ran(
	operation: Installation,
	args: string[],
	platform: Platform,
): Promise<string[]> {
	const root = commandFolder();
	if (operation === "release") {
		const [repo = "", tag = ""] = args;
		const asset = assetName(platform);
		if (asset === null)
			throw new Fail(EXIT.COMMAND, "no binary for this platform");
		const folder = join(root, RELEASE_FOLDER);
		if (!freshFolder(folder))
			throw new Fail(EXIT.COMMAND, `cannot make the folder ${RELEASE_FOLDER}`);
		ranOutput(await runRelease(repo, tag, folder, asset));
		return [`release done folder=${RELEASE_FOLDER} asset=${asset}`];
	}
	if (operation === "verify") {
		const [asset = "", provenance = "", repo = "", commit = ""] = args;
		ranOutput(
			await runVerify(join(root, asset), join(root, provenance), repo, commit),
		);
		return ["verify passed"];
	}
	return factLines(ranOutput(await runLawVersion()));
}

// One operation of the installation through the journal, as the update runs it.
// The journal prints the outcome and no word of the command's output.
export async function runInstallationCommand(
	args: string[],
	platform: Platform = { os: process.platform, arch: process.arch },
): Promise<number> {
	const [operation, ...rest] = args;
	if (!isInstallation(operation) || rest.length !== CLASSES[operation].length)
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
		if (e instanceof FactsStop) {
			out(`${operation} stop ${e.text}`);
			return EXIT.COMMAND;
		}
		if (!(e instanceof Refused)) throw e;
		const { code, blocks } = await refusal(operation, e);
		out(renderAll(blocks));
		return code;
	}
}

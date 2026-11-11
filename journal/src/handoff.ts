import { parseArgs, usage } from "./args";
import { maskSecrets, stripInvisible } from "./clean";
import { fenceLength } from "./clean-quote";
import { EXIT, Fail, now, readStdin } from "./db";

const HANDOFF_USAGE =
	"handoff --sources <a,b,…> [--adopted] [--merged <m>] (stdin: the old pull request body, with --adopted)";
const POSITIVE = /^[1-9][0-9]*$/;
const ADOPTED_FLAG = "--adopted";
const TITLE = "Clerk";
const MIN_FENCE = 3;
const CLEAN_FAILED =
	"handoff: a library failed while cleaning the old body; run the command again";

export type HandoffInput = {
	sources: string[];
	adopted?: string | undefined;
	merged?: string | undefined;
	at: string;
};

function listed(sources: string[]): string {
	const refs = sources.map((s) => `#${s}`);
	const last = refs.pop();
	return refs.length === 0 ? `${last}` : `${refs.join(", ")} and ${last}`;
}

async function cleaned(body: string): Promise<string> {
	try {
		return await maskSecrets(stripInvisible(body));
	} catch {
		throw new Fail(EXIT.USAGE, CLEAN_FAILED);
	}
}

async function fenced(body: string): Promise<string> {
	const text = (await cleaned(body)).replace(/\r?\n$/, "");
	const fence = "`".repeat(fenceLength(text, "`", MIN_FENCE));
	return [fence, ...(text === "" ? [] : [text]), fence].join("\n");
}

export async function buildHandoff(input: HandoffInput): Promise<string> {
	const blocks = [
		`This pull request carries ${listed(input.sources)} for the spec writer.`,
		...(input.merged === undefined
			? []
			: [`The earlier work is in the merged pull request #${input.merged}.`]),
		...(input.adopted === undefined ? [] : [await fenced(input.adopted)]),
		`<!-- lawman: role=clerk stage=handoff at=${input.at} -->`,
	];
	return `${TITLE}\n\n${blocks.join("\n\n")}\n`;
}

function splitAdopted(args: string[]): { adopted: boolean; rest: string[] } {
	const rest: string[] = [];
	let adopted = false;
	for (let i = 0; i < args.length; ) {
		if (args[i] === ADOPTED_FLAG) {
			if (adopted) throw usage(HANDOFF_USAGE);
			adopted = true;
			i += 1;
		} else {
			rest.push(...args.slice(i, i + 2));
			i += 2;
		}
	}
	return { adopted, rest };
}

function positive(value: string): string {
	if (!POSITIVE.test(value)) throw usage(HANDOFF_USAGE);
	return value;
}

export async function handoffCommand(args: string[]): Promise<number> {
	const { adopted, rest } = splitAdopted(args);
	const { opt } = parseArgs(rest, 0, ["sources"], HANDOFF_USAGE, ["merged"]);
	const text = await buildHandoff({
		sources: opt.sources.split(",").map(positive),
		merged: opt.merged === undefined ? undefined : positive(opt.merged),
		adopted: adopted ? readStdin() : undefined,
		at: now(),
	});
	process.stdout.write(text);
	return EXIT.OK;
}

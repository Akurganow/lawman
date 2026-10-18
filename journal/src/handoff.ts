import { parseArgs, usage } from "./args";
import { EXIT, now, readStdin } from "./db";
import { lintBody } from "./lint";

const HANDOFF_USAGE =
	"handoff --sources <a,b,…> [--adopted] [--merged <m>] (stdin: the old pull request body, with --adopted)";
const POSITIVE = /^[1-9][0-9]*$/;
const ADOPTED_FLAG = "--adopted";
const TITLE = "Clerk";
const MIN_FENCE = 3;

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

function fenced(body: string): string[] {
	const longest = Math.max(
		0,
		...(body.match(/`+/g) ?? []).map((r) => r.length),
	);
	const fence = "`".repeat(Math.max(MIN_FENCE, longest + 1));
	const text = body.replace(/\r?\n$/, "");
	return [fence, ...(text === "" ? [] : [text]), fence];
}

export function buildHandoff(input: HandoffInput): {
	text: string;
	reasons: string[];
} {
	const blocks = [
		`This pull request carries ${listed(input.sources)} for the spec writer.`,
		...(input.merged === undefined
			? []
			: [`The earlier work is in the merged pull request #${input.merged}.`]),
		...(input.adopted === undefined ? [] : [fenced(input.adopted).join("\n")]),
		`<!-- lawman: role=clerk stage=handoff at=${input.at} -->`,
	];
	const text = `${TITLE}\n\n${blocks.join("\n\n")}\n`;
	return { text, reasons: lintBody(text) };
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

export function handoffCommand(args: string[]): number {
	const { adopted, rest } = splitAdopted(args);
	const { opt } = parseArgs(rest, 0, ["sources"], HANDOFF_USAGE, ["merged"]);
	const built = buildHandoff({
		sources: opt.sources.split(",").map(positive),
		merged: opt.merged === undefined ? undefined : positive(opt.merged),
		adopted: adopted ? readStdin() : undefined,
		at: now(),
	});
	for (const reason of built.reasons) process.stderr.write(`${reason}\n`);
	if (built.reasons.length > 0) return EXIT.LINT_BODY;
	process.stdout.write(built.text);
	return EXIT.OK;
}

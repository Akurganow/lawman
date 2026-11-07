import { fits, usage } from "./args";
import {
	CleanFailed,
	parseTextWords,
	printCached,
	type TextKey,
} from "./cache-text";
import { EXIT, Fail, open, out } from "./db";
import { inputChars, readConfig } from "./input-files";
import { type Block, type FencedBlock, framed, pack } from "./input-parts";

const TEXT_USAGE =
	"text <p> <issue|pull> <n> body|comment <at> <j> [--part <k>]";
const CLEAN_FAILED =
	"text: a library failed while cleaning the text; run the command again";
const NO_TEXT =
	"text: the cache holds no such text; read it from the host yourself, as for a self step";

const isFenced = (b: Block): b is FencedBlock => "label" in b;

// the block of one text among those of its case: the body first, then the comments in order
function blockOf(blocks: Block[], key: TextKey): FencedBlock | undefined {
	const fenced = blocks.filter(isFenced);
	if (key.part === "body") return fenced[0];
	const head = `comment at=${key.part.at}`;
	return fenced.filter((b) => b.head === head)[key.part.j - 1];
}

// The words of the `full` line after `full text` name the text. The cache is read, not the host.
export async function textCommand(args: string[]): Promise<number> {
	const named = args.at(-2) === "--part";
	const words = named ? args.slice(0, -2) : args;
	const given = named ? args.at(-1) : "1";
	const key = parseTextWords(words);
	if (key === null || given === undefined || !fits("number", given))
		throw usage(TEXT_USAGE);
	const size = inputChars(readConfig());
	const db = open();
	let blocks: Block[] | null;
	try {
		blocks = await printCached(db, key.precinct, key.kind, key.number);
	} catch (e) {
		if (e instanceof CleanFailed) throw new Fail(EXIT.USAGE, CLEAN_FAILED);
		throw e;
	} finally {
		db.close();
	}
	const block = blockOf(blocks ?? [], key);
	if (block === undefined) throw new Fail(EXIT.USAGE, NO_TEXT);
	const parts = framed(pack([block], size), () => "text");
	const part = parts[Number(given) - 1];
	if (part === undefined)
		throw new Fail(
			EXIT.USAGE,
			`text: part ${given} is out of range; the text has ${parts.length} parts`,
		);
	out(part);
	return EXIT.OK;
}

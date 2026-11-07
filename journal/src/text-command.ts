import { parsePart, partOutOfRange, usage } from "./args";
import { CleanFailed, parseTextWords, printText } from "./cache-text";
import { EXIT, Fail, open, out } from "./db";
import { inputChars, readConfig } from "./input-files";
import { framed, pack } from "./input-parts";

const TEXT_USAGE =
	"text <p> <issue|pull> <n> body|comment <at> <j> [--part <k>]";
const CLEAN_FAILED =
	"text: a library failed while cleaning the text; run the command again";
const NO_TEXT =
	"text: the cache holds no such text; read it from the host yourself, as for a self step";

// The words of the `full` line after `full text` name the text. The cache is read, not the host.
export async function textCommand(args: string[]): Promise<number> {
	const named = args.at(-2) === "--part";
	const words = named ? args.slice(0, -2) : args;
	const key = parseTextWords(words);
	const k = parsePart(named ? args.at(-1) : undefined, TEXT_USAGE);
	if (key === null) throw usage(TEXT_USAGE);
	const size = inputChars(readConfig());
	const db = open();
	let block: Awaited<ReturnType<typeof printText>>;
	try {
		block = await printText(db, key);
	} catch (e) {
		if (e instanceof CleanFailed) throw new Fail(EXIT.USAGE, CLEAN_FAILED);
		throw e;
	} finally {
		db.close();
	}
	if (block === null) throw new Fail(EXIT.USAGE, NO_TEXT);
	const parts = framed(pack([block], size), () => "text");
	const part = parts[k - 1];
	if (part === undefined) throw partOutOfRange(k, parts.length);
	out(part);
	return EXIT.OK;
}

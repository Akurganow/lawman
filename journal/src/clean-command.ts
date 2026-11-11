import { parsePart, partOutOfRange, usage } from "./args";
import { CleanFailed } from "./cache-text";
import { cleanEach } from "./clean-run";
import { EXIT, Fail, out, readStdin } from "./db";
import { inputChars, readConfig } from "./input-files";
import { framed, runs } from "./input-parts";

const CLEAN_USAGE =
	"clean [--json] [--part <k>] (stdin: host text, or JSON values with --json)";
const JSON_FLAG = "--json";
const PART_FLAG = "--part";
const NOT_JSON =
	"clean: the input does not parse as JSON values; read the host reply again";
const CLEAN_FAILED =
	"clean: the cleaning failed on a text that is known to be good; the installation needs repair";

// A text that cannot be cleaned prints as the withheld text, as it does in the cache. A
// cleaning that fails for a good text too is a failed command.
async function cleanedTexts(texts: string[]): Promise<Map<string, string>> {
	try {
		const done = await cleanEach(texts);
		return new Map([...done].map(([text, r]) => [text, r.text]));
	} catch (e) {
		if (e instanceof CleanFailed) throw new Fail(EXIT.COMMAND, CLEAN_FAILED);
		throw e;
	}
}

// values may follow each other with or without white space between them.
// The parser's own error is never shown, because it can quote the input.
function parsedValues(text: string): unknown[] {
	const values: unknown[] = [];
	let rest = text;
	while (rest.trim() !== "") {
		const chunk = Bun.JSONL.parseChunk(rest);
		values.push(...chunk.values);
		if (chunk.done) break;
		if (chunk.error === null || chunk.read === 0)
			throw new Fail(EXIT.USAGE, NOT_JSON);
		rest = rest.slice(chunk.read);
	}
	return values;
}

const stringsOf = (value: unknown): string[] =>
	typeof value === "string"
		? [value]
		: Array.isArray(value)
			? value.flatMap(stringsOf)
			: value !== null && typeof value === "object"
				? Object.values(value).flatMap(stringsOf)
				: [];

// fromEntries defines own properties, so a __proto__ key stays plain data
function replaced(value: unknown, by: Map<string, string>): unknown {
	if (typeof value === "string") return by.get(value);
	if (Array.isArray(value)) return value.map((v) => replaced(v, by));
	if (value === null || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value).map(([k, v]) => [k, replaced(v, by)]),
	);
}

const lineList = (text: string) => (text.trim() === "" ? [] : text.split("\n"));

// the option order is [--json] [--part <k>]; any other form is a usage error
function options(args: string[]): { json: boolean; part: number | undefined } {
	const json = args[0] === JSON_FLAG;
	const rest = json ? args.slice(1) : args;
	if (rest.length === 0) return { json, part: undefined };
	const [flag, given] = rest;
	if (rest.length !== 2 || flag !== PART_FLAG) throw usage(CLEAN_USAGE);
	return { json, part: parsePart(given, CLEAN_USAGE) };
}

// Plain text keeps its bytes, and its final newline is the one every printed line ends with.
// Output within one part prints as it always did. A longer one prints in framed parts,
// split by lines, and nothing is cut: the journal does not keep the text.
export async function cleanCommand(args: string[]): Promise<number> {
	const { json, part } = options(args);
	const size = inputChars(readConfig());
	const input = readStdin();
	const values = json ? parsedValues(input) : [];
	const by = await cleanedTexts(json ? values.flatMap(stringsOf) : [input]);
	const lines = json
		? values.map((v) => JSON.stringify(replaced(v, by)))
		: lineList((by.get(input) ?? "").replace(/\n$/, ""));
	const pieces = runs(lines, size, 0);
	const wanted = part ?? 1;
	if (wanted > pieces.length) throw partOutOfRange(wanted, pieces.length);
	if (pieces.length === 1) {
		process.stdout.write(lines.map((line) => `${line}\n`).join(""));
		return EXIT.OK;
	}
	out(framed(pieces, () => "clean")[wanted - 1] ?? "");
	return EXIT.OK;
}

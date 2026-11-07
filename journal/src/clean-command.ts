import { parsePart, partOutOfRange, usage } from "./args";
import { cleanHostText } from "./clean-host";
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
	"clean: a library failed while cleaning the text; run the command again";

// a library error can quote the input, so its message never reaches stderr
async function cleaned(text: string): Promise<string> {
	try {
		return await cleanHostText(text);
	} catch {
		throw new Fail(EXIT.USAGE, CLEAN_FAILED);
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

// fromEntries defines own properties, so a __proto__ key stays plain data
async function cleanedValue(value: unknown): Promise<unknown> {
	if (typeof value === "string") return cleaned(value);
	if (Array.isArray(value)) return Promise.all(value.map(cleanedValue));
	if (value === null || typeof value !== "object") return value;
	const entries = Object.entries(value).map(
		async ([key, inner]) => [key, await cleanedValue(inner)] as const,
	);
	return Object.fromEntries(await Promise.all(entries));
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
	const lines = json
		? (await Promise.all(parsedValues(input).map(cleanedValue))).map((v) =>
				JSON.stringify(v),
			)
		: lineList((await cleaned(input)).replace(/\n$/, ""));
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

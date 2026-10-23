import { usage } from "./args";
import { cleanHostText } from "./clean-host";
import { EXIT, Fail, readStdin } from "./db";

const CLEAN_USAGE =
	"clean [--json] (stdin: host text, or JSON values with --json)";
const JSON_FLAG = "--json";
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

// plain text keeps its bytes, and its final newline is the one every printed line ends with
export async function cleanCommand(args: string[]): Promise<number> {
	const json = args[0] === JSON_FLAG;
	if (args.length > (json ? 1 : 0)) throw usage(CLEAN_USAGE);
	const input = readStdin();
	const lines = json
		? (await Promise.all(parsedValues(input).map(cleanedValue))).map((v) =>
				JSON.stringify(v),
			)
		: [(await cleaned(input)).replace(/\n$/, "")].filter(
				(text) => text.trim() !== "",
			);
	process.stdout.write(lines.map((line) => `${line}\n`).join(""));
	return EXIT.OK;
}

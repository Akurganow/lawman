import { parseArgs } from "./args";
import { isRecordId, parseSourceLine } from "./catalog-entries";
import { EXIT, Fail, now } from "./db";

const REQUEST_USAGE = "catalog request --kind record (stdin: a Source line)";
const ANSWER_USAGE =
	"catalog answer --kind record --id <identifier> (stdin: reply, then status line)";
const ABSENT = "unknown";
const MAX_SUMMARY_READ = 1000;
const MAX_SUMMARY = 240;
const OK = "200";
const MISSING = new Set(["404", "410", "422"]);
const SEVERITY = /^[A-Za-z]{1,16}$/;
const MODIFIED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

// A dropped field was present and outside its class. A field the record lacks prints as absent and is not dropped.
type Field = { name: string; text: string; dropped: boolean };
const kept = (name: string, text: string): Field => ({
	name,
	text,
	dropped: false,
});
const absent = (name: string): Field => kept(name, `${name}=${ABSENT}`);
const outside = (name: string): Field => ({
	name,
	text: `${name}=${ABSENT}`,
	dropped: true,
});

const classed = (name: string, raw: unknown, pattern: RegExp): Field =>
	raw === undefined
		? absent(name)
		: typeof raw === "string" && pattern.test(raw)
			? kept(name, `${name}=${raw}`)
			: outside(name);

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

// The text is cleaned as the printed field, so no marker or fence can stand on a line of its own.
async function summaryField(raw: unknown): Promise<Field> {
	if (raw === undefined) return absent("summary");
	if (typeof raw !== "string" || raw.length > MAX_SUMMARY_READ)
		return outside("summary");
	try {
		const { cleanHostText } = await import("./clean-host");
		const cleaned = await cleanHostText(`summary=${oneLine(raw)}`);
		return kept("summary", oneLine(cleaned).slice(0, MAX_SUMMARY));
	} catch {
		return outside("summary");
	}
}

export function recordRequest(args: string[], input: string): string {
	parseArgs(args, 0, ["kind"], REQUEST_USAGE);
	const source = parseSourceLine(input.replace(/\r?\n$/, ""));
	if (source === null)
		throw new Fail(EXIT.USAGE, "catalog record: the Source line is not valid");
	return source.id;
}

type Verdict = { record: Record<string, unknown> } | { reason: string };

function judge(id: string, input: string): Verdict {
	const text = input.replace(/\s+$/, "");
	const cut = text.lastIndexOf("\n");
	const status = text.slice(cut + 1);
	const body = text.slice(0, Math.max(cut, 0));
	if (MISSING.has(status)) return { reason: "missing" };
	if (status !== OK) return { reason: "failed" };
	if (body.trim() === "") return { reason: "unconfirmed" };
	try {
		const record = JSON.parse(body) as Record<string, unknown> | null;
		return record?.id === id ? { record } : { reason: "unconfirmed" };
	} catch {
		return { reason: "failed" };
	}
}

export async function recordAnswer(
	args: string[],
	input: string,
): Promise<string> {
	const { opt } = parseArgs(args, 0, ["kind", "id"], ANSWER_USAGE);
	if (!isRecordId(opt.id))
		throw new Fail(EXIT.USAGE, "catalog record: the identifier is not valid");
	const verdict = judge(opt.id, input);
	if ("reason" in verdict) return `catalog none reason=${verdict.reason}`;
	const { record } = verdict;
	const database = record.database_specific as { severity?: unknown } | null;
	const fields = [
		classed("severity", database?.severity, SEVERITY),
		classed("modified", record.modified, MODIFIED),
	];
	const summary = await summaryField(record.summary);
	const dropped = [...fields, summary]
		.filter((field) => field.dropped)
		.map((field) => field.name);
	return [
		`catalog record id=${opt.id}`,
		...fields.map((field) => field.text),
		`read=${now()}`,
		...(dropped.length > 0 ? [`dropped=${dropped.join(",")}`] : []),
		summary.text,
	].join(" ");
}

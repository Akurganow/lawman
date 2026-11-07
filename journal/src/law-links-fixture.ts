import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INTRO, WHOLE } from "./input-roles";
import { LAW } from "./test-helpers";

// The four files whose sections the roles take by heading.
export const LAW_FILES = [
	"LAW.md",
	"tick.md",
	"markers.md",
	"departments.md",
] as const;

export type Ref = { line: number; name: string; file: string | null };

// The headings that LAW.md had and no longer has. A link to one of them, quoted
// or as an anchor, fails the check.
export const DEPARTED: string[] = [
	"The funnel",
	"The roles of this release",
	"Evidence",
	"Alarms and their repetition",
	"Dedupe and closures",
	"Pull requests",
	"The report",
	"The cache",
];

const FENCE = /^\s*(```|~~~)/;

// the lines outside fenced blocks, with their numbers: a fenced block is a template
export function prose(text: string): [number, string][] {
	let inside = false;
	const kept: [number, string][] = [];
	text.split("\n").forEach((line, i) => {
		if (FENCE.test(line)) inside = !inside;
		else if (!inside) kept.push([i + 1, line]);
	});
	return kept;
}

// lower case, each run of other characters one hyphen, no hyphen at the ends
export const slug = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

// the second-level headings of a file, as the sections are named
export const headingsOf = (text: string): string[] =>
	prose(text).flatMap(([, line]) => {
		const m = line.match(/^## (.+)$/);
		return m?.[1] === undefined ? [] : [m[1]];
	});

export const HEADINGS: Record<string, string[]> = Object.fromEntries(
	LAW_FILES.map((file) => [
		file,
		headingsOf(readFileSync(join(LAW, file), "utf8")),
	]),
);

const filesOf = (name: string): string[] =>
	LAW_FILES.filter((file) => HEADINGS[file]?.includes(name));

const NAMED = /(LAW|tick|markers|departments)\.md#([a-z0-9-]+)/g;

// A link in a skill or a role reference: a heading of the four files in straight
// or guillemet quotes, an anchor `<file>.md#<slug>`, or the words `<name> section`
// for a heading that left the law. The name of an anchor
// whose target is missing stays as written, so it fails the check.
export function linksIn(text: string, departed: string[] = DEPARTED): Ref[] {
	const known = new Set([
		...LAW_FILES.flatMap((f) => HEADINGS[f] ?? []),
		...departed,
	]);
	return prose(text).flatMap(([line, body]) => {
		const refs: Ref[] = [];
		for (const name of known)
			for (const quoted of [`"${name}"`, `«${name}»`])
				if (body.includes(quoted)) refs.push({ line, name, file: null });
		// the words `<name> section` of a heading that left the law, quoted or not
		for (const name of departed)
			if (new RegExp(`\\b${name} section\\b`).test(body))
				refs.push({ line, name, file: null });
		for (const m of body.matchAll(NAMED)) {
			const file = `${m[1]}.md`;
			const target = HEADINGS[file]?.find((h) => slug(h) === m[2]);
			refs.push({ line, name: target ?? `${file}#${m[2]}`, file });
		}
		return refs;
	});
}

const SECTION_WORDS = [
	// the section "A", "B" and "C" [of `file.md`]
	/\bthe sections? ((?:"[^"\n]+"(?:, and |, | and | or )?)+)(?: of `?(\w+\.md)`?)?/gi,
	// the "A" section [of `file.md`]
	/\bthe ("[^"\n]+") sections?(?: of `?(\w+\.md)`?)?/gi,
];

// The sections that a sentence of LAW.md or tick.md names with the words
// `the "<name>" section`, `the section "<name>"` or `the sections "<name>", ...`.
// The file is the one the sentence names with `of <file>`, else the file itself.
export function wordsIn(text: string, own: string): Ref[] {
	return prose(text).flatMap(([line, body]) =>
		SECTION_WORDS.flatMap((pattern) =>
			[...body.matchAll(pattern)].flatMap((m) =>
				[...(m[1] ?? "").matchAll(/"([^"\n]+)"/g)].map(
					(n): Ref => ({ line, name: n[1] ?? "", file: m[2] ?? own }),
				),
			),
		),
	);
}

// The sections of the four files that the role reads, by file.
export function readBy(reads: [string, string[]][]): Set<string> {
	const read = new Set<string>();
	for (const [file, wanted] of reads)
		for (const name of wanted.includes(WHOLE) ? (HEADINGS[file] ?? []) : wanted)
			read.add(`${file}#${name}`);
	return read;
}

// what the role's input lacks for each link, as `line: name`
export function missing(
	refs: Ref[],
	lines: string[],
	read: Set<string>,
): string[] {
	return refs.flatMap(({ line, name, file }) => {
		const files = file === null ? filesOf(name) : [file];
		const exempt =
			name === "Sync the law with an older journal" ||
			(lines[line - 1] ?? "").includes("self law");
		return files.some((f) => read.has(`${f}#${name}`)) || exempt
			? []
			: [`${line}: ${name}`];
	});
}

// the word links into the four files whose section does not exist
export const unfound = (refs: Ref[]): string[] =>
	refs.flatMap(({ line, name, file }) =>
		LAW_FILES.some((f) => f === file) && !HEADINGS[file ?? ""]?.includes(name)
			? [`${line}: ${name}`]
			: [],
	);

// the section that holds each line outside fenced blocks: INTRO before the first heading
const holders = (text: string): Map<number, string> => {
	let section = INTRO;
	const held = new Map<number, string>();
	for (const [line, body] of prose(text)) {
		section = body.match(/^## (.+)$/)?.[1] ?? section;
		held.set(line, section);
	}
	return held;
};

// What a reader of a section of `own` lacks of the sections that the section names.
// A sentence of a section goes to every role that reads it, so each of those roles
// must read the sections the sentence names. A row of the table of self steps in
// the intro of tick.md is exempt: the journal prints a `self` line only for a step
// that the role has, and the test of the self steps checks that it reads the section.
// Each entry reads `line: name`.
export function unreached(
	text: string,
	own: string,
	read: Set<string>,
): string[] {
	const held = holders(text);
	const lines = text.split("\n");
	const row = (line: number) =>
		own === "tick.md" &&
		held.get(line) === INTRO &&
		(lines[line - 1] ?? "").startsWith("| `");
	const refs = [...linksIn(text, []), ...wordsIn(text, own)].filter(
		({ line, file }) =>
			read.has(`${own}#${held.get(line)}`) &&
			!row(line) &&
			(file === null || LAW_FILES.some((f) => f === file)),
	);
	return [...new Set(missing(refs, lines, read))];
}

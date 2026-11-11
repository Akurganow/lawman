import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { cleanCharacters } from "./clean";
import { splitPrecedent } from "./precedent-file";

// The ruling is already a public comment. A pull request body adds two risks: the
// host may close or reference an issue that the words name, and the journal reads
// a fingerprint line of the body as a source. Each pattern is one such sign.
const REFUSED = [
	/#/u, // an issue or work item (`#12`, `o/r#12`, `AB#12`); the `sources=#12` of a fingerprint line
	/@/u, // a mention, an email address
	/!\p{N}/u, // a merge request (`!12`)
	/\p{L}[\p{L}\p{N}_]*[\p{Pd}−]\p{N}/u, // a tracker key (`GH-12`, `PROJ-12`)
	/https?:\/\/|www\./iu, // an address that a host closes by or links
	/\p{C}/u, // a line break that whitespace misses, or a mark that hides a sign
];
const PLAIN = new Set(
	"root paragraph text inlineCode emphasis strong".split(" "),
);
const LEFT_OUT = "The text of the ruling was left out. It stands at the link.";
const RULE_LEFT_OUT = "the text of the rule was left out";

// the words of a text that is one paragraph of text, code spans and emphasis
function wordsOf(markdown: string): string | null {
	const tree = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.parse(markdown) as Root;
	let plain =
		tree.children.length === 1 && tree.children[0]?.type === "paragraph";
	const parts: string[] = [];
	visit(tree, (node) => {
		if (!PLAIN.has(node.type)) plain = false;
		if (node.type === "text" || node.type === "inlineCode")
			parts.push(node.value);
	});
	return plain ? parts.join("").replace(/\s+/g, " ").trim() : null;
}

// Words that no host reads as a reference, a mention or an address, or null. The
// case's own `#<n>` adds no source, so it stands.
export async function plainWords(markdown: string, own?: number) {
	let words: string | null;
	try {
		// folded first, so a full-width or small form of a sign reads as the sign
		words = wordsOf(await cleanCharacters(markdown.normalize("NFKC")));
	} catch {
		return null;
	}
	if (words === null) return null;
	const probe =
		own === undefined
			? words
			: words.replaceAll(new RegExp(`(?<![^\\s(])#${own}(?!\\p{N})`, "gu"), "");
	return REFUSED.some((re) => re.test(probe)) ? null : words;
}

// The words stand in a fence. Each line starts with its own words, so no line of
// them is a run of `~` that ends it.
const fenced = (lines: string[]) => `~~~\n${lines.join("\n")}\n~~~`;

export function convictionBody(
	issue: number,
	source?: string,
	disposition?: string | null,
) {
	const parts = [`Closes #${issue}`];
	if (source !== undefined)
		parts.push(
			disposition ? fenced([`Disposition: ${disposition}`]) : LEFT_OUT,
			`Ruling: ${source}`,
		);
	return `${parts.join("\n\n")}\n`;
}

export type Change = { name: string; was: string | null; now: string | null };

// One line for each changed file: its name and the rule it writes or cancels.
export async function precedentBody(source: string, changes: Change[]) {
	const lines = await Promise.all(
		changes.map(async ({ name, was, now }) => {
			const verb = now === null ? "cancel" : was === null ? "new" : "refine";
			const rule = splitPrecedent(now ?? was ?? "")?.body ?? "";
			return `${verb} ${name}: ${(await plainWords(rule)) ?? RULE_LEFT_OUT}`;
		}),
	);
	return `Records the precedents of the court ruling ${source}. Merge it to make them binding.\n\n${fenced(lines)}\n`;
}

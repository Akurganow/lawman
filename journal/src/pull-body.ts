import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { cleanCharacters } from "./clean";
import { fenceOf } from "./fence";

// The class of a sentence. It leaves out `#` and `@`, which start a reference or
// a mention, and every character that starts markup, so no host reads the words
// as anything but words.
const PLAIN = /^[\p{L}\p{N} .,;:?'"()/_+=*%-]+$/u;
// a hyphen before a digit forms `GH-12`, which a host reads as an issue after a closing word
const SHORTHAND = /-\d/;
const PLAIN_NODES = new Set([
	"root",
	"paragraph",
	"text",
	"inlineCode",
	"emphasis",
	"strong",
]);

const parse = (text: string) =>
	unified().use(remarkParse).use(remarkGfm).parse(text) as Root;

// the words of a text that is one paragraph of text, code spans and emphasis
function wordsOf(markdown: string): string | null {
	const tree = parse(markdown);
	let plain =
		tree.children.length === 1 && tree.children[0]?.type === "paragraph";
	const parts: string[] = [];
	visit(tree, (node) => {
		if (!PLAIN_NODES.has(node.type)) plain = false;
		if (node.type === "text" || node.type === "inlineCode")
			parts.push(node.value);
	});
	return plain ? parts.join("").replace(/\s+/g, " ").trim() : null;
}

// Words that read the same on every host, or null. The pieces of a link that
// emphasis marks separate join into one, so the joined words are read again.
export async function plainWords(markdown: string): Promise<string | null> {
	let words: string | null;
	try {
		words = wordsOf(await cleanCharacters(markdown));
	} catch {
		return null;
	}
	if (words === null || !PLAIN.test(words) || SHORTHAND.test(words))
		return null;
	const [only, ...more] = parse(words).children;
	const alone = only?.type === "paragraph" && more.length === 0;
	return alone && only.children.every((c) => c.type === "text") ? words : null;
}

// the words stand in a fence that no line of them closes, as the law quotes text
const quoted = (lines: string[]) => {
	const text = lines.join("\n");
	const fence = fenceOf(text);
	return `${fence}\n${text}\n${fence}`;
};

const block = (lines: string[]) => (lines.length === 0 ? [] : [quoted(lines)]);

export const convictionBody = (
	issue: number,
	ruling: string,
	lines: string[],
) =>
	`${[`Closes #${issue}`, ...block(lines), `Ruling: ${ruling}`].join("\n\n")}\n`;

export const precedentBody = (ruling: string, lines: string[]) =>
	`${[
		`Records the precedents of the court ruling ${ruling}. Merge it to make them binding.`,
		...block(lines),
	].join("\n\n")}\n`;

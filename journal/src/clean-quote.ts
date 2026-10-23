import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { maskSecrets, stripInvisible } from "./clean";

type Range = { start: number; end: number };
type Block = Range & { open?: Range; close?: Range };

// mdast keeps no fence positions, so the parser's own fence tokens are recorded
function codeBlocks(text: string): Block[] {
	const fences: Range[] = [];
	const tree = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(function recordFences() {
			const data = this.data();
			data.fromMarkdownExtensions ??= [];
			data.fromMarkdownExtensions.push({
				exit: {
					codeFencedFenceSequence(token) {
						fences.push({ start: token.start.offset, end: token.end.offset });
					},
				},
			});
		})
		.parse(text);
	const blocks: Block[] = [];
	visit(tree, "code", (node) => {
		const start = node.position?.start.offset ?? 0;
		const end = node.position?.end.offset ?? 0;
		const [open, close] = fences.filter(
			(f) => f.start >= start && f.end <= end,
		);
		blocks.push({ start, end, ...(open && { open }), ...(close && { close }) });
	});
	return blocks;
}

// the raw lines between the fences, container prefixes included
function contentOf(text: string, block: Block): Range {
	const { end, open, close } = block;
	if (!open) return { start: block.start, end };
	const eol = text.slice(open.end, end).match(/\r\n?|\n/);
	const start = eol ? open.end + (eol.index ?? 0) + eol[0].length : end;
	if (!close) return { start, end };
	const before = text.slice(0, close.start);
	return {
		start,
		end: Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r")),
	};
}

// the rule of mdast-util-to-markdown: longer than the longest run in the content
export function fenceLength(
	content: string,
	char: string,
	before: number,
): number {
	const runs = content.match(new RegExp(`\\${char}+`, "g")) ?? [];
	return runs.reduce((n, run) => Math.max(n, run.length + 1), before);
}

function refenced(text: string, block: Block, content: Range, cleaned: string) {
	const { open, close } = block;
	if (!open) return cleaned;
	const char = text[open.start] ?? "`";
	const length = fenceLength(cleaned, char, open.end - open.start);
	const head = char.repeat(length) + text.slice(open.end, content.start);
	if (!close) return head + cleaned;
	const closing = char.repeat(Math.max(length, close.end - close.start));
	return `${head}${cleaned}${text.slice(content.end, close.start)}${closing}${text.slice(close.end, block.end)}`;
}

// Cleans the content of every fenced and indented code block and never
// rejects. A block whose content changed gets a fence no content line can close.
export async function cleanQuotes(text: string): Promise<string> {
	const blocks = codeBlocks(text);
	const contents = blocks.map((block) => contentOf(text, block));
	const cleaned = await Promise.all(
		contents.map(({ start, end }) =>
			maskSecrets(stripInvisible(text.slice(start, end))),
		),
	);
	let out = text;
	for (const [i, block] of [...blocks.entries()].reverse()) {
		const content = contents[i] as Range;
		const next = cleaned[i] as string;
		if (next === text.slice(content.start, content.end)) continue;
		out =
			out.slice(0, block.start) +
			refenced(text, block, content, next) +
			out.slice(block.end);
	}
	return out;
}

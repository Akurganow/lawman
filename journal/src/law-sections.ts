import type { Heading, Root, RootContent } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { INTRO, WHOLE } from "./input-roles";

type Found = { name: string; depth: number; start: number };

const parse = (text: string) => unified().use(remarkParse).parse(text) as Root;

// the heading's text as written, from its first inline node to its last
const titleOf = (text: string, h: Heading) =>
	text.slice(
		h.children[0]?.position?.start.offset ?? 0,
		h.children.at(-1)?.position?.end.offset ?? 0,
	);

// a heading written with `#`, at or above the depth; an underlined one is not
const atxHeading = (
	text: string,
	node: RootContent,
	depth: number,
): node is Heading =>
	node.type === "heading" &&
	node.depth <= depth &&
	text[node.position?.start.offset ?? 0] === "#";

function headings(text: string): Found[] {
	return parse(text)
		.children.filter((node): node is Heading => node.type === "heading")
		.map((h) => ({
			name: titleOf(text, h),
			depth: h.depth,
			start: h.position?.start.offset ?? 0,
		}));
}

// The top-level nodes of every `## <name>` section, in order. A section ends at the
// next heading of level two or higher written with `#`; an underlined one stays inside.
export function sectionNodes(text: string, name: string): RootContent[][] {
	const nodes = parse(text).children;
	const found: RootContent[][] = [];
	nodes.forEach((node, i) => {
		if (!atxHeading(text, node, 2) || node.depth !== 2) return;
		if (titleOf(text, node) !== name) return;
		const end = nodes.findIndex((n, k) => k > i && atxHeading(text, n, 2));
		found.push(nodes.slice(i + 1, end < 0 ? nodes.length : end));
	});
	return found;
}

const lines = (text: string) => text.replace(/\n$/, "").split("\n");

// The lines of each wanted section, null for one the file lacks. A section is
// its heading and everything up to the next heading of the same or a higher level.
export function sectionsOf(
	text: string,
	wanted: string[],
): (string[] | null)[] {
	const found = wanted.every((name) => name === WHOLE) ? [] : headings(text);
	return wanted.map((name) => {
		if (name === WHOLE) return lines(text);
		if (name === INTRO) {
			const end = found.find((h) => h.depth === 2)?.start ?? text.length;
			return lines(text.slice(0, end));
		}
		const at = found.findIndex((h) => h.name === name);
		const h = found[at];
		if (h === undefined) return null;
		const end =
			found.slice(at + 1).find((next) => next.depth <= h.depth)?.start ??
			text.length;
		return lines(text.slice(h.start, end));
	});
}

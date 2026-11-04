import type { Heading, Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { INTRO, WHOLE } from "./input-roles";

type Found = { name: string; depth: number; start: number };

// the heading's text as written, from its first inline node to its last
function headings(text: string): Found[] {
	const tree = unified().use(remarkParse).parse(text) as Root;
	return tree.children
		.filter((node): node is Heading => node.type === "heading")
		.map((h) => ({
			name: text.slice(
				h.children[0]?.position?.start.offset ?? 0,
				h.children.at(-1)?.position?.end.offset ?? 0,
			),
			depth: h.depth,
			start: h.position?.start.offset ?? 0,
		}));
}

const lines = (text: string) => text.replace(/\n$/, "").split("\n");

// The lines of each wanted section, null for one the file lacks. A section is
// its heading and everything up to the next heading of the same or a higher level.
export function sectionsOf(
	text: string,
	wanted: string[],
): (string[] | null)[] {
	const found = headings(text);
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

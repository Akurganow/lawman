import type { RootContent } from "mdast";
import { sectionNodes, sliceOf } from "./law-sections";

// an underlined heading never applies as written
export type Item = { text: string; bad: boolean; hidden?: true };

export function itemsOf(text: string, nodes: RootContent[]): Item[] {
	return nodes.flatMap((node): Item[] => {
		if (node.type === "html" || node.type === "thematicBreak") return [];
		if (node.type === "list")
			return node.children.flatMap((li) => {
				const t = sliceOf(text, li.children[0], li.children.at(-1));
				return t === "" ? [] : [{ text: t, bad: false }];
			});
		if (
			node.type === "heading" &&
			text[node.position?.start.offset ?? 0] !== "#"
		)
			return [
				{
					text: sliceOf(text, node.children[0], node.children.at(-1)),
					bad: true,
				},
			];
		const t = sliceOf(text, node, node);
		return t === "" ? [] : [{ text: t, bad: false }];
	});
}

// whether the `## Precedent` section of a ruling holds a line other than `none`
export const holdsPrecedent = (text: string) =>
	sectionNodes(text, "Precedent").some((nodes) =>
		itemsOf(text, nodes).some((i) => i.bad || i.text !== "none"),
	);

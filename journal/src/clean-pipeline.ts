import type { Element, Nodes, Root, RootContent } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeRemark from "rehype-remark";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";

// hast property names of the attributes that make an element load an address
export const ADDRESS_PROPERTIES = [
	"src",
	"srcSet",
	"poster",
	"background",
	"data",
] as const;

// hast splits a srcset into candidates, each an address and a descriptor
function addressOf(name: string, value: unknown): string {
	const first = String([value ?? ""].flat()[0] ?? "").trim();
	return name === "srcSet" ? (first.split(/\s/)[0] ?? "") : first;
}

// an element with content keeps it; sanitize then drops its address
function imageToLink(node: Element): void {
	if (node.children.length) return;
	const href = ADDRESS_PROPERTIES.map((name) =>
		addressOf(name, node.properties[name]),
	).find(Boolean);
	if (!href) return;
	const alt = node.properties.alt;
	node.tagName = "a";
	node.children = [{ type: "text", value: String(alt ?? "") || href }];
	node.properties = { href };
}

const imagesToLinks = () => (tree: Root) => visit(tree, "element", imageToLink);

function mergeTexts(children: RootContent[]): RootContent[] {
	const out: RootContent[] = [];
	for (const child of children) {
		const last = out.at(-1);
		if (child.type === "text" && last?.type === "text")
			out[out.length - 1] = { type: "text", value: last.value + child.value };
		else out.push(child);
	}
	return out;
}

type Clean = (text: string) => Promise<string>;

// runs on decoded text, so a character reference or a backslash escape hides nothing
const cleanDecoded = (clean: Clean) => () => async (tree: Root) => {
	const jobs: Promise<void>[] = [];
	visit(tree as Nodes, (node) => {
		if ("children" in node) node.children = mergeTexts(node.children);
		if (node.type === "text")
			jobs.push(
				clean(node.value).then((value) => {
					node.value = value;
				}),
			);
		if (node.type !== "element") return;
		for (const [name, value] of Object.entries(node.properties))
			if (typeof value === "string" || Array.isArray(value))
				jobs.push(
					Promise.all([value].flat().map((v) => clean(String(v)))).then(
						(cleaned) => {
							node.properties[name] =
								typeof value === "string" ? cleaned.join("") : cleaned;
						},
					),
				);
	});
	await Promise.all(jobs);
};

// an image with no address has nothing to link to, so it goes
const SCHEMA = {
	...defaultSchema,
	clobberPrefix: "",
	tagNames: defaultSchema.tagNames?.filter((name) => name !== "img") ?? [],
};

export async function cleanMarkdown(
	text: string,
	clean: Clean,
): Promise<string> {
	const file = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(imagesToLinks)
		.use(rehypeSanitize, SCHEMA)
		.use(cleanDecoded(clean))
		.use(rehypeRemark)
		.use(remarkStringify, { bullet: "-" })
		.process(text);
	return String(file);
}

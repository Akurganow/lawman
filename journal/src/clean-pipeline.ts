import type { Element, Nodes, Parents, Root } from "hast";
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
];

// hast splits a srcset into candidates, each an address and a descriptor
function addressOf(name: string, value: unknown): string {
	const first = String([value ?? ""].flat()[0] ?? "").trim();
	return name === "srcSet" ? (first.split(/\s/)[0] ?? "") : first;
}

// an element with content keeps it; sanitize then drops its address
function addressIn(node: Element): string | undefined {
	if (node.children.length) return undefined;
	return ADDRESS_PROPERTIES.map((name) =>
		addressOf(name, node.properties[name]),
	).find(Boolean);
}

const textOf = (node: Element, href: string) =>
	String(node.properties.alt ?? "") || href;

function imageToLink(node: Element): boolean {
	const href = addressIn(node);
	if (!href) return false;
	node.children = [{ type: "text", value: textOf(node, href) }];
	node.tagName = "a";
	node.properties = { href };
	return true;
}

// a link cannot hold a link, so an image inside one becomes its text
function imageToText(
	node: Element,
	index: number | undefined,
	parent: Parents | undefined,
): boolean {
	const href = addressIn(node);
	if (!href || !parent || index === undefined) return false;
	parent.children[index] = { type: "text", value: textOf(node, href) };
	return true;
}

const imagesToLinks = (tree: Root) => {
	let converted = false;
	visit(tree, "element", (node) => {
		if (node.tagName !== "a") converted = imageToLink(node) || converted;
		else
			visit(node, "element", (inner, index, parent) => {
				converted = imageToText(inner, index, parent) || converted;
			});
	});
	return converted;
};

type Clean = (text: string) => Promise<string>;
type Mark = (changed: boolean) => void;

// runs on decoded text, so a character reference or a backslash escape hides nothing
async function cleanDecoded(tree: Root, clean: Clean, mark: Mark) {
	const jobs: Promise<void>[] = [];
	const cleaned = async (value: string) => {
		const out = await clean(value);
		mark(out !== value);
		return out;
	};
	visit(tree as Nodes, (node) => {
		if (node.type === "text")
			jobs.push(
				cleaned(node.value).then((value) => {
					node.value = value;
				}),
			);
		if (node.type !== "element") return;
		for (const [name, value] of Object.entries(node.properties))
			if (typeof value === "string" || Array.isArray(value))
				jobs.push(
					Promise.all([value].flat().map((v) => cleaned(String(v)))).then(
						(out) => {
							node.properties[name] =
								typeof value === "string" ? out.join("") : out;
						},
					),
				);
	});
	await Promise.all(jobs);
}

// sanitize rebuilds positions, so the comparison leaves them out
const shape = (tree: Root) =>
	JSON.stringify(tree, (key, value) =>
		key === "position" ? undefined : value,
	);

// an image with no address has nothing to link to, so it goes
const SCHEMA = {
	...defaultSchema,
	// cleaning must not rename ids or names
	clobberPrefix: "",
	tagNames: defaultSchema.tagNames?.filter((name) => name !== "img") ?? [],
};

// changed is false when the pipeline removed nothing and cleaned no decoded value
export async function cleanMarkdown(
	text: string,
	clean: Clean,
): Promise<{ markdown: string; changed: boolean }> {
	let changed = false;
	const mark: Mark = (did) => {
		changed ||= did;
	};
	let unsanitized = "";
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(() => (tree: Root) => {
			mark(imagesToLinks(tree));
			unsanitized = shape(tree);
		})
		.use(rehypeSanitize, SCHEMA)
		.use(() => async (tree: Root) => {
			mark(shape(tree) !== unsanitized);
			await cleanDecoded(tree, clean, mark);
		})
		.use(rehypeRemark, { newlines: true })
		.use(remarkStringify, { bullet: "-" });
	const mdast = processor.parse(text);
	// the HTML parser drops a block that ends inside a tag or a comment, and a
	// footnote with no reference is not shown, so either one goes through the pipeline
	visit(mdast, ["definition", "footnoteDefinition", "html"], () => mark(true));
	const markdown = processor.stringify(await processor.run(mdast));
	return { markdown, changed };
}

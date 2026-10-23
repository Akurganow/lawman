import type { Nodes, Root } from "hast";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { usage } from "./args";
import { secretRanges, stripInvisible } from "./clean";
import { ADDRESS_PROPERTIES } from "./clean-pipeline";
import { cleanQuotes } from "./clean-quote";
import { EXIT, Fail, readStdin } from "./db";
import { fencedLines, parseMarker } from "./markers";

// an SVG image loads its href, which is no address property of an HTML element
const IMAGE_TAGS = new Set(["img", "image"]);

const LINT_BODY_USAGE =
	"lint-body [--no-marker] (stdin: the text to write, its marker last unless --no-marker)";
const NO_MARKER = "--no-marker";
const LINT_FAILED =
	"lint-body: a library failed while reading the text; run the command again";
const LINE_END = /\r\n?|\n/;

type Finding = [line: number, rule: string];
type Piece = { text: string; line: number };
type Position = NonNullable<Nodes["position"]>;

const markdown = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeRaw);
const html = unified().use(rehypeRaw);

// a node the HTML parser adds after a stray end tag has no start
const lineOf = (node: Nodes) => node.position?.start?.line ?? 1;
const offsets = ({ start, end }: Position) => [
	start.offset ?? 0,
	end.offset ?? 0,
];
const inBlock = (blocks: Position[], line: number) =>
	blocks.some(({ start, end }) => start.line <= line && line <= end.line);

// spaces keep every offset and line, so positions still point into the input
function blanked(text: string, spans: Position[]): string {
	let out = text;
	for (const span of spans) {
		const [start, end] = offsets(span);
		out =
			out.slice(0, start) +
			out.slice(start, end).replace(/[^\r\n]/g, " ") +
			out.slice(end);
	}
	return out;
}

// Markdown and the renderer disagree on some tags, such as an unquoted
// address with a slash, so the text outside code is read as HTML too
const asHtml = (value: string): Root => ({
	type: "root",
	children: [{ type: "raw", value }],
});

const invisibleLines = ({ text, line }: Piece): Finding[] =>
	text
		.split(LINE_END)
		.flatMap((part, i) =>
			stripInvisible(part) === part ? [] : [[line + i, "invisible character"]],
		);

// a key block spans lines, so it is reported where it starts
async function secretLines({ text, line }: Piece): Promise<Finding[]> {
	const view = stripInvisible(text);
	return (await secretRanges(view)).map(({ start }) => [
		line + view.slice(0, start).split(LINE_END).length - 1,
		"secret",
	]);
}

async function textFindings(pieces: Piece[]): Promise<Finding[]> {
	const secrets = await Promise.all(pieces.map(secretLines));
	return pieces.flatMap((piece, i) => [
		...(secrets[i] ?? []),
		...invisibleLines(piece),
	]);
}

// the library gives code block text and the text it adds no position,
// so every positioned string is own words, decoded as the page shows it
function decoded(tree: Root): Piece[] {
	const pieces: Piece[] = [];
	visit(tree, (node) => {
		if (node.type === "text" && node.position)
			pieces.push({ text: node.value, line: lineOf(node) });
		if (node.type !== "element") return;
		for (const value of Object.values(node.properties))
			if (typeof value === "string" || Array.isArray(value))
				pieces.push({ text: [value].flat().join(" "), line: lineOf(node) });
	});
	return pieces;
}

function elementFindings(
	tree: Root,
	hidden: (node: Nodes) => boolean,
): Finding[] {
	const found: Finding[] = [];
	visit(tree, (node) => {
		if (node.type === "comment" && hidden(node))
			found.push([lineOf(node), "HTML comment"]);
		if (node.type !== "element") return;
		if (IMAGE_TAGS.has(node.tagName)) found.push([lineOf(node), "image embed"]);
		else if (
			ADDRESS_PROPERTIES.some((name) => node.properties[name] !== undefined)
		)
			found.push([lineOf(node), "loading element"]);
	});
	return found;
}

// an empty rule means the line holds the trailing marker. The journal's own
// marker reader must also see it outside a fence, or the read-back loses it.
function markerLine(lines: string[], blocks: Position[]): Finding {
	const last = lines.findLastIndex((line) => line.trim() !== "") + 1;
	if (last > 0 && (inBlock(blocks, last) || fencedLines(lines)[last - 1]))
		return [last, "last line is inside a fenced block"];
	if (last > 0 && parseMarker(lines[last - 1] ?? "")) return [last, ""];
	return [Math.max(last, 1), "last line is not a valid marker"];
}

// reasons name the rule only, never the matched text
export async function lintBody(text: string, marker = true): Promise<string[]> {
	const lines = text.split(LINE_END);
	const mdast = markdown.parse(text);
	const blocks: Position[] = [];
	const spans: Position[] = [];
	// the info string sits on the fence line and is no quote
	const infos: Piece[] = [];
	visit(mdast, (node) => {
		if (node.type === "inlineCode" && node.position) spans.push(node.position);
		if (node.type !== "code" || !node.position) return;
		blocks.push(node.position);
		const info = [node.lang, node.meta].join(" ");
		infos.push({ text: info, line: node.position.start.line });
	});
	const tree = await markdown.run(mdast);
	const [line, missing] = marker ? markerLine(lines, blocks) : [0, ""];
	const isMarker = (node: Nodes) =>
		!missing &&
		node.position?.start?.line === line &&
		text.slice(...offsets(node.position)) === lines[line - 1];
	const quoted = blanked(text, blocks);
	const findings: Finding[] = [
		...(await textFindings([
			{ text: quoted, line: 1 },
			...infos,
			...decoded(tree),
		])),
		...elementFindings(tree, (node) => !isMarker(node)),
		...elementFindings(
			await html.run(asHtml(blanked(quoted, spans))),
			() => false,
		),
		...(missing ? [[line, missing] as Finding] : []),
	];
	const sorted = findings.toSorted(([a], [b]) => a - b);
	return [...new Set(sorted.map(([at, rule]) => `${at}: ${rule}`))];
}

async function filtered(text: string, marker: boolean) {
	try {
		const reasons = await lintBody(text, marker);
		const cleaned = reasons.length > 0 ? "" : await cleanQuotes(text);
		return { reasons, cleaned };
	} catch {
		throw new Fail(EXIT.USAGE, LINT_FAILED);
	}
}

export async function lintBodyCommand(args: string[]): Promise<number> {
	const marker = args[0] !== NO_MARKER;
	if (args.length > (marker ? 0 : 1)) throw usage(LINT_BODY_USAGE);
	const { reasons, cleaned } = await filtered(readStdin(), marker);
	if (reasons.length > 0) {
		process.stderr.write(reasons.map((reason) => `${reason}\n`).join(""));
		return EXIT.LINT_BODY;
	}
	process.stdout.write(cleaned);
	return EXIT.OK;
}

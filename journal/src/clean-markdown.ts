import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { maskSecrets, stripInvisible } from "./clean";
import { parseMarker, stripCr } from "./markers";

type Edit = { start: number; end: number; put: string };

export const parseMarkdown = (text: string) =>
	fromMarkdown(text, {
		extensions: [gfm()],
		mdastExtensions: [gfmFromMarkdown()],
	});

function offsets(node: Nodes): [number, number] | null {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	return start === undefined || end === undefined ? null : [start, end];
}

// a backslash keeps every ASCII punctuation character literal
const escapeText = (text: string) =>
	text.replace(/\r?\n|\r/g, " ").replace(/[!-/:-@[-`{-~]/g, "\\$&");
// a line ending ends a link destination, so control characters are percent-encoded
const escapeAddress = (url: string) =>
	url
		.replace(/[\\<>&|]/g, "\\$&")
		.replace(/\p{Cc}/gu, (c) => encodeURIComponent(c));

function imageLink(alt: string, url: string, inLink: boolean): string {
	const text = escapeText(alt.trim() === "" ? url : alt);
	return inLink ? text : `[${text}](<${escapeAddress(url)}>)`;
}

const OPEN = "<!--";
const CLOSE = "-->";
// the close may reuse the opener's dashes, so <!--> and <!---> close
const CLOSE_FROM = "<!".length;

// an unclosed comment keeps the node's trailing blank lines, which end its container
function commentCuts(text: string, start: number, end: number): Edit[] {
	const cuts: Edit[] = [];
	let at = text.indexOf(OPEN, start);
	while (at !== -1 && at < end) {
		const close = text.indexOf(CLOSE, at + CLOSE_FROM);
		const stop =
			close === -1 || close + CLOSE.length > end
				? at + text.slice(at, end).trimEnd().length
				: close + CLOSE.length;
		cuts.push({ start: at, end: stop, put: "" });
		at = text.indexOf(OPEN, stop);
	}
	return cuts;
}

function nodeEdits(
	text: string,
	node: Nodes,
	inLink: boolean,
	definitions: Map<string, string>,
): Edit[] {
	const at = offsets(node);
	if (!at) return [];
	const [start, end] = at;
	if (node.type === "html" && node.value.trimStart().startsWith(OPEN))
		return commentCuts(text, start, end);
	if (node.type !== "image" && node.type !== "imageReference") return [];
	const url =
		node.type === "image" ? node.url : definitions.get(node.identifier);
	if (url === undefined) return [];
	return [{ start, end, put: imageLink(node.alt ?? "", url, inLink) }];
}

function markdownEdits(text: string): Edit[] {
	const definitions = new Map<string, string>();
	const visited: [Nodes, boolean][] = [];
	const walk = (node: Nodes, inLink: boolean) => {
		if (node.type === "definition" && !definitions.has(node.identifier))
			definitions.set(node.identifier, node.url);
		visited.push([node, inLink]);
		const linked =
			inLink || node.type === "link" || node.type === "linkReference";
		if ("children" in node)
			for (const child of node.children) walk(child, linked);
	};
	walk(parseMarkdown(text), false);
	return visited.flatMap(([node, inLink]) =>
		nodeEdits(text, node, inLink, definitions),
	);
}

// a marker line keeps its own line, so its newlines are protected with it
function markerSpans(text: string): [number, number][] {
	const spans: [number, number][] = [];
	let at = 0;
	for (const line of text.split("\n")) {
		const end = at + line.length;
		if (parseMarker(stripCr(line)))
			spans.push([Math.max(at - 1, 0), Math.min(end + 1, text.length)]);
		at = end + 1;
	}
	return spans;
}

function splitAroundMarkers(edit: Edit, spans: [number, number][]): Edit[] {
	const pieces: Edit[] = [];
	let { start, put } = edit;
	for (const [from, to] of spans) {
		if (to <= start || from >= edit.end) continue;
		if (from > start) {
			pieces.push({ start, end: from, put });
			put = "";
		}
		start = Math.max(start, to);
	}
	if (start < edit.end) pieces.push({ start, end: edit.end, put });
	return pieces;
}

function isEscaped(text: string, at: number): boolean {
	let slashes = 0;
	while (text[at - 1 - slashes] === "\\") slashes++;
	return slashes % 2 === 1;
}

// a splice can join "<!" and "--" into a comment, or "!" and "[" into an image.
// Escaping the first character renders as the page did and needs no new pass.
function escapeJoin(out: string, next: string): string {
	for (const danger of ["<!--", "!["])
		for (let tail = 1; tail < danger.length; tail++) {
			const at = out.length - tail;
			const joined = out.slice(at) + next.slice(0, danger.length - tail);
			if (at >= 0 && joined === danger && !isEscaped(out, at))
				return `${out.slice(0, at)}\\${out.slice(at)}`;
		}
	return out;
}

function splice(text: string, edits: Edit[]): string {
	let out = "";
	let at = 0;
	const append = (piece: string) => {
		out = escapeJoin(out, piece) + piece;
	};
	for (const { start, end, put } of edits) {
		append(text.slice(at, start));
		append(put);
		at = end;
	}
	append(text.slice(at));
	return out;
}

// secrets are masked before the edits, because the built link text escapes
// the punctuation that the secret rules match
export async function cleanPass(text: string): Promise<string> {
	const clean = await maskSecrets(stripInvisible(text));
	const spans = markerSpans(clean);
	const edits = markdownEdits(clean).flatMap((e) =>
		splitAroundMarkers(e, spans),
	);
	return splice(clean, edits);
}

// no pass cap, because a cap would fail on hostile text. The join escapes keep
// nested comment openers to two passes. Other joins, such as "](", take more.
export async function cleanHostText(text: string): Promise<string> {
	let before = text;
	let after = await cleanPass(text);
	while (after !== before) {
		before = after;
		after = await cleanPass(before);
	}
	return after;
}

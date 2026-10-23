import { randomUUID } from "node:crypto";
import { maskSecrets, stripInvisible } from "./clean";
import { cleanMarkdown } from "./clean-pipeline";
import { fencedLines, parseMarker, stripCr } from "./markers";

type Clean = (text: string) => Promise<string>;

// holds no Markdown syntax character and no part of the input
const WITHHELD_NOTICE = "Text withheld because cleaning failed";

// a marker is a raw line outside a fence that cleaning leaves as it is
async function isMarker(line: string, fenced: boolean, clean: Clean) {
	return !fenced && parseMarker(line) !== null && (await clean(line)) === line;
}

// a placeholder is letters and digits only, so the pipeline keeps it as text.
// The nonce is new on every call, so the input cannot forge one.
async function hideMarkers(text: string, nonce: string, clean: Clean) {
	const lines = text.split("\n").map(stripCr);
	const fenced = fencedLines(lines);
	const markers: string[] = [];
	const out: string[] = [];
	for (const [i, line] of lines.entries()) {
		if (!(await isMarker(line, fenced[i] ?? false, clean))) out.push(line);
		else out.push(`q${nonce}q${markers.push(line) - 1}q`);
	}
	return { text: out.join("\n"), markers };
}

// each placeholder becomes its marker on a line of its own. A marker whose
// placeholder the pipeline dropped goes before the next kept one, or to the end.
function restoreMarkers(text: string, nonce: string, markers: string[]) {
	const placeholder = new RegExp(`q${nonce}q(\\d+)q`);
	let next = 0;
	const markersUpTo = (index: string) => {
		const due = markers.slice(next, Number(index) + 1);
		next = Math.max(next, Number(index) + 1);
		return due;
	};
	// text before a placeholder keeps its indent, text after it starts the next line
	const kept = (part: string, i: number) => {
		const trimmed = i ? part.trim() : part.trimEnd();
		return trimmed.trim() ? [trimmed] : [];
	};
	const split = (line: string) =>
		line
			.split(placeholder)
			.flatMap((part, i) => (i % 2 ? markersUpTo(part) : kept(part, i)));
	const lines = (text ? text.split("\n") : []).flatMap((line) =>
		placeholder.test(line) ? split(line) : [line],
	);
	return [...lines, ...markers.slice(next)].join("\n");
}

// cleaning never throws: on any failure a notice replaces the text, so no
// secret goes out unmasked. The mask parameter lets a test make it throw.
// The output is cleaned once more, because Markdown can join text that
// sat in separate elements into one token.
export async function cleanHostText(
	text: string,
	mask = maskSecrets,
): Promise<string> {
	const clean = async (part: string) => mask(stripInvisible(part));
	let markers: string[] = [];
	try {
		const nonce = randomUUID().replaceAll("-", "");
		const hidden = await hideMarkers(String(text), nonce, clean);
		markers = hidden.markers;
		const out = await clean(await cleanMarkdown(hidden.text, clean));
		return restoreMarkers(out.trimEnd(), nonce, markers);
	} catch {
		return [WITHHELD_NOTICE, ...markers].join("\n");
	}
}

import { fenceOf } from "./fence";

// The version of the input's form. A role tells an old binary's output by it.
export const INPUT_FORM = 1;
export const DEFAULT_INPUT_CHARS = 16000;

// A journal line is never cut. Law lines print behind "| ". A fenced text
// keeps one fence for all its pieces. A head line goes with the first piece.
// A whole block is rendered lines that stay together in one part.
export type FencedBlock = {
	head?: string;
	label: string;
	fence: string;
	lines: string[];
};
export type Block =
	| { line: string }
	| { whole: string[] }
	| { head?: string; law: string[] }
	| FencedBlock;

export function fencedBlock(
	label: string,
	text: string,
	head?: string,
): FencedBlock {
	const content = text.replace(/\r?\n$/, "");
	return {
		...(head === undefined ? {} : { head }),
		label,
		fence: fenceOf(content),
		lines: content === "" ? [] : content.split("\n"),
	};
}

const lawLine = (line: string) => (line === "" ? "|" : `| ${line}`);

export function render(block: Block): string[] {
	if ("line" in block) return [block.line];
	if ("whole" in block) return block.whole;
	const head = block.head === undefined ? [] : [block.head];
	if ("law" in block) return [...head, ...block.law.map(lawLine)];
	return [...head, `${block.fence}${block.label}`, ...block.lines, block.fence];
}

export const renderAll = (blocks: Block[]) => blocks.flatMap(render).join("\n");

// a size counts Unicode characters, each line with its newline
const chars = (line: string) => [...line].length + 1;
const cost = (lines: string[]) =>
	lines.reduce((sum, line) => sum + chars(line), 0);

// shortcut: a piece holds at least one character, so a size below a fence's
// own lines gives a part above the size; no installation sets one that small
function chop(line: string, width: number): string[] {
	const all = [...line];
	const step = Math.max(1, width);
	const pieces: string[] = [];
	for (let i = 0; i < all.length; i += step)
		pieces.push(all.slice(i, i + step).join(""));
	return pieces.length === 0 ? [""] : pieces;
}

// Groups lines into runs that each cost at most `room`, a long line chopped.
function runs(lines: string[], room: number, wrap: number): string[][] {
	const out: string[][] = [[]];
	let used = 0;
	for (const line of lines)
		for (const piece of chars(line) + wrap > room
			? chop(line, room - wrap - 1)
			: [line]) {
			const n = chars(piece) + wrap;
			if (used + n > room && (out.at(-1)?.length ?? 0) > 0) {
				out.push([]);
				used = 0;
			}
			out.at(-1)?.push(piece);
			used += n;
		}
	return out;
}

// Whole lines from one end of the text while they cost at most `room`; the
// first line alone, cut to its characters, when even that line does not fit.
function piece(lines: string[], room: number, last: boolean): string {
	const ordered = last ? lines.toReversed() : lines;
	const taken: string[] = [];
	let used = 0;
	for (const line of ordered) {
		used += chars(line);
		if (used > room) break;
		taken.push(line);
	}
	if (taken.length > 0) return (last ? taken.toReversed() : taken).join("\n");
	const all = [...(ordered[0] ?? "")];
	return (last ? all.slice(-(room - 1)) : all.slice(0, room - 1)).join("");
}

const framedPiece = (label: string, text: string) => {
	const fence = fenceOf(text);
	return [`${fence}${label}`, ...text.split("\n"), fence];
};

// A piece holds at least one character, with its newline.
const MIN_ROOM = 2;

// The cut block for pieces of at most `room` characters each. A piece grows with
// `room` and keeps its start (head) or end (tail), so the cost never falls as `room` rises.
export function cutBlock(
	block: FencedBlock,
	room: number,
	full: string,
	secretsIn: (text: string) => number,
): string[] {
	const text = block.lines.join("\n");
	const head = piece(block.lines, room, false);
	const tail = piece(block.lines, room, true);
	const secrets = secretsIn(text) - secretsIn(head) - secretsIn(tail);
	const kept = `${cost(head.split("\n"))}+${cost(tail.split("\n"))}`;
	return [
		...(block.head === undefined ? [] : [block.head]),
		...framedPiece(block.label, head),
		`cut kept=${kept} of=${cost(block.lines)} secrets=${secrets}`,
		full,
		...framedPiece(block.label, tail),
	];
}

// A fenced text whose block costs more than `size` becomes a head, a `cut` line,
// the `full` line and a tail, each piece in a fence of its own. The pieces are the
// longest whose block fits, found by binary search. When not even the shortest
// fits, the text stays whole and `pack` splits it by lines.
export function cutToFit(
	block: FencedBlock,
	size: number,
	full: string,
	secretsIn: (text: string) => number,
): Block {
	if (cost(render(block)) <= size || block.lines.length === 0) return block;
	const build = (room: number) => cutBlock(block, room, full, secretsIn);
	let lo = MIN_ROOM;
	let hi = Math.floor(Math.min(size, cost(block.lines)) / 2);
	if (hi < lo || cost(build(lo)) > size) return block;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (cost(build(mid)) <= size) lo = mid;
		else hi = mid - 1;
	}
	return { whole: build(lo) };
}

const PREFIX = 2;

function cut(block: Block, size: number): Block[] {
	if ("line" in block || "whole" in block) return [block];
	const head = block.head === undefined ? 0 : chars(block.head);
	if ("law" in block) {
		const [first = [], ...rest] = runs(block.law, size - head, PREFIX);
		const tail = rest.length === 0 ? [] : runs(rest.flat(), size, PREFIX);
		return [{ ...block, law: first }, ...tail.map((law) => ({ law }))];
	}
	const frame = cost([`${block.fence}${block.label}`, block.fence]);
	const { head: _, ...bare } = block;
	return runs(block.lines, size - frame - head, 0).map((lines, i) =>
		i === 0 ? { ...block, lines } : { ...bare, lines },
	);
}

// The parts of a group: each block whole when it fits, else cut by lines.
export function pack(blocks: Block[], size: number): string[][] {
	const parts: string[][] = [[]];
	let used = 0;
	const place = (lines: string[]) => {
		const n = cost(lines);
		if (used + n > size && (parts.at(-1)?.length ?? 0) > 0) {
			parts.push([]);
			used = 0;
		}
		parts.at(-1)?.push(...lines);
		used += n;
	};
	for (const block of blocks) {
		const lines = render(block);
		if (cost(lines) <= size) place(lines);
		else for (const piece of cut(block, size)) place(render(piece));
	}
	return parts;
}

// each part between its first line, which names the form, and its last
export function framed(
	parts: string[][],
	fields: (k: number) => string,
): string[] {
	return parts.map((lines, i) =>
		[
			`lawman input ${INPUT_FORM} ${fields(i + 1)} part ${i + 1} of ${parts.length}`,
			...lines,
			`end part ${i + 1} of ${parts.length}`,
		].join("\n"),
	);
}

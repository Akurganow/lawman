import { fenceOf } from "./fence";

// The version of the input's form. A role tells an old binary's output by it.
export const INPUT_FORM = 1;
export const DEFAULT_INPUT_CHARS = 16000;

// A journal line is never cut. Law lines print behind "| ". A fenced text
// keeps one fence for all its pieces, and its head line goes with the first.
export type Block =
	| { line: string }
	| { law: string[] }
	| { head?: string; label: string; fence: string; lines: string[] };

export function fencedBlock(label: string, text: string, head?: string): Block {
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
	if ("law" in block) return block.law.map(lawLine);
	const { head, label, fence, lines } = block;
	return [
		...(head === undefined ? [] : [head]),
		`${fence}${label}`,
		...lines,
		fence,
	];
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

const PREFIX = 2;

function cut(block: Block, size: number): Block[] {
	if ("line" in block) return [block];
	if ("law" in block)
		return runs(block.law, size, PREFIX).map((law) => ({ law }));
	const frame = cost([`${block.fence}${block.label}`, block.fence]);
	const { head, ...bare } = block;
	const room = size - frame - (head === undefined ? 0 : chars(head));
	return runs(block.lines, room, 0).map((lines, i) =>
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

export const endLine = (k: number, n: number) => `end part ${k} of ${n}`;

// the first line of a part, the fields between the form and the part number
export const firstLine = (fields: string, k: number, n: number) =>
	`lawman input ${INPUT_FORM} ${fields} part ${k} of ${n}`;

export function framed(
	parts: string[][],
	fields: (k: number) => string,
): string[] {
	return parts.map((lines, i) =>
		[
			firstLine(fields(i + 1), i + 1, parts.length),
			...lines,
			endLine(i + 1, parts.length),
		].join("\n"),
	);
}

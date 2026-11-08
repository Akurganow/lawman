import { describe, expect, test } from "bun:test";
import { fenceOf } from "./fence";
import { type Block, fencedBlock, pack, renderAll } from "./input-parts";

const cost = (lines: string[]) =>
	lines.reduce((n, l) => n + [...l].length + 1, 0);

describe("pack", () => {
	const blocks: Block[] = [
		{ line: "order 1 main o/main - 3" },
		{ law: ["# A", "", "a line of the law", "`code` at the start"] },
		fencedBlock("issue", "one\n~~~~\ntwo\nthree\nfour", "comment at=t"),
	];

	test("a group within the size is one part, byte for byte", () => {
		expect(pack(blocks, 10_000)).toEqual([renderAll(blocks).split("\n")]);
	});

	test.each([40, 64, 100])(
		"at size %d each part fits and each cut piece keeps its label and takes the fence of its own lines",
		(size) => {
			const parts = pack(blocks, size);
			expect(parts.length).toBeGreaterThan(1);
			for (const part of parts) {
				expect(cost(part)).toBeLessThanOrEqual(size);
				expect(part.some((l) => l.startsWith("`"))).toBe(false);
			}
			// each piece takes the fence of its own lines
			const bodies: string[] = [];
			const fences = new Set<string>();
			for (const part of parts) {
				let open: { fence: string; body: string[] } | undefined;
				for (const l of part) {
					if (open === undefined) {
						const m = /^(~+)issue$/.exec(l);
						if (m) open = { fence: m[1] ?? "", body: [] };
					} else if (l === open.fence) {
						expect(open.fence).toBe(fenceOf(open.body.join("\n")));
						fences.add(open.fence);
						bodies.push(...open.body);
						open = undefined;
					} else open.body.push(l);
				}
				expect(open).toBeUndefined();
			}
			expect(bodies).toEqual(["one", "~~~~", "two", "three", "four"]);
			expect(fences.size).toBeGreaterThan(1);
			expect(parts.flat().filter((l) => l.startsWith("comment at="))).toEqual([
				"comment at=t",
			]);
		},
	);

	test("a line longer than the size is cut by characters, each piece behind the prefix", () => {
		const parts = pack([{ law: ["é".repeat(25)] }], 10);
		expect(parts).toEqual([
			["| ééééééé"],
			["| ééééééé"],
			["| ééééééé"],
			["| éééé"],
		]);
	});

	test("a fenced line longer than the size is cut into pieces of the same fence", () => {
		const parts = pack([fencedBlock("title", "x".repeat(12))], 14);
		for (const part of parts) expect(part[0]).toBe("~~~title");
		expect(parts.flatMap((p) => p.slice(1, -1)).join("")).toBe("x".repeat(12));
	});
});

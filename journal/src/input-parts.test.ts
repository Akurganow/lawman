import { describe, expect, test } from "bun:test";
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
		"at size %d each part fits and a cut fence keeps its label and its length",
		(size) => {
			const parts = pack(blocks, size);
			expect(parts.length).toBeGreaterThan(1);
			for (const part of parts) {
				expect(cost(part)).toBeLessThanOrEqual(size);
				expect(part.some((l) => l.startsWith("`"))).toBe(false);
			}
			const fences = parts.flat().filter((l) => /^~+issue$/.test(l));
			expect(new Set(fences)).toEqual(new Set(["~~~~~issue"]));
			expect(parts.flat().filter((l) => l.startsWith("comment at="))).toEqual([
				"comment at=t",
			]);
			// the pieces of a cut fence join again once each repeated close and open goes
			const joined = parts
				.flat()
				.filter(
					(l, i, all) =>
						!(l === "~~~~~" && all[i + 1] === "~~~~~issue") &&
						!(l === "~~~~~issue" && all[i - 1] === "~~~~~"),
				);
			expect(joined).toEqual(renderAll(blocks).split("\n"));
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

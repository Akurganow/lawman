import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	DUTY_DESK,
	HARNESS_SECTIONS,
	inputOf,
	lawOf,
	TICK_ORDER,
	WHOLE,
} from "./input-roles";
import { ROLE_NAMES } from "./input-test-fixture";
import { sectionsOf } from "./law-sections";
import { LAW } from "./test-helpers";

const read = (path: string) => readFileSync(join(LAW, path), "utf8");

describe("the role table", () => {
	test.each(ROLE_NAMES)(
		"every section of %s stands in the law of this commit",
		(role) => {
			const reads = lawOf(role);
			expect(reads.length).toBeGreaterThan(0);
			for (const [path, wanted] of reads) {
				const found = sectionsOf(read(path), wanted);
				const missing = wanted.filter((_, i) => found[i] === null);
				expect([path, missing]).toEqual([path, []]);
			}
		},
	);

	test("every role has its precedents, the duty desk none", () => {
		const precedents = Object.fromEntries(
			ROLE_NAMES.map((role) => [role, inputOf(role)?.precedents]),
		);
		expect(precedents).toEqual({
			patrol: "order",
			"response-unit": "stage",
			investigation: "stage",
			prosecutor: "all",
			defender: "all",
			court: "all",
			clerk: null,
			"spec-writer": "all",
			executor: "all",
			[DUTY_DESK]: undefined,
		});
	});

	test("every section of the harness page stands on the Hermes page", () => {
		const page = read(join("harnesses", "hermes.md"));
		expect(sectionsOf(page, HARNESS_SECTIONS)).not.toContain(null);
	});

	test("the sections of tick.md stand in the order of the document", () => {
		const headings = [...read("tick.md").matchAll(/^## (.+)$/gm)].map(
			(m) => m[1] ?? "",
		);
		expect(TICK_ORDER).toEqual(["intro", ...headings]);
		for (const role of ROLE_NAMES)
			for (const [path, wanted] of lawOf(role)) {
				const starts = sectionsOf(read(path), wanted).map((lines) =>
					wanted.includes(WHOLE)
						? 0
						: read(path).indexOf((lines ?? [])[0] ?? ""),
				);
				expect([role, path, starts]).toEqual([
					role,
					path,
					[...starts].sort((a, b) => a - b),
				]);
			}
	});
});

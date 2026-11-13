import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	DUTY_DESK,
	HARNESS_SECTIONS,
	INTRO,
	inputOf,
	LAW_MAP,
	lawMap,
	lawOf,
	lawSections,
	TICK_ORDER,
	WHOLE,
} from "./input-roles";
import { ROLE_NAMES } from "./input-test-fixture";
import { HEADINGS } from "./law-links-fixture";
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

	test("a section that names a reader which is not a role stops the map", () => {
		expect(() => lawMap([["Writing", ["patrol", "patrolman"]]])).toThrow(
			/"patrolman", which is not a role/,
		);
		expect(() => lawMap([["Writing", ["duty-desk"]]])).not.toThrow();
	});

	test("lawSections stops on a name that is no role", () => {
		expect(() => lawSections("patrolman")).toThrow(/"patrolman" is not a role/);
		expect(lawSections("patrol").length).toBeGreaterThan(0);
	});

	test("every section of LAW.md has a reader or a row with none, and the whole file counts as every section", () => {
		const sections = [INTRO, ...(HEADINGS["LAW.md"] ?? [])];
		const read = new Set(
			ROLE_NAMES.flatMap((role) =>
				lawOf(role)
					.filter(([path]) => path === "LAW.md")
					.flatMap(([, wanted]) =>
						wanted.includes(WHOLE) ? sections : wanted,
					),
			),
		);
		expect(sections.filter((s) => !read.has(s))).toEqual(
			LAW_MAP.filter(([, readers]) => readers.length === 0).map(([s]) => s),
		);
	});

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

	test("only patrol and the response unit receive a dismissal", () => {
		const dismissals = Object.fromEntries(
			ROLE_NAMES.map((role) => [role, inputOf(role)?.dismissals]),
		);
		expect(dismissals).toEqual({
			patrol: true,
			"response-unit": true,
			investigation: false,
			prosecutor: false,
			defender: false,
			court: false,
			clerk: false,
			"spec-writer": false,
			executor: false,
			[DUTY_DESK]: undefined,
		});
	});

	test("every section of the harness page stands on the Hermes page", () => {
		const page = read(join("harnesses", "hermes.md"));
		expect(sectionsOf(page, HARNESS_SECTIONS)).not.toContain(null);
	});

	test("the section for an older journal follows Sync the law and no role reads it", () => {
		const at = TICK_ORDER.indexOf("Sync the law");
		expect(TICK_ORDER[at + 1]).toBe("Sync the law with an older journal");
		for (const role of ROLE_NAMES)
			for (const [, wanted] of lawOf(role))
				expect(wanted).not.toContain("Sync the law with an older journal");
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

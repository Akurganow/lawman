import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Heading, Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { sectionsOf } from "./law-sections";
import { LAW } from "./test-helpers";

const PAGES = join(LAW, "harnesses");
const NOT_A_SECTION = "What a second harness needs";

const read = (name: string) => readFileSync(join(PAGES, name), "utf8");
const parse = (text: string) => unified().use(remarkParse).parse(text) as Root;
const nameOf = (text: string, h: Heading) =>
	text.slice(
		h.children[0]?.position?.start.offset ?? 0,
		h.children.at(-1)?.position?.end.offset ?? 0,
	);

// every heading below the title of the Hermes page, read on the fly
function hermesSections(): string[] {
	const text = read("hermes.md");
	return parse(text)
		.children.filter((n): n is Heading => n.type === "heading" && n.depth >= 2)
		.map((h) => nameOf(text, h))
		.filter((name) => name !== NOT_A_SECTION);
}

// the sections whose heading is missing, or ends in nothing or in a heading of its own level or above
function bodiless(text: string, wanted: string[]): string[] {
	const nodes = parse(text).children;
	return wanted.filter((name) => {
		const at = nodes.findIndex(
			(n) => n.type === "heading" && nameOf(text, n) === name,
		);
		const own = nodes[at];
		const next = nodes[at + 1];
		return (
			own?.type !== "heading" ||
			next === undefined ||
			(next.type === "heading" && next.depth <= own.depth)
		);
	});
}

const others = readdirSync(PAGES)
	.filter((f) => f.endsWith(".md") && f !== "hermes.md")
	.sort();

describe("the harness pages", () => {
	const wanted = hermesSections();

	test("the Hermes page gives the set of sections", () => {
		expect(wanted).toContain("Installing the plugin");
		expect(wanted).toContain("Role entry");
		expect(wanted).toContain("Silence");
		expect(wanted).not.toContain(NOT_A_SECTION);
	});

	test("a page stands beside Hermes", () => {
		expect(others).toContain("openclaw.md");
	});

	test.each(others)(
		"%s answers every section of the Hermes page and keeps the silence words",
		(file) => {
			const text = read(file);
			const found = sectionsOf(text, wanted);
			expect(wanted.filter((_, i) => found[i] === null)).toEqual([]);
			expect(bodiless(text, wanted)).toEqual([]);
			const [silence] = sectionsOf(text, ["Silence"]);
			const words = (silence ?? []).join("\n");
			expect(words).toContain("`NO_REPLY`");
			expect(words.match(/no_reply/gi)?.every((m) => m === "NO_REPLY")).toBe(
				true,
			);
			expect(words).toContain("own line");
			expect(words).toContain("alarm line");
		},
	);

	test.each(others)(
		"%s starts Installing the plugin with the detection command",
		(file) => {
			const [lines] = sectionsOf(read(file), ["Installing the plugin"]);
			const first = (lines ?? []).slice(1).find((l) => l.trim() !== "");
			expect(first).toMatch(/^Detection: `[a-z]+ --version`/);
		},
	);
});

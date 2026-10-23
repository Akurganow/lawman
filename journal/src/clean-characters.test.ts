import { describe, expect, test } from "bun:test";
import { stripInvisible } from "./clean";

const span = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) =>
		String.fromCodePoint(from + i),
	).join("");

describe("invisible characters", () => {
	const groups: [string, string][] = [
		["tag characters", `\u{E0001}${span(0xe0020, 0xe007f)}`],
		["zero width space and non-joiner", "\u200B\u200C"],
		["directional marks", "\u200E\u200F\u061C"],
		[
			"embeddings, overrides and isolates",
			`${span(0x202a, 0x202e)}${span(0x2066, 0x2069)}`,
		],
		[
			"soft hyphen, vowel separator, joiners and operators, byte order mark",
			`\u00AD\u180E${span(0x2060, 0x2064)}\uFEFF`,
		],
		[
			"variation selectors after a space",
			`${span(0xfe00, 0xfe0f)}${span(0xe0100, 0xe01ef)}`,
		],
	];

	test.each(groups)("%s are removed everywhere", (_, hidden) => {
		for (const ch of hidden)
			expect(stripInvisible(`a ${ch}b \`c${ch}d\``)).toBe("a b `cd`");
	});

	test("the zero width joiner stays", () => {
		const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
		expect(stripInvisible(family)).toBe(family);
	});

	test("one selector directly after a graphic base stays", () => {
		for (const kept of [
			"\u2708\uFE0F",
			"1\uFE0F\u20E3",
			"#\uFE0E",
			"\u845B\u{E0100}",
		])
			expect(stripInvisible(kept)).toBe(kept);
	});

	test("a run of selectors goes, but for one directly after a graphic base", () => {
		expect(stripInvisible("\u2708\uFE0F\uFE00\uFE01\u{E0110}x")).toBe(
			"\u2708\uFE0Fx",
		);
		expect(stripInvisible("a \uFE00\uFE01\u{E0110}b")).toBe("a b");
	});

	test("a selector with no graphic base goes", () => {
		expect(stripInvisible("\uFE0Fstart")).toBe("start");
		expect(stripInvisible("a\uFE0F")).toBe("a");
		expect(stripInvisible("\u200B\uFE0Fx")).toBe("x");
		expect(stripInvisible("\u2708\u{E0100}")).toBe("\u2708");
		expect(stripInvisible("1\uFE00")).toBe("1");
	});

	test("visible text stays byte-exact", () => {
		const text =
			"\u00DCn\u00EFcode \u0442\u0435\u043A\u0441\u0442 \u6F22\u5B57 \u00A0 tab\there\n";
		expect(stripInvisible(text)).toBe(text);
	});
});

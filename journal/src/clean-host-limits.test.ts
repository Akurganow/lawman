import { describe, expect, spyOn, test } from "bun:test";
import * as cleaners from "./clean";
import { cleanHostText } from "./clean-host";

const MARKER =
	"<!-- lawman: role=court stage=ruling at=2026-10-14T09:30:00Z -->";
const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");

const clean = async (text: string) => cleanHostText(text);

describe("a cleaning failure reaches the caller", () => {
	const failing = (calls: number) => {
		const original = cleaners.maskSecrets;
		let seen = 0;
		return spyOn(cleaners, "maskSecrets").mockImplementation(async (text) => {
			seen += 1;
			if (seen > calls) throw new Error("rules failed");
			return original(text);
		});
	};

	test.each([
		["at the first mask", 0],
		["inside the tree", 1],
	])("a mask that fails %s rejects", async (_, calls) => {
		const mask = failing(calls);
		try {
			await expect(cleanHostText(`a *b* ${TOKEN}\n${MARKER}`)).rejects.toThrow(
				"rules failed",
			);
		} finally {
			mask.mockRestore();
		}
	});

	test("input too deep for the libraries rejects", async () => {
		const deep = `${MARKER}\n${"<b>".repeat(50_000)}<img src=x>`;
		await expect(clean(deep)).rejects.toThrow();
	});
});

describe("cleaning repeats and large input", () => {
	test("64 KiB of comment openers is cleaned", async () => {
		expect(await clean("<!--".repeat(16_384))).toBe("");
		expect(await clean(`${"<!-".repeat(21_845)}-> visible`)).toBe(
			`${"\\<!-".repeat(21_844)} visible`,
		);
	});

	test("empty input gives empty output", async () => {
		expect(await clean("")).toBe("");
	});

	test("the same input gives the same output", async () => {
		const input = `![a](u) <!-- x --> ${TOKEN}\n${MARKER}`;
		expect(await clean(input)).toBe(await clean(input));
	});

	test("cleaning a cleaned output changes nothing", async () => {
		const out = await clean(
			`![a](u) <!-- c --> *b*\n> <!-- open\n\ntext ${TOKEN}\n${MARKER}`,
		);
		expect(await clean(out)).toBe(out);
	});
});

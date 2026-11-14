import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lines } from "./input-test-fixture";

const fixture = (name: string) =>
	readFileSync(join(import.meta.dir, "fixtures", name), "utf8");

// the rule of the sentence: output that is not empty and does not open with the form line
const isOld = (output: string) =>
	output !== "" && !(output.split("\n")[0] ?? "").startsWith("lawman input");

describe("the output of the journal 0.23.1 against the new input", () => {
	test("the old output without work reads as old", () => {
		expect(isOld(fixture("old-wake-idle.txt"))).toBe(true);
	});

	test("the old output with work lists the orders and the time, and reads as old", () => {
		const old = fixture("old-wake-work.txt");
		expect(
			lines(old)
				.slice(0, -1)
				.every((l) => /^order \d+$/.test(l)),
		).toBe(true);
		expect(lines(old).at(-1)).toMatch(/^at \S+$/);
		expect(isOld(old)).toBe(true);
	});
});

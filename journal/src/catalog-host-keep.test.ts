import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./test-helpers";

const install = readFileSync(
	join(ROOT, "skills", "assembly", "references", "install.md"),
	"utf8",
);
const SECTION = "`## Dependency reading`";

function between(start: RegExp, end: RegExp): string {
	const [, after = ""] = install.split(start);
	return after.split(end)[0] ?? "";
}

describe("the Host part keeps the reading-way entries", () => {
	const host = between(/^## Host$/m, /^## /m);
	const apply = between(/^### Write the host notes$/m, /^##/m);

	test("part Host names the section and keeps its lines", () => {
		expect(host).toContain(SECTION);
		expect(host).toMatch(/keeps every line/);
	});

	test("the Apply step reads the old section and carries its lines over", () => {
		expect(apply).toContain(SECTION);
		expect(apply).toMatch(/Read the existing `host\.md` first/);
		expect(apply).toMatch(/over unchanged/);
	});
});

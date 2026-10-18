import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json";

const ROOT = join(import.meta.dir, "..");

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

describe("manifests", () => {
	test("plugin.json version equals package.json version", () => {
		const plugin = readJson("plugin.json") as { version: unknown };
		expect(plugin.version).toBe(pkg.version);
	});

	test("the marketplace entry named lawman has source ./", () => {
		const marketplace = readJson(".claude-plugin/marketplace.json") as {
			plugins: { name: string; source: unknown }[];
		};
		const entry = marketplace.plugins.find((p) => p.name === "lawman");
		expect(entry).toBeDefined();
		expect(entry?.source).toBe("./");
	});
});

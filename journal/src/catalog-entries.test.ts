import { describe, expect, test } from "bun:test";
import {
	isEcosystem,
	isPackageName,
	isPlace,
	isRecordId,
	isVersion,
	leadIdentity,
	parseList,
	parseSourceLine,
	sourceLine,
	splitPackageToken,
	UNRESOLVED_VERSION,
} from "./catalog-entries";
import { canonicalId } from "./markers";

const HIDDEN = ["a​b", "a‮b", "a\u0000b", "a b", "é"];
const HOSTILE = ["a b", "a\tb", "a\nb", "a`b", 'a"b', "a'b", ...HIDDEN];
const LONG = "a".repeat(600);

const CLASSES: [
	string,
	(v: string) => boolean,
	admitted: string[],
	refused: string[],
][] = [
	[
		"place",
		isPlace,
		["package-lock.json", "services/api/requirements.txt", "a/@b/c+d.lock"],
		[
			"",
			"/abs",
			"./a",
			"a/../b",
			"a/./b",
			"a//b",
			"a/",
			"a\\b",
			"..",
			".",
			LONG,
			...HOSTILE,
		],
	],
	[
		"ecosystem",
		isEcosystem,
		["npm", "PyPI", "crates.io", "Debian:11"],
		["", "1npm", "a/b", "npm ", LONG, ...HOSTILE],
	],
	[
		"package",
		isPackageName,
		["lodash", "@scope/name", "github.com/x/y", "org.x:artifact", "a+b"],
		["", "-x", "/x", LONG, ...HOSTILE],
	],
	[
		"version",
		isVersion,
		["4.17.15", "1.0.0+build.5", "2:1.0~rc1", "v1.2.3-beta.1"],
		["", "-", "+1", LONG, ...HOSTILE],
	],
	[
		"record identifier",
		isRecordId,
		["GHSA-29mw-wpgm-hmr9", "CVE-2020-1234", "RUSTSEC-2020-0001"],
		["", "-GHSA", "a/b", "a:b", LONG, ...HOSTILE],
	],
];

describe("value classes", () => {
	for (const [name, check, admitted, refused] of CLASSES) {
		test.each(admitted)(`${name} admits %p`, (v) => {
			expect(check(v)).toBe(true);
		});
		test.each(refused)(`${name} refuses %p`, (v) => {
			expect(check(v)).toBe(false);
		});
	}
});

describe("parseList", () => {
	const line = (...f: string[]) => f.join("\t");

	test("sorts entries into sendable, refused and unresolved by number", () => {
		const input = [
			line("a/lock", "npm", "lodash", "4.17.15"),
			"",
			line("/bad", "npm", "x", "1"),
			line("b/lock", "PyPI", "django", UNRESOLVED_VERSION),
			line("c/lock", "npm", "y", "bad version"),
			line("d/lock", "npm", "z"),
			line("e/lock", "npm", "z", "1", "extra"),
			line("f/lock", "npm", "ok", "2.0.0"),
		].join("\n");
		const parsed = parseList(input);
		expect(parsed.entries.map((e) => e.number)).toEqual([1, 7]);
		expect(parsed.entries[0]).toEqual({
			number: 1,
			place: "a/lock",
			ecosystem: "npm",
			name: "lodash",
			version: "4.17.15",
		});
		expect(parsed.unresolved).toEqual([3]);
		expect(parsed.refused).toEqual([2, 4, 5, 6]);
	});

	test("an unresolved entry with a refused place is refused", () => {
		const parsed = parseList(line("../x", "npm", "p", UNRESOLVED_VERSION));
		expect(parsed).toEqual({ entries: [], refused: [1], unresolved: [] });
	});

	test("a field holding the text undefined is not a missing field", () => {
		expect(parseList("a\tnpm").refused).toEqual([1]);
	});

	test("an empty input is an empty list", () => {
		expect(parseList("")).toEqual({ entries: [], refused: [], unresolved: [] });
	});

	test("a hostile line is named by number only", () => {
		const parsed = parseList(line("a", "npm", "`rm -rf`", "1"));
		expect(JSON.stringify(parsed)).not.toContain("rm");
		expect(parsed.refused).toEqual([1]);
	});
});

describe("source line and identity", () => {
	test("a line round-trips through its builder and parser", () => {
		const built = sourceLine("GHSA-29mw-wpgm-hmr9", "npm", "@scope/name");
		expect(built).toBe("Source: catalog GHSA-29mw-wpgm-hmr9 npm/@scope/name");
		expect(parseSourceLine(built)).toEqual({
			id: "GHSA-29mw-wpgm-hmr9",
			ecosystem: "npm",
			name: "@scope/name",
		});
	});

	test("two ecosystems with one name never share a token", () => {
		expect(sourceLine("CVE-1", "npm", "x")).not.toBe(
			sourceLine("CVE-1", "PyPI", "x"),
		);
	});

	test.each([
		"",
		"Source: catalog",
		"Source: catalog GHSA-1",
		"Source: catalog GHSA-1 npm",
		"Source: catalog GHSA-1 /name",
		"Source: catalog GHSA-1 npm/",
		"Source: catalog GHSA-1 npm/name extra",
		"Source: catalog GHSA-1  npm/name",
		"Source: catalog GHSA-1 npm/name\n",
		"Source: catalog a`b npm/name",
		"Source: catalog GHSA-1 npm/na`me",
		"Source: catalog GHSA-1 npm/na​me",
		"Source: catalog GHSA-1\nSource: catalog GHSA-2 npm/name",
		"source: catalog GHSA-1 npm/name",
	])("a line outside the classes is refused: %p", (value) => {
		expect(parseSourceLine(value)).toBeNull();
	});

	test("a package token without a separator has no parts", () => {
		expect(splitPackageToken("npm")).toBeNull();
	});

	test("the identity is canonical and holds no version", () => {
		const id = leadIdentity("a/lock", "GHSA-29mw-wpgm-hmr9", "npm", "@s/n");
		expect(canonicalId(id)).toBe(true);
		expect(id.endsWith("::advisory")).toBe(true);
		expect(id.startsWith("a/lock::GHSA-29mw-wpgm-hmr9/")).toBe(true);
	});

	test("an identity is the same for any version and differs by place", () => {
		const a = leadIdentity("a/lock", "CVE-1", "npm", "x");
		expect(a).toBe(leadIdentity("a/lock", "CVE-1", "npm", "x"));
		expect(a).not.toBe(leadIdentity("b/lock", "CVE-1", "npm", "x"));
	});
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { join } from "node:path";
import { MIGRATIONS } from "./db";
import {
	CONFIG,
	configOf,
	flags,
	LAW_COMMIT,
	lay,
	leftovers,
	noDatabase,
	OLD_BINARY,
	OLD_COMMIT,
	type Result,
	type Runner,
	shasum,
	snapshot,
	TAG,
	TYPESAFE_ENV,
} from "./law-sync-test-fixture";
import { dir, tempDb } from "./test-helpers";

const SYNCED = `synced ${TAG}\n`;
const EXECUTABLE = 0o111;
const READ_ONLY = 0o555;
const NO_ACCESS = 0o000;
const OWNER_ONLY = 0o600;
const ALL_WRITABLE = 0o755;
const PERMISSION_BITS = 0o777;
const alarmLine = (law: string, config: string) =>
	`ALARM contract-changed installation constitution contract ${law}, precincts at ${config}, run the assembly to amend\n`;

export function defineCases(runner: Runner): void {
	tempDb();
	let root = "";
	beforeEach(() => {
		root = join(dir, "installation");
	});
	const bin = () => join(root, "bin", "journal");
	const config = () => join(root, "config.yaml");
	const sync = (exe: string, args = flags(root)): Result =>
		runner.run(args, exe);
	const synced = (name: string) => {
		const result = sync(runner.exe(root, name));
		expect(result).toMatchObject({ code: 0, err: "" });
		return result;
	};
	const syncedSum = () => {
		const exe = runner.exe(root, "tick1");
		const sum = shasum(exe);
		sync(exe);
		return sum;
	};
	const unchanged = (exe: string, args: string[], code?: number) => {
		const before = snapshot(root);
		const result = sync(exe, args);
		if (code === undefined) expect(result.code).not.toBe(0);
		else expect(result.code).toBe(code);
		expect(result.out).toBe("");
		expect(snapshot(root)).toEqual(before);
		return result;
	};

	describe("success", () => {
		test("renames itself over bin/journal and records the release", () => {
			lay(root);
			const exe = runner.exe(root, "tick1");
			const bytes = readFileSync(exe);
			const sum = shasum(exe);
			expect(sync(exe)).toEqual({ code: 0, out: SYNCED, err: "" });
			expect(existsSync(exe)).toBe(false);
			expect(statSync(bin()).mode & EXECUTABLE).not.toBe(0);
			expect(Buffer.compare(readFileSync(bin()), bytes)).toBe(0);
			expect(configOf(root)).toContain(`law_commit: ${LAW_COMMIT}\n`);
			expect(configOf(root)).toContain(`release_tag: ${TAG}\n`);
			expect(configOf(root)).toContain(`journal_sha256: ${sum}\n`);
			expect(noDatabase(root)).toEqual([]);
			expect(existsSync(join(dir, "journal.sqlite"))).toBe(false);
		});

		test("a second run from a fresh copy leaves the same bytes and lines", () => {
			lay(root);
			const first = synced("tick1");
			const config1 = configOf(root);
			const binary1 = readFileSync(bin());
			const second = synced("tick2");
			expect(second).toEqual(first);
			expect(configOf(root)).toBe(config1);
			expect(Buffer.compare(readFileSync(bin()), binary1)).toBe(0);
		});
	});

	describe("config rewrite", () => {
		test("keeps unknown lines, comments and order, and appends what is absent", () => {
			lay(root);
			const sum = syncedSum();
			expect(configOf(root)).toBe(
				`${CONFIG.replace(OLD_COMMIT, LAW_COMMIT)}release_tag: ${TAG}\njournal_sha256: ${sum}\ntypesafe_key: ${TYPESAFE_ENV}\namended_law_commit: ${OLD_COMMIT}\n`,
			);
		});

		test("replaces present keys in place and never overwrites a present default", () => {
			const text = `release_tag: v0.1.0\nlaw_commit: ${OLD_COMMIT}\ntypesafe_key: the keychain\njournal_sha256: 0\namended_law_commit: ${"a".repeat(40)}\n`;
			lay(root, { config: text });
			const sum = syncedSum();
			expect(configOf(root)).toBe(
				`release_tag: ${TAG}\nlaw_commit: ${LAW_COMMIT}\ntypesafe_key: the keychain\njournal_sha256: ${sum}\namended_law_commit: ${"a".repeat(40)}\n`,
			);
		});

		test("starts the appended lines on a new line when the file has no final newline", () => {
			lay(root, { config: `law_commit: ${OLD_COMMIT}` });
			synced("tick1");
			expect(configOf(root)).toMatch(
				new RegExp(`^law_commit: ${LAW_COMMIT}\\nrelease_tag: `),
			);
		});

		test("keeps the file mode of the old config", () => {
			lay(root);
			chmodSync(config(), OWNER_ONLY);
			synced("tick1");
			expect(statSync(config()).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
		});
	});

	describe("defaults", () => {
		test.each([
			["typesafe: yes", TYPESAFE_ENV],
			["typesafe: no", "none"],
			["trusted_login: x", "none"],
		])("%s gives typesafe_key %s", (line, value) => {
			lay(root, { config: `law_commit: ${OLD_COMMIT}\n${line}\n` });
			synced("tick1");
			expect(configOf(root)).toContain(`typesafe_key: ${value}\n`);
		});
	});

	describe("schema", () => {
		test("skills that name 3, 4, 5 and 6 sync", () => {
			lay(root, { schemas: [3, 4, 5, 6] });
			expect(synced("tick1").out).toBe(SYNCED);
		});

		test("a schema above the binary's exits 6 and changes nothing", () => {
			lay(root, { schemas: [3, MIGRATIONS.length + 1] });
			const result = unchanged(runner.exe(root, "tick1"), flags(root), 6);
			expect(result.err).toContain(`schema ${MIGRATIONS.length + 1}`);
			expect(leftovers(root)).toEqual([]);
		});
	});

	describe("contract", () => {
		test("reads the frontmatter value, not the example below it", () => {
			lay(root, { contract: "2" });
			expect(synced("tick1").out).toBe(SYNCED);
		});

		test("a different value prints the alarm first and keeps the value", () => {
			lay(root, {
				config: CONFIG.replace("contract_version: 2", "contract_version: 1"),
			});
			expect(synced("tick1").out).toBe(`${alarmLine("2", "1")}${SYNCED}`);
			expect(configOf(root)).toContain("contract_version: 1\n");
		});

		test("an absent key prints the alarm with none, is not written and repeats", () => {
			lay(root, { config: CONFIG.replace("contract_version: 2\n", "") });
			const expected = `${alarmLine("2", "none")}${SYNCED}`;
			expect(synced("tick1").out).toBe(expected);
			expect(configOf(root)).not.toContain("contract_version");
			expect(synced("tick2").out).toBe(expected);
			expect(configOf(root)).not.toContain("contract_version");
		});
	});

	describe("local only", () => {
		test("syncs with a PATH that holds neither git nor gh", () => {
			lay(root);
			const empty = join(dir, "empty");
			mkdirSync(empty);
			const exe = runner.exe(root, "tick1");
			expect(runner.run(flags(root), exe, empty)).toEqual({
				code: 0,
				out: SYNCED,
				err: "",
			});
		});
	});

	describe("write failure", () => {
		test("keeps the new binary and the old config, and a rerun completes", () => {
			lay(root);
			const exe = runner.exe(root, "tick1");
			const bytes = readFileSync(exe);
			const before = configOf(root);
			chmodSync(root, READ_ONLY);
			let result: Result;
			try {
				result = sync(exe);
			} finally {
				chmodSync(root, ALL_WRITABLE);
			}
			expect(result.code).not.toBe(0);
			expect(result.out).toBe("");
			expect(Buffer.compare(readFileSync(bin()), bytes)).toBe(0);
			expect(configOf(root)).toBe(before);
			expect(leftovers(root)).toEqual([]);
			expect(synced("tick2").out).toBe(SYNCED);
			expect(configOf(root)).toContain(`law_commit: ${LAW_COMMIT}\n`);
		});
	});

	describe("usage and validation", () => {
		const bad = (name: string, args: (full: string[]) => string[]) =>
			test(name, () => {
				lay(root);
				const result = unchanged(
					runner.exe(root, "tick1"),
					args(flags(root)),
					1,
				);
				expect(result.err).toContain("usage:");
			});
		for (const flag of ["--tag", "--commit", "--installation"]) {
			bad(`a missing ${flag} exits 1`, (full) => {
				const at = full.indexOf(flag);
				return full.filter((_, i) => i !== at && i !== at + 1);
			});
			bad(`a repeated ${flag} exits 1`, (full) => {
				const at = full.indexOf(flag);
				return [...full, ...full.slice(at, at + 2)];
			});
		}
		bad("an unknown flag exits 1", (full) => [...full, "--force", "x"]);
		bad("a flag without a value exits 1", (full) => full.slice(0, -1));

		test.each([
			["upper-case hex", "A".repeat(40)],
			["39 digits", "a".repeat(39)],
			["41 digits", "a".repeat(41)],
			["a trailing newline", `${"a".repeat(40)}\n`],
			["non-hex letters", "g".repeat(40)],
		])("a --commit with %s exits 1", (_, commit) => {
			lay(root);
			const args = flags(root);
			args[3] = commit;
			unchanged(runner.exe(root, "tick1"), args, 1);
		});

		test.each([
			["empty", ""],
			["a space", "v1 0"],
			["a semicolon", "v1;0"],
			["a dollar sign", "v1$0"],
			["a parenthesis", "v1(0"],
			["a newline", "v1\n0"],
		])("a --tag that is %s exits 1", (_, tag) => {
			lay(root);
			const args = flags(root);
			args[1] = tag;
			unchanged(runner.exe(root, "tick1"), args, 1);
		});

		test("an absent law_commit exits 1 and changes nothing", () => {
			lay(root, { config: "trusted_login: x\n" });
			const result = unchanged(runner.exe(root, "tick1"), flags(root), 1);
			expect(result.err).toContain("law_commit");
		});

		test.each([
			["config.yaml", "config.yaml"],
			["law file", "lawman/skills/lawman-law/references/constitution.md"],
		])("an unreadable %s exits non-zero and changes nothing", (_, relative) => {
			lay(root);
			const file = join(root, relative);
			chmodSync(file, NO_ACCESS);
			try {
				unchanged(runner.exe(root, "tick1"), flags(root));
			} finally {
				chmodSync(file, OWNER_ONLY);
			}
		});

		test("a constitution frontmatter without a contract_version exits 1", () => {
			lay(root, { contract: "" });
			const result = unchanged(runner.exe(root, "tick1"), flags(root), 1);
			expect(result.err).toContain("contract_version");
		});

		test("a missing config.yaml exits non-zero and changes nothing", () => {
			lay(root, { config: null });
			unchanged(runner.exe(root, "tick1"), flags(root));
			expect(readFileSync(bin(), "utf8")).toBe(OLD_BINARY);
		});
	});
}

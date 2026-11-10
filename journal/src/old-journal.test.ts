import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captured } from "./inproc";
import { lawOf, TICK_ORDER } from "./input-roles";
import { installation, lines, ROLE_NAMES } from "./input-test-fixture";
import { lawSync } from "./law-sync";
import {
	configOf,
	flags,
	LAW_COMMIT,
	lay,
	OLD_COMMIT,
	put,
	TAG,
} from "./law-sync-test-fixture";
import { BASE, call, dir, order, precinct, seed, tempDb } from "./test-helpers";

tempDb();
beforeEach(() => seed((d) => precinct(d, "main")));

const SECTION = "Sync the law with an older journal";

const fixture = (name: string) =>
	readFileSync(join(import.meta.dir, "fixtures", name), "utf8");

// the rule of the sentence: output that is not empty and does not open with the form line
const isOld = (output: string) =>
	output !== "" && !(output.split("\n")[0] ?? "").startsWith("lawman input");

describe("the output of the journal 0.23.1 against the new input", () => {
	test("the old output without work is one line idle and reads as old", () => {
		expect(fixture("old-wake-idle.txt")).toBe("idle\n");
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

	test("the new wake with work opens with the form line and does not read as old", () => {
		installation();
		seed((d) => order(d, "main", "patrol", { at: BASE, issue: 3 }));
		const out = call(BASE, ["wake", "--role", "patrol"]).out;
		expect(lines(out)[0]).toMatch(/^lawman input /);
		expect(isOld(out)).toBe(false);
	});

	test("the new wake without work prints nothing and does not read as old", () => {
		installation();
		const out = call(BASE, ["wake", "--role", "patrol"]);
		expect(out).toMatchObject({ code: 0, out: "" });
		expect(isOld(out.out)).toBe(false);
	});
});

describe("the place of the older section", () => {
	test("it stands in TICK_ORDER, and no role reads it", () => {
		expect(TICK_ORDER).toContain(SECTION);
		for (const role of ROLE_NAMES)
			for (const [, wanted] of lawOf(role))
				expect(wanted).not.toContain(SECTION);
	});
});

describe("law-sync of the new file on an installation of 0.23.1", () => {
	const OLD_CONFIG = `law_commit: ${OLD_COMMIT}
release_tag: v0.23.1
journal_sha256: ${"a".repeat(64)}
trusted_login: octocat-lawman
amended_law_commit: ${OLD_COMMIT}
contract_version: 4
license_precincts: main=no
`;

	test("it prints synced, adds the missing keys and erases nothing", () => {
		const root = join(dir, "installation");
		lay(root, { config: OLD_CONFIG });
		const exe = put(root, "runs/a/journal", "#!/bin/sh\necho new\n");
		const r = captured(BASE, () => lawSync(flags(root), exe));
		expect(r).toMatchObject({ code: 0, err: "" });
		expect(lines(r.out)).toContain(`synced ${TAG}`);
		const config = configOf(root);
		expect(config).toContain(`law_commit: ${LAW_COMMIT}`);
		expect(config).toMatch(/^jobs: /m);
		expect(config).toContain("\nprogress_checks: 3\n");
		for (const kept of [
			`amended_law_commit: ${OLD_COMMIT}`,
			"trusted_login: octocat-lawman",
			"contract_version: 4",
			"license_precincts: main=no",
		])
			expect(config).toContain(kept);
	});
});

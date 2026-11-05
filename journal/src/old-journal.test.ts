import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { captured } from "./inproc";
import { lawOf, TICK_ORDER } from "./input-roles";
import { installation, lines, ROLE_NAMES } from "./input-test-fixture";
import { sectionsOf } from "./law-sections";
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
import {
	BASE,
	call,
	dir,
	LAW,
	order,
	precinct,
	ROOT,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => seed((d) => precinct(d, "main")));

const SECTION = "Sync the law with an older journal";
// The one sentence that tells a role the journal is older than the law.
const OLD_SENTENCE =
	'Input output that is not empty and whose first line does not start with `lawman input` means that the journal is older than the law. Run the section "Sync the law with an older journal" of `tick.md`, then take the input again.';

const tick = readFileSync(join(LAW, "tick.md"), "utf8");
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

describe("the sign of an old journal in the law and the skills", () => {
	test("the second paragraph of the intro of tick.md carries the sentence", () => {
		const [intro] = sectionsOf(tick, ["intro"]);
		const paragraphs = (intro ?? []).filter((l) => l !== "");
		expect(paragraphs[2]).toContain(OLD_SENTENCE);
	});

	test.each(ROLE_NAMES)("the skill of %s carries the same sentence", (role) => {
		const skill = readFileSync(join(ROOT, "skills", role, "SKILL.md"), "utf8");
		expect(skill.split(OLD_SENTENCE).length - 1).toBe(1);
	});

	test("the sentence speaks of the first line of the input and of no harness gate", () => {
		expect(OLD_SENTENCE).toContain("first line");
		expect(OLD_SENTENCE.toLowerCase()).not.toContain("gate");
		expect(OLD_SENTENCE.toLowerCase()).not.toContain("harness");
	});
});

describe("the older section holds the protections of the procedure of 0.23.1", () => {
	const [oldLines, mainLines] = sectionsOf(tick, [SECTION, "Sync the law"]);
	const old = oldLines ?? [];
	const main = mainLines ?? [];
	const text = old.join("\n");

	// The protections of the old "Sync the law", each with a phrase of its text.
	const PROTECTIONS: [number, string[]][] = [
		[
			1,
			[
				"Skip the rest of this section when the two commits are equal, or when the file or a key cannot be read.",
			],
		],
		[2, ["Check the commit against `[0-9a-f]{40}`."]],
		[
			3,
			[
				"Check `release_repo` against `[A-Za-z0-9._-]+/[A-Za-z0-9._-]+`.",
				'the reason "a value is not safe"',
			],
		],
		[
			4,
			[
				"Confirm that the law folder has no local change.",
				"`stopped-dirty-law`",
				'the reason "the law folder has a local change"',
			],
		],
		[5, ["Confirm that the folder's commit carries a release tag."]],
		[
			6,
			[
				"Check the tag against `[A-Za-z0-9._-]+` before you use it anywhere.",
				'the reason is "the law is not on a release"',
				'the reason "the tag is not safe"',
			],
		],
		[
			7,
			[
				"Create the new folder `runs/sync-<role>-<first seven characters of the commit>`.",
				'the reason is "binary not ready"',
				'the reason "the release download failed"',
			],
		],
		[8, ["The asset is named `journal-bun-<os>-<arch>`."]],
		[
			9,
			[
				"confirm that it matches the checksum the release publishes",
				'the reason "the checksum failed"',
			],
		],
		[10, ["The statement names the file's own digest."]],
		[11, ["The release workflow of `release_repo` signed it."]],
		[
			12,
			["That workflow built the file from the commit the law folder holds."],
		],
		[
			13,
			[
				"Check the signature against a trusted root from Sigstore, never from the release.",
			],
		],
		[
			14,
			[
				"a check that cannot run or that reports anything but success is a stop",
				'the reason "the provenance check failed"',
				'the reason "the check could not run"',
			],
		],
		[
			15,
			[
				"Notes that are missing or name neither a verifier nor a refusal are a stop too.",
				'the reason "the host notes name neither a verifier nor a refusal"',
			],
		],
		[
			16,
			[
				"When the notes record that the user declined a verifier, skip the signature check.",
			],
		],
		[17, ["None of this needs an account on the release host."]],
		[
			18,
			[
				"run it with `<path> law-sync --tag <tag> --commit <commit> --installation .`",
				"A non-zero exit is a stop, and its standard error is the reason.",
			],
		],
		[
			19,
			[
				"The journal command reads and writes local files only. It makes no network request. It runs no version-control tool and no hosting tool.",
			],
		],
		[20, ["- Write into the law folder."]],
		[
			21,
			[
				"- Replace `bin/journal` or `config.yaml` by any means other than `law-sync`.",
			],
		],
		[22, ["- Run any file other than the asset that step 4 verified."]],
		[23, ["- Continue the tick after a stop."]],
		[
			24,
			[
				"A stop is answered and not recorded, because no tick exists yet.",
				"Remove the folder of step 3 when step 3 created it.",
				"The next tick tries again.",
			],
		],
	];

	test.each(PROTECTIONS)(
		"protection %i stands in the section",
		(_, phrases) => {
			for (const phrase of phrases) expect(text).toContain(phrase);
		},
	);

	test("a stop uses the token of drift unless the step names another", () => {
		expect(text).toContain(
			"A stop uses the token `stopped-law-drift` unless the step names another.",
		);
	});

	test("the section opens with the sign of an old journal and ends by taking the input again", () => {
		expect(old[2]).toContain(
			"Do this section only when the first line of your input output does not start with `lawman input`.",
		);
		expect(text).toContain(
			"A non-zero exit is a stop, and its standard error is the reason. After the line `synced <tag>`",
		);
		expect(text).toContain("Then take your input again.");
	});

	test("the section names the update list of the main section and does not copy it", () => {
		expect(text).toContain('as the section "Sync the law" says');
		expect(text).not.toContain("**The update list.**");
		expect(main.join("\n")).toContain("**The update list.**");
	});
});

describe("the place of the older section", () => {
	test("it is a second-level heading right after Sync the law and before Working rules", () => {
		const headings = [...tick.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
		const at = headings.indexOf("Sync the law");
		expect(headings.slice(at, at + 3)).toEqual([
			"Sync the law",
			SECTION,
			"Working rules",
		]);
		expect(tick).not.toMatch(/^#{3,} Sync the law with an older journal$/m);
	});

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

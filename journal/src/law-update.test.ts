import { describe, expect, spyOn, test } from "bun:test";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import * as clean from "./clean";
import { EXIT } from "./db";
import { capturedAsync, inprocAsync, type Result } from "./inproc";
import { noDatabase, shasum, snapshot } from "./law-sync-test-fixture";
import { assetName, lawUpdate } from "./law-update";
import {
	ASSET,
	allCommands,
	assetRuns,
	binaryText,
	CONFIG_COMMIT,
	calls,
	config,
	configText,
	DIRTY,
	facts,
	fixtureVerifier,
	law,
	lay,
	OLD_BINARY,
	originalConfig,
	publish,
	REPO,
	REVISION,
	ROLE,
	ready,
	releaseCommand,
	releaseFolder,
	runsFolder,
	SYNCED,
	sha256,
	stop,
	TAG,
	upstream,
	verifyCommand,
	versionCommand,
} from "./law-update-fixture";
import { BASE, dir, tempDb } from "./test-helpers";

tempDb();

const run = (...args: string[]) =>
	inprocAsync(BASE, ["law-update", ROLE, ...args]);
const on = (platform: { os: string; arch: string }, ...args: string[]) =>
	capturedAsync(BASE, () => lawUpdate([ROLE, ...args], platform));
const answer = (revision: string, tag = TAG) => [
	"--revision",
	revision,
	"--state",
	"clean",
	"--tag",
	tag,
];

type Expected = { token?: string; ran?: boolean; kept?: boolean };

// A stop is an answer with exit 0. The asset did not run, nothing was swapped
// and the release folder is gone, unless the test says otherwise.
function expectStop(r: Result, reason: string, o: Expected = {}): void {
	expect(r).toEqual({ code: EXIT.OK, out: stop(reason, o.token), err: "" });
	if (o.ran !== true) expect(assetRuns()).toEqual([]);
	expect(binaryText()).toBe(OLD_BINARY);
	expect(configText()).toBe(originalConfig);
	if (o.kept !== true) expect(existsSync(releaseFolder())).toBe(false);
}

const withoutLog = () =>
	Object.fromEntries(
		Object.entries(snapshot(dir)).filter(([name]) => name !== "calls.log"),
	);

const assetPath = () => join(releaseFolder(), ASSET);
const provenancePath = () => `${assetPath()}.sigstore.json`;
const versionCall = () => `law-version ${law()}`;
const releaseCall = () => `release ${REPO} ${TAG} ${releaseFolder()} ${ASSET}`;
const verifyCall = () =>
	`verify ${assetPath()} ${provenancePath()} ${REPO} ${REVISION}`;
const syncCall = () =>
	`law-sync --tag ${TAG} --commit ${REVISION} --installation ${dir}`;
const selfVerify = () =>
	`self verify ${assetPath()} ${provenancePath()} ${REPO} ${REVISION}\n`;
const synced = `synced ${TAG}\n`;

// the role's part: a release folder that holds the files of the release
function placeFiles(): void {
	mkdirSync(releaseFolder(), { recursive: true });
	for (const name of readdirSync(upstream()))
		writeFileSync(
			join(releaseFolder(), name),
			readFileSync(join(upstream(), name)),
		);
}

// without a verify file
function noVerify(): void {
	lay();
	versionCommand();
	releaseCommand();
	publish();
}

describe("law-update: nothing to update", () => {
	test("a revision equal to law_commit gives law current and runs only law-version", async () => {
		lay({ config: config(REVISION) });
		allCommands();
		publish();
		expect(await run()).toEqual({
			code: EXIT.OK,
			out: "law current\n",
			err: "",
		});
		expect(calls()).toEqual([versionCall()]);
	});

	test.each([
		["no config.yaml", null],
		["no law_commit", "release_repo: owner/x\n"],
		["no release_repo", `law_commit: ${CONFIG_COMMIT}\n`],
	])("%s gives law current and runs nothing", async (_, text) => {
		lay({ config: text });
		allCommands();
		expect(await run()).toEqual({
			code: EXIT.OK,
			out: "law current\n",
			err: "",
		});
		expect(calls()).toEqual([]);
	});

	test("a config.yaml that cannot be read gives law current", async () => {
		lay({ config: null });
		mkdirSync(join(dir, "config.yaml"));
		allCommands();
		expect((await run()).out).toBe("law current\n");
		expect(calls()).toEqual([]);
	});
});

describe("law-update: the update with three commands", () => {
	test("the asset runs after the sum and the check, with its arguments, and the lines are printed", async () => {
		ready({
			body: `echo "ALARM contract-changed the contract moved"\necho noise\n${SYNCED}`,
		});
		expect(statSync(join(upstream(), ASSET)).mode & 0o111).toBe(0);
		expect(await run()).toEqual({
			code: EXIT.OK,
			out: `ALARM contract-changed the contract moved\n${synced}`,
			err: "",
		});
		expect(calls().map((line) => line.split(" ")[0])).toEqual([
			"law-version",
			"release",
			"verify",
		]);
		expect(assetRuns()).toEqual([syncCall()]);
		expect(statSync(assetPath()).mode & 0o111).not.toBe(0);
		expect(binaryText()).toBe(OLD_BINARY);
		expect(configText()).toBe(originalConfig);
	});

	test.each([
		["linux", "x64"],
		["linux", "arm64"],
		["darwin", "x64"],
		["darwin", "arm64"],
	])("the asset of %s %s is journal-bun-%s-%s", async (os, arch) => {
		const asset = `journal-bun-${os}-${arch}`;
		expect(assetName({ os, arch })).toBe(asset);
		ready({ asset });
		const r = await on({ os, arch });
		expect(r.out).toBe(synced);
		expect(calls("release")).toEqual([
			`release ${REPO} ${TAG} ${releaseFolder()} ${asset}`,
		]);
	});

	test.each([
		["win32", "x64"],
		["linux", "ia32"],
		["freebsd", "arm64"],
	])("%s %s has no asset and release is not called", async (os, arch) => {
		expect(assetName({ os, arch })).toBeNull();
		ready();
		expectStop(await on({ os, arch }), "no binary for this platform");
		expect(calls()).toEqual([versionCall()]);
		expect(existsSync(runsFolder())).toBe(false);
	});

	test("release and verify get the folder, the files, the repository and the revision", async () => {
		ready();
		await run();
		expect(calls()).toEqual([versionCall(), releaseCall(), verifyCall()]);
		expect(releaseFolder().startsWith(join(dir, "runs", "sync-patrol-"))).toBe(
			true,
		);
		expect(releaseFolder().endsWith(`-${REVISION.slice(0, 7)}`)).toBe(true);
	});

	test("the law folder holds no .git and the update passes", async () => {
		ready();
		expect(existsSync(join(law(), ".git"))).toBe(false);
		expect((await run()).out).toBe(synced);
	});
});

describe("law-update: the fixture verifier (a fixture, it proves no real verifier)", () => {
	test("the right claim passes and the asset runs", async () => {
		ready();
		verifyCommand(fixtureVerifier());
		expect((await run()).out).toBe(synced);
		expect(assetRuns()).toEqual([syncCall()]);
	});

	test.each([
		["a replaced file", { digest: sha256("another file") }],
		["another signer", { signer: "other/law-release" }],
		["a right claim for another commit", { commit: "d".repeat(40) }],
	])("%s gives the provenance check failed", async (_, claim) => {
		ready({ claim });
		verifyCommand(fixtureVerifier());
		expectStop(await run(), "the provenance check failed");
		expect(calls("verify")).toEqual([verifyCall()]);
	});
});

describe("law-update: declining the signature", () => {
	test("a declined signature keeps the sum and starts no check", async () => {
		noVerify();
		expect(await run()).toEqual({ code: EXIT.OK, out: selfVerify(), err: "" });
		expect((await run(...["--verify", "declined"])).out).toBe(synced);
		expect(calls("verify")).toEqual([]);
		expect(assetRuns()).toEqual([syncCall()]);
	});

	test("a declined signature with a wrong sum gives the checksum failed", async () => {
		noVerify();
		await run();
		appendFileSync(assetPath(), "# changed\n");
		expectStop(await run("--verify", "declined"), "the checksum failed");
		expect(calls("verify")).toEqual([]);
	});
});

describe("law-update: the checksum", () => {
	test.each([
		["a wrong hash", (_: string, a: string) => `${"0".repeat(64)}  ${a}\n`],
		["no row for the asset", () => ""],
		["a row of another name", (h: string) => `${h}  other-name\n`],
		[
			"a row of a longer name",
			(h: string, a: string) => `${h}  ${a}.sigstore.json\n`,
		],
		[
			"two rows of the asset",
			(h: string, a: string) => `${h}  ${a}\n${h}  ${a}\n`,
		],
		[
			"upper case letters",
			(h: string, a: string) => `${h.toUpperCase()}  ${a}\n`,
		],
		["63 characters", (h: string, a: string) => `${h.slice(1)}  ${a}\n`],
		["65 characters", (h: string, a: string) => `${h}0  ${a}\n`],
		["a hash with no name", (h: string) => `${h}\n`],
	])(
		"%s gives the checksum failed and verify is not called",
		async (_, sums) => {
			ready({ sums });
			expectStop(await run(), "the checksum failed");
			expect(calls("verify")).toEqual([]);
		},
	);

	test.each([
		["a star before the name", (h: string, a: string) => `${h} *${a}\n`],
		["one space", (h: string, a: string) => `${h} ${a}\n`],
		[
			"rows of other files",
			(h: string, a: string) => `${"0".repeat(64)}  other\n${h}  ${a}\n`,
		],
	])("%s passes", async (_, sums) => {
		ready({ sums });
		expect((await run()).out).toBe(synced);
	});
});

describe("law-update: a local change and a law that is not on a release", () => {
	test("a local change gives stopped-dirty-law and starts no release", async () => {
		ready();
		versionCommand(facts(REVISION, "yes"));
		expectStop(await run(), "the law folder has a local change", {
			token: DIRTY,
		});
		expect(calls()).toEqual([versionCall()]);
		expect(existsSync(runsFolder())).toBe(false);
	});

	test("no tag gives the law is not on a release", async () => {
		ready();
		versionCommand(facts(REVISION, "no", ""));
		expectStop(await run(), "the law is not on a release");
		expect(calls()).toEqual([versionCall()]);
		expect(existsSync(runsFolder())).toBe(false);
	});

	test("a local change comes before a missing tag", async () => {
		ready();
		versionCommand(facts(REVISION, "yes", ""));
		expect((await run()).out).toBe(
			stop("the law folder has a local change", DIRTY),
		);
	});

	test("an answer of a local change stops the same way", async () => {
		lay();
		releaseCommand();
		publish();
		expectStop(
			await run("--revision", REVISION, "--state", "changed"),
			"the law folder has a local change",
			{ token: DIRTY },
		);
	});

	test("a stop before the release leaves a folder of an earlier try alone", async () => {
		ready();
		versionCommand(facts(REVISION, "yes"));
		mkdirSync(releaseFolder(), { recursive: true });
		writeFileSync(join(releaseFolder(), "stray"), "x");
		await run();
		expect(existsSync(join(releaseFolder(), "stray"))).toBe(true);
	});
});

describe("law-update: a law folder without .git", () => {
	test("without a law-version file the role is asked for the facts", async () => {
		lay();
		releaseCommand();
		verifyCommand();
		expect(await run()).toEqual({
			code: EXIT.OK,
			out: "self law-version\n",
			err: "",
		});
		expect(calls()).toEqual([]);
	});

	test("a call with the facts goes through all the guards", async () => {
		lay();
		releaseCommand();
		verifyCommand();
		publish();
		expect((await run(...answer(REVISION))).out).toBe(synced);
	});

	test("a revision that cannot be read stops with the way to update", async () => {
		lay();
		releaseCommand();
		expectStop(
			await run("--revision", "unreadable"),
			"the law folder gives no facts: put a `law-version` command in `shared/`, form in docs/journal.md",
		);
	});
});

const BAD_REVISIONS = [
	["upper case", "A".repeat(40)],
	["39 characters", "a".repeat(39)],
	["41 characters", "a".repeat(41)],
	["a path", "../../x"],
	["a slash", "a/b"],
	["empty", ""],
];
const BAD_TAGS = [
	["a space", "v 1"],
	["a semicolon", "v;1"],
	["a dollar", "v$1"],
	["a bracket", "v(1"],
	["a dot", "."],
	["two dots", ".."],
	["a leading dash", "-v1"],
];
const BAD_REPOS = [
	["no slash", "owner"],
	["three parts", "a/b/c"],
	["a space", "own er/repo"],
	["a dot part", "./repo"],
	["a dots part", "owner/.."],
	["a leading dash", "-owner/repo"],
];

describe("law-update: classes before any use", () => {
	const unchanged = async (r: Promise<Result>, reason: string) => {
		const before = withoutLog();
		expectStop(await r, reason);
		expect(withoutLog()).toEqual(before);
	};

	test.each(BAD_REVISIONS)(
		"a revision with %s in the output of law-version is not safe",
		async (_, value) => {
			ready();
			versionCommand(facts(value));
			await unchanged(run(), "a value is not safe");
			expect(calls()).toEqual([versionCall()]);
		},
	);

	test.each(BAD_REVISIONS)(
		"a revision with %s in an answer is not safe",
		async (_, value) => {
			lay();
			releaseCommand();
			verifyCommand();
			publish();
			await unchanged(run(...answer(value)), "a value is not safe");
			expect(calls()).toEqual([]);
		},
	);

	test("a revision that ends in a line break is not safe in an answer", async () => {
		lay();
		releaseCommand();
		await unchanged(run(...answer(`${REVISION}\n`)), "a value is not safe");
	});

	test.each([
		["upper case", "B".repeat(40)],
		["39 characters", "b".repeat(39)],
		["41 characters", "b".repeat(41)],
		["a path", "../../x"],
	])("a law_commit with %s is not safe", async (_, value) => {
		lay({ config: config(value) });
		allCommands();
		await unchanged(run(), "a value is not safe");
	});

	test.each(BAD_REPOS)(
		"a release_repo with %s is not safe",
		async (_, value) => {
			lay({ config: config(CONFIG_COMMIT, value) });
			allCommands();
			publish();
			await unchanged(run(), "a value is not safe");
			expect(calls("release")).toEqual([]);
		},
	);

	test.each(BAD_TAGS)(
		"a tag with %s in the output of law-version is not safe",
		async (_, value) => {
			ready();
			versionCommand(facts(REVISION, "no", value));
			await unchanged(run(), "the tag is not safe");
			expect(calls()).toEqual([versionCall()]);
		},
	);

	test.each(BAD_TAGS)(
		"a tag with %s in an answer is not safe",
		async (_, value) => {
			lay();
			releaseCommand();
			await unchanged(run(...answer(REVISION, value)), "the tag is not safe");
			expect(calls()).toEqual([]);
		},
	);

	test("a tag that ends in a line break is not safe in an answer", async () => {
		lay();
		releaseCommand();
		await unchanged(
			run(...answer(REVISION, `${TAG}\n`)),
			"the tag is not safe",
		);
	});

	test("an empty tag is not a release in the output and in an answer", async () => {
		ready();
		versionCommand(facts(REVISION, "no", ""));
		await unchanged(run(), "the law is not on a release");
		await unchanged(
			run("--revision", REVISION, "--state", "clean"),
			"the law is not on a release",
		);
	});

	test.each([
		["an extra line", `${facts()}extra=1\n`],
		[
			"a line break in a value",
			`revision=${REVISION}\nx\nchanged=no\ntag=${TAG}\n`,
		],
		["another order", `changed=no\nrevision=${REVISION}\ntag=${TAG}\n`],
		["changed=maybe", facts(REVISION, "maybe")],
		["no break at the end", `revision=${REVISION}\nchanged=no\ntag=${TAG}`],
		["a missing line", `revision=${REVISION}\nchanged=no\n`],
		["no output", ""],
	])("output with %s is outside the form", async (_, output) => {
		ready();
		versionCommand(output);
		await unchanged(run(...answer(REVISION)), "the law-version command failed");
		expect(calls()).toEqual([versionCall()]);
	});

	test("lines that end in a carriage return and a line break are in the form", async () => {
		ready();
		versionCommand(facts(REVISION, "no", TAG, "\r\n"));
		expect((await run()).out).toBe(synced);
	});

	test.each([
		["outside the form", "```\n\u001b[31mred\n```\n"],
		["a long line outside the form", `${"x".repeat(100_000)}\n`],
		["a revision outside the class", facts("```\u001b[31m".padEnd(40, "x"))],
		["a long tag", facts(REVISION, "no", `${"t".repeat(100_000)};`)],
	])("hostile output of law-version, %s, is not printed", async (_, output) => {
		ready();
		versionCommand(output);
		const r = await run();
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toMatch(/^stop stopped-law-drift [a-z -]+\n$/);
		expect(r.out.length).toBeLessThan(100);
		expect(assetRuns()).toEqual([]);
	});
});

describe("law-update: the steps the role does, the answers and the folder", () => {
	test("without a release file the first call asks the role and builds an empty folder", async () => {
		lay();
		versionCommand();
		verifyCommand();
		publish();
		expect(existsSync(runsFolder())).toBe(false);
		expect(await run()).toEqual({
			code: EXIT.OK,
			out: `self release ${REPO} ${TAG} ${releaseFolder()} ${ASSET}\n`,
			err: "",
		});
		expect(readdirSync(releaseFolder())).toEqual([]);
	});

	test("the answer done checks the files the role placed and the asset runs", async () => {
		lay();
		versionCommand();
		verifyCommand();
		publish();
		await run();
		placeFiles();
		expect((await run("--release", "done")).out).toBe(synced);
		expect(calls("release")).toEqual([]);
	});

	test("the answer done without a folder gives binary not ready and builds none", async () => {
		lay();
		versionCommand();
		verifyCommand();
		publish();
		expectStop(await run("--release", "done"), "binary not ready");
	});

	test.each([ASSET, `${ASSET}.sigstore.json`, "SHA256SUMS"])(
		"the answer done without %s gives binary not ready",
		async (name) => {
			lay();
			versionCommand();
			verifyCommand();
			publish();
			placeFiles();
			rmSync(join(releaseFolder(), name));
			expectStop(await run("--release", "done"), "binary not ready");
		},
	);

	test.each([
		["missing", "binary not ready"],
		["failed", "the release download failed"],
	])("the answer %s stops with and without a folder", async (word, reason) => {
		lay();
		versionCommand();
		verifyCommand();
		publish();
		expectStop(await run("--release", word), reason);
		placeFiles();
		expectStop(await run("--release", word), reason);
	});

	test.each([ASSET, `${ASSET}.sigstore.json`, "SHA256SUMS"])(
		"a link in place of %s gives binary not ready",
		async (name) => {
			ready();
			rmSync(join(upstream(), name));
			writeFileSync(join(dir, "elsewhere"), "x");
			symlinkSync(join(dir, "elsewhere"), join(upstream(), name));
			expectStop(await run(), "binary not ready");
		},
	);

	test.each([ASSET, `${ASSET}.sigstore.json`, "SHA256SUMS"])(
		"a folder in place of %s gives binary not ready",
		async (name) => {
			ready();
			rmSync(join(upstream(), name));
			mkdirSync(join(upstream(), name));
			expectStop(await run(), "binary not ready");
		},
	);

	test("without a verify file the first call asks the role", async () => {
		noVerify();
		expect(await run()).toEqual({ code: EXIT.OK, out: selfVerify(), err: "" });
		expect(existsSync(assetPath())).toBe(true);
	});

	test("the answer passed without a folder gives binary not ready", async () => {
		noVerify();
		expectStop(await run("--verify", "passed"), "binary not ready");
	});

	test.each([
		["passed", null],
		["declined", null],
		["failed", "the provenance check failed"],
		["not-run", "the check could not run"],
		["unnamed", "the host notes name neither a verifier nor a refusal"],
	])("the answer %s of the role gives its outcome", async (word, reason) => {
		noVerify();
		await run();
		const r = await run("--verify", word);
		if (reason === null) expect(r.out).toBe(synced);
		else expectStop(r, reason);
	});

	test("a ready release ignores the answer done and builds the folder again", async () => {
		ready();
		mkdirSync(releaseFolder(), { recursive: true });
		writeFileSync(join(releaseFolder(), "stale"), "x");
		expect((await run("--release", "done")).out).toBe(synced);
		expect(calls("release")).toEqual([releaseCall()]);
		expect(existsSync(join(releaseFolder(), "stale"))).toBe(false);
	});

	test("a folder of an earlier try does not outlive a pass that builds it again", async () => {
		noVerify();
		mkdirSync(releaseFolder(), { recursive: true });
		writeFileSync(join(releaseFolder(), "stale"), "x");
		await run();
		expect(existsSync(join(releaseFolder(), "stale"))).toBe(false);
	});

	test("a ready law-version ignores the answer", async () => {
		ready();
		const r = await run("--revision", "c".repeat(40), "--state", "changed");
		expect(r.out).toBe(synced);
		expect(calls("law-version")).toEqual([versionCall()]);
	});

	test.each(["declined", "passed"])(
		"a ready verify ignores the answer %s",
		async (word) => {
			ready();
			verifyCommand("exit 1");
			expectStop(await run("--verify", word), "the provenance check failed");
			expect(calls("verify")).toEqual([verifyCall()]);
		},
	);

	test.each([
		["exits with a code", "exit 3", 0o755, facts()],
		["has no right to run", "", 0o644, facts()],
		["prints outside the form", "", 0o755, "nothing\n"],
	])(
		"a law-version that %s gives the law-version command failed, the answer is not counted",
		async (_, tail, mode, output) => {
			ready();
			versionCommand(output, tail, mode);
			expectStop(
				await run(...answer(REVISION)),
				"the law-version command failed",
			);
			expect(calls("release")).toEqual([]);
		},
	);

	test("a verify that cannot start gives the check could not run", async () => {
		ready();
		verifyCommand("exit 0", 0o644);
		expectStop(await run(), "the check could not run");
	});

	test("the second pass of the role does not call release again and the asset bytes stay", async () => {
		noVerify();
		await run();
		const first = shasum(assetPath());
		expect((await run("--verify", "passed")).out).toBe(synced);
		expect(calls("release")).toEqual([releaseCall()]);
		expect(shasum(assetPath())).toBe(first);
	});

	test("a pass with an answer leaves a file in the folder alone", async () => {
		noVerify();
		await run();
		writeFileSync(join(releaseFolder(), "stray"), "x");
		await run("--verify", "passed");
		expect(existsSync(join(releaseFolder(), "stray"))).toBe(true);
	});

	test.each([
		["an unknown option", ["--bogus", "x"]],
		["a repeated option", [...answer(REVISION), "--state", "clean"]],
		["an option without a value", ["--tag"]],
		["a state outside the list", ["--revision", REVISION, "--state", "odd"]],
		["a release word outside the list", ["--release", "maybe"]],
		["a verify word outside the list", ["--verify", "nope"]],
		["a state without a revision", ["--state", "clean"]],
		["a tag without a revision", ["--tag", TAG]],
		["a revision without a state", ["--revision", REVISION]],
		[
			"unreadable with a state",
			["--revision", "unreadable", "--state", "clean"],
		],
		["unreadable with a tag", ["--revision", "unreadable", "--tag", TAG]],
	])("%s is an error of use", async (_, args) => {
		ready();
		const r = await run(...args);
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.out).toBe("");
		expect(calls()).toEqual([]);
	});

	test.each([[[]], [["Bad Role"]]])(
		"a missing or malformed role %p is an error of use",
		async (args) => {
			ready();
			const r = await inprocAsync(BASE, ["law-update", ...args]);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.out).toBe("");
		},
	);
});

describe("law-update: the exits of release", () => {
	test.each([
		["exit 0", "exit 0", null],
		["exit 2", "exit 2", "binary not ready"],
		["exit 1", "exit 1", "the release download failed"],
		["exit 3", "exit 3", "the release download failed"],
		["a signal", "kill -TERM $$", "the release download failed"],
	])("release with %s", async (_, tail, reason) => {
		ready();
		releaseCommand(tail);
		const r = await run();
		if (reason === null) expect(r.out).toBe(synced);
		else expectStop(r, reason);
	});

	test("a release that cannot start gives the release download failed", async () => {
		ready();
		releaseCommand("", 0o644);
		expectStop(await run(), "the release download failed");
	});
});

describe("law-update: the new binary", () => {
	const fails = async (body: string, reason: string) => {
		ready({ body });
		expectStop(await run(), reason, { ran: true });
		expect(assetRuns()).toEqual([syncCall()]);
	};

	test("a failing binary stops with the first line of its error", async () => {
		await fails(
			"echo noise\nprintf 'boom: reason\\nsecond\\n' >&2\nexit 3",
			"boom: reason",
		);
	});

	test.each([
		["an empty error", "exit 3"],
		[
			"an error of invisible characters",
			"printf '\\342\\200\\213\\342\\201\\240\\357\\273\\277\\n' >&2\nexit 3",
		],
	])("%s gives the new binary failed", async (_, body) => {
		await fails(body, "the new binary failed");
	});

	test("invisible characters in the error are removed", async () => {
		await fails("printf 'bro\\342\\200\\213ken\\n' >&2\nexit 3", "broken");
	});

	test("a secret in the error is masked", async () => {
		const secret = `ghp_${"a1B2c3D4e5".repeat(4).slice(0, 36)}`;
		ready({ body: `echo "failed with ${secret}" >&2\nexit 3` });
		const r = await run();
		expect(r.out).toStartWith("stop stopped-law-drift failed with ");
		expect(r.out).not.toContain(secret);
		expect(r.out).toContain("REMOVED");
	});

	test("a binary that cannot start gives the new binary did not start", async () => {
		ready({ raw: "#!/nonexistent/interpreter\n" });
		expectStop(await run(), "the new binary did not start");
	});

	test.each([
		["no line", "echo hello"],
		["another tag", "echo synced v9.9.9"],
		["a longer line", `echo "synced ${TAG} more"`],
	])(
		"an exit 0 with %s gives the new binary did not confirm the update",
		async (_, body) => {
			await fails(body, "the new binary did not confirm the update");
		},
	);

	test("lines of alarm pass the character layer before synced and other lines are dropped", async () => {
		ready({
			body: [
				"echo before",
				"printf 'ALARM contract-changed ab\\342\\200\\213cd\\n'",
				"echo 'ALARM contract-changedX no'",
				"echo 'ALARM contract-changed'",
				"echo 'ALARM contract-changed second'",
				SYNCED,
				"echo after",
			].join("\n"),
		});
		expect((await run()).out).toBe(
			`ALARM contract-changed abcd\nALARM contract-changed second\n${synced}`,
		);
	});

	test("a secret in a line of alarm is masked", async () => {
		const secret = `ghp_${"a1B2c3D4e5".repeat(4).slice(0, 36)}`;
		ready({ body: `echo "ALARM contract-changed key ${secret}"\n${SYNCED}` });
		const r = await run();
		expect(r.out).not.toContain(secret);
		expect(r.out).toContain("REMOVED");
		expect(r.out).toEndWith(synced);
	});

	describe("when the character layer throws", () => {
		const original = clean.cleanCharacters;
		const throwing = () =>
			spyOn(clean, "cleanCharacters").mockImplementation(async (text) => {
				if (text.includes("BOOM")) throw new Error("the library quotes text");
				return original(text);
			});

		test("a line of alarm becomes the bare alarm and the others go on", async () => {
			ready({
				body: `echo 'ALARM contract-changed BOOM'\necho 'ALARM contract-changed second'\n${SYNCED}`,
			});
			const spy = throwing();
			try {
				expect((await run()).out).toBe(
					`ALARM contract-changed\nALARM contract-changed second\n${synced}`,
				);
			} finally {
				spy.mockRestore();
			}
		});

		test("the first line of the error gives the new binary failed", async () => {
			ready({ body: "echo 'BOOM failed' >&2\nexit 3" });
			const spy = throwing();
			try {
				expectStop(await run(), "the new binary failed", { ran: true });
			} finally {
				spy.mockRestore();
			}
		});
	});
});

describe("law-update: what the command does not do", () => {
	test("the law folder is the same after an update and after a stop", async () => {
		ready();
		const before = snapshot(law());
		await run();
		expect(snapshot(law())).toEqual(before);
		versionCommand(facts(REVISION, "yes"));
		await run();
		expect(snapshot(law())).toEqual(before);
	});

	test("no database and no tick come from an update or a stop", async () => {
		ready();
		await run();
		verifyCommand("exit 1");
		await run();
		expect(noDatabase(dir)).toEqual([]);
		expect(existsSync(join(dir, "journal.sqlite"))).toBe(false);
	});

	test("a call after a stop starts over", async () => {
		ready();
		verifyCommand("exit 1");
		expectStop(await run(), "the provenance check failed");
		verifyCommand();
		expect((await run()).out).toBe(synced);
		expect(calls("law-version")).toHaveLength(2);
		expect(calls("release")).toHaveLength(2);
	});
});

describe("law-update: the source", () => {
	const source = (name: string) =>
		readFileSync(join(import.meta.dir, name), "utf8");

	test.each(["law-update.ts", "law-version.ts"])(
		"%s names no network or version-control word",
		(name) => {
			expect(source(name)).not.toMatch(/\b(fetch|http|https|git|gh)\b/i);
		},
	);

	test.each(["law-update.ts", "law-version.ts"])(
		"%s starts processes only through launch",
		(name) => {
			const text = source(name);
			expect(text).not.toMatch(
				/\b(spawn|spawnSync|child_process|execSync|execFile)\b|exec\(/,
			);
			expect(text).not.toContain("Bun.$");
		},
	);

	test("law-update.ts runs the three operations and the binary through launch", () => {
		const text = source("law-update.ts");
		expect(text).toContain('from "./launch"');
		expect(text.match(/\blaunch\(/g)?.length).toBeGreaterThanOrEqual(3);
	});
});

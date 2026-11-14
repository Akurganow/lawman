import { describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
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
import { join, relative } from "node:path";
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
// the self lines name the paths from the installation folder
const fromInstallation = (path: string) => relative(dir, path);
const selfVerify = () =>
	`self verify ${fromInstallation(assetPath())} ${fromInstallation(provenancePath())} ${REPO} ${REVISION}\n`;
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

describe("law-update: nothing to update, or a config that cannot say", () => {
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
	])("%s stops with its own token and runs nothing", async (_, text) => {
		lay({ config: text });
		allCommands();
		expect(await run()).toEqual({
			code: EXIT.OK,
			out: "stop stopped-law-config config.yaml cannot give law_commit or release_repo\n",
			err: "",
		});
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
});

describe("law-update: declining the signature", () => {
	// the pass the assembly runs to prove a refusal: no answer about the signature
	test("a changed asset with the real sums and no verify file gives the checksum failed", async () => {
		lay();
		versionCommand();
		releaseCommand(`printf x >> "$3/$4"`);
		publish();
		expectStop(await run(), "the checksum failed");
		expect(existsSync(join(dir, "shared", "verify"))).toBe(false);
		expect(assetRuns()).toEqual([]);
		expect(binaryText()).toBe(OLD_BINARY);
		expect(configText()).toBe(config());
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

	test("a revision with upper case in an answer is not safe", async () => {
		lay();
		releaseCommand();
		verifyCommand();
		publish();
		await unchanged(run(...answer("A".repeat(40))), "a value is not safe");
		expect(calls()).toEqual([]);
	});

	test("a revision that ends in a line break is not safe in an answer", async () => {
		lay();
		releaseCommand();
		await unchanged(run(...answer(`${REVISION}\n`)), "a value is not safe");
	});

	test("a law_commit with upper case is not safe", async () => {
		lay({ config: config("B".repeat(40)) });
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

	test("a tag with a space in an answer is not safe", async () => {
		lay();
		releaseCommand();
		await unchanged(run(...answer(REVISION, "v 1")), "the tag is not safe");
		expect(calls()).toEqual([]);
	});

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
			out: `self release ${REPO} ${TAG} ${fromInstallation(releaseFolder())} ${ASSET}\n`,
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

	test.each([ASSET, "SHA256SUMS"])(
		"a link in place of %s gives binary not ready",
		async (name) => {
			ready();
			rmSync(join(upstream(), name));
			writeFileSync(join(dir, "elsewhere"), "x");
			symlinkSync(join(dir, "elsewhere"), join(upstream(), name));
			expectStop(await run(), "binary not ready");
		},
	);

	test("a folder in place of the provenance file gives binary not ready", async () => {
		ready();
		rmSync(join(upstream(), `${ASSET}.sigstore.json`));
		mkdirSync(join(upstream(), `${ASSET}.sigstore.json`));
		expectStop(await run(), "binary not ready");
	});

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
		["declined", null, undefined],
		["failed", "the provenance check failed", undefined],
		["not-run", "the check could not run", undefined],
		[
			"unnamed",
			"the host notes name neither a verifier nor a refusal",
			"stopped-no-verifier",
		],
	])(
		"the answer %s of the role gives its outcome",
		async (word, reason, token) => {
			noVerify();
			await run();
			const r = await run("--verify", word);
			if (reason === null) expect(r.out).toBe(synced);
			else expectStop(r, reason, token === undefined ? {} : { token });
		},
	);

	test("a ready release ignores the answer done and builds the folder again", async () => {
		ready();
		mkdirSync(releaseFolder(), { recursive: true });
		writeFileSync(join(releaseFolder(), "stale"), "x");
		expect((await run("--release", "done")).out).toBe(synced);
		expect(calls("release")).toEqual([releaseCall()]);
		expect(existsSync(join(releaseFolder(), "stale"))).toBe(false);
	});

	test("a ready law-version ignores the answer", async () => {
		ready();
		const r = await run("--revision", "c".repeat(40), "--state", "changed");
		expect(r.out).toBe(synced);
		expect(calls("law-version")).toEqual([versionCall()]);
	});

	test("a ready verify ignores the answer declined", async () => {
		ready();
		verifyCommand("exit 1");
		expectStop(
			await run("--verify", "declined"),
			"the provenance check failed",
		);
		expect(calls("verify")).toEqual([verifyCall()]);
	});

	test.each([
		["exits with a code", "exit 3", 0o755, facts()],
		["has no right to run", "", 0o644, facts()],
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

	test.each([
		["an unknown option", ["--bogus", "x"]],
		["a repeated option", [...answer(REVISION), "--state", "clean"]],
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

describe("law-update: file operations that fail", () => {
	test("a release folder the journal cannot make stops with the release download failed", async () => {
		ready();
		writeFileSync(runsFolder(), "a file where the folder goes\n");
		expectStop(await run(), "the release download failed");
		expect(calls("release")).toEqual([]);
	});

	test("an asset the journal cannot make executable stops, and the folder is gone", async () => {
		ready();
		const chmod = spyOn(fs, "chmodSync").mockImplementation(() => {
			throw new Error("EPERM");
		});
		try {
			expectStop(await run(), "the new binary did not start");
		} finally {
			chmod.mockRestore();
		}
	});
});

describe("law-update: an installation path with a space", () => {
	test("the self lines name the paths from the installation folder, so each field stays one word", async () => {
		const place = join(dir, "with space");
		mkdirSync(place);
		writeFileSync(join(place, "config.yaml"), config());
		const facts = answer(REVISION);
		const pass = (...args: string[]) =>
			capturedAsync(BASE, () => {
				process.env.LAWMAN_DB = join(place, "journal.sqlite");
				return lawUpdate([ROLE, ...facts, ...args]);
			});
		const release = await pass();
		const fields = release.out.trimEnd().split(" ");
		expect(fields).toEqual([
			"self",
			"release",
			REPO,
			TAG,
			join("runs", `sync-${ROLE}-${REVISION.slice(0, 7)}`),
			ASSET,
		]);
		const { hash } = publish();
		const folder = join(place, fields[4] ?? "");
		for (const name of readdirSync(upstream()))
			writeFileSync(join(folder, name), readFileSync(join(upstream(), name)));
		expect(hash).toHaveLength(64);
		const verify = await pass("--release", "done");
		expect(verify.out.trimEnd().split(" ")).toEqual([
			"self",
			"verify",
			join(fields[4] ?? "", ASSET),
			join(fields[4] ?? "", `${ASSET}.sigstore.json`),
			REPO,
			REVISION,
		]);
	});
});

describe("law-update: the exits of release", () => {
	test.each([
		["exit 2", "exit 2", "binary not ready"],
		["exit 1", "exit 1", "the release download failed"],
		["exit 3", "exit 3", "the release download failed"],
		["a signal", "kill -TERM $$", "the release download failed"],
	])("release with %s", async (_, tail, reason) => {
		ready();
		releaseCommand(tail);
		expectStop(await run(), reason);
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
		[
			"an error of invisible characters",
			"printf '\\342\\200\\213\\342\\201\\240\\357\\273\\277\\n' >&2\nexit 3",
		],
	])("%s gives the new binary failed", async (_, body) => {
		await fails(body, "the new binary failed");
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
});

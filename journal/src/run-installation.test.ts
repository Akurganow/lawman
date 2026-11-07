import { describe, expect, spyOn, test } from "bun:test";
import {
	appendFileSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import * as clean from "./clean";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import {
	ASSET,
	calls,
	facts,
	fixtureVerifier,
	law,
	publish,
	REPO,
	REVISION,
	releaseCommand,
	TAG,
	verifyCommand,
	versionCommand,
} from "./law-update-fixture";
import { command, shared } from "./operations-test-fixture";
import { RELEASE_FOLDER } from "./run-installation";
import { addPrecincts, BASE, cli, dbFile, dir, tempDb } from "./test-helpers";

tempDb();

const run = (...args: string[]) =>
	inprocAsync(BASE, ["run-installation", ...args]);
const refused = (operation: string, reason: string, detail = "") =>
	`${operation} failed reason=${reason}\n~~~error\n${detail === "" ? "" : `${detail}\n`}~~~\n`;
const released = `release done folder=${RELEASE_FOLDER} asset=${ASSET}\n`;
const folder = () => join(dir, RELEASE_FOLDER);
const OTHER_REPO = "someone/else";
const OTHER_COMMIT = "c".repeat(40);
const HOSTILE = "printf '```\\n\\342\\200\\213hidden ~~~\\n'";

// the files of a real release, in the folder that release built
async function releasedFiles(): Promise<void> {
	publish();
	releaseCommand();
	expect((await run("release", REPO, TAG)).out).toBe(released);
}

const asset = `${RELEASE_FOLDER}/${ASSET}`;
const provenance = `${asset}.sigstore.json`;

describe("run-installation: the call", () => {
	test.each([
		[[]],
		[["fetch"]],
		[["release", REPO]],
		[["verify", asset, provenance, REPO]],
		[["law-version", "x"]],
	])("%j is a usage error", async (args) => {
		const r = await run(...args);
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.err).toContain("usage: journal run-installation");
	});

	test.each([
		["release", "-x/y", TAG],
		["release", "a/b/c", TAG],
		["release", REPO, "-v1"],
		["release", REPO, "v 1"],
	])(
		"%s %s %s outside the class never reaches the command",
		async (operation, repo, tag) => {
			releaseCommand();
			expect(await run(operation, repo, tag)).toEqual({
				code: EXIT.COMMAND,
				out: refused("release", "argument"),
				err: "",
			});
			expect(calls()).toEqual([]);
		},
	);

	test("an argument outside its class gives argument even with no file", async () => {
		expect((await run("release", "-x/y", TAG)).out).toBe(
			refused("release", "argument"),
		);
	});

	test("an operation with no file prints empty and exits 0", async () => {
		expect(await run("release", REPO, TAG)).toEqual({
			code: EXIT.OK,
			out: "release empty\n",
			err: "",
		});
		expect(await run("law-version")).toEqual({
			code: EXIT.OK,
			out: "law-version empty\n",
			err: "",
		});
	});

	test("the run opens no database", async () => {
		versionCommand();
		await run("law-version");
		expect(existsSync(dbFile)).toBe(false);
	});

	test("a precinct named after an operation keeps its own run", async () => {
		addPrecincts({ release: 1 });
		command(join(dir, "configs", "release"), "identity", "echo octo");
		releaseCommand();
		publish();
		expect((await inprocAsync(BASE, ["run", "release", "identity"])).out).toBe(
			"login=octo\n",
		);
		expect((await run("release", REPO, TAG)).out).toBe(released);
	});
});

describe("run-installation: the outcome", () => {
	test("a file that does not start gives start", async () => {
		versionCommand(facts(), "", 0o644);
		expect(await run("law-version")).toEqual({
			code: EXIT.COMMAND,
			out: refused("law-version", "start"),
			err: "",
		});
	});

	test("a non-zero exit gives exit and its stderr in the fence", async () => {
		command(shared(), "release", "echo broken >&2\nexit 2");
		expect((await run("release", REPO, TAG)).out).toBe(
			refused("release", "exit", "broken"),
		);
	});

	test("a signal gives exit", async () => {
		command(shared(), "release", "kill -TERM $$");
		expect((await run("release", REPO, TAG)).out).toBe(
			refused("release", "exit"),
		);
	});

	test("a failed cleaning of stderr gives clean and an empty fence", async () => {
		command(shared(), "release", "echo broken >&2\nexit 1");
		const spy = spyOn(clean, "cleanCharacters").mockRejectedValue(
			new Error("library"),
		);
		try {
			expect((await run("release", REPO, TAG)).out).toBe(
				refused("release", "clean"),
			);
		} finally {
			spy.mockRestore();
		}
	});

	test("hidden characters of stderr do not reach the fence", async () => {
		command(shared(), "release", "printf 'a\\342\\200\\213b\\n' >&2\nexit 1");
		expect((await run("release", REPO, TAG)).out).toBe(
			refused("release", "exit", "ab"),
		);
	});

	test.each([
		["release", () => releaseCommand(HOSTILE), [REPO, TAG]],
		[
			"verify",
			() => verifyCommand(HOSTILE),
			[asset, provenance, REPO, REVISION],
		],
	])("%s prints no word of its output", async (operation, write, args) => {
		await releasedFiles();
		write();
		const r = await run(operation, ...args);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toBe(operation === "release" ? released : "verify passed\n");
	});
});

describe("run-installation: release", () => {
	test("release gets the tag, the folder the journal built and the asset", async () => {
		await releasedFiles();
		expect(calls("release")).toEqual([
			`release ${REPO} ${TAG} ${folder()} ${ASSET}`,
		]);
		expect(readdirSync(folder()).sort()).toEqual(
			[ASSET, `${ASSET}.sigstore.json`, "SHA256SUMS"].sort(),
		);
	});

	test("each run removes what the folder held before", async () => {
		mkdirSync(folder(), { recursive: true });
		writeFileSync(join(folder(), "old"), "x");
		await releasedFiles();
		expect(existsSync(join(folder(), "old"))).toBe(false);
	});
});

describe("run-installation: verify", () => {
	test.each([
		["a path outside runs", "shared/x"],
		["runs itself", "runs"],
		["a parent segment", "runs/../shared/release"],
		["an absolute path", "/runs/x"],
		["a missing file", "runs/none"],
		["a folder", "runs/installation-release"],
	])("%s never reaches the command", async (_, path) => {
		await releasedFiles();
		verifyCommand();
		expect((await run("verify", path, provenance, REPO, REVISION)).out).toBe(
			refused("verify", "argument"),
		);
		expect(calls("verify")).toEqual([]);
	});

	test("a link to a plain file never reaches the command", async () => {
		await releasedFiles();
		verifyCommand();
		symlinkSync(join(dir, asset), join(dir, "runs", "link"));
		expect(
			(await run("verify", "runs/link", provenance, REPO, REVISION)).out,
		).toBe(refused("verify", "argument"));
	});

	test("a folder link on the way never reaches the command", async () => {
		await releasedFiles();
		verifyCommand();
		symlinkSync(folder(), join(dir, "runs", "through"));
		const path = `runs/through/${ASSET}`;
		expect((await run("verify", path, provenance, REPO, REVISION)).out).toBe(
			refused("verify", "argument"),
		);
	});

	test.each([
		["a short commit", REPO, "abc"],
		["a repository of three segments", "a/b/c", REVISION],
	])("%s never reaches the command", async (_, repo, commit) => {
		await releasedFiles();
		verifyCommand();
		expect((await run("verify", asset, provenance, repo, commit)).out).toBe(
			refused("verify", "argument"),
		);
	});

	test("verify builds no folder and gets the absolute paths", async () => {
		await releasedFiles();
		verifyCommand("true");
		writeFileSync(join(folder(), "kept"), "x");
		expect((await run("verify", asset, provenance, REPO, REVISION)).out).toBe(
			"verify passed\n",
		);
		expect(existsSync(join(folder(), "kept"))).toBe(true);
		expect(calls("verify")).toEqual([
			`verify ${join(dir, asset)} ${join(dir, provenance)} ${REPO} ${REVISION}`,
		]);
	});
});

describe("run-installation: the four cases of a signature check", () => {
	const tampered = `runs/tampered/${ASSET}`;

	async function cases(): Promise<void> {
		await releasedFiles();
		verifyCommand(fixtureVerifier());
		mkdirSync(join(dir, "runs", "tampered"));
		copyFileSync(join(dir, asset), join(dir, tampered));
		appendFileSync(join(dir, tampered), "x");
	}

	test("the real asset, its file, the release repository and the commit pass", async () => {
		await cases();
		expect(await run("verify", asset, provenance, REPO, REVISION)).toEqual({
			code: EXIT.OK,
			out: "verify passed\n",
			err: "",
		});
	});

	test.each([
		["a changed asset", tampered, REPO, REVISION],
		["another signer", asset, OTHER_REPO, REVISION],
		["another commit", asset, REPO, OTHER_COMMIT],
	])(
		"%s is refused and its arguments arrive as given",
		async (_, path, repo, commit) => {
			await cases();
			const r = await run("verify", path, provenance, repo, commit);
			expect(r.code).toBe(EXIT.COMMAND);
			expect(r.out).toStartWith("verify failed reason=exit\n");
			expect(calls("verify")).toEqual([
				`verify ${join(dir, path)} ${join(dir, provenance)} ${repo} ${commit}`,
			]);
		},
	);
});

describe("run-installation: law-version", () => {
	test("output in form prints the facts and gets the law folder", async () => {
		versionCommand();
		expect(await run("law-version")).toEqual({
			code: EXIT.OK,
			out: `revision=${REVISION}\nchanged=no\ntag=${TAG}\n`,
			err: "",
		});
		expect(calls("law-version")).toEqual([`law-version ${law()}`]);
	});

	test("an empty tag and line ends of a carriage return pass", async () => {
		versionCommand(facts(REVISION, "yes", "", "\r\n"));
		expect((await run("law-version")).out).toBe(
			`revision=${REVISION}\nchanged=yes\ntag=\n`,
		);
	});

	test.each([
		[
			"output outside the form",
			"revision=x\n",
			"the law-version command failed",
		],
		["output that is not UTF-8", "\xff\n", "the law-version command failed"],
		["a revision outside its class", facts("abc"), "a value is not safe"],
		[
			"a tag outside its class",
			facts(REVISION, "no", "-v1"),
			"the tag is not safe",
		],
	])("%s gives its reason and no fact", async (_, output, reason) => {
		versionCommand(output);
		if (output === "\xff\n")
			writeFileSync(join(dir, "law-version.out"), Buffer.from([0xff, 0x0a]));
		expect(await run("law-version")).toEqual({
			code: EXIT.COMMAND,
			out: `law-version stop ${reason}\n`,
			err: "",
		});
	});
});

describe("run-installation as a program", () => {
	test("it prints the outcome and opens no database", () => {
		versionCommand();
		const r = cli(["run-installation", "law-version"], { LAWMAN_DB: dbFile });
		expect(r).toEqual({
			code: 0,
			out: `revision=${REVISION}\nchanged=no\ntag=${TAG}\n`,
			err: "",
		});
		expect(existsSync(dbFile)).toBe(false);
	});

	test("a failure exits 5", () => {
		command(shared(), "verify", "exit 1");
		mkdirSync(join(dir, "runs"));
		writeFileSync(join(dir, "runs", "a"), "x");
		const r = cli(
			["run-installation", "verify", "runs/a", "runs/a", REPO, REVISION],
			{
				LAWMAN_DB: dbFile,
			},
		);
		expect(r).toEqual({ code: 5, out: refused("verify", "exit"), err: "" });
	});
});

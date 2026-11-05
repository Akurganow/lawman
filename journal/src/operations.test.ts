import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as clean from "./clean";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { installationPlace, launch } from "./launch";
import {
	command,
	configs,
	RECORDS,
	recording,
	shared,
} from "./operations-test-fixture";
import { addPrecincts, BASE, dir, SHA, TRUSTED, tempDb } from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const run = (...args: string[]) => inprocAsync(BASE, ["run", "main", ...args]);
const refused = (operation: string, reason: string, detail = "") =>
	`${operation} failed reason=${reason}\n~~~error\n${detail === "" ? "" : `${detail}\n`}~~~\n`;
const decoded = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("run: the command and its outcome", () => {
	test("a command that succeeds prints its output in the operation's form", async () => {
		command(configs("main"), "fetch", `printf '%s\\n' ${SHA}`);
		expect(await run("fetch")).toEqual({
			code: EXIT.OK,
			out: `revision=${SHA}\n`,
			err: "",
		});
	});

	test("a command that exits non-zero gives exit and its stderr in the fence", async () => {
		command(configs("main"), "fetch", "echo broken >&2\nexit 3");
		expect(await run("fetch")).toEqual({
			code: EXIT.COMMAND,
			out: refused("fetch", "exit", "broken"),
			err: "",
		});
	});

	test("a command that a signal ends gives exit", async () => {
		command(configs("main"), "identity", "kill -TERM $$");
		expect(await run("identity")).toEqual({
			code: EXIT.COMMAND,
			out: refused("identity", "exit"),
			err: "",
		});
	});

	test.each([
		["two lines", "printf 'a\\nb\\n'"],
		["no line", "true"],
		["a value outside the class", "printf '%s\\n' '-a'"],
	])("output with %s is outside the form", async (_, body) => {
		command(configs("main"), "fetch", body);
		const r = await run("fetch");
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.out).toBe(
			refused(
				"fetch",
				"form",
				"the output is not one line that holds a revision",
			),
		);
	});

	test("output that is not UTF-8 is outside the form", async () => {
		command(configs("main"), "files", "printf '\\377\\n'");
		expect((await run("files", SHA)).out).toBe(
			refused("files", "form", "the output is not UTF-8"),
		);
	});

	test("a line may end with one newline or one carriage return and newline", async () => {
		command(configs("main"), "identity", "printf 'octo-cat\\r\\n'");
		expect((await run("identity")).out).toBe("login=octo-cat\n");
	});

	test("a file that does not run gives start with an empty fence", async () => {
		command(configs("main"), "fetch", "true", 0o644);
		expect(await run("fetch")).toEqual({
			code: EXIT.COMMAND,
			out: refused("fetch", "start"),
			err: "",
		});
	});

	test("no file makes the operation empty and a step of its own", async () => {
		expect(await run("fetch")).toEqual({
			code: EXIT.OK,
			out: "fetch empty\n",
			err: "",
		});
		const listed = await inprocAsync(BASE, ["commands", "main"]);
		expect(listed.out).toContain("\nfetch empty\n");
	});

	test("a folder named after the operation is no command", async () => {
		mkdirSync(join(configs("main"), "fetch"), { recursive: true });
		expect((await run("fetch")).out).toBe("fetch empty\n");
		expect((await inprocAsync(BASE, ["commands", "main"])).out).toContain(
			"\nfetch empty\n",
		);
	});

	test("a file in place of the precinct folder makes every operation empty", async () => {
		mkdirSync(join(dir, "configs"));
		writeFileSync(configs("main"), "not a folder");
		expect(await run("fetch")).toEqual({
			code: EXIT.OK,
			out: "fetch empty\n",
			err: "",
		});
		expect((await inprocAsync(BASE, ["commands", "main"])).out).toContain(
			"\nfetch empty\n",
		);
	});

	test("the command runs in its own folder", async () => {
		command(configs("main"), "files", "pwd -P");
		const r = await run("files", SHA);
		expect(r.out).toContain(`${join("configs", "main")}\n~~~\n`);
	});

	test("a library failure gives clean with an empty fence", async () => {
		command(configs("main"), "file", "printf 'text\\n'");
		const characters = spyOn(clean, "cleanCharacters").mockRejectedValue(
			new Error("the library quotes text"),
		);
		try {
			expect(await run("file", SHA, "a.md")).toEqual({
				code: EXIT.COMMAND,
				out: refused("file", "clean"),
				err: "",
			});
		} finally {
			characters.mockRestore();
		}
	});
});

describe("run: the arguments", () => {
	const started = () => {
		const file = join(configs("main"), RECORDS);
		return existsSync(file) ? readFileSync(file, "utf8") : "";
	};

	test.each([
		["file", ["a b", "a.md"]],
		["file", ["-x", "a.md"]],
		["file", [SHA, "../a.md"]],
		["file", [SHA, "/etc/a"]],
		["files", ["a;b"]],
		["decider", ["issue", "01"]],
		["decider", ["issue", "-1"]],
		["decider", ["review", "3"]],
	])("%s %j never reaches the command", async (operation, args) => {
		command(configs("main"), operation, recording("true"));
		expect(await run(operation, ...args)).toEqual({
			code: EXIT.COMMAND,
			out: refused(operation, "argument"),
			err: "",
		});
		expect(started()).toBe("");
	});

	test("an argument outside its class is refused before the file is looked for", async () => {
		expect((await run("files", "a b")).out).toBe(refused("files", "argument"));
	});

	test("arguments that pass their class reach the command unchanged", async () => {
		command(configs("main"), "file", recording(`printf '%s|' "$@"`));
		expect((await run("file", SHA, "docs/a-b_c.md")).out).toBe(
			`~~~file\n${SHA}|docs/a-b_c.md|\n~~~\n`,
		);
		expect(started()).not.toBe("");
	});

	test.each([
		[["fetch", "x"]],
		[["file", SHA]],
		[["decider", "issue"]],
		[["issues"]],
		[["issues", "--author", TRUSTED, "--reset", "--reset"]],
		[["pulls", "--author", TRUSTED, "--reset"]],
		[["review"]],
		[[]],
	])("the arguments %j are a usage error", async (args) => {
		const r = await run(...args);
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.out).toBe("");
		expect(r.err).toContain("usage: journal run");
	});

	test("an author outside the login class is a usage error, as in sync", async () => {
		const r = await run("issues", "--author", "a b");
		expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
		expect(r.err).toContain("invalid login");
	});

	test("an unknown precinct is a usage error", async () => {
		const r = await inprocAsync(BASE, ["run", "ghost", "fetch"]);
		expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
		expect(r.err).toContain("unknown precinct: ghost");
	});
});

describe("run: the operations", () => {
	test("file prints the text in a file fence, files the list in a files fence", async () => {
		command(configs("main"), "file", "printf 'one\\ntwo\\n'");
		command(configs("main"), "files", "printf 'a.md\\nb c.md\\n'");
		expect((await run("file", SHA, "a.md")).out).toBe(
			"~~~file\none\ntwo\n~~~\n",
		);
		expect((await run("files", SHA)).out).toBe("~~~files\na.md\nb c.md\n~~~\n");
	});

	test("decider prints what the decider command prints on the same form", async () => {
		command(
			configs("main"),
			"decider",
			`printf '%s' '{"lastActor":"Maintainer","writers":["maintainer"]}'`,
		);
		expect(await run("decider", "pull", "7")).toEqual({
			code: EXIT.OK,
			out: "decider=yes actor=Maintainer\n",
			err: "",
		});
	});

	test("a decider form the reader refuses prints form with its message in the fence", async () => {
		command(
			configs("main"),
			"decider",
			`printf '%s' '{"lastActor":"a b","writers":[]}'`,
		);
		const r = await run("decider", "issue", "3");
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.out).toStartWith("decider failed reason=form\n~~~error\n");
		expect(r.out).toContain('lastActor is not a valid login: "a b"');
		expect(r.out).toEndWith("\n~~~\n");
	});
});

describe("commands", () => {
	test("prints the folder, then one line for each operation of a precinct", async () => {
		command(configs("main"), "issues", "true");
		command(configs("main"), "file", "true");
		expect(await inprocAsync(BASE, ["commands", "main"])).toEqual({
			code: EXIT.OK,
			out: `folder ${dir}\nfetch empty\nidentity empty\nissues command\npulls empty\ndecider empty\nfile command\nfiles empty\n`,
			err: "",
		});
	});

	test("without a precinct it lists the operations of the installation", async () => {
		command(shared(), "verify", "true");
		expect((await inprocAsync(BASE, ["commands"])).out).toBe(
			`folder ${dir}\nrelease empty\nverify command\nlaw-version empty\n`,
		);
	});

	test("a folder without configs makes every operation empty", async () => {
		const out = (await inprocAsync(BASE, ["commands", "main"])).out;
		expect(out.split("\n").slice(1, -1)).toEqual(
			["fetch", "identity", "issues", "pulls", "decider", "file", "files"].map(
				(op) => `${op} empty`,
			),
		);
	});

	test.each([[["ghost"]], [["Bad"]], [["main", "extra"]]])(
		"%j is a usage error",
		async (args) => {
			const r = await inprocAsync(BASE, ["commands", ...args]);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.out).toBe("");
		},
	);
});

describe("the launch module", () => {
	test("an argument reaches the command unchanged", async () => {
		command(configs("main"), "files", `printf '%s\\n' "$@"`);
		const ran = await launch(configs("main"), "files", ["a b;$(x)", "'\"`"]);
		expect(ran?.ok).toBe(true);
		expect(decoded(ran?.stdout ?? new Uint8Array())).toBe("a b;$(x)\n'\"`\n");
	});

	test("runs a command of the installation from shared", async () => {
		command(shared(), "release", "printf 'v1.0.0\\n'");
		process.env.LAWMAN_DB = join(dir, "journal.sqlite");
		try {
			const ran = await launch(installationPlace(), "release", []);
			expect(ran?.ok).toBe(true);
			expect(decoded(ran?.stdout ?? new Uint8Array())).toBe("v1.0.0\n");
		} finally {
			delete process.env.LAWMAN_DB;
		}
	});

	test("a file that does not start gives null", async () => {
		expect(await launch(configs("main"), "fetch", [])).toBeNull();
	});
});

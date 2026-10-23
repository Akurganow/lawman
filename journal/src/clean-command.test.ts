import { describe, expect, test } from "bun:test";
import { EXIT } from "./db";
import { cli } from "./test-helpers";

const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const BROKEN = `{"body": "secret words ${TOKEN}", bad}`;
const WHOLE = [
	"Closes #3\nCloses #4\n\nTaken up by the clerk as a draft that counts as not started.",
	"my-app[bot]",
	"john_",
	"_john",
	"https://github.com/o/r/pull/7",
	"src/__init__.py",
	"a1b2c3d Fix\ne4f5a6b Add __init__.py loader",
];
const FAILED =
	"journal: clean: a library failed while cleaning the text; run the command again\n";
const DEEP = `${"<div>".repeat(20_000)}x`;

const run = (input: string, ...args: string[]) =>
	cli(["clean", ...args], {}, input);

describe("clean command, plain text", () => {
	test("a commit subject is text, never JSON", () => {
		expect(run("[core] fix\n")).toEqual({
			code: EXIT.OK,
			out: "[core] fix\n",
			err: "",
		});
		expect(run('{"a": 1')).toEqual({
			code: EXIT.OK,
			out: '{"a": 1\n',
			err: "",
		});
	});

	test("host text is cleaned", () => {
		expect(run(`key ${TOKEN} <!-- hidden -->\n\na\u200Bb\n`).out).toBe(
			`key ${LABEL}\n\nab\n`,
		);
	});
});

describe("clean command, --json", () => {
	test("one value is printed as compact JSON with every string cleaned", () => {
		const input = JSON.stringify(
			{ title: "t", n: 1, ok: true, none: null, list: [{ body: TOKEN }] },
			null,
			2,
		);
		expect(run(input, "--json")).toEqual({
			code: EXIT.OK,
			out: '{"title":"t","n":1,"ok":true,"none":null,"list":[{"body":"REMOVED GITHUB SECRET"}]}\n',
			err: "",
		});
	});

	test("a sequence of values gives one line each", () => {
		expect(run('[1]\n"a\u200Bb"\n{"x": []}[2]', "--json").out).toBe(
			'[1]\n"ab"\n{"x":[]}\n[2]\n',
		);
	});

	test("broken JSON gives exit 1, empty stdout and no input or parser text", () => {
		const r = run(BROKEN, "--json");
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.out).toBe("");
		expect(r.err).toContain("clean:");
		for (const leak of [
			"secret words",
			TOKEN,
			"bad",
			"SyntaxError",
			"Parse error",
			"Failed to parse",
		])
			expect(r.err).not.toContain(leak);
	});

	test("an unfinished value after a good one is broken JSON", () => {
		expect(run('[1]\n{"a": ', "--json")).toMatchObject({
			code: EXIT.USAGE,
			out: "",
		});
	});
});

describe("clean command, both forms", () => {
	test.each(WHOLE)(
		"text cleaning leaves whole comes back byte for byte %j",
		(text) => {
			expect(run(`${text}\n`)).toEqual({
				code: EXIT.OK,
				out: `${text}\n`,
				err: "",
			});
			expect(run(JSON.stringify({ body: text }), "--json")).toEqual({
				code: EXIT.OK,
				out: `${JSON.stringify({ body: text })}\n`,
				err: "",
			});
		},
	);

	test("a library failure gives exit 1, empty stdout and a fixed message", () => {
		expect(run(DEEP)).toEqual({ code: EXIT.USAGE, out: "", err: FAILED });
		expect(run(JSON.stringify(DEEP), "--json")).toEqual({
			code: EXIT.USAGE,
			out: "",
			err: FAILED,
		});
	});

	test.each([[[]], [["--json"]]])(
		"empty input gives empty output %j",
		(args) => {
			expect(run("", ...args)).toEqual({ code: EXIT.OK, out: "", err: "" });
			expect(run(" \n", ...args)).toEqual({ code: EXIT.OK, out: "", err: "" });
		},
	);

	test.each([[["extra"]], [["--json", "x"]], [["--jsonx"]]])(
		"the arguments %j are a usage error",
		(args) => {
			const r = run("", ...args);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.out).toBe("");
			expect(r.err).toContain("--json");
		},
	);
});

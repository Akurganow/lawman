import { describe, expect, test } from "bun:test";
import { EXIT } from "./db";
import { cli } from "./test-helpers";

const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const BROKEN = `{"body": "secret words ${TOKEN}", bad}`;

const run = (input: string, ...args: string[]) =>
	cli(["clean", ...args], {}, input);

describe("clean command, plain text", () => {
	test("a commit subject is text, never JSON", () => {
		expect(run("[core] fix\n")).toEqual({
			code: EXIT.OK,
			out: "\\[core] fix\n",
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

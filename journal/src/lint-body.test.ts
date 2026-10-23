import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { EXIT } from "./db";
import { lintBody } from "./lint-body";
import { cli, lead, PRIVATE_KEYS, ret } from "./test-helpers";

const HOME_MAC = ["/Us", "ers/someone"].join("");
const TOKEN = ["gh", "p_", "a1B2c3D4e5F6g7H8i9J0k1L2"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const ZWSP = "\u200B";
const FENCE = "```";

const privateKey = () =>
	generateKeyPairSync("ec", {
		namedCurve: "P-256",
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	}).privateKey.trim();

const FINE = [
	"Analysed commit: 0123456",
	"",
	"## What",
	"A function nobody calls.",
	"",
];
const text = (...lines: string[]) => [...lines, lead()].join("\n");
const reasonsOf = (...lines: string[]) => lintBody(text(...lines));

describe("lint-body own words", () => {
	test("a stray end tag before text is no failure", async () => {
		expect(await reasonsOf("a", "</div>text")).toEqual([]);
	});

	test("a finding on a CR-only text gives its own line", async () => {
		const input = ["a", "b", `c&#x200B;d`, "e", lead()].join("\r");
		expect(await lintBody(input)).toEqual(["3: invisible character"]);
	});

	test("a clean comment passes", async () => {
		expect(await reasonsOf(...FINE)).toEqual([]);
	});

	test("paths, mentions, shell characters and size are not checked", async () => {
		const lines = [
			`see ${HOME_MAC}/code and ~/x and $HOME and .lawman/bin`,
			"thanks @someone, it's `$1` and \\x",
			"x".repeat(70 * 1024),
		];
		expect(await reasonsOf(...lines)).toEqual([]);
	});

	test("a secret is rejected with its line", async () => {
		expect(await reasonsOf("ok", `key ${TOKEN}`)).toEqual(["2: secret"]);
	});

	test("a secret split by an invisible character is rejected", async () => {
		const split = `${TOKEN.slice(0, 2)}${ZWSP}${TOKEN.slice(2)}`;
		expect(await reasonsOf(`key ${split}`)).toEqual([
			"1: secret",
			"1: invisible character",
		]);
	});

	test("a secret written with character references is rejected", async () => {
		expect(await reasonsOf("ok", `key &#103;${TOKEN.slice(1)}`)).toEqual([
			"2: secret",
		]);
		expect(await reasonsOf(`<a title="&#x67;${TOKEN.slice(1)}">x</a>`)).toEqual(
			["1: secret"],
		);
	});

	test("a secret inside a code span is rejected", async () => {
		expect(await reasonsOf("ok", "ok", `the \`${TOKEN}\` value`)).toEqual([
			"3: secret",
		]);
	});

	test("a key block over several lines is rejected where it starts", async () => {
		expect(await reasonsOf("ok", privateKey())).toEqual(["2: secret"]);
	});

	test.each(PRIVATE_KEYS)("%s is rejected where it starts", async (_, make) => {
		expect(await reasonsOf("ok", make().trim())).toEqual(["2: secret"]);
	});

	test("an invisible character is rejected with its line", async () => {
		expect(await reasonsOf("ok", `a${ZWSP}b`)).toEqual([
			"2: invisible character",
		]);
	});

	test("an invisible character inside a code span or written as a reference is rejected", async () => {
		expect(await reasonsOf(`the \`a${ZWSP}b\` span`)).toEqual([
			"1: invisible character",
		]);
		expect(await reasonsOf("ok", "a&#x200B;b")).toEqual([
			"2: invisible character",
		]);
	});

	test("a Markdown image is rejected with its line", async () => {
		expect(await reasonsOf("ok", "![shot](https://example.org/a.png)")).toEqual(
			["2: image embed"],
		);
		expect(
			await reasonsOf("![shot][a]", "", "[a]: https://example.org/a.png"),
		).toEqual(["1: image embed"]);
	});

	test.each([
		['<img src="https://example.org/a.png">', "image embed"],
		["<IMG src=x>", "image embed"],
		["<img src=https://example.org/a.png alt=a/b>", "image embed"],
		["<picture><img src=a.png></picture>", "image embed"],
		['<picture><source srcset="a.png"></picture>', "loading element"],
		['<svg><image href="https://example.org/a.png"/></svg>', "image embed"],
	])("the HTML image %s is rejected with its line", async (tag, rule) => {
		expect(await reasonsOf("ok", "", tag)).toEqual([`3: ${rule}`]);
	});

	test("an element that loads an address is rejected with its line", async () => {
		expect(
			await reasonsOf(
				"ok",
				'<video poster="https://example.org/p.png"></video>',
			),
		).toEqual(["2: loading element"]);
		expect(
			await reasonsOf('<object data="https://example.org/x"></object>'),
		).toEqual(["1: loading element"]);
	});

	test("an HTML comment other than the trailing marker is rejected with its line", async () => {
		expect(await reasonsOf("ok", "<!-- note -->")).toEqual(["2: HTML comment"]);
		expect(
			await reasonsOf("<details>", "<!-- note -->", "shown", "</details>"),
		).toEqual(["2: HTML comment"]);
		expect(await reasonsOf("text <!-- inline --> text")).toEqual([
			"1: HTML comment",
		]);
		expect(await reasonsOf(ret(), "", "ok")).toEqual(["1: HTML comment"]);
	});

	test("image and comment syntax inside a code span passes", async () => {
		expect(
			await reasonsOf(
				"the `vec![1]` macro, `![a](b)`, `<img src=x>` and `<!-- c -->`",
			),
		).toEqual([]);
	});

	test("image and comment syntax inside a code block passes", async () => {
		expect(
			await reasonsOf(
				FENCE,
				"let v = vec![1];",
				"<img src=x>",
				"<!-- c -->",
				FENCE,
			),
		).toEqual([]);
		expect(await reasonsOf("    <img src=x>", "    <!-- c -->", "")).toEqual(
			[],
		);
	});

	test("a secret or an invisible character in a quote is never rejected", async () => {
		expect(await reasonsOf(FENCE, `key ${TOKEN} a${ZWSP}b`, FENCE)).toEqual([]);
	});

	test("a secret or an invisible character in a fence's info string is rejected", async () => {
		expect(
			await reasonsOf("ok", "", `${FENCE}js ${TOKEN}`, "x", FENCE),
		).toEqual(["3: secret"]);
		expect(await reasonsOf(`${FENCE}j${ZWSP}s`, "x", FENCE)).toEqual([
			"1: invisible character",
		]);
	});

	test("findings come in line order, several on one line each once", async () => {
		expect(
			await reasonsOf(`<!-- c --> ${TOKEN} a${ZWSP}b`, "![x](y) <img src=z>"),
		).toEqual([
			"1: secret",
			"1: invisible character",
			"1: HTML comment",
			"2: image embed",
		]);
	});

	test("no reason holds the matched text", async () => {
		const reasons = (
			await reasonsOf(`${TOKEN} <!-- someone --> ![x](https://example.org/y)`)
		).join("\n");
		for (const value of [TOKEN, "someone", "example.org"])
			expect(reasons).not.toContain(value);
	});
});

describe("lint-body marker contract", () => {
	test("the marker may be followed by blank lines", async () => {
		expect(await lintBody(`${text(...FINE)}\n\n  \n`)).toEqual([]);
	});

	test("the last non-blank line must be a valid marker", async () => {
		expect(await lintBody(FINE.join("\n"))).toEqual([
			"4: last line is not a valid marker",
		]);
		expect(await lintBody([lead(), "trailing words"].join("\n"))).toEqual([
			"1: HTML comment",
			"2: last line is not a valid marker",
		]);
		expect(
			await lintBody(lead().replace("role=patrol", "role=Patrol")),
		).toEqual(["1: HTML comment", "1: last line is not a valid marker"]);
		expect(await lintBody(` ${lead()}`)).toEqual([
			"1: HTML comment",
			"1: last line is not a valid marker",
		]);
	});

	test("empty input has no marker", async () => {
		expect(await lintBody("")).toEqual(["1: last line is not a valid marker"]);
		expect(await lintBody("\n\n")).toEqual([
			"1: last line is not a valid marker",
		]);
	});

	test("a marker inside a fenced block is inside code", async () => {
		expect(await lintBody([FENCE, lead(), FENCE].join("\n"))).toEqual([
			"3: last line is inside a fenced block",
		]);
		expect(await lintBody(["text", FENCE, lead()].join("\n"))).toEqual([
			"3: last line is inside a fenced block",
		]);
	});

	test("a marker the journal reads as fenced is inside a fenced block", async () => {
		expect(await lintBody(`</div>\n   ~~~\n<div>\n\n${lead()}`)).toEqual([
			"5: HTML comment",
			"5: last line is inside a fenced block",
		]);
	});

	test("CRLF line ends are accepted and counted once", async () => {
		expect(await lintBody(`ok\r\n${lead()}\r\n`)).toEqual([]);
		expect(
			await lintBody(`ok\r\n<!-- c -->\r\n<img src=x>\r\n${lead()}\r\n`),
		).toEqual(["2: HTML comment", "3: image embed"]);
	});

	test("without the marker requirement any text passes and every comment is a finding", async () => {
		expect(await lintBody("[core] fix: it's done", false)).toEqual([]);
		expect(await lintBody("", false)).toEqual([]);
		expect(await lintBody(lead(), false)).toEqual(["1: HTML comment"]);
		expect(await lintBody(`x ${TOKEN}`, false)).toEqual(["1: secret"]);
	});
});

describe("lint-body command", () => {
	const feed = (input: string, ...args: string[]) =>
		cli(["lint-body", ...args], {}, input);

	test("a clean text is printed on stdout with exit 0", () => {
		const input = `${text(...FINE)}\n`;
		expect(feed(input)).toEqual({ code: EXIT.OK, out: input, err: "" });
	});

	test("a quote is cleaned on stdout and gets a longer fence", () => {
		const r = feed(
			`${text("a", FENCE, `key ${TOKEN} \`\`${ZWSP}\``, FENCE)}\n`,
		);
		expect(r).toEqual({
			code: EXIT.OK,
			out: `${text("a", "````", `key ${LABEL} \`\`\``, "````")}\n`,
			err: "",
		});
	});

	test("a comment in a fence and a code span passes unchanged", () => {
		const input = `${text("the `<!-- c -->` span", "", FENCE, "<!-- c -->", FENCE)}\n`;
		expect(feed(input)).toEqual({ code: EXIT.OK, out: input, err: "" });
	});

	test("findings go to stderr, stdout stays empty and the exit is 7", () => {
		expect(feed(`${text("ok", "<img src=x>", TOKEN)}\n`)).toEqual({
			code: EXIT.LINT_BODY,
			out: "",
			err: "2: image embed\n3: secret\n",
		});
	});

	test("--no-marker takes a title or a commit message", () => {
		expect(feed("[core] fix: it's done\n", "--no-marker")).toEqual({
			code: EXIT.OK,
			out: "[core] fix: it's done\n",
			err: "",
		});
		expect(feed(`${lead()}\n`, "--no-marker")).toEqual({
			code: EXIT.LINT_BODY,
			out: "",
			err: "1: HTML comment\n",
		});
	});

	test.each([[["extra"]], [["--no-marker", "x"]], [["--marker"]]])(
		"the arguments %j are a usage error",
		(args) => {
			const r = cli(["lint-body", ...args]);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.out).toBe("");
			expect(r.err).toContain("--no-marker");
		},
	);
});

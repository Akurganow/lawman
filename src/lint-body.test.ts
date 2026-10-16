import { describe, expect, test } from "bun:test";
import { EXIT } from "./db";
import { BODY_MAX_BYTES, lintBody } from "./lint";
import { cli, lead, ret } from "./test-helpers";

const HOME_MAC = ["/Us", "ers/someone"].join("");
const HOME_LINUX = ["/ho", "me/someone"].join("");

describe("lint-body", () => {
	const TITLE = "[Lead] core: dead code";
	const TOKEN = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2";
	const FINE = [
		"Analysed commit: 0123456",
		"",
		"## What",
		"A function nobody calls.",
		"",
	];
	const body = (...lines: string[]) => [...lines, lead()].join("\n");
	const lintText = (text: string, title = TITLE) =>
		lintBody(`${title}\n\n${text}`);
	const reasonsOf = (...lines: string[]) => lintText(body(...lines));

	test("a clean body passes", () => {
		expect(reasonsOf(...FINE)).toEqual([]);
	});

	test("the marker may be followed by blank lines", () => {
		expect(lintText(`${body(...FINE)}\n\n  \n`)).toEqual([]);
	});

	test("home directories, $HOME and installation roots are rejected with the body line", () => {
		const leaks = [
			`see ${HOME_MAC}/code`,
			`see ${HOME_LINUX}/code`,
			"see ~/code",
			"run $HOME/bin",
			`run $\{HOME}/bin`,
			"tool at .lawman/bin/journal",
			"tool at /opt/.lawman/bin",
			"tool at .lawman",
		];
		for (const leak of leaks)
			expect(reasonsOf("ok", leak)).toEqual(["2: home or installation path"]);
	});

	test("the precinct-local department directory is allowed, any other .lawman path is not", () => {
		expect(reasonsOf("page at .lawman/departments/x.md")).toEqual([]);
		expect(reasonsOf("page at tree/.lawman/departments/x.md")).toEqual([]);
		expect(reasonsOf("page at .lawman/departments")).toEqual([
			"1: home or installation path",
		]);
		expect(reasonsOf("page at .lawman/other/x.md")).toEqual([
			"1: home or installation path",
		]);
		expect(reasonsOf("a name like not.lawman is no segment")).toEqual([]);
	});

	test("a segment that only resembles a home directory passes", () => {
		expect(
			reasonsOf("src/Us" + "ers/model.rs", "see https://example.org/x"),
		).toEqual([]);
	});

	test("GitHub token shapes are rejected", () => {
		const pat = `github_pat_${"A1b2C3d4E5f6G7h8I9j0_k"}`;
		for (const secret of [
			TOKEN,
			pat,
			`gho_${"x".repeat(20)}`,
			`ghs_${"y".repeat(30)}`,
		]) {
			expect(reasonsOf(`key ${secret}`)).toEqual(["1: GitHub token"]);
		}
		expect(reasonsOf("ghp_short")).toEqual([]);
	});

	test("image embeds and image tags are rejected", () => {
		for (const line of [
			"![shot](https://example.org/a.png)",
			"<img src=x>",
			"<IMG src=x>",
			"<picture>",
		]) {
			expect(reasonsOf(line)).toEqual(["1: image embed"]);
		}
	});

	test("an @ mention is rejected outside code", () => {
		expect(reasonsOf("thanks @someone")).toEqual(["1: @ mention"]);
		expect(reasonsOf("mail a@b.example")).toEqual(["1: @ mention"]);
		expect(reasonsOf("@7days")).toEqual(["1: @ mention"]);
	});

	test("an @ sign without a letter or digit after it passes", () => {
		expect(reasonsOf("at @ sign, @-, @")).toEqual([]);
	});

	test("an @ inside a code span passes, one outside it does not", () => {
		expect(reasonsOf("the `@Override` tag and ``@x`` too")).toEqual([]);
		expect(reasonsOf("the `@Override` tag and @someone")).toEqual([
			"1: @ mention",
		]);
		expect(reasonsOf("an unclosed `span @someone")).toEqual(["1: @ mention"]);
	});

	test("a Source line naming a package version or a release is not a mention", () => {
		expect(reasonsOf("Source: advisories npm left-pad@1.3.0")).toEqual([]);
		expect(reasonsOf("Source: advisories pip @scope/pkg@1.0.0-rc.1")).toEqual(
			[],
		);
		expect(reasonsOf("Source: releases owner/repo")).toEqual([]);
		expect(reasonsOf("Source: advisories npm a@1 thanks @someone")).toEqual([
			"1: @ mention",
		]);
		expect(reasonsOf("Source: advisories npm left-pad@1.3.0 ping@x")).toEqual([
			"1: @ mention",
		]);
		expect(reasonsOf("note Source: advisories npm left-pad@1.3.0")).toEqual([
			"1: @ mention",
		]);
	});

	test("an @ inside a fenced block passes, other rules still apply there", () => {
		expect(reasonsOf("```", "@Override", "```")).toEqual([]);
		expect(reasonsOf("~~~~", "@Override", "~~~", "@someone", "~~~~")).toEqual(
			[],
		);
		expect(reasonsOf("```", "@Override", "```", "@someone")).toEqual([
			"4: @ mention",
		]);
		expect(reasonsOf("```", `${HOME_LINUX}/x`, "```")).toEqual([
			"2: home or installation path",
		]);
	});

	test("one line can fail several rules, each named once and in a fixed order", () => {
		expect(reasonsOf(`${HOME_LINUX} ${TOKEN} @someone`)).toEqual([
			"1: home or installation path",
			"1: GitHub token",
			"1: @ mention",
		]);
	});

	test("the output never holds the matched text", () => {
		const text = reasonsOf(`${HOME_LINUX} ${TOKEN} @someone ![x](y)`).join(
			"\n",
		);
		for (const secret of ["someone", TOKEN, "![x]"])
			expect(text).not.toContain(secret);
	});

	test("the last non-empty line must be a valid marker", () => {
		const missing = lintText(FINE.join("\n"));
		expect(missing).toEqual(["4: last line is not a valid marker"]);
		const notLast = lintText([lead(), "trailing words"].join("\n"));
		expect(notLast).toEqual(["2: last line is not a valid marker"]);
		expect(lintText(lead().replace("role=patrol", "role=Patrol"))).toEqual([
			"1: last line is not a valid marker",
		]);
	});

	test("an empty body has no marker", () => {
		expect(lintBody(`${TITLE}\n\n`)).toEqual([
			"1: last line is not a valid marker",
		]);
		expect(lintBody(`${TITLE}\n`)).toEqual([
			"1: last line is not a valid marker",
		]);
	});

	test("the marker stage is not constrained", () => {
		expect(lintText(ret())).toEqual([]);
	});

	test("a marker inside a closed fence at the end is rejected by the fence", () => {
		expect(lintText(["```", lead(), "```"].join("\n"))).toEqual([
			"3: last line is inside a fenced block",
		]);
	});

	test("CRLF line ends are accepted", () => {
		expect(lintBody(`${TITLE}\r\n\r\nok\r\n${lead()}\r\n`)).toEqual([]);
	});

	test("the size limit is 64 KB and counts bytes of the body", () => {
		expect(BODY_MAX_BYTES).toBe(64 * 1024);
		const room = BODY_MAX_BYTES - Buffer.byteLength(`\n${lead()}`);
		expect(lintText(`${"x".repeat(room)}\n${lead()}`)).toEqual([]);
		expect(lintText(`${"x".repeat(room + 1)}\n${lead()}`)).toEqual([
			`1: body exceeds ${BODY_MAX_BYTES} bytes`,
		]);
		expect(lintText(`${"é".repeat(BODY_MAX_BYTES / 2)}\n${lead()}`)).toEqual([
			`1: body exceeds ${BODY_MAX_BYTES} bytes`,
		]);
	});

	test("the title is checked with the same rules and reported as title", () => {
		expect(lintText(body(...FINE), "")).toEqual(["title: empty title"]);
		expect(lintText(body(...FINE), "x @someone")).toEqual(["title: @ mention"]);
		expect(lintText(body(...FINE), `x ${HOME_LINUX}`)).toEqual([
			"title: home or installation path",
		]);
		expect(lintText(body(...FINE), `x ${TOKEN}`)).toEqual([
			"title: GitHub token",
		]);
	});

	test("a title with a shell character is rejected, the body is not", () => {
		for (const c of ["'", "`", "$", "\\"])
			expect(lintText(body(...FINE), `x ${c} y`)).toEqual([
				"title: shell character",
			]);
		expect(lintText(body("call `f()` costs $1 and 'x'", ...FINE))).toEqual([]);
	});

	test("a second line that is not blank is a title error and the body starts there", () => {
		expect(lintBody(`${TITLE}\nfirst body line\n${lead()}`)).toEqual([
			"title: no blank line after the title",
		]);
	});

	describe("command", () => {
		const feed = (input: string) => cli(["lint-body"], {}, input);

		test("a clean body prints nothing and exits 0", () => {
			const r = feed(`${TITLE}\n\n${body(...FINE)}\n`);
			expect([r.code, r.out, r.err]).toEqual([0, "", ""]);
		});

		test("rejected input prints one reason per line on stdout and exits 7", () => {
			const r = feed(`${TITLE}\n\n${body(HOME_LINUX, "@someone")}\n`);
			expect(r.code).toBe(EXIT.LINT_BODY);
			expect(r.out).toBe("1: home or installation path\n2: @ mention\n");
			expect(r.err).toBe("");
		});

		test("a marker after an unclosed fence is rejected with exit 7", () => {
			const r = feed(`${TITLE}\n\ntext\n\`\`\`\n${lead()}\n`);
			expect(r.code).toBe(EXIT.LINT_BODY);
			expect(r.out).toBe("3: last line is inside a fenced block\n");
		});

		test("empty stdin is rejected with exit 7", () => {
			const r = feed("");
			expect(r.code).toBe(7);
			expect(r.out).toBe(
				"title: empty title\n1: last line is not a valid marker\n",
			);
		});

		test("arguments are a usage error that names the input format", () => {
			const r = cli(["lint-body", "extra"]);
			expect(r.code).toBe(1);
			expect(r.err).toContain("title");
			expect(r.err).toContain("blank line");
		});
	});
});

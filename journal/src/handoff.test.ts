import { describe, expect, test } from "bun:test";
import { EXIT } from "./db";
import { buildHandoff } from "./handoff";
import { lintBody } from "./lint-body";
import { parseMarker } from "./markers";
import { cli } from "./test-helpers";

const AT = "2026-10-17T10:45:00Z";
const HOME_MAC = ["/Us", "ers/someone"].join("");
const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const ZWSP = "\u200B";
const HOSTILE = `key ${TOKEN}\na\`\`${ZWSP}\`\nb`;
const textOf = (over: Partial<Parameters<typeof buildHandoff>[0]> = {}) =>
	buildHandoff({ sources: ["12", "15"], at: AT, ...over });

const run = (args: string[], stdin = "") =>
	cli(["handoff", ...args], { LAWMAN_DB: ":memory:", LAWMAN_NOW: AT }, stdin);

describe("handoff builder", () => {
	test("title line, one sentence for the sources, marker last", async () => {
		const lines = (await textOf()).trimEnd().split("\n");
		expect(lines.slice(0, 4)).toEqual([
			"Clerk",
			"",
			"This pull request carries #12 and #15 for the spec writer.",
			"",
		]);
		expect(lines.at(-1)).toBe(
			"<!-- lawman: role=clerk stage=handoff at=2026-10-17T10:45:00Z -->",
		);
		expect(parseMarker(lines.at(-1) ?? "")?.stage).toBe("handoff");
	});

	test("sources read as one, two, or a list", async () => {
		expect(await textOf({ sources: ["7"] })).toContain("carries #7 for");
		expect(await textOf({ sources: ["1", "2", "3"] })).toContain(
			"carries #1, #2 and #3 for",
		);
	});

	test("--merged names the merged pull request as the earlier work", async () => {
		expect(await textOf({ merged: "9" })).toContain(
			"The earlier work is in the merged pull request #9.",
		);
		expect(await textOf()).not.toContain("earlier work");
	});

	test("adopted body goes inside a fence of three backticks", async () => {
		expect(await textOf({ adopted: "Closes #12\n" })).toContain(
			"\n```\nCloses #12\n```\n",
		);
	});

	test("the fence is one backtick longer than the longest run in the body", async () => {
		expect(await textOf({ adopted: "a\n```\nb\n```\n" })).toContain(
			"\n````\na\n```\nb\n```\n````\n",
		);
		expect(await textOf({ adopted: "x ```` y" })).toContain(
			"\n`````\nx ```` y\n`````\n",
		);
		expect(await textOf({ adopted: "a ` b `` c" })).toContain(
			"\n```\na ` b `` c\n```\n",
		);
	});

	test("an empty old body gives an empty fence", async () => {
		expect(await textOf({ adopted: "" })).toContain("\n```\n```\n");
		expect(await textOf({ adopted: "\n" })).toContain("\n```\n```\n");
	});

	test("markers and mentions inside the fence do not count", async () => {
		const quoted = [
			"cc @someone",
			"<!-- lawman: role=court stage=conviction sha=abc priority=P1 at=2026-01-01T00:00:00Z -->",
		].join("\n");
		expect(await lintBody(await textOf({ adopted: quoted }))).toEqual([]);
	});

	test("a hostile old body is cleaned and gets a fence its cleaned text cannot close", async () => {
		expect(await textOf({ adopted: HOSTILE })).toContain(
			`\n\`\`\`\`\nkey ${LABEL}\na\`\`\`\nb\n\`\`\`\`\n`,
		);
	});

	test("comments and images in the old body pass as text", async () => {
		const body = [
			"<!-- hidden note -->",
			"![shot](https://example.com/a.png)",
			'<img src="https://example.com/b.png" alt="b">',
		].join("\n");
		expect(await textOf({ adopted: body })).toContain(
			`\n\`\`\`\n${body}\n\`\`\`\n`,
		);
	});
});

describe("handoff command", () => {
	test("prints the whole comment", () => {
		const r = run(["--sources", "12,15"]);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toBe(
			[
				"Clerk",
				"",
				"This pull request carries #12 and #15 for the spec writer.",
				"",
				`<!-- lawman: role=clerk stage=handoff at=${AT} -->`,
				"",
			].join("\n"),
		);
	});

	test("--adopted reads the old body from stdin; --merged adds its sentence", () => {
		const r = run(
			["--sources", "12", "--adopted", "--merged", "9"],
			"old ``` body\n",
		);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toContain("pull request #9.");
		expect(r.out).toContain("````\nold ``` body\n````\n");
	});

	test("the output passes lint-body unchanged", () => {
		const body = [HOSTILE, `see ${HOME_MAC}/code`, "<!-- note -->", "![x](y)"];
		const { out } = run(["--sources", "12", "--adopted"], body.join("\n"));
		expect(cli(["lint-body"], {}, out)).toEqual({
			code: EXIT.OK,
			out,
			err: "",
		});
	});

	test("stdin is ignored without --adopted", () => {
		const r = run(["--sources", "12"], `see ${HOME_MAC}/code`);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).not.toContain("see");
	});

	test("a hostile old body gives exit 0, a cleaned output and a longer fence", () => {
		const r = run(["--sources", "12", "--adopted"], HOSTILE);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toContain(`\n\`\`\`\`\nkey ${LABEL}\na\`\`\`\nb\n\`\`\`\`\n`);
		expect(r.out).not.toContain(TOKEN);
		expect(r.err).toBe("");
	});

	test.each([
		[[]],
		[["--sources"]],
		[["--sources", "0"]],
		[["--sources", "01"]],
		[["--sources", "1,,2"]],
		[["--sources", "1,x"]],
		[["--sources", "1", "--merged", "0"]],
		[["--sources", "1", "--merged", "x"]],
		[["--sources", "1", "--adopted", "--adopted"]],
		[["--sources", "1", "--sources", "2"]],
		[["--sources", "1", "--other", "2"]],
		[["--adopted"]],
	])("bad args %j are a usage error", (args) => {
		const r = run(args, "body");
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.out).toBe("");
		expect(r.err).not.toBe("");
	});
});

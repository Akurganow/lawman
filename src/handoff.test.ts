import { describe, expect, test } from "bun:test";
import { EXIT } from "./db";
import { buildHandoff, handoffCommand } from "./handoff";
import { captured } from "./inproc";
import { lintBody } from "./lint";
import { parseMarker } from "./markers";
import { cli, tempDb } from "./test-helpers";

const AT = "2026-10-17T10:45:00Z";
const HOME_MAC = ["/Us", "ers/someone"].join("");
const build = (
	over: Partial<Parameters<typeof buildHandoff>[0]> = {},
): ReturnType<typeof buildHandoff> =>
	buildHandoff({ sources: ["12", "15"], at: AT, ...over });
const textOf = (over: Partial<Parameters<typeof buildHandoff>[0]> = {}) => {
	const built = build(over);
	if (built.reasons.length > 0) throw new Error(built.reasons.join(", "));
	return built.text;
};

const run = (args: string[], stdin = "") =>
	cli(["handoff", ...args], { LAWMAN_DB: ":memory:", LAWMAN_NOW: AT }, stdin);

describe("handoff builder", () => {
	test("title line, one sentence for the sources, marker last", () => {
		const lines = textOf().trimEnd().split("\n");
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

	test("sources read as one, two, or a list", () => {
		expect(textOf({ sources: ["7"] })).toContain("carries #7 for");
		expect(textOf({ sources: ["1", "2", "3"] })).toContain(
			"carries #1, #2 and #3 for",
		);
	});

	test("--merged names the merged pull request as the earlier work", () => {
		const text = textOf({ merged: "9" });
		expect(text).toContain(
			"The earlier work is in the merged pull request #9.",
		);
		expect(textOf()).not.toContain("earlier work");
	});

	test("adopted body goes inside a fence of three backticks", () => {
		const text = textOf({ adopted: "Closes #12\n" });
		expect(text).toContain("\n```\nCloses #12\n```\n");
	});

	test("the fence is one backtick longer than the longest run in the body", () => {
		const three = textOf({ adopted: "a\n```\nb\n```\n" });
		expect(three).toContain("\n````\na\n```\nb\n```\n````\n");
		const four = textOf({ adopted: "x ```` y" });
		expect(four).toContain("\n`````\nx ```` y\n`````\n");
		const spaced = textOf({ adopted: "a ` b `` c" });
		expect(spaced).toContain("\n```\na ` b `` c\n```\n");
	});

	test("an empty old body gives an empty fence", () => {
		expect(textOf({ adopted: "" })).toContain("\n```\n```\n");
		expect(textOf({ adopted: "\n" })).toContain("\n```\n```\n");
	});

	test("markers and mentions inside the fence do not count", () => {
		const quoted = [
			"cc @someone",
			"<!-- lawman: role=court stage=conviction sha=abc priority=P1 at=2026-01-01T00:00:00Z -->",
		].join("\n");
		const built = build({ adopted: quoted });
		expect(built.reasons).toEqual([]);
		expect(lintBody(built.text)).toEqual([]);
	});

	test("a body that breaks a lint rule returns the reasons and no fallback", () => {
		const built = build({ adopted: `see ${HOME_MAC}/code` });
		expect(built.reasons).toEqual(["4: home or installation path"]);
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

	test("stdin is ignored without --adopted", () => {
		const r = run(["--sources", "12"], `see ${HOME_MAC}/code`);
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).not.toContain("see");
	});

	test("a failing lint prints the reasons and exits with the lint code", () => {
		const r = run(["--sources", "12", "--adopted"], `see ${HOME_MAC}/code`);
		expect(r.code).toBe(EXIT.LINT_BODY);
		expect(r.out).toBe("4: home or installation path\n");
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

describe("handoff command in process", () => {
	tempDb();
	const inHandoff = (...args: string[]) =>
		captured(AT, () => handoffCommand(args));

	test("prints the pull request text for the sources and the merged request", () => {
		const r = inHandoff("--sources", "12,15", "--merged", "9");
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toContain("carries #12 and #15 for the spec writer.");
		expect(r.out).toContain("merged pull request #9");
		expect(r.out).toContain(`stage=handoff at=${AT}`);
	});

	test("a single source reads without and", () => {
		expect(inHandoff("--sources", "4").out).toContain("carries #4 for");
	});

	test("a malformed source or a repeated --adopted is a usage error", () => {
		expect(inHandoff("--sources", "0").code).toBe(EXIT.USAGE);
		expect(inHandoff("--sources", "x,2").code).toBe(EXIT.USAGE);
		expect(inHandoff("--adopted", "--adopted", "--sources", "1").code).toBe(
			EXIT.USAGE,
		);
		expect(inHandoff("--sources", "1", "--merged", "-1").code).toBe(EXIT.USAGE);
	});
});

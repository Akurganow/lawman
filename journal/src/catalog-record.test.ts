import { describe, expect, test } from "bun:test";
import { sourceLine } from "./catalog";
import {
	ANSWER,
	CLOCK,
	FOUND,
	ID,
	line,
	none,
	REQUEST,
	RUNNERS,
	reply,
	SUMMARY,
	TOKEN,
	UNKNOWN,
	withField,
	withSummary,
	ZWSP,
} from "./catalog-record-fixture";
import { extractMarkers } from "./markers";
import { cli, lead, tempDb } from "./test-helpers";

tempDb();

describe.each(RUNNERS)("catalog record request (%s)", (_name, request) => {
	test("a Source line gives the record identifier alone", async () => {
		const input = `${sourceLine(ID, "npm", "lodash")}\n`;
		expect(await request(REQUEST, input)).toEqual({
			code: 0,
			out: `${ID}\n`,
			err: "",
		});
	});

	test("the line needs no final newline", async () => {
		expect((await request(REQUEST, sourceLine(ID, "npm", "lodash"))).out).toBe(
			`${ID}\n`,
		);
	});

	test.each([
		["no input", ""],
		["a blank line", "\n"],
		["two lines", `${sourceLine(ID, "npm", "lodash")}\nSource: canary`],
		["another source", "Source: advisories canary npm/lodash"],
		["a package without ecosystem", "Source: catalog GHSA-1 canary"],
		["a path as identifier", "Source: catalog ../canary npm/lodash"],
		["a backtick in the package", "Source: catalog GHSA-1 npm/canary`x`"],
		["a hidden character", `Source: catalog GHSA-1 npm/canary${ZWSP}x`],
		["a quote", `Source: catalog GHSA-1 npm/"canary"`],
		["trailing text", "Source: catalog GHSA-1 npm/canary extra"],
	])("%s is refused and no part of it is printed", async (_label, input) => {
		const result = await request(REQUEST, input);
		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).not.toContain("canary");
		expect(result.err).not.toContain(TOKEN);
		expect(result.err).not.toContain("GHSA-1");
	});

	test("the printed identifier passes the body check and holds no marker", async () => {
		const { out } = await request(REQUEST, sourceLine(ID, "npm", "lodash"));
		const comment = `${out}${lead()}`;
		expect(cli(["lint-body"], {}, comment)).toEqual({
			code: 0,
			out: comment,
			err: "",
		});
		const carrier = { text: out, createdAt: CLOCK, rank: 0, author: "t" };
		expect(extractMarkers(carrier, "t")).toEqual([]);
	});

	test("a wrong option is a usage error", async () => {
		expect((await request(["--kind", "record", "--tick", "1"], "")).code).toBe(
			1,
		);
	});
});

describe.each(RUNNERS)("catalog record answer (%s)", (_name, _req, answer) => {
	test("the recorded record gives the expected line", async () => {
		expect(await answer(ANSWER, reply(FOUND.reply, FOUND.status))).toEqual({
			code: 0,
			out: line(SUMMARY),
			err: "",
		});
	});

	test.each([404, 410, 422])("status %d is missing", async (status) => {
		expect(await answer(ANSWER, reply(UNKNOWN.reply, status))).toEqual({
			code: 0,
			out: none("missing"),
			err: "",
		});
	});

	test("the recorded unknown record is missing", async () => {
		const result = await answer(
			["--kind", "record", "--id", "GHSA-0000-0000-0000"],
			reply(UNKNOWN.reply, UNKNOWN.status),
		);
		expect(result.out).toBe(none("missing"));
	});

	test.each([
		["no reply", "\n000"],
		["no status line", JSON.stringify(FOUND.reply)],
		["a server error", reply(FOUND.reply, 500)],
		["a rate limit", reply(FOUND.reply, 429)],
		["a redirect", reply(FOUND.reply, 301)],
		["a body that is no JSON", "<html>oops</html>\n200"],
		["a truncated body", `${JSON.stringify(FOUND.reply).slice(0, 40)}\n200`],
	])("%s is failed", async (_label, input) => {
		expect((await answer(ANSWER, input)).out).toBe(none("failed"));
	});

	test.each([
		["an empty body", "\n200"],
		["an empty object", "{}\n200"],
		["a null", "null\n200"],
		["a list", "[]\n200"],
		["a string", '"x"\n200'],
		["another record", reply({ ...FOUND.reply, id: "GHSA-1111-2222-3333" })],
		["a record with no identifier", reply({ summary: "x" })],
		["an identifier of another kind", reply({ ...FOUND.reply, id: 7 })],
	])("%s is unconfirmed", async (_label, input) => {
		expect((await answer(ANSWER, input)).out).toBe(none("unconfirmed"));
	});

	test("a reply with CRLF line ends is read", async () => {
		const input = `${JSON.stringify(FOUND.reply)}\r\n200\r\n`;
		expect((await answer(ANSWER, input)).out).toBe(line(SUMMARY));
	});

	test("a severity outside its class is dropped", async () => {
		const input = withField("database_specific", { severity: "<script>" });
		const result = await answer(ANSWER, input);
		expect(result.out).toBe(
			`catalog record id=${ID} severity=unknown modified=${FOUND.reply.modified} read=${CLOCK} dropped=severity ${SUMMARY}\n`,
		);
	});

	test.each(["yesterday", "2025-09-29", "2025-09-29T21:12:31+02:00", 20250929])(
		"a modified time of %p is dropped",
		async (bad) => {
			const result = await answer(ANSWER, withField("modified", bad));
			expect(result.out).toBe(
				`catalog record id=${ID} severity=MODERATE modified=unknown read=${CLOCK} dropped=modified ${SUMMARY}\n`,
			);
		},
	);

	test.each([
		["a number", 7],
		["a list", ["x"]],
		["a very long text", "x".repeat(5000)],
	])("a summary that is %s is dropped", async (_label, summary) => {
		const result = await answer(ANSWER, withSummary(summary));
		expect(result.out).toBe(line("summary=unknown", " dropped=summary"));
	});

	test("fields the record lacks print as unknown and are not dropped", async () => {
		const bare = { id: ID };
		const result = await answer(ANSWER, reply(bare));
		expect(result.out).toBe(
			`catalog record id=${ID} severity=unknown modified=unknown read=${CLOCK} summary=unknown\n`,
		);
	});

	test("two outside fields are both named", async () => {
		const input = reply({
			...FOUND.reply,
			modified: 5,
			database_specific: { severity: "no no" },
		});
		expect((await answer(ANSWER, input)).out).toContain(
			" dropped=severity,modified ",
		);
	});

	test("a score is never computed from the vector", async () => {
		const {
			severity: _vector,
			database_specific: _text,
			...rest
		} = FOUND.reply;
		const input = reply({ ...rest, severity: FOUND.reply.severity });
		const result = await answer(ANSWER, input);
		expect(result.out).toContain("severity=unknown");
		expect(result.out).not.toContain("CVSS");
	});

	test("a long summary is cut", async () => {
		const result = await answer(ANSWER, withSummary("word ".repeat(150)));
		expect(result.out.trimEnd().length).toBeLessThan(400);
		expect(result.out).toContain("summary=word word");
	});

	test.each([
		["", ""],
		["id", ""],
		["id", "GHSA-1 --kind"],
	])("a missing or wrong option is a usage error", async (flag, value) => {
		const args =
			flag === ""
				? ["--kind", "record"]
				: ["--kind", "record", `--${flag}`, value];
		const result = await answer(args, reply(FOUND.reply));
		expect(result.code).toBe(1);
		expect(result.out).toBe("");
	});

	test("an identifier outside its class is refused and not printed", async () => {
		const result = await answer(
			["--kind", "record", "--id", "../canary"],
			reply(FOUND.reply),
		);
		expect(result.code).toBe(1);
		expect(result.out).toBe("");
		expect(result.err).not.toContain("canary");
	});
});

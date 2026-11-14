import { describe, expect, test } from "bun:test";
import { sourceLine } from "./catalog-entries";
import {
	ANSWER,
	cliAnswer,
	cliRequest,
	expectCleanComment,
	FOUND,
	ID,
	inProcessAnswer,
	inProcessRequest,
	line,
	none,
	REQUEST,
	SUMMARY,
	TOKEN,
	UNKNOWN,
	withField,
	withSummary,
} from "./catalog-record-fixture";
import { CLOCK, reply } from "./catalog-test-run";
import { tempDb } from "./test-helpers";

tempDb();

test.each([
	["in process", inProcessRequest],
	["cli", cliRequest],
])(
	"a Source line gives the record identifier alone (%s)",
	async (_name, request) => {
		const input = `${sourceLine(ID, "npm", "lodash")}\n`;
		expect(await request(REQUEST, input)).toEqual({
			code: 0,
			out: `${ID}\n`,
			err: "",
		});
	},
);

describe("catalog record request", () => {
	const request = inProcessRequest;

	test("the line needs no final newline", async () => {
		expect((await request(REQUEST, sourceLine(ID, "npm", "lodash"))).out).toBe(
			`${ID}\n`,
		);
	});

	test.each([
		["two lines", `${sourceLine(ID, "npm", "lodash")}\nSource: canary`],
		["another source", "Source: advisories canary npm/lodash"],
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
		expectCleanComment(out);
	});

	test("a wrong option is a usage error", async () => {
		expect((await request(["--kind", "record", "--tick", "1"], "")).code).toBe(
			1,
		);
	});
});

test.each([
	["in process", inProcessAnswer],
	["cli", cliAnswer],
])(
	"the recorded record gives the expected line (%s)",
	async (_name, answer) => {
		expect(await answer(ANSWER, reply(FOUND.reply, FOUND.status))).toEqual({
			code: 0,
			out: line(SUMMARY),
			err: "",
		});
	},
);

describe("catalog record answer", () => {
	const answer = inProcessAnswer;

	test.each([404, 410, 422])("status %d is missing", async (status) => {
		expect(await answer(ANSWER, reply(UNKNOWN.reply, status))).toEqual({
			code: 0,
			out: none("missing"),
			err: "",
		});
	});

	test.each([
		["no reply", "\n000"],
		["a server error", reply(FOUND.reply, 500)],
		["a body that is no JSON", "<html>oops</html>\n200"],
	])("%s is failed", async (_label, input) => {
		expect((await answer(ANSWER, input)).out).toBe(none("failed"));
	});

	test.each([
		["an empty body", "\n200"],
		["an empty object", "{}\n200"],
		["a null", "null\n200"],
		["another record", reply({ ...FOUND.reply, id: "GHSA-1111-2222-3333" })],
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

	test("a long summary is cut by code points, never inside a surrogate pair", async () => {
		const result = await answer(ANSWER, withSummary(`x${"😀".repeat(300)}`));
		const printed = result.out.trimEnd().split(" summary=")[1] ?? "";
		expect(printed.isWellFormed()).toBe(true);
		expect(Array.from(printed)).toHaveLength(240 - "summary=".length);
	});

	test("a missing identifier option is a usage error", async () => {
		const result = await answer(["--kind", "record"], reply(FOUND.reply));
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

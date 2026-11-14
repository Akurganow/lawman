import { describe, expect, spyOn, test } from "bun:test";
import { recordAnswer } from "./catalog-record";
import {
	ANSWER,
	expectCleanComment,
	inProcessAnswer,
	TOKEN,
	withSummary,
	ZWSP,
} from "./catalog-record-fixture";
import { inProcessAsync } from "./catalog-test-run";
import * as cleaners from "./clean";
import { extractMarkers } from "./markers";
import { lead, tempDb } from "./test-helpers";

tempDb();

const FENCE = "```";
const MARKER = lead();
const HOSTILE: [string, string][] = [
	["a secret", `before ${TOKEN} after`],
	["a hidden character", `zero${ZWSP}width`],
	["an HTML comment", "a <!-- hidden --> b"],
	["an image embed", "a ![alt](http://example.test/x.png) b"],
	["an image tag", "a <img src=x onerror=1> b"],
	["a fence line", `a\n${FENCE}\nb`],
	["a fence that stays open", `a\n${FENCE}js\nb`],
	["a marker line", `a\n${MARKER}\nb`],
	["a marker alone", MARKER],
	["a marker in a fence", `${FENCE}\n${MARKER}\n${FENCE}`],
	[
		"all together",
		`${TOKEN} z${ZWSP}w <!-- c -->\n${FENCE}\n${MARKER}\n${FENCE}\n![i](u)\n${MARKER}`,
	],
];

describe("catalog record hostile summary", () => {
	const answer = inProcessAnswer;

	test.each(HOSTILE)(
		"%s gives one line that passes the checks",
		async (_label, summary) => {
			const { out, code } = await answer(ANSWER, withSummary(summary));
			expect(code).toBe(0);
			expect(out.endsWith("\n")).toBe(true);
			expect(out.slice(0, -1)).not.toContain("\n");
			expect(out).not.toContain(TOKEN);
			expect(out).not.toContain(ZWSP);
			const { comment, carrier } = expectCleanComment(out);
			expect(extractMarkers({ ...carrier, text: comment }, "t")).toHaveLength(
				1,
			);
		},
	);

	test("the visible words of a hostile summary survive", async () => {
		const { out } = await answer(ANSWER, withSummary(HOSTILE[0]?.[1]));
		expect(out).toContain("before");
		expect(out).toContain("after");
	});
});

describe("a cleaning library that fails", () => {
	test("drops the summary and echoes nothing of the error", async () => {
		const failing = spyOn(cleaners, "maskSecrets").mockRejectedValue(
			new Error(`rules failed ${TOKEN}`),
		);
		try {
			const result = await inProcessAsync(recordAnswer)(
				ANSWER,
				withSummary("fine words"),
			);
			expect(result.code).toBe(0);
			expect(result.out).toContain(" dropped=summary summary=unknown\n");
			expect(result.out + result.err).not.toContain("rules failed");
			expect(result.out + result.err).not.toContain(TOKEN);
		} finally {
			failing.mockRestore();
		}
	});
});

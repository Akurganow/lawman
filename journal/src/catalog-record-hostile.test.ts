import { describe, expect, spyOn, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecordId } from "./catalog-entries";
import { recordAnswer } from "./catalog-record";
import {
	ANSWER,
	expectCleanComment,
	FOUND,
	ID,
	RUNNERS,
	TOKEN,
	withSummary,
	ZWSP,
} from "./catalog-record-fixture";
import { FIXTURES, fixture, inProcessAsync, reply } from "./catalog-test-run";
import * as cleaners from "./clean";
import { extractMarkers } from "./markers";
import { JOURNAL, lead, tempDb } from "./test-helpers";

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

describe.each(RUNNERS)(
	"catalog record hostile summary (%s)",
	(_name, _req, answer) => {
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

		test("a hostile value in a short field is dropped", async () => {
			const bad = `x ${TOKEN}`;
			const input = reply({
				...FOUND.reply,
				modified: bad,
				database_specific: { severity: bad },
			});
			const { out } = await answer(ANSWER, input);
			expect(out).not.toContain(TOKEN);
			expect(out).toContain(" dropped=severity,modified ");
		});
	},
);

describe("catalog record identifiers", () => {
	const fromBatches = readdirSync(FIXTURES)
		.filter((name) => name.startsWith("batch."))
		.flatMap((name) => fixture(name).reply.results as unknown[])
		.flatMap((result) => (result as { vulns?: { id: string }[] }).vulns ?? [])
		.map((vuln) => vuln.id);

	test("the batch fixtures hold identifiers", () => {
		expect(fromBatches.length).toBeGreaterThan(3);
	});

	test.each([...new Set([...fromBatches, ID])])("the class admits %s", (id) => {
		expect(isRecordId(id)).toBe(true);
	});
});

describe("only the record module reads the cleaning code", () => {
	const SRC = join(JOURNAL, "src");
	const source = (name: string) => readFileSync(join(SRC, name), "utf8");
	const catalogSources = readdirSync(SRC).filter(
		(name) =>
			name.startsWith("catalog") &&
			name.endsWith(".ts") &&
			!name.endsWith(".test.ts"),
	);

	test("the record module imports it dynamically and not statically", () => {
		expect(source("catalog-record.ts")).toMatch(
			/await import\("\.\/clean-host"\)/,
		);
		expect(source("catalog-record.ts")).not.toMatch(/^import .*clean/m);
	});

	test.each(catalogSources.filter((name) => name !== "catalog-record.ts"))(
		"%s does not import it",
		(name) => {
			expect(source(name)).not.toMatch(/clean/);
		},
	);
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

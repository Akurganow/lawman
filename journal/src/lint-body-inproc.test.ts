import { describe, expect, spyOn, test } from "bun:test";
import * as clean from "./clean";
import * as db from "./db";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { lead, tempDb } from "./test-helpers";

const AT = "2026-10-17T10:45:00Z";
const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const HIDDEN_CLOSER = "``\u200B`";

tempDb();

const lintIn = async (input: string, ...args: string[]) => {
	const stdin = spyOn(db, "readStdin").mockReturnValue(input);
	try {
		return await inprocAsync(AT, ["lint-body", ...args]);
	} finally {
		stdin.mockRestore();
	}
};

describe("lint-body command in process", () => {
	test("a clean text goes to stdout with exit 0", async () => {
		const input = `ok\n${lead()}\n`;
		expect(await lintIn(input)).toEqual({ code: EXIT.OK, out: input, err: "" });
	});

	test("findings go to stderr with an empty stdout and exit 7", async () => {
		expect(await lintIn(`ok <!-- c -->\n![x](y)\n${lead()}\n`)).toEqual({
			code: EXIT.LINT_BODY,
			out: "",
			err: "1: HTML comment\n2: image embed\n",
		});
	});

	test("--no-marker passes a commit message and nothing else", async () => {
		expect(await lintIn("[core] fix\n", "--no-marker")).toEqual({
			code: EXIT.OK,
			out: "[core] fix\n",
			err: "",
		});
		expect((await lintIn("x", "--no-marker", "--no-marker")).code).toBe(
			EXIT.USAGE,
		);
	});

	test("a quote is cleaned and re-fenced", async () => {
		const quote = `- item\n\n  \`\`\`\n  key ${TOKEN} ${HIDDEN_CLOSER}\n  \`\`\`\n`;
		const cleaned = `- item\n\n  \`\`\`\`\n  key ${LABEL} \`\`\`\n  \`\`\`\`\n`;
		expect(await lintIn(`ok\n\n${quote}\n${lead()}\n`)).toEqual({
			code: EXIT.OK,
			out: `ok\n\n${cleaned}\n${lead()}\n`,
			err: "",
		});
	});

	test("a thrown library error gives exit 1 and quotes no input", async () => {
		const input = `secret words ${TOKEN}\n${lead()}\n`;
		const mask = spyOn(clean, "secretRanges").mockRejectedValue(
			new Error(`rules failed on ${input}`),
		);
		try {
			const r = await lintIn(input);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.out).toBe("");
			expect(r.err).not.toBe("");
			expect(r.err).not.toContain("secret words");
			expect(r.err).not.toContain(TOKEN);
		} finally {
			mask.mockRestore();
		}
	});
});

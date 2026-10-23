import { describe, expect, spyOn, test } from "bun:test";
import * as clean from "./clean";
import * as db from "./db";
import { EXIT } from "./db";
import { handoffCommand } from "./handoff";
import { capturedAsync } from "./inproc";
import { tempDb } from "./test-helpers";

const AT = "2026-10-17T10:45:00Z";
const HOME_MAC = ["/Us", "ers/someone"].join("");
const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");

tempDb();

const inHandoff = (...args: string[]) =>
	capturedAsync(AT, () => handoffCommand(args));

const adopted = async (body: string) => {
	const stdin = spyOn(db, "readStdin").mockReturnValue(body);
	try {
		return await inHandoff("--sources", "12", "--adopted");
	} finally {
		stdin.mockRestore();
	}
};

describe("handoff command in process", () => {
	test("prints the pull request text for the sources and the merged request", async () => {
		const r = await inHandoff("--sources", "12,15", "--merged", "9");
		expect(r.code).toBe(EXIT.OK);
		expect(r.out).toContain("carries #12 and #15 for the spec writer.");
		expect(r.out).toContain("merged pull request #9");
		expect(r.out).toContain(`stage=handoff at=${AT}`);
	});

	test("a single source reads without and", async () => {
		expect((await inHandoff("--sources", "4")).out).toContain("carries #4 for");
	});

	test("a malformed source or a repeated --adopted is a usage error", async () => {
		expect((await inHandoff("--sources", "0")).code).toBe(EXIT.USAGE);
		expect((await inHandoff("--sources", "x,2")).code).toBe(EXIT.USAGE);
		expect(
			(await inHandoff("--adopted", "--adopted", "--sources", "1")).code,
		).toBe(EXIT.USAGE);
		expect((await inHandoff("--sources", "1", "--merged", "-1")).code).toBe(
			EXIT.USAGE,
		);
	});

	test("a home path read from stdin passes verbatim with exit 0", async () => {
		const r = await adopted(`see ${HOME_MAC}/code\n`);
		expect(r).toMatchObject({ code: EXIT.OK, err: "" });
		expect(r.out).toContain(`\n\`\`\`\nsee ${HOME_MAC}/code\n\`\`\`\n`);
	});

	test("a hostile body read from stdin is cleaned with exit 0", async () => {
		const r = await adopted(`key ${TOKEN}\na\`\`\u200B\`\n`);
		expect(r).toMatchObject({ code: EXIT.OK, err: "" });
		expect(r.out).toContain("\n````\nkey REMOVED GITHUB SECRET\na```\n````\n");
	});

	test("a thrown cleaner error gives exit 1, never 7, and quotes no input", async () => {
		const body = `secret words ${TOKEN}`;
		const mask = spyOn(clean, "maskSecrets").mockRejectedValue(
			new Error(`rules failed on ${body}`),
		);
		try {
			const r = await adopted(body);
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

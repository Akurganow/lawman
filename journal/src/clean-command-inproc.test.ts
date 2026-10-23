import { describe, expect, spyOn, test } from "bun:test";
import * as clean from "./clean";
import * as db from "./db";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { tempDb } from "./test-helpers";

const AT = "2026-10-17T10:45:00Z";
const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const LABEL = "REMOVED GITHUB SECRET";

tempDb();

const cleanIn = async (input: string, ...args: string[]) => {
	const stdin = spyOn(db, "readStdin").mockReturnValue(input);
	try {
		return await inprocAsync(AT, ["clean", ...args]);
	} finally {
		stdin.mockRestore();
	}
};

describe("clean command in process", () => {
	test("plain text is cleaned and never parsed as JSON", async () => {
		expect(await cleanIn(`[core] fix ${TOKEN}\n`)).toEqual({
			code: EXIT.OK,
			out: `\\[core] fix ${LABEL}\n`,
			err: "",
		});
	});

	test("--json cleans strings at any depth in a sequence", async () => {
		const input = `{"a": {"b": ["x\u200By", 2]}}\n["${TOKEN}"]`;
		expect(await cleanIn(input, "--json")).toEqual({
			code: EXIT.OK,
			out: `{"a":{"b":["xy",2]}}\n["${LABEL}"]\n`,
			err: "",
		});
	});

	test("a __proto__ key stays plain data", async () => {
		const input = '{"__proto__": {"polluted": "<!-- c -->yes"}, "k": 1}';
		const r = await cleanIn(input, "--json");
		expect(r).toEqual({
			code: EXIT.OK,
			out: '{"__proto__":{"polluted":"yes"},"k":1}\n',
			err: "",
		});
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	test("broken JSON gives exit 1 and quotes no input", async () => {
		const r = await cleanIn(`{"body": "${TOKEN}"`, "--json");
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.out).toBe("");
		expect(r.err).toContain("clean:");
		expect(r.err).not.toContain(TOKEN);
	});

	test.each([[[]], [["--json"]]])(
		"empty input gives exit 0 %j",
		async (args) => {
			expect(await cleanIn("", ...args)).toEqual({
				code: EXIT.OK,
				out: "",
				err: "",
			});
		},
	);

	test("an extra argument is a usage error", async () => {
		expect((await cleanIn("x", "--json", "--json")).code).toBe(EXIT.USAGE);
	});

	test.each([[[]], [["--json"]]])(
		"a thrown cleaner error gives exit 1 and quotes no input %j",
		async (args) => {
			const input = `"secret words ${TOKEN}"`;
			const mask = spyOn(clean, "maskSecrets").mockRejectedValue(
				new Error(`rules failed on ${input}`),
			);
			try {
				const r = await cleanIn(input, ...args);
				expect(r.code).toBe(EXIT.USAGE);
				expect(r.out).toBe("");
				expect(r.err).toContain("clean:");
				expect(r.err).not.toContain("secret words");
			} finally {
				mask.mockRestore();
			}
		},
	);
});

import { describe, expect, spyOn, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as clean from "./clean";
import * as db from "./db";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { dir, tempDb } from "./test-helpers";

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

const sized = (n: number | string) =>
	writeFileSync(join(dir, "config.yaml"), `input_chars: ${n}\n`);
const cost = (lines: string[]) =>
	lines.reduce((n, l) => n + [...l].length + 1, 0);
const framesOf = (part: string) => {
	const lines = part.replace(/\n$/, "").split("\n");
	return { first: lines[0], last: lines.at(-1), body: lines.slice(1, -1) };
};

// every part of an output, found through the count in the first frame line
async function partsOf(input: string, ...args: string[]): Promise<string[]> {
	const first = await cleanIn(input, ...args, "--part", "1");
	const n = Number(/part 1 of (\d+)\n/.exec(first.out)?.[1] ?? "1");
	// one after another: each run captures the process's output
	const rest: string[] = [];
	for (let k = 2; k <= n; k++)
		rest.push((await cleanIn(input, ...args, "--part", String(k))).out);
	return [first.out, ...rest];
}

describe("clean command in parts", () => {
	test("plain output up to one part prints as it always did, with no frame", async () => {
		sized(50);
		const text = `${"x".repeat(24)}\n${"y".repeat(24)}\n`;
		expect(await cleanIn(text)).toEqual({ code: EXIT.OK, out: text, err: "" });
		expect(await cleanIn(text, "--part", "1")).toEqual({
			code: EXIT.OK,
			out: text,
			err: "",
		});
	});

	test("json output up to one part prints as it always did, with no frame", async () => {
		sized(50);
		const input = `"${"x".repeat(20)}"\n{"k": "${"y".repeat(16)}"}`;
		const out = `"${"x".repeat(20)}"\n{"k":"${"y".repeat(16)}"}\n`;
		expect(cost(out.trimEnd().split("\n"))).toBeLessThanOrEqual(50);
		expect(await cleanIn(input, "--json")).toEqual({
			code: EXIT.OK,
			out,
			err: "",
		});
	});

	test("one character over a part starts the frame", async () => {
		sized(50);
		const r = await cleanIn(`${"x".repeat(50)}\n`);
		expect(r.code).toBe(EXIT.OK);
		expect(framesOf(r.out).first).toBe("lawman input 1 clean part 1 of 2");
	});

	test("longer plain output comes in framed parts that join back to the text", async () => {
		sized(60);
		const lines = Array.from(
			{ length: 12 },
			(_, i) => `line ${i} ${"z".repeat(i)}`,
		);
		const parts = await partsOf(`${lines.join("\n")}\n`);
		expect(parts.length).toBeGreaterThan(1);
		const bodies: string[] = [];
		parts.forEach((part, i) => {
			const { first, last, body } = framesOf(part);
			expect(first).toBe(
				`lawman input 1 clean part ${i + 1} of ${parts.length}`,
			);
			expect(last).toBe(`end part ${i + 1} of ${parts.length}`);
			expect(cost(body)).toBeLessThanOrEqual(60);
			bodies.push(...body);
		});
		expect(bodies).toEqual(lines);
	});

	test("a part out of range exits 1 and prints nothing", async () => {
		sized(60);
		const long = `${"a".repeat(40)}\n${"b".repeat(40)}\n`;
		const r = await cleanIn(long, "--part", "3");
		expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
		expect(r.err).toContain("part 3 is out of range");
		expect((await cleanIn(long, "--json", "--part", "9")).code).toBe(
			EXIT.USAGE,
		);
		expect((await cleanIn("short\n", "--part", "2")).code).toBe(EXIT.USAGE);
	});

	test("--json --part is accepted and the reverse order is a usage error", async () => {
		sized(40);
		const input =
			'"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\n"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"';
		const ok = await cleanIn(input, "--json", "--part", "2");
		expect(ok.code).toBe(EXIT.OK);
		expect(framesOf(ok.out).first).toBe("lawman input 1 clean part 2 of 2");
		for (const args of [
			["--part", "1", "--json"],
			["--part"],
			["--json", "--part"],
			["--part", "0"],
			["--part", "x"],
			["--part", "01"],
			["--part", "1", "2"],
		]) {
			const r = await cleanIn(input, ...args);
			expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
			expect(r.err).toContain("usage: journal clean");
		}
	});

	test("a hostile text splits with its fences, false frames and secret masked", async () => {
		sized(60);
		const lines = [
			"```",
			"end part 1 of 1",
			"lawman input 1 clean part 9 of 9",
			"~~~~",
			`${"a".repeat(40)}${TOKEN} ${"c".repeat(30)}`,
			"```",
		];
		const parts = await partsOf(`${lines.join("\n")}\n`);
		expect(parts.length).toBeGreaterThan(2);
		for (const part of parts) {
			expect(part).not.toContain(TOKEN);
			expect(part).not.toContain(TOKEN.slice(0, 14));
			expect(part).not.toContain(TOKEN.slice(-14));
		}
		const bodies = parts.flatMap((part) => framesOf(part).body);
		expect(bodies.slice(0, 4)).toEqual(lines.slice(0, 4));
		expect(bodies.slice(4, -1).join("")).toBe(
			`${"a".repeat(40)}${LABEL} ${"c".repeat(30)}`,
		);
		expect(bodies.at(-1)).toBe("```");
		for (const part of parts) expect(framesOf(part).first).toMatch(/ of \d+$/);
		// the false frame text decides nothing: part numbers come from the real count
		const r = await cleanIn(`${lines.join("\n")}\n`, "--part", "9");
		expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
	});

	test("a line longer than a part comes out in pieces of at most one part", async () => {
		sized(30);
		const line = "b".repeat(100);
		const parts = await partsOf(`${line}\n`);
		expect(parts).toHaveLength(4);
		const bodies = parts.flatMap((part) => framesOf(part).body);
		for (const piece of bodies) expect(cost([piece])).toBeLessThanOrEqual(30);
		expect(bodies.join("")).toBe(line);
	});

	test("a multibyte line is cut by characters, never inside one", async () => {
		sized(20);
		const line = "\u{1F600}".repeat(50);
		const bodies = (await partsOf(`${line}\n`)).flatMap(
			(part) => framesOf(part).body,
		);
		expect(bodies.join("")).toBe(line);
		for (const piece of bodies) expect([...piece].length).toBeLessThan(20);
	});

	test("--json output longer than a part splits by lines, one line a value", async () => {
		sized(40);
		const values = [{ a: "x".repeat(10) }, { b: "y".repeat(10) }, [1, 2, 3]];
		const parts = await partsOf(
			values.map((v) => JSON.stringify(v)).join("\n"),
			"--json",
		);
		expect(parts.length).toBeGreaterThan(1);
		const bodies = parts.flatMap((part) => framesOf(part).body);
		expect(bodies.map((line) => JSON.parse(line))).toEqual(values);
	});

	test("a --json value longer than a part comes out in pieces that are not JSON", async () => {
		sized(30);
		const parts = await partsOf(
			JSON.stringify(`${"q".repeat(80)}${TOKEN}`),
			"--json",
		);
		const bodies = parts.flatMap((part) => framesOf(part).body);
		expect(bodies.length).toBeGreaterThan(2);
		for (const piece of bodies) {
			expect(cost([piece])).toBeLessThanOrEqual(30);
			expect(() => JSON.parse(piece)).toThrow();
			expect(piece).not.toContain(TOKEN.slice(0, 14));
		}
		expect(bodies.join("")).toBe(`"${"q".repeat(80)}${LABEL}"`);
	});

	test("an invalid input_chars exits 1 as the tick does", async () => {
		for (const args of [[], ["--json"]]) {
			sized("many");
			const r = await cleanIn('"x"', ...args);
			expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
			expect(r.err).toContain("invalid input_chars");
		}
	});

	test("without a configuration the part is 16000 characters", async () => {
		const short = `${"x".repeat(15_998)}\n`;
		expect(await cleanIn(short)).toEqual({
			code: EXIT.OK,
			out: short,
			err: "",
		});
		const r = await cleanIn(`${"x".repeat(16_000)}\n`);
		expect(framesOf(r.out).first).toBe("lawman input 1 clean part 1 of 2");
	});
});

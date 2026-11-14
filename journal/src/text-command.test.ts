import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { human, T } from "./cases-fixture";
import { cleanHostText } from "./clean-host";
import * as db from "./db";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { CONFIG, content } from "./input-test-fixture";
import { configs } from "./operations-test-fixture";
import {
	BASE,
	dir,
	issuesForm,
	rows,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";
import { host, orderOf, setUp } from "./tick-start-test-fixture";

tempDb();

const TOKEN = ["gh", "p_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const AT = T(11);
const LOGIN = "hostile-login";
const TILDES = "~".repeat(200);

const cost = (lines: string[]) =>
	lines.reduce((n, l) => n + [...l].length + 1, 0);
const rowsOf = (n: number) =>
	Array.from({ length: n }, (_, i) => `line ${i} ${"z".repeat(i % 60)}`);
const cleaned = async (lines: string[]) =>
	(await cleanHostText(lines.join("\n"))).split("\n");

type Note = { id: string; at: string; body: string };

// a tick start that caches the case at the given `input_chars`: the parts it stores
async function started(size: number, body: string, notes: Note[] = []) {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir);
	setUp(`${CONFIG}input_chars: ${size}\n`);
	orderOf("response-unit", { issue: 3 });
	host({ issues: { 3: human("OPEN") } });
	writeFileSync(
		join(configs("main"), "issues.json"),
		JSON.stringify(
			issuesForm(
				[
					{
						number: 3,
						state: "OPEN",
						title: "issue 3",
						createdAt: T(9),
						author: { login: TRUSTED },
						body,
						comments: notes.map((n) => ({
							id: n.id,
							author: { login: LOGIN },
							body: n.body,
							createdAt: n.at,
						})),
					},
				],
				[TRUSTED],
			),
		),
	);
	const r = await inprocAsync(BASE, [
		"tick",
		"start",
		"--role",
		"response-unit",
		"--order",
		"1",
	]);
	expect(r.code).toBe(0);
	return JSON.parse(
		String(rows("SELECT parts FROM ticks")[0]?.parts),
	) as string[];
}

const text = (...args: string[]) => inprocAsync(BASE, ["text", ...args]);

// the lines inside the fence of one part
function inside(part: string): string[] {
	const all = content(part);
	const open = all.findIndex((l) => /^~{3,}[a-z]+$/.test(l));
	const fence = (all[open] ?? "").replace(/[a-z]+$/, "");
	return all.slice(open + 1, all.lastIndexOf(fence));
}

// every part of a text, in order; runs in turn, because a run owns stdout while it lasts
async function parts(...words: string[]): Promise<string[]> {
	const first = await text(...words);
	expect(first.code).toBe(0);
	const n = Number(/ part 1 of (\d+)\n/.exec(first.out)?.[1]);
	const all = [first.out];
	for (let k = 2; k <= n; k++)
		all.push((await text(...words, "--part", String(k))).out);
	return all;
}

// the words after `full text` of the full lines of the stored parts, in order
const fullWords = (stored: string[]) =>
	stored
		.flatMap((p) => p.split("\n"))
		.flatMap((l) => (l.startsWith("full text ") ? [l.slice(10)] : []));

describe("the text command", () => {
	test("prints the whole text of a body, part 1 without --part", async () => {
		await started(16000, "alpha\nbeta\ngamma");
		const r = await text("main", "issue", "3", "body");
		expect(r).toEqual({
			code: 0,
			out: "lawman input 1 text part 1 of 1\n~~~issue\nalpha\nbeta\ngamma\n~~~\nend part 1 of 1\n",
			err: "",
		});
		expect(await text("main", "issue", "3", "body", "--part", "1")).toEqual(r);
	});

	test("prints the text as the sync cleaned it", async () => {
		await started(16000, `first ${TOKEN}\nsecond​ line`);
		const r = await text("main", "issue", "3", "body");
		expect(r.out).not.toContain(TOKEN);
		expect(inside(r.out)).toEqual([`first ${LABEL}`, "second line"]);
	});

	test("prints a pull request body", async () => {
		await started(16000, "short");
		seed((d) =>
			d.run(
				"INSERT INTO pulls (precinct, number, issues, spec, body) VALUES ('main', 8, '', '', ?)",
				["pull text\nbody"],
			),
		);
		const r = await text("main", "pull", "8", "body");
		expect(r.out.split("\n")[1]).toBe("~~~pull");
		expect(inside(r.out)).toEqual(["pull text", "body"]);
	});

	test("prints a comment under its header, the id line first inside the fence", async () => {
		await started(16000, "short", [
			{ id: "IC_b", at: AT, body: "second" },
			{ id: "IC_a", at: AT, body: "first" },
		]);
		const r = await text("main", "issue", "3", "comment", AT, "2");
		expect(r.out).toBe(
			`lawman input 1 text part 1 of 1\ncomment at=${AT}\n~~~comment\nid="IC_b" author="${LOGIN}"\nsecond\n~~~\nend part 1 of 1\n`,
		);
	});

	test.each([
		[16000, 20000],
		[300, 200],
	])(
		"a tilde run longer than half a part keeps every part within %i characters (run of %i)",
		async (size, run) => {
			const tildes = "~".repeat(run);
			const before = await cleaned(rowsOf(40));
			const texts = {
				start: [tildes, ...before],
				middle: [...before, tildes, ...before],
				end: [...before, tildes],
				inline: [...before, `a ${tildes} b`, ...before],
			};
			for (const lines of Object.values(texts)) {
				const noted = ["note head", ...lines];
				await started(size, lines.join("\n"), [
					{ id: "IC_a", at: AT, body: noted.join("\n") },
				]);
				const words = {
					body: ["main", "issue", "3", "body"],
					comment: ["main", "issue", "3", "comment", AT, "1"],
				};
				for (const [kind, w] of Object.entries(words)) {
					const all = await parts(...w);
					for (const [i, p] of all.entries()) {
						const at = `part ${i + 1} of ${all.length}`;
						expect(p.split("\n")[0]).toBe(`lawman input 1 text ${at}`);
						expect(p.endsWith(`\nend ${at}\n`)).toBe(true);
						expect(cost(content(p))).toBeLessThanOrEqual(size);
					}
					const wanted = kind === "body" ? lines : noted;
					const inner = all.flatMap(inside);
					const given = kind === "body" ? inner : inner.slice(1);
					expect(given.join("")).toBe(wanted.join(""));
					if (kind === "comment")
						expect(inner[0]).toBe(`id="IC_a" author="${LOGIN}"`);
				}
			}
		},
	);

	test("the words of a full line, given back, print the cut text", async () => {
		const lines = await cleaned(rowsOf(300));
		lines[40] = TILDES;
		lines[41] = "```";
		const noted = await cleaned(rowsOf(200));
		const stored = await started(2000, lines.join("\n"), [
			{ id: "IC_x", at: T(10), body: "short" },
			{ id: "IC_b", at: AT, body: noted.join("\n") },
			{ id: "IC_a", at: AT, body: "earlier id" },
		]);
		const words = fullWords(stored);
		expect(words).toEqual([
			"main issue 3 body",
			`main issue 3 comment ${AT} 2`,
		]);
		const body = await parts(...(words[0] ?? "").split(" "));
		expect(body.flatMap(inside)).toEqual(lines);
		const comment = await parts(...(words[1] ?? "").split(" "));
		expect(comment.flatMap(inside)).toEqual([
			`id="IC_b" author="${LOGIN}"`,
			...noted,
		]);
		expect(comment[0]?.split("\n")[1]).toBe(`comment at=${AT}`);
	});

	test("works after the tick has ended", async () => {
		await started(16000, "alpha");
		const open = await text("main", "issue", "3", "body");
		const end = await inprocAsync(BASE, [
			"tick",
			"end",
			"1",
			"--outcome",
			"silent",
		]);
		expect(end.code).toBe(0);
		expect(await text("main", "issue", "3", "body")).toEqual(open);
	});

	test("exits 1 for a text the cache lacks, and tells the role to read the host", async () => {
		await started(16000, "alpha", [{ id: "IC_a", at: AT, body: "one" }]);
		for (const words of [
			["main", "issue", "4", "body"],
			["main", "pull", "3", "body"],
			["other", "issue", "3", "body"],
			["main", "issue", "3", "comment", AT, "2"],
			["main", "issue", "3", "comment", T(1), "1"],
		]) {
			const r = await text(...words);
			expect(r.code).toBe(1);
			expect(r.out).toBe("");
			expect(r.err).toContain("read it from the host yourself");
			expect(r.err).toContain("self");
		}
	});

	test("exits 1 for a part out of range", async () => {
		await started(16000, "alpha");
		const r = await text("main", "issue", "3", "body", "--part", "2");
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
		expect(r.err).toContain("part 2 is out of range; there is 1 part");
	});

	test.each([[[]], [["main", "issue", "3", "body", "--part", "0"]]])(
		"exits 1 with the usage line for %j",
		async (words) => {
			await started(16000, "alpha");
			const r = await text(...words);
			expect(r.code).toBe(1);
			expect(r.out).toBe("");
			expect(r.err).toContain("usage: journal text");
		},
	);
});

test("an invalid input_chars exits 1 as the tick does", async () => {
	// clean
	const cleanIn = async (input: string, ...args: string[]) => {
		const stdin = spyOn(db, "readStdin").mockReturnValue(input);
		try {
			return await inprocAsync("2026-10-17T10:45:00Z", ["clean", ...args]);
		} finally {
			stdin.mockRestore();
		}
	};
	const sized = (n: number | string) =>
		writeFileSync(join(dir, "config.yaml"), `input_chars: ${n}\n`);
	for (const args of [[], ["--json"]]) {
		sized("many");
		const r = await cleanIn('"x"', ...args);
		expect(r).toMatchObject({ code: EXIT.USAGE, out: "" });
		expect(r.err).toContain("invalid input_chars");
	}
	// text
	await started(16000, "alpha");
	writeFileSync(join(dir, "config.yaml"), `${CONFIG}input_chars: many\n`);
	const r = await text("main", "issue", "3", "body");
	expect(r.code).toBe(1);
	expect(r.err).toContain("invalid input_chars");
});

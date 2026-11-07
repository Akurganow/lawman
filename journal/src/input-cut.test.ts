import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	fullLine,
	parseTextWords,
	printCached,
	type TextKey,
} from "./cache-text";
import { human, T } from "./cases-fixture";
import { countSecretMarks, MARK_LABELS } from "./clean";
import { cleanHostText } from "./clean-host";
import * as db from "./db";
import { fenceOf } from "./fence";
import { inprocAsync } from "./inproc";
import {
	cutBlock,
	cutToFit,
	fencedBlock,
	pack,
	render,
	renderAll,
} from "./input-parts";
import { CONFIG, content } from "./input-test-fixture";
import { configs } from "./operations-test-fixture";
import {
	BASE,
	dbFile,
	dir,
	issuesForm,
	precinct,
	rows,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";
import { withoutCaseTexts } from "./tick-start";
import {
	CONSTITUTION,
	departmentPage,
	host,
	input,
	orderOf,
	setUp,
} from "./tick-start-test-fixture";

tempDb();

const TOKEN = ["gh", "p_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4"].join("");
const LONG_ID = `IC_${"9".repeat(197)}`;
const LONG_LOGIN = "l".repeat(39);
const AT = T(10);
const SIZES = [16000, 15000, 49000];

const cost = (lines: string[]) =>
	lines.reduce((n, l) => n + [...l].length + 1, 0);
const row = (i: number) => `line ${i} ${"z".repeat(i % 60)}`;
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => row(i));
// a text of exactly `size` characters
const plainText = (size: number) => {
	const text = rowsOf(Math.ceil(size / 30)).join("\n");
	return text.slice(0, size);
};
const TILDES = "~".repeat(200);
// a run of 200 tildes and a backtick fence at the start, the middle and the end
const tildeText = (size: number) => {
	const lines = plainText(size).split("\n");
	const middle = Math.floor(lines.length / 2);
	lines[0] = TILDES;
	lines[middle] = TILDES;
	lines[middle + 1] = "```";
	lines[lines.length - 1] = TILDES;
	return lines.join("\n");
};

type Event =
	| { line: string }
	| { label: string; fence: string; body: string[] };

// the journal's lines and the fenced texts of one part, in order
function events(lines: string[]): Event[] {
	const out: Event[] = [];
	let open: { label: string; fence: string; body: string[] } | null = null;
	for (const line of lines) {
		if (open !== null) {
			if (line === open.fence) {
				out.push(open);
				open = null;
			} else open.body.push(line);
			continue;
		}
		const fence = /^(~{3,})([a-z]+)$/.exec(line);
		if (fence === null) out.push({ line });
		else open = { fence: fence[1] ?? "", label: fence[2] ?? "", body: [] };
	}
	return out;
}

const showing = (e: Event | undefined) =>
	e === undefined
		? []
		: "line" in e
			? [e.line]
			: [`${e.fence}${e.label}`, ...e.body, e.fence];

type Piece = Extract<Event, { label: string }>;
type Cut = {
	before: string | null;
	head: Piece;
	cut: string;
	full: string;
	tail: Piece;
	lines: string[];
	part: number;
};

const CUT = /^cut kept=(\d+)\+(\d+) of=(\d+) secrets=(\d+)$/;

// the cut block of the parts: its pieces and journal lines stand together in one part
function cutIn(parts: string[]): Cut {
	const found: Cut[] = [];
	for (const [part, text] of parts.entries()) {
		const all = events(content(text));
		for (const [k, e] of all.entries()) {
			if (!("line" in e) || !CUT.test(e.line)) continue;
			const head = all[k - 1];
			const full = all[k + 1];
			const tail = all[k + 2];
			expect(head && "label" in head).toBe(true);
			expect(full && "line" in full).toBe(true);
			expect(tail && "label" in tail).toBe(true);
			const before = all[k - 2];
			const named = before !== undefined && "line" in before;
			const lines = [
				...(named ? showing(before) : []),
				...showing(head),
				e.line,
				...showing(full),
				...showing(tail),
			];
			found.push({
				before: named ? before.line : null,
				head: head as Piece,
				cut: e.line,
				full: (full as { line: string }).line,
				tail: tail as Piece,
				lines,
				part,
			});
		}
	}
	expect(found.length).toBe(1);
	return found[0] as Cut;
}

const noCut = (parts: string[]) => {
	const text = parts.join("\n");
	expect(
		events(text.split("\n")).some((e) => "line" in e && CUT.test(e.line)),
	).toBe(false);
};

type Note = { id: string; login: string; at: string; body: string };

// one tick start in process: the parts it stores
async function started(
	size: number,
	body: string,
	notes: Note[] = [],
	tree?: Record<string, string>,
) {
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir);
	setUp(`${CONFIG}input_chars: ${size}\n`);
	orderOf("response-unit", { issue: 3 });
	host({
		issues: { 3: human("OPEN") },
		...(tree === undefined ? {} : { tree }),
	});
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
							author: { login: n.login },
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
	const parts = JSON.parse(
		String(rows("SELECT parts FROM ticks")[0]?.parts),
	) as string[];
	return { parts, out: r.out };
}

const note = (body: string, id = LONG_ID, at = AT): Note => ({
	id,
	login: LONG_LOGIN,
	at,
	body,
});

// the text of the block, as the journal prints it after cleaning
const cleaned = (text: string) =>
	cleanHostText(text).then((t) => t.split("\n"));

describe("a text up to one part", () => {
	test("a body of exactly P goes as it is, P + 1 is cut", async () => {
		const size = 2000;
		const lines = [
			...Array.from({ length: 19 }, () => "w".repeat(99)),
			"v".repeat(86),
		];
		// the block is `~~~issue`, the lines and `~~~`
		expect(9 + cost(lines) + 4).toBe(size);
		const whole = await started(size, lines.join("\n"));
		noCut(whole.parts);
		const issue = whole.parts
			.flatMap((p) => events(content(p)))
			.find((e): e is Piece => "label" in e && e.label === "issue");
		expect(issue?.body).toEqual(lines);
		expect(issue?.fence).toBe("~~~");
		const over = await started(
			size,
			[...lines.slice(0, -1), `${lines.at(-1)}v`].join("\n"),
		);
		expect(cutIn(over.parts).full).toBe("full text main issue 3 body");
	});

	test("a comment of exactly P goes as it is, P + 1 is cut", async () => {
		const size = 2000;
		const header = `comment at=${AT}`;
		const id = `id=${JSON.stringify(LONG_ID)} author=${JSON.stringify(LONG_LOGIN)}`;
		const room = size - cost([header, "~~~comment", id, "~~~"]);
		const text = "m".repeat(room - 1);
		const whole = await started(size, "short", [note(text)]);
		noCut(whole.parts);
		expect(whole.parts.join("\n")).toContain(`\n${id}\n${text}\n`);
		const over = await started(size, "short", [note(`${text}m`)]);
		expect(cutIn(over.parts).before).toBe(header);
	});
});

describe("a cut text", () => {
	test("pieces are whole lines, the first line leads and the last line ends", async () => {
		const lines = await cleaned(rowsOf(300).join("\n"));
		const r = await started(2000, lines.join("\n"));
		const c = cutIn(r.parts);
		const head = c.head.body;
		const tail = c.tail.body;
		expect(head).toEqual(lines.slice(0, head.length));
		expect(tail).toEqual(lines.slice(lines.length - tail.length));
		expect(head[0]).toBe(lines[0]);
		expect(tail.at(-1)).toBe(lines.at(-1));
		expect(head.length).toBeGreaterThan(1);
		expect(tail.length).toBeGreaterThan(1);
		expect(c.cut).toBe(
			`cut kept=${cost(head)}+${cost(tail)} of=${cost(lines)} secrets=0`,
		);
		expect(c.full).toBe("full text main issue 3 body");
		expect(c.before).toBeNull();
		expect(cost(c.lines)).toBeLessThanOrEqual(2000);
	});

	test("one long line is cut by characters", async () => {
		const line = Array.from({ length: 5000 }, (_, i) =>
			String.fromCharCode(97 + (i % 26)),
		).join("");
		const r = await started(2000, line);
		const c = cutIn(r.parts);
		const [head, tail] = [c.head.body, c.tail.body];
		expect(head).toHaveLength(1);
		expect(tail).toHaveLength(1);
		expect(line.startsWith(head[0] ?? "?")).toBe(true);
		expect(line.endsWith(tail[0] ?? "?")).toBe(true);
		expect((head[0] ?? "").length + (tail[0] ?? "").length).toBeLessThan(5000);
		expect(c.cut).toBe(
			`cut kept=${(head[0] ?? "").length + 1}+${(tail[0] ?? "").length + 1} of=5001 secrets=0`,
		);
		expect(cost(c.lines)).toBeLessThanOrEqual(2000);
	});

	test("a comment keeps its id line in the head, and its key names it", async () => {
		const lines = await cleaned(rowsOf(300).join("\n"));
		const r = await started(2000, "short", [
			note("before", "IC_0"),
			note(lines.join("\n"), "IC_b", T(11)),
			note("same time, earlier id", "IC_a", T(11)),
		]);
		const c = cutIn(r.parts);
		expect(c.before).toBe(`comment at=${T(11)}`);
		expect(c.head.label).toBe("comment");
		expect(c.head.body[0]).toBe(
			`id="IC_b" author=${JSON.stringify(LONG_LOGIN)}`,
		);
		expect(c.head.body.slice(1)).toEqual(
			lines.slice(0, c.head.body.length - 1),
		);
		expect(c.tail.body.at(-1)).toBe(lines.at(-1));
		expect(c.full).toBe(`full text main issue 3 comment ${T(11)} 2`);
		const [, kept, , of] = CUT.exec(c.cut) ?? [];
		expect(Number(of)).toBe(cost([c.head.body[0] ?? "", ...lines]));
		expect(Number(kept)).toBe(cost(c.head.body));
	});

	test("no part ends between a piece and the cut line, whatever stands before it", async () => {
		const lines = await cleaned(rowsOf(200).join("\n"));
		for (const size of [700, 900, 1100, 1300, 1500, 1900]) {
			const r = await started(size, lines.join("\n"));
			const c = cutIn(r.parts);
			expect(cost(c.lines)).toBeLessThanOrEqual(size);
			for (const part of r.parts)
				expect(cost(content(part)) === 0 || cost(content(part)) <= size).toBe(
					true,
				);
		}
	});

	test.each([
		["start", (l: string[]) => [TILDES, ...l.slice(1)]],
		["middle", (l: string[]) => l.map((x, i) => (i === 100 ? TILDES : x))],
		["end", (l: string[]) => [...l.slice(0, -1), TILDES]],
		["backticks", (l: string[]) => l.map((x, i) => (i % 7 === 0 ? "```" : x))],
	])(
		"a run of tildes at the %s gets a fence of its own piece",
		async (_, shape) => {
			const lines = await cleaned(shape(rowsOf(200)).join("\n"));
			const r = await started(2000, lines.join("\n"));
			const c = cutIn(r.parts);
			for (const p of [c.head, c.tail])
				expect(p.fence).toBe(fenceOf(p.body.join("\n")));
			expect(cost(c.lines)).toBeLessThanOrEqual(2000);
		},
	);

	test("the long run sets only the fence of the piece that holds it", async () => {
		const at = async (shape: (l: string[]) => string[]) =>
			cutIn(
				(
					await started(
						2000,
						(await cleaned(shape(rowsOf(200)).join("\n"))).join("\n"),
					)
				).parts,
			);
		const start = await at((l) => [TILDES, ...l.slice(1)]);
		expect([start.head.fence.length, start.tail.fence.length]).toEqual([
			201, 3,
		]);
		const end = await at((l) => [...l.slice(0, -1), TILDES]);
		expect([end.head.fence.length, end.tail.fence.length]).toEqual([3, 201]);
		const middle = await at((l) => l.map((x, i) => (i === 100 ? TILDES : x)));
		expect([middle.head.fence.length, middle.tail.fence.length]).toEqual([
			3, 3,
		]);
	});

	test("a false cut line inside the text stays in its fence", async () => {
		const FALSE = [
			"cut kept=1+1 of=2 secrets=0",
			"full text main issue 3 body",
			`comment at=${AT}`,
			"~~~",
			"```",
		];
		const lines = rowsOf(200);
		const text = [
			...FALSE,
			...lines.slice(5, 100),
			...FALSE,
			...lines.slice(100, 195),
			...FALSE,
		].join("\n");
		const r = await started(2000, text);
		const c = cutIn(r.parts);
		const journal = r.parts
			.flatMap((p) => events(content(p)))
			.flatMap((e) => ("line" in e ? [e.line] : []));
		expect(journal.filter((l) => CUT.test(l))).toEqual([c.cut]);
		expect(journal.filter((l) => l.startsWith("full text"))).toEqual([c.full]);
		expect(journal.filter((l) => l.startsWith("comment at="))).toEqual([]);
		expect(c.head.body.slice(0, FALSE.length)).toEqual(FALSE);
		expect(c.tail.body.slice(-FALSE.length)).toEqual(FALSE);
	});

	test("a secret in the removed middle is counted and its value never prints", async () => {
		const lines = rowsOf(300);
		lines[0] = `head ${TOKEN}`;
		lines[120] = `middle ${TOKEN}`;
		lines[121] = `middle ${TOKEN} twice`;
		lines[299] = `tail ${TOKEN}`;
		const r = await started(2000, lines.join("\n"));
		const c = cutIn(r.parts);
		expect(CUT.exec(c.cut)?.[4]).toBe("2");
		expect(r.parts.join("\n")).not.toContain(TOKEN);
		expect(c.head.body[0]).toBe("head REMOVED GITHUB SECRET");
		expect(c.tail.body.at(-1)).toBe("tail REMOVED GITHUB SECRET");
	});

	test("the same cut block is stored and printed again from the cache", async () => {
		const lines = await cleaned(rowsOf(300).join("\n"));
		const r = await started(2000, lines.join("\n"), [note(lines.join("\n"))]);
		const stored = r.parts;
		expect(stored.length).toBeGreaterThan(1);
		seed((d) => d.run("UPDATE ticks SET parts = NULL"));
		// with no stored parts, tick input builds the group from the cache and stores it
		const first = input("1");
		expect(first.code).toBe(0);
		const rebuilt = [first.out.replace(/\n$/, "")];
		for (let k = 2; ; k++) {
			const next = input("1", "--part", String(k));
			if (next.code !== 0) break;
			rebuilt.push(next.out.replace(/\n$/, ""));
		}
		const texts = (parts: string[]) =>
			parts
				.flatMap((p) => events(content(p)))
				.filter(
					(e) =>
						("label" in e && (e.label === "issue" || e.label === "comment")) ||
						("line" in e &&
							(CUT.test(e.line) ||
								e.line.startsWith("full text") ||
								e.line.startsWith("comment at="))),
				);
		expect(texts(rebuilt)).toEqual(texts(stored));
		// the lines from the title on, byte for byte: only the constitution and stage lines before differ
		const fromTitle = (parts: string[]) => {
			const all = parts.flatMap(content);
			return all
				.slice(all.findIndex((l) => /^~+title$/.test(l)))
				.filter((l) => !l.startsWith("self "));
		};
		expect(fromTitle(rebuilt)).toEqual(fromTitle(stored));
		expect(
			texts(stored).filter((e) => "line" in e && CUT.test(e.line)),
		).toHaveLength(2);
		expect(
			JSON.parse(String(rows("SELECT parts FROM ticks")[0]?.parts)),
		).toEqual(rebuilt);
	});
});

describe("the fit", () => {
	const shapes: [string, (size: number) => string][] = [
		["plain", plainText],
		["tildes", tildeText],
	];
	for (const size of SIZES)
		for (const [name, make] of shapes) {
			test(`a body and a comment of ${name} text above ${size} fit one part`, async () => {
				const text = make(100889);
				const body = await started(size, text);
				const b = cutIn(body.parts);
				expect(cost(b.lines)).toBeLessThanOrEqual(size);
				for (const part of body.parts)
					expect(cost(content(part))).toBeLessThanOrEqual(size);
				const comment = await started(size, "short", [note(text)]);
				const c = cutIn(comment.parts);
				expect(cost(c.lines)).toBeLessThanOrEqual(size);
				expect(c.head.body[0]).toBe(
					`id=${JSON.stringify(LONG_ID)} author=${JSON.stringify(LONG_LOGIN)}`,
				);
				for (const part of comment.parts)
					expect(cost(content(part))).toBeLessThanOrEqual(size);
			});
		}

	test("a text of 100 889 characters is one part at 16 000 where it was seven", async () => {
		seed((d) => {
			precinct(d, "main");
			d.run(
				"INSERT INTO issues (precinct, issue, state, title, created_at, body) VALUES ('main', 3, 'OPEN', 't', ?, ?)",
				[T(9), plainText(100889)],
			);
		});
		const opened = db.open(dbFile);
		try {
			const before = await printCached(opened, "main", "issue", 3);
			const after = await printCached(opened, "main", "issue", 3, 16000);
			expect(pack(before ?? [], 16000)).toHaveLength(7);
			expect(pack(after ?? [], 16000)).toHaveLength(1);
		} finally {
			opened.close();
		}
	});
});

describe("a part smaller than the cut block", () => {
	test("a text the frame leaves no room for is split by lines, not cut", async () => {
		const lines = rowsOf(30);
		const r = await started(40, lines.join("\n"));
		noCut(r.parts);
		expect(r.parts.join("\n")).not.toContain("full text");
		const joined = r.parts
			.flatMap((p) => events(content(p)))
			.flatMap((e) => ("label" in e && e.label === "issue" ? e.body : []));
		expect(joined.length).toBeGreaterThan(30);
	});

	test("the constitution and the department page above a part split by lines", async () => {
		const filler = Array.from(
			{ length: 150 },
			(_, i) => `Filler rule ${i}.`,
		).join("\n\n");
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir);
		setUp(`${CONFIG}input_chars: 1500\n`);
		orderOf("patrol", { department: "fixtures" });
		host({
			tree: {
				"LAWMAN.md": `${CONSTITUTION.trimEnd()}\n\n${filler}\n`,
				".lawman/departments/fixtures.md": `${departmentPage("fixtures").trimEnd()}\n\n${filler}\n`,
			},
		});
		const r = await inprocAsync(BASE, [
			"tick",
			"start",
			"--role",
			"patrol",
			"--order",
			"1",
		]);
		expect(r.code).toBe(0);
		const parts = JSON.parse(
			String(rows("SELECT parts FROM ticks")[0]?.parts),
		) as string[];
		expect(parts.length).toBeGreaterThan(2);
		noCut(parts);
		expect(parts.join("\n")).not.toContain("full text");
		for (const label of ["constitution", "department"]) {
			const body = parts
				.flatMap((p) => events(content(p)))
				.flatMap((e) => ("label" in e && e.label === label ? e.body : []));
			expect(body).toContain("Filler rule 149.");
		}
	});
});

describe("the key of a comment", () => {
	const seeded = (
		comments: [id: string, at: string, body: string][],
		issue = 3,
	) =>
		seed((d) => {
			d.run("DELETE FROM comments");
			d.run("DELETE FROM issues");
			d.run(
				"INSERT OR IGNORE INTO precincts (name, repo, weight) VALUES ('main', 'o/main', 1)",
			);
			d.run(
				"INSERT INTO issues (precinct, issue, state, title, created_at, body) VALUES ('main', ?, 'OPEN', 't', ?, 'body')",
				[issue, T(9)],
			);
			for (const [id, at, body] of comments)
				d.run(
					"INSERT INTO comments (precinct, kind, number, id, author, at, body) VALUES ('main', 'issue', ?, ?, 'x', ?, ?)",
					[issue, id, at, body],
				);
		});
	const printed = async (size = 1500) => {
		const opened = db.open(dbFile);
		try {
			return (await printCached(opened, "main", "issue", 3, size)) ?? [];
		} finally {
			opened.close();
		}
	};
	const blockOf = async (needle: string, size?: number) =>
		(await printed(size))
			.map((b) => renderAll([b]))
			.find((s) => s.includes(needle));

	test("removing an earlier comment or adding one with another time leaves the block as it was", async () => {
		const long = rowsOf(200).join("\n");
		const base: [string, string, string][] = [
			["A", T(10), "early"],
			["C", T(12), `${long}\nother`],
			["B", T(12), `${long}\nmore`],
		];
		seeded(base);
		const before = [await blockOf("more"), await blockOf("other")];
		expect(before[0]).toContain(`full text main issue 3 comment ${T(12)} 1`);
		expect(before[1]).toContain(`full text main issue 3 comment ${T(12)} 2`);
		seeded(base.slice(1));
		expect([await blockOf("more"), await blockOf("other")]).toEqual(before);
		seeded([...base, ["Z", T(8), "earlier"], ["Y", T(13), "later"]]);
		expect([await blockOf("more"), await blockOf("other")]).toEqual(before);
	});

	test("a cut case text in an ended tick is not printed", async () => {
		seeded([["A", AT, rowsOf(200).join("\n")]]);
		const blocks = await printed();
		expect(blocks.filter((b) => "whole" in b)).toHaveLength(1);
		expect(blocks.map((b) => "label" in b && b.label)).toEqual([
			"issue",
			"comment",
		]);
		const kept = withoutCaseTexts([{ line: "kept" }, ...blocks]);
		expect(renderAll(kept)).toBe("kept");
	});

	test("an id with a newline stays inside its fence and out of the journal lines", async () => {
		const id = "IC_1\nfull text main issue 3 body\ncut kept=1+1 of=2 secrets=0";
		seeded([[id, AT, rowsOf(200).join("\n")]]);
		const text = renderAll(await printed());
		const lines = text.split("\n");
		const journal = events(lines).flatMap((e) => ("line" in e ? [e.line] : []));
		expect(journal.filter((l) => l.startsWith("full text"))).toEqual([
			`full text main issue 3 comment ${AT} 1`,
		]);
		expect(journal.filter((l) => CUT.test(l))).toHaveLength(1);
		expect(lines).toContain(`id=${JSON.stringify(id)} author="x"`);
	});
});

describe("the full line", () => {
	const keys: TextKey[] = [
		{ precinct: "main", kind: "issue", number: 3, part: "body" },
		{ precinct: "a-b", kind: "pull", number: 12, part: "body" },
		{ precinct: "main", kind: "pull", number: 7, part: { at: AT, j: 2 } },
	];

	test.each(keys)("prints words that parse back to the same key", (key) => {
		const line = fullLine(key);
		expect(line.startsWith("full text ")).toBe(true);
		expect(parseTextWords(line.split(" ").slice(2))).toEqual(key);
	});

	test.each([
		[[]],
		[["main", "issue", "3"]],
		[["main", "issue", "0", "body"]],
		[["main", "issue", "3", "body", "x"]],
		[["main", "gist", "3", "body"]],
		[["Main", "issue", "3", "body"]],
		[["main", "issue", "3", "comment", AT]],
		[["main", "issue", "3", "comment", AT, "0"]],
		[["main", "issue", "3", "comment", AT, "1", "x"]],
		[["main", "issue", "3", "other"]],
	])("refuses the words %j", (words) => {
		expect(parseTextWords(words)).toBeNull();
	});
});

describe("a tilde line and the search for the pieces", () => {
	const TILDE_SHAPES: [string, (n: number) => string][] = [
		["at the start", (n) => `${"~".repeat(n)}\n${rowsOf(50).join("\n")}`],
		["at the end", (n) => `${rowsOf(50).join("\n")}\n${"~".repeat(n)}`],
		["as the whole text", (n) => "~".repeat(n)],
	];
	for (const size of SIZES)
		for (const [where, make] of TILDE_SHAPES)
			test(`a body and a comment with a tilde line ${where} are cut to fit ${size}`, async () => {
				const text = make(size);
				const body = await started(size, text);
				expect(cost(cutIn(body.parts).lines)).toBeLessThanOrEqual(size);
				const comment = await started(size, "short", [note(text)]);
				expect(cost(cutIn(comment.parts).lines)).toBeLessThanOrEqual(size);
			});

	test("a mark of a removed secret split by the cut still counts as removed", () => {
		const lines = rowsOf(100);
		lines[0] = `a ${TOKEN}`;
		lines[50] = "REMOVED GITHUB SECRET";
		const block = fencedBlock("issue", lines.join("\n"));
		const mark = (t: string) => countSecretMarks(t);
		const out = cutBlock(block, 200, "full", mark);
		expect(out.some((l) => l.startsWith("cut kept="))).toBe(true);
		expect(mark("x REMOVED GITHUB SECRET y")).toBe(1);
		const split = fencedBlock(
			"issue",
			`${"w".repeat(100)} REMOVED GITHUB SECRET ${"w".repeat(600)}`,
		);
		for (let room = 105; room < 125; room += 5) {
			const lines = cutBlock(split, room, "full", mark);
			const secrets = Number(/secrets=(\d+)/.exec(lines.join("\n"))?.[1]);
			const shown = mark(lines.filter((l) => !l.startsWith("cut ")).join("\n"));
			expect(shown).toBe(0);
			expect(secrets).toBe(1);
		}
	});

	test("every label the cleaner can emit counts as one removed secret", async () => {
		expect(MARK_LABELS.length).toBeGreaterThan(10);
		for (const label of MARK_LABELS)
			expect(countSecretMarks(`a ${label} b ${label}`)).toBe(2);
		const masked = await cleanHostText(`k ${TOKEN}`);
		expect(MARK_LABELS.some((label) => masked.includes(label))).toBe(true);
		expect(countSecretMarks(masked)).toBe(1);
	});

	test("text that no rule emits does not count as a mark", () => {
		for (const text of [
			"REMOVED SECRET",
			"REMOVED  SECRET",
			"REMOVED lower SECRET",
			"REMOVED NO SUCH RULE SECRET",
			"REMOVED GITHUB",
		])
			expect(countSecretMarks(text)).toBe(0);
	});

	// the quadratic count took several seconds on the first two shapes
	const HOSTILE = [
		["a run of REMOVED", (n: number) => "REMOVED ".repeat(n / 8)],
		[
			"marks that miss the end",
			(n: number) => "REMOVED GITHUB SECRE ".repeat(n / 21),
		],
		["a long label without the end", (n: number) => `REMOVED ${"A".repeat(n)}`],
	] as const;
	for (const [shape, make] of HOSTILE)
		test(`a text of 130000 characters made of ${shape} is cut in linear time`, () => {
			const text = `${make(130000)}\nREMOVED GITHUB SECRET`;
			const block = fencedBlock("issue", text);
			const started = performance.now();
			const got = cutToFit(block, 16000, "full", countSecretMarks);
			expect(performance.now() - started).toBeLessThan(2000);
			const lines = render(got);
			expect(cost(lines)).toBeLessThanOrEqual(16000);
			expect(lines.some((l) => l.startsWith("cut kept="))).toBe(true);
			const [secrets] = /secrets=(\d+)/.exec(lines.join("\n"))?.slice(1) ?? [];
			const kept = countSecretMarks(
				lines.filter((l) => !l.startsWith("cut ")).join("\n"),
			);
			expect(Number(secrets) + kept).toBe(1);
		});

	test("the pieces are the longest that fit, against a brute-force search", () => {
		let seedN = 7;
		const rnd = (n: number) => {
			seedN = (seedN * 1103515245 + 12345) % 2147483648;
			return seedN % n;
		};
		const atoms = [
			"~",
			"~~~",
			"`",
			"```",
			"a",
			"bc ",
			"\u{1F600}",
			"\u00e9",
			"\r",
			"",
		];
		const line = () => {
			if (rnd(9) === 0) return "~".repeat(rnd(60));
			let t = "";
			for (let n = rnd(40); n > 0; n--) t += atoms[rnd(atoms.length)];
			return t;
		};
		for (let i = 0; i < 400; i++) {
			const lines = Array.from({ length: 1 + rnd(40) }, line);
			const header =
				rnd(2) === 0 ? undefined : `comment at=${"t".repeat(rnd(40))}`;
			const full = `full text main issue ${rnd(99999) + 1} body`;
			const block = { ...fencedBlock("comment", lines.join("\n"), header) };
			const size = [30, 80, 150, 400, 1500][rnd(5)] ?? 100;
			const blockCost = cost(render(block));
			const got = cutToFit(block, size, full, countSecretMarks);
			if (blockCost <= size) {
				expect(got).toBe(block);
				continue;
			}
			let best = -1;
			for (let room = 2; room <= cost(block.lines); room++)
				if (cost(cutBlock(block, room, full, countSecretMarks)) <= size)
					best = room;
			if (best < 0) expect(got).toBe(block);
			else
				expect(render(got)).toEqual(
					cutBlock(block, best, full, countSecretMarks),
				);
		}
	});
});

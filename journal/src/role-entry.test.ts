import { beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { withDb } from "./db";
import { takeableOrders } from "./dispatch";
import { captured, inprocAsync } from "./inproc";
import { readConfig } from "./input-files";
import {
	CONFIG,
	config,
	content,
	installation,
	lines,
	ROLE_NAMES,
	references,
} from "./input-test-fixture";
import {
	command,
	configs,
	RECORDS,
	recording,
	shared,
} from "./operations-test-fixture";
import { roleParts } from "./role-entry";
import {
	BASE,
	call,
	dir,
	LAW,
	later,
	order,
	precinct,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => seed((d) => precinct(d, "main")));

const WIDE = 10_000_000;
const wake = (role: string, clock = BASE) =>
	call(clock, ["wake", "--role", role]);
const part = (role: string, k: number) =>
	call(BASE, ["tick", "input", "--role", role, "--part", String(k)]);
const sized = (n: number) => config(`${CONFIG}input_chars: ${n}\n`);
const orderFor = (role: string, at = BASE) =>
	seed((d) => order(d, "main", role, { at, issue: 3 }));
const total = (out: string) =>
	Number(/ of (\d+)$/.exec(lines(out)[0] ?? "")?.[1]);

// every part of a role's group: the first from wake, the rest from tick input
async function parts(role: string): Promise<string[]> {
	const first = (await inprocAsync(BASE, ["wake", "--role", role])).out;
	const rest: string[] = [];
	for (let k = 2; k <= total(first); k++)
		rest.push(
			(
				await inprocAsync(BASE, [
					"tick",
					"input",
					"--role",
					role,
					"--part",
					String(k),
				])
			).out,
		);
	return [first, ...rest];
}

// Appendix A of the role table, as the skills read it at this commit.
const TICK = readFileSync(join(LAW, "tick.md"), "utf8");
const TICK_HEADINGS = [
	"intro",
	...[...TICK.matchAll(/^## (.+)$/gm)].map((m) => m[1] ?? ""),
];
const EVERY_ROLE = [
	"intro",
	"One end",
	"Sync the law",
	"Working rules",
	"Instructions and evidence",
	"Fetch the precinct",
	"End the tick",
];
const PROSECUTOR = [
	"Sync the tracker",
	"Read the stage",
	"Check the constitution",
	"Reading without a tree",
	"Write a comment",
	"Close the issue",
	"Alarm",
];
const MORE: Record<string, string[]> = {
	patrol: [
		"Sync the tracker",
		"Check the constitution",
		"Resolve the department page",
		"Alarm",
	],
	"response-unit": [
		"Sync the tracker",
		"Check the intake order",
		"Check the constitution",
		"Reading without a tree",
		"Write a comment",
		"Alarm",
	],
	investigation: [
		"Sync the tracker",
		"Read the stage",
		"Check the constitution",
		"Write a comment",
		"Alarm",
	],
	prosecutor: PROSECUTOR,
	defender: [...PROSECUTOR, "Resolve the department page"],
	court: [...PROSECUTOR, "Resolve the department page"],
	clerk: [
		"Sync the tracker",
		"Sync the pull requests",
		"Read the stage",
		"Check the decider",
		"Write a comment",
		"Close the issue",
		"Alarm",
	],
	"spec-writer": [
		"Sync the pull requests",
		"Read the pull stage",
		"Check the constitution",
		"Reading without a tree",
		"Write a comment",
	],
	executor: [
		"Sync the pull requests",
		"Read the pull stage",
		"Check the constitution",
		"Write a comment",
	],
};
const heading = (name: string) =>
	name === "intro" ? "# The tick" : `## ${name}`;
const file = (path: string) =>
	readFileSync(join(LAW, path), "utf8").replace(/\n$/, "").split("\n");

type Expected = { head: string; whole?: string[]; headings?: string[] };

function expected(role: string): Expected[] {
	const harness = {
		head: "harness harnesses/hermes.md",
		headings: ["### Silence"],
	};
	const order = { head: "order 1 main o/main - 3", headings: [] };
	if (role === "duty-desk")
		return [
			{
				head: "law LAW.md",
				headings: [
					"## Silence is the default",
					"## One tick, one case, exit",
					"## Alarms and their repetition",
					"## Tick outcomes",
				],
			},
			{
				head: "law tick.md",
				headings: [
					"# The tick",
					"## Sync the law",
					"## Sync the tracker",
					"## Sync the pull requests",
				],
			},
			harness,
		];
	const tick = TICK_HEADINGS.filter(
		(h) => EVERY_ROLE.includes(h) || (MORE[role] ?? []).includes(h),
	);
	const extra: Expected[] =
		role === "patrol"
			? [
					{ head: "law markers.md", whole: file("markers.md") },
					{ head: "law departments.md", whole: file("departments.md") },
				]
			: role === "response-unit"
				? [{ head: "law markers.md", headings: ["## The `id` value"] }]
				: [];
	return [
		{ head: "law LAW.md", whole: file("LAW.md") },
		{ head: "law tick.md", headings: tick.map(heading) },
		...extra,
		harness,
		order,
	];
}

// the blocks of a group: a journal line and the law lines behind it
function blocks(group: string[]): { head: string; body: string[] }[] {
	const found: { head: string; body: string[] }[] = [];
	for (const line of group)
		if (line.startsWith("|"))
			found.at(-1)?.body.push(line === "|" ? "" : line.slice(2));
		else found.push({ head: line, body: [] });
	return found;
}

describe("the role group", () => {
	beforeEach(() => installation(`${CONFIG}input_chars: ${WIDE}\n`));

	test.each(ROLE_NAMES)(
		"%s gets the blocks and sections of the role table in order",
		(role) => {
			if (role !== "duty-desk") orderFor(role);
			const out = wake(role);
			expect(out.code).toBe(0);
			expect(lines(out.out)[0]).toBe(
				`lawman input 1 role=${role} at=${BASE} part 1 of 1`,
			);
			expect(lines(out.out).at(-1)).toBe("end part 1 of 1");
			const found = blocks(content(out.out));
			expect(found.map((b) => b.head)).toEqual(
				expected(role).map((e) => e.head),
			);
			for (const [i, e] of expected(role).entries()) {
				const body = found[i]?.body ?? [];
				if (e.whole !== undefined)
					expect([e.head, body]).toEqual([e.head, e.whole]);
				else
					expect([e.head, body.filter((l) => /^#{1,3} /.test(l))]).toEqual([
						e.head,
						e.headings ?? [],
					]);
			}
		},
	);

	test("a section runs from its heading to the next heading of its level, byte for byte", () => {
		orderFor("investigation");
		const tick = blocks(content(wake("investigation").out))[1]?.body ?? [];
		const one = TICK.slice(
			TICK.indexOf("## One end"),
			TICK.indexOf("## Sync the law"),
		);
		expect(
			tick.slice(tick.indexOf("## One end"), tick.indexOf("## Sync the law")),
		).toEqual(one.replace(/\n$/, "").split("\n"));
		expect(tick.slice(0, tick.indexOf("## One end"))).toEqual(
			TICK.slice(0, TICK.indexOf("## One end")).replace(/\n$/, "").split("\n"),
		);
	});

	test("the duty desk always has work and no order block", () => {
		seed((d) => order(d, "main", "duty-desk"));
		const r = wake("duty-desk");
		expect(r.out).not.toBe("");
		expect(content(r.out).filter((l) => l.startsWith("order "))).toEqual([]);
	});
});

const BACKTICK_LINE = /^`/m;
const PROMPT_SCAN = [
	// the patterns of the Hermes scan of an assembled cron prompt, tools/cronjob_prompt_scan.py:28-31
	/ignore\s+(?:\w+\s+)*(?:previous|all|above|prior)\s+(?:\w+\s+)*instructions/i,
	/do\s+not\s+tell\s+the\s+user/i,
	/system\s+prompt\s+override/i,
	/disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i,
];

describe("the role group on this commit's law", () => {
	beforeEach(() => installation());

	test.each(ROLE_NAMES)(
		"%s stays one code block inside a backtick fence, at the default size",
		async (role) => {
			orderFor(role);
			for (const printed of await parts(role)) {
				const group = printed.replace(/\n$/, "");
				expect(group).not.toMatch(BACKTICK_LINE);
				const tree = unified()
					.use(remarkParse)
					.parse(`\`\`\`\n${group}\n\`\`\``) as Root;
				expect(tree.children).toHaveLength(1);
				expect(tree.children[0]).toMatchObject({ type: "code", value: group });
			}
		},
	);

	test.each(ROLE_NAMES)(
		"%s matches none of the Hermes prompt scan patterns",
		async (role) => {
			orderFor(role);
			const all = (await parts(role)).join("");
			for (const pattern of PROMPT_SCAN)
				expect([role, pattern.test(all)]).toEqual([role, false]);
		},
	);

	test("the first line of every part carries the form", async () => {
		orderFor("prosecutor");
		const all = await parts("prosecutor");
		expect(all.length).toBeGreaterThan(1);
		for (const [i, printed] of all.entries())
			expect(lines(printed)[0]).toMatch(
				new RegExp(
					`^lawman input 1 role=prosecutor .*part ${i + 1} of ${all.length}$`,
				),
			);
	});
});

describe("parts of the role group", () => {
	beforeEach(() => installation());

	test("each part fits the size, ends with its last line, and the parts join to the whole group", async () => {
		orderFor("court");
		sized(WIDE);
		const whole = content(wake("court").out);
		const size = 3000;
		sized(size);
		const all = await parts("court");
		expect(all.length).toBeGreaterThan(5);
		for (const [i, printed] of all.entries()) {
			const lines_ = content(printed);
			expect(
				lines_.reduce((n, l) => n + [...l].length + 1, 0),
			).toBeLessThanOrEqual(size);
			expect(lines(printed).at(-1)).toBe(`end part ${i + 1} of ${all.length}`);
			// a file's line goes with its first section, so no part ends on it
			expect(content(printed).at(-1)).not.toMatch(/^(law|harness) /);
		}
		expect(all.flatMap(content)).toEqual(whole);
	});

	test("a part's content is the same at every call, and a new order changes no part of the law", async () => {
		orderFor("court");
		config(`${CONFIG}input_chars: 3000\njobs: court=2\n`);
		const before = await parts("court");
		expect((await parts("court")).map(content)).toEqual(before.map(content));
		seed((d) => order(d, "main", "court", { at: later(1), issue: 4 }));
		const after = await parts("court");
		expect(after.length).toBe(before.length);
		expect(after.slice(0, -1).map(content)).toEqual(
			before.slice(0, -1).map(content),
		);
		expect(content(after.at(-1) ?? "")).toEqual([
			"order 1 main o/main - 3",
			"order 2 main o/main - 4",
		]);
	});

	test("a whole group in one part keeps its orders in that part", () => {
		orderFor("investigation");
		sized(WIDE);
		expect(total(wake("investigation").out)).toBe(1);
	});

	// Each call of tick input builds the whole group again, so this test builds
	// the parts once and checks the command against the first and the last.
	test("at a small size no line starts with a backtick and long law lines are cut behind the prefix", async () => {
		orderFor("executor");
		sized(300);
		let built: string[] = [];
		captured(BASE, () => {
			const orders = withDb((d) => takeableOrders(d, "executor", BASE));
			built = roleParts("executor", orders, readConfig()).map((p) =>
				p.join("\n"),
			);
		});
		expect(built.length).toBeGreaterThan(100);
		for (const part of built) {
			expect(part).not.toMatch(BACKTICK_LINE);
			for (const line of part.split("\n"))
				expect([...line].length + 1).toBeLessThanOrEqual(300);
		}
		const law = readFileSync(join(LAW, "LAW.md"), "utf8").split("\n");
		expect(law.some((line) => [...line].length + 3 > 300)).toBe(true);
		const last = await inprocAsync(BASE, [
			"tick",
			"input",
			"--role",
			"executor",
			"--part",
			String(built.length),
		]);
		expect(content(last.out)).toEqual((built.at(-1) ?? "").split("\n"));
		const first = await inprocAsync(BASE, ["wake", "--role", "executor"]);
		expect(content(first.out)).toEqual((built[0] ?? "").split("\n"));
	});

	test("an input_chars outside the class exits 1 with work and changes nothing without", () => {
		config(`${CONFIG}input_chars: 12k\n`);
		expect(wake("court")).toMatchObject({ code: 0, out: "" });
		orderFor("court");
		expect(wake("court")).toMatchObject({ code: 1, out: "" });
		expect(part("court", 2)).toMatchObject({ code: 1, out: "" });
		for (const value of ["0", "007", "-5", "1.5"]) {
			config(`${CONFIG}input_chars: ${value}\n`);
			expect([value, wake("court").code]).toEqual([value, 1]);
		}
	});

	test("a part outside the group exits 1", () => {
		orderFor("court");
		sized(WIDE);
		expect(part("court", 2)).toMatchObject({ code: 1, out: "" });
		expect(part("judge", 1)).toMatchObject({ code: 1, out: "" });
		expect(part("constructor", 1)).toMatchObject({ code: 1, out: "" });
		expect(part("court", 1).out).toStartWith(
			"lawman input 1 role=court part 1 of 1\n",
		);
	});
});

describe("no work", () => {
	test("prints nothing, the same at every check, whatever the config holds", () => {
		installation();
		expect(wake("court", later(1))).toMatchObject({ code: 0, out: "" });
		config("input_chars: bad\nharness: Bad/../x\n");
		expect(wake("court", later(2))).toMatchObject({ code: 0, out: "" });
	});

	test("runs no command and changes only the role's check time and check count", () => {
		installation();
		for (const place of [configs("main"), shared()])
			for (const operation of ["fetch", "identity", "issues", "release"])
				command(place, operation, recording("true"));
		seed((d) =>
			d.run(
				"INSERT INTO roles (name, every_minutes) VALUES ('court', 5), ('clerk', 5)",
			),
		);
		orderFor("court");
		const tables = [
			"precincts",
			"roles",
			"dispatches",
			"ticks",
			"alarms",
			"issues",
			"markers",
			"pulls",
			"comments",
		];
		const dump = () =>
			Object.fromEntries(tables.map((t) => [t, rows(`SELECT * FROM ${t}`)]));
		const before = dump();
		expect(wake("court", later(1)).code).toBe(0);
		expect(wake("clerk", later(1)).code).toBe(0);
		const after = dump();
		for (const place of [configs("main"), shared()])
			expect(existsSync(join(place, RECORDS))).toBe(false);
		expect({ ...after, roles: [] }).toEqual({ ...before, roles: [] });
		expect(after.roles).toEqual([
			{ name: "court", every_minutes: 5, checked_at: later(1), checks: 1 },
			{ name: "clerk", every_minutes: 5, checked_at: later(1), checks: 0 },
		]);
	});
});

describe("a block the journal cannot give", () => {
	const selfs = (out: string) => content(out).filter((l) => !l.startsWith("|"));

	test.each([
		[
			"the law file",
			() => rmSync(references("markers.md")),
			["self law markers.md The `id` value"],
		],
		[
			"a law section",
			() => {
				const path = references("tick.md");
				writeFileSync(
					path,
					readFileSync(path, "utf8").replace(
						"## Check the intake order",
						"## Renamed",
					),
				);
			},
			["law tick.md", "self law tick.md Check the intake order"],
		],
		[
			"config.yaml",
			() => rmSync(join(dir, "config.yaml")),
			["self harness harnesses/<harness>.md Silence"],
		],
		[
			"the harness key",
			() => config("trusted_login: x\n"),
			["self harness harnesses/<harness>.md Silence"],
		],
		[
			"a harness outside the class",
			() => config("harness: ../hermes\n"),
			["self harness harnesses/<harness>.md Silence"],
		],
		[
			"the harness page",
			() => rmSync(references("harnesses", "hermes.md")),
			["self harness harnesses/hermes.md Silence"],
		],
	])(
		"stands as a self line in place of %s, the other blocks stay",
		async (_, broken, wanted) => {
			installation();
			orderFor("response-unit");
			broken();
			const all = await parts("response-unit");
			const got = all.flatMap((p) => selfs(p));
			for (const line of wanted) expect(got).toContain(line);
			expect(got.filter((l) => l.startsWith("self "))).toHaveLength(1);
			expect(got).toContain("law LAW.md");
			expect(got).toContain("order 1 main o/main - 3");
		},
	);
});

describe("in process", () => {
	test("wake and tick input --role print the same group as the command line", async () => {
		installation(`${CONFIG}input_chars: 4000\n`);
		orderFor("spec-writer");
		const first = await inprocAsync(BASE, ["wake", "--role", "spec-writer"]);
		expect(first).toMatchObject({ code: 0, out: wake("spec-writer").out });
		const second = await inprocAsync(BASE, [
			"tick",
			"input",
			"--role",
			"spec-writer",
			"--part",
			"2",
		]);
		expect(second).toMatchObject({ code: 0, out: part("spec-writer", 2).out });
		expect(
			(
				await inprocAsync(BASE, [
					"tick",
					"input",
					"--role",
					"spec-writer",
					"--part",
					"99",
				])
			).code,
		).toBe(1);
		expect(
			(await inprocAsync(BASE, ["tick", "input", "--role", "spec-writer"]))
				.code,
		).toBe(1);
	});
});

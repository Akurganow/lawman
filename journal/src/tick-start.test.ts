import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { handed, human, put, type Spec, T } from "./cases-fixture";
import { inprocAsync } from "./inproc";
import {
	CONFIG,
	config,
	content,
	LAW_COMMIT,
	lawVersion,
	lines,
} from "./input-test-fixture";
import {
	command,
	configs,
	RECORDS,
	recording,
	shared,
} from "./operations-test-fixture";
import { SPEC } from "./pulls-fixture";
import {
	BASE,
	call,
	caseMark,
	charge,
	defence,
	dir,
	JOURNAL,
	later,
	order,
	rows,
	SHA,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";
import {
	CONSTITUTION,
	departmentPage,
	host,
	input,
	leadIn,
	orderOf,
	setUp,
	skeleton,
	start,
} from "./tick-start-test-fixture";

tempDb();

const withLead = (department: string, ...marks: string[]): Spec => ({
	body: [leadIn(department)],
	comments: marks.map((body, i) => [T(10 + i), body]),
});
const HEAD = (role: string, tick = 1) =>
	`lawman input 1 role=${role} tick=${tick} part 1 of 1`;
const RAN = [`login=${TRUSTED}`];
const ORDER = (issue = "3", department = "-") => [
	`order 1 main o/main ${department} ${issue}`,
];
const REVISION = `revision=${SHA}`;
const CONSTITUTION_FENCES = ["~lint", "~constitution"];
const ISSUE_TEXT = ["~title", "~issue"];
const END = "end part 1 of 1";
const SPEC_PULL = {
	number: 7,
	author: TRUSTED,
	closes: [3],
	comments: [{ body: SPEC, author: TRUSTED, up: ["maint-a"] }],
};

type Case = {
	order: { issue?: number; department?: string };
	setup: () => void;
	skeleton: string[];
};

const CASES: Record<string, Case> = {
	patrol: {
		order: { department: "fixtures" },
		setup: () =>
			host({
				tree: {
					"LAWMAN.md": CONSTITUTION,
					".lawman/departments/fixtures.md": departmentPage("fixtures"),
				},
			}),
		skeleton: [
			...RAN,
			...ORDER("-", "fixtures"),
			REVISION,
			"issues",
			...CONSTITUTION_FENCES,
			"department fixtures place=1",
			"~lint",
			"~department",
			"precedents none",
		],
	},
	"response-unit": {
		order: { issue: 3 },
		setup: () => host({ issues: { 3: human("OPEN") } }),
		skeleton: [
			...RAN,
			...ORDER(),
			REVISION,
			"issues",
			"need=intake",
			...CONSTITUTION_FENCES,
			"precedents none",
			...ISSUE_TEXT,
		],
	},
	investigation: {
		order: { issue: 3 },
		setup: () => host({ issues: { 3: withLead("fixtures") } }),
		skeleton: [
			...RAN,
			...ORDER(),
			REVISION,
			"issues",
			"need=investigation",
			...CONSTITUTION_FENCES,
			"precedents none",
			...ISSUE_TEXT,
		],
	},
	prosecutor: {
		order: { issue: 3 },
		setup: () => host({ issues: { 3: withLead("fixtures", caseMark()) } }),
		skeleton: [
			...RAN,
			...ORDER(),
			REVISION,
			"issues",
			"need=prosecutor",
			...CONSTITUTION_FENCES,
			"precedents none",
			...ISSUE_TEXT,
			"comment at=2026-10-14T10:00:00Z",
			"~comment",
		],
	},
	defender: {
		order: { issue: 3 },
		setup: () => {
			host({ issues: { 3: withLead("fixtures", caseMark(), charge()) } });
			mkdirSync(join(dir, "departments"));
			writeFileSync(
				join(dir, "departments", "fixtures.md"),
				departmentPage("fixtures"),
			);
		},
		skeleton: [
			...RAN,
			...ORDER(),
			REVISION,
			"issues",
			"need=defender",
			...CONSTITUTION_FENCES,
			"department fixtures place=2",
			"~lint",
			"~department",
			"precedents none",
			...ISSUE_TEXT,
			"comment at=2026-10-14T10:00:00Z",
			"~comment",
			"comment at=2026-10-14T11:00:00Z",
			"~comment",
		],
	},
	court: {
		order: { issue: 3 },
		setup: () =>
			host({
				issues: { 3: withLead("logic", caseMark(), charge(), defence()) },
			}),
		skeleton: [
			...RAN,
			...ORDER(),
			REVISION,
			"issues",
			"need=court",
			...CONSTITUTION_FENCES,
			"department logic place=3",
			"~lint",
			"~department",
			"precedents none",
			...ISSUE_TEXT,
			...[10, 11, 12].flatMap((h) => [`comment at=${T(h)}`, "~comment"]),
		],
	},
	clerk: {
		order: { issue: 3 },
		setup: () =>
			host({
				issues: { 3: human("OPEN") },
				pulls: [{ number: 7, author: TRUSTED, closes: [3] }],
			}),
		skeleton: [
			...RAN,
			...ORDER(),
			REVISION,
			"issues",
			"pulls",
			"need=clerk",
			...ISSUE_TEXT,
			"~pull",
		],
	},
	"spec-writer": {
		order: { issue: 7 },
		setup: () => {
			host({ pulls: [{ number: 7, author: TRUSTED, closes: [3] }] });
			put({ 3: handed(7) });
		},
		skeleton: [
			...RAN,
			...ORDER("7"),
			REVISION,
			"pulls",
			"need=spec-writer",
			...CONSTITUTION_FENCES,
			"precedents none",
			"~pull",
		],
	},
	executor: {
		order: { issue: 7 },
		setup: () => {
			host({ pulls: [SPEC_PULL] });
			put({ 3: handed(7) });
		},
		skeleton: [
			...RAN,
			...ORDER("7"),
			REVISION,
			"pulls",
			"need=executor",
			...CONSTITUTION_FENCES,
			"precedents none",
			"~pull",
			"comment at=2026-10-14T09:00:00Z",
			"~comment",
		],
	},
};

const ticks = () =>
	rows(
		"SELECT id, role, precinct, department, dispatch, outcome, parts FROM ticks",
	);
const orders = () => rows("SELECT id, taken_at, outcome FROM dispatches");

describe("tick start with an order", () => {
	test.each(Object.keys(CASES))(
		"%s takes the order and prints its whole start",
		(role) => {
			const c = CASES[role] as Case;
			setUp();
			orderOf(role, c.order);
			c.setup();
			const r = start(role);
			expect(r.code).toBe(0);
			expect(skeleton(r.out)).toEqual([HEAD(role), ...c.skeleton, END]);
			expect(orders()).toEqual([{ id: 1, taken_at: BASE, outcome: null }]);
			const [t] = ticks();
			expect(t).toMatchObject({
				role,
				precinct: "main",
				department: c.order.department ?? null,
				dispatch: 1,
				outcome: null,
			});
			expect(JSON.parse(String(t?.parts))).toEqual([r.out.replace(/\n$/, "")]);
			expect(input("1", "--part", "1").out).toBe(r.out);
		},
	);

	test("alarms print first", () => {
		setUp();
		// a tick with no end record while a later tick of its role exists
		seed((d) => {
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]);
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [
				later(1),
			]);
		});
		orderOf("investigation", { issue: 3 });
		CASES.investigation?.setup();
		const r = start("investigation", 1, later(0, 30));
		expect(lines(r.out)[1]).toBe(`ALARM tick-hung 1 court started ${BASE}`);
	});

	test("the issue title prints in its own fence after the character layer", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures") } });
		const r = start("investigation");
		expect(r.out).toContain("\n~~~title\nissue 3\n~~~\n~~~issue\n");
	});

	test("the stored parts of lines join to the unsplit group, and tick input returns each part's stored bytes", () => {
		const startAt = (size: number) => {
			setUp(`${CONFIG}input_chars: ${size}\n`);
			orderOf("defender", { issue: 3 });
			CASES.defender?.setup();
			return start("defender").out;
		};
		const whole = content(startAt(1_000_000));
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir);
		startAt(300);
		const stored = JSON.parse(String(ticks()[0]?.parts)) as string[];
		expect(stored.length).toBeGreaterThan(3);
		// the long blocks here are the constitution and the page, which split by lines;
		// a case text above the size would be cut, so none of these is
		expect(stored.join("\n")).not.toContain("\ncut kept=");
		for (const [i, part] of stored.entries())
			expect(input("1", "--part", String(i + 1)).out).toBe(`${part}\n`);
		// a fence cut at a part's end opens again with the same label in the next part
		const joined = stored.map(content).reduce((all, next) => {
			const close = all.at(-1) ?? "";
			const opened = all.findLast((l) => l.startsWith(close) && l !== close);
			const cut = /^~+$/.test(close) && next[0] === opened;
			return [
				...(cut ? all.slice(0, -1) : all),
				...(cut ? next.slice(1) : next),
			];
		}, [] as string[]);
		expect(joined).toEqual(whole);
	});

	test("a tick the journal ends prints one part even above the size", () => {
		setUp(`${CONFIG}input_chars: 40\n`);
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures", caseMark()) } });
		const r = start("investigation");
		expect(lines(r.out)[0]).toBe(HEAD("investigation"));
		expect(lines(r.out).at(-1)).toBe(END);
		expect(content(r.out).join("\n").length).toBeGreaterThan(40);
	});

	test("a group above the size splits into stored parts, and the end of the tick clears them", () => {
		setUp(`${CONFIG}input_chars: 400\n`);
		orderOf("prosecutor", { issue: 3 });
		CASES.prosecutor?.setup();
		const first = start("prosecutor").out;
		const n = Number(/ of (\d+)$/.exec(lines(first)[0] ?? "")?.[1]);
		expect(n).toBeGreaterThan(1);
		const all = [
			first,
			...Array.from(
				{ length: n - 1 },
				(_, i) => input("1", "--part", String(i + 2)).out,
			),
		];
		for (const [i, part] of all.entries()) {
			expect(lines(part)[0]).toBe(
				`lawman input 1 role=prosecutor tick=1 part ${i + 1} of ${n}`,
			);
			expect(lines(part).at(-1)).toBe(`end part ${i + 1} of ${n}`);
			expect(
				content(part).reduce((s, l) => s + [...l].length + 1, 0),
			).toBeLessThanOrEqual(400);
		}
		const past = input("1", "--part", String(n + 1));
		expect(past.code).toBe(1);
		expect(past.err).toContain(
			`part ${n + 1} is out of range; there are ${n} parts`,
		);
		expect(
			call(BASE, [
				"tick",
				"end",
				"1",
				"--outcome",
				"charged",
				"--precinct",
				"main",
				"--dispatch",
				"1",
			]).code,
		).toBe(0);
		expect(ticks()[0]?.parts).toBeNull();
		expect(input("1", "--part", "1").code).toBe(1);
	});
});

const STALE: [string, Record<number, Spec>, number][] = [
	["response-unit", { 3: withLead("fixtures") }, 3],
	["response-unit", { 3: human("CLOSED") }, 3],
	["investigation", { 3: withLead("fixtures", caseMark()) }, 3],
	["investigation", { 3: { ...withLead("fixtures"), state: "CLOSED" } }, 3],
	["prosecutor", { 3: withLead("fixtures") }, 3],
	[
		"prosecutor",
		{ 3: { ...withLead("fixtures", caseMark()), state: "CLOSED" } },
		3,
	],
	["defender", { 3: withLead("fixtures", caseMark()) }, 3],
	[
		"defender",
		{ 3: { ...withLead("fixtures", caseMark(), charge()), state: "CLOSED" } },
		3,
	],
	["court", { 3: withLead("fixtures", caseMark(), charge()) }, 3],
	[
		"court",
		{
			3: {
				...withLead("fixtures", caseMark(), charge(), defence()),
				state: "CLOSED",
			},
		},
		3,
	],
	["clerk", { 3: withLead("fixtures") }, 3],
	["spec-writer", {}, 7],
	["executor", {}, 7],
];

describe("a stale order", () => {
	test.each(STALE)(
		"%s ends the tick silent and closes the order after the sync",
		(role, issues, n) => {
			setUp();
			orderOf(role, { issue: n });
			host({ issues });
			const r = start(role);
			const [stage] = lines(r.out).filter((l) => l.startsWith("need="));
			expect(lines(r.out).slice(-3)).toEqual([
				"ended silent",
				`report Order stale: ${stage}`,
				END,
			]);
			expect(lines(r.out)[0]).toBe(HEAD(role));
			expect(skeleton(r.out).filter((l) => l.startsWith("~"))).toEqual([]);
			expect(orders()).toEqual([{ id: 1, taken_at: BASE, outcome: "silent" }]);
			expect(ticks()[0]).toMatchObject({ outcome: "silent", parts: null });
		},
	);

	test("after the role's own sync, tick input prints the stage and closes nothing", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures", caseMark()) } });
		rmSync(join(configs("main"), "issues"));
		const r = start("investigation");
		expect(lines(r.out).slice(-2)).toEqual(["self issues", END]);
		put({ 3: withLead("fixtures", caseMark()) });
		const again = input("1");
		expect(again.code).toBe(0);
		expect(skeleton(again.out)).toEqual([
			HEAD("investigation"),
			"need=prosecutor",
			...ISSUE_TEXT,
			"comment at=2026-10-14T10:00:00Z",
			"~comment",
			"self constitution",
			"self precedents .lawman/precedents/",
			END,
		]);
		expect(orders()[0]?.outcome).toBeNull();
		expect(ticks()[0]?.outcome).toBeNull();
	});
});

const DRIFT_REPORT: [string, string] = [
	"stopped-law-drift",
	"the law folder is not at law_commit",
];
const DIRTY_REPORT: [string, string] = [
	"stopped-dirty-law",
	"the law folder has a local change",
];

type Ending = {
	name: string;
	role: string;
	order: { issue?: number; department?: string };
	setup: () => void;
	outcome: string;
	report: string;
	taken: boolean;
};

const ENDINGS: Ending[] = [
	{
		name: "a missing config.yaml",
		role: "investigation",
		order: { issue: 3 },
		setup: () => rmSync(join(dir, "config.yaml")),
		outcome: "failed",
		report: "config.yaml is missing",
		taken: false,
	},
	{
		name: "a config.yaml without trusted_login",
		role: "investigation",
		order: { issue: 3 },
		setup: () => config("harness: hermes\n"),
		outcome: "failed",
		report: "config.yaml has no trusted_login",
		taken: false,
	},
	{
		name: "a config.yaml without law_commit",
		role: "investigation",
		order: { issue: 3 },
		setup: () => config(`harness: hermes\ntrusted_login: ${TRUSTED}\n`),
		outcome: "failed",
		report: "config.yaml has no law_commit",
		taken: false,
	},
	...(
		[
			[
				"a law folder at another commit",
				() => lawVersion("2".repeat(40)),
				DRIFT_REPORT,
			],
			[
				"a law folder with a local change",
				() => lawVersion(LAW_COMMIT, "yes"),
				DIRTY_REPORT,
			],
			[
				"a law folder at another commit with a local change",
				() => lawVersion("2".repeat(40), "yes"),
				DIRTY_REPORT,
			],
			[
				"a revision outside its class",
				() => lawVersion("A".repeat(40)),
				["stopped-law-drift", "a value is not safe"],
			],
			[
				"a law_commit outside its class",
				() => config(CONFIG.replace(LAW_COMMIT, "../x")),
				["stopped-law-drift", "a value is not safe"],
			],
		] as [string, () => void, [string, string]][]
	).map(([name, setup, [outcome, report]]) => ({
		name,
		role: "investigation",
		order: { issue: 3 },
		setup,
		outcome,
		report,
		taken: false,
	})),
	{
		name: "another identity",
		role: "investigation",
		order: { issue: 3 },
		setup: () => host({ login: "someone-else" }),
		outcome: "stopped-identity-changed",
		report: "Host identity changed: someone-else",
		taken: false,
	},
	{
		name: "an issue order without a number",
		role: "investigation",
		order: {},
		setup: () => host(),
		outcome: "failed",
		report: "The order has no issue number",
		taken: true,
	},
	{
		name: "a pull request order without a number",
		role: "executor",
		order: {},
		setup: () => host(),
		outcome: "failed",
		report: "The order has no pull request number",
		taken: true,
	},
	{
		name: "a patrol order with an issue",
		role: "patrol",
		order: { issue: 3, department: "fixtures" },
		setup: () => host(),
		outcome: "failed",
		report: "The patrol order has an issue number or no department",
		taken: true,
	},
	{
		name: "a patrol order without a department",
		role: "patrol",
		order: {},
		setup: () => host(),
		outcome: "failed",
		report: "The patrol order has an issue number or no department",
		taken: true,
	},
	...(["investigation", "response-unit", "clerk"] as const).map((role) => ({
		name: `an issue that left the cache, for ${role}`,
		role,
		order: { issue: 9 },
		setup: () => host(),
		outcome: "silent",
		report: "Order stale: need=none",
		taken: true,
	})),
	{
		name: "a pull request that left the cache, for the executor",
		role: "executor",
		order: { issue: 9 },
		setup: () => host(),
		outcome: "silent",
		report:
			"Order stale: need=none spec=- spec_id=- work=- sources=- priority=P2",
		taken: true,
	},
	{
		name: "no constitution",
		role: "investigation",
		order: { issue: 3 },
		setup: () =>
			host({ issues: { 3: withLead("fixtures") }, tree: { "a.md": "x" } }),
		outcome: "skipped-no-constitution",
		report: `No constitution at ${SHA}`,
		taken: true,
	},
	{
		name: "an older constitution",
		role: "investigation",
		order: { issue: 3 },
		setup: () =>
			host({
				issues: { 3: withLead("fixtures") },
				tree: {
					"LAWMAN.md": CONSTITUTION.replace(
						"contract_version: 4",
						"contract_version: 3",
					),
				},
			}),
		outcome: "skipped-contract-version",
		report: `Constitution check failed at ${SHA}`,
		taken: true,
	},
	{
		name: "a bad constitution",
		role: "investigation",
		order: { issue: 3 },
		setup: () =>
			host({
				issues: { 3: withLead("fixtures") },
				tree: { "LAWMAN.md": CONSTITUTION.replace("## Fence", "## Other") },
			}),
		outcome: "skipped-bad-constitution",
		report: `Constitution check failed at ${SHA}`,
		taken: true,
	},
	{
		name: "a department name outside the class",
		role: "patrol",
		order: { department: "Bad" },
		setup: () => host(),
		outcome: "stopped-bad-department",
		report: "The department name is not safe",
		taken: true,
	},
	{
		name: "a department page that fails its check",
		role: "patrol",
		order: { department: "fixtures" },
		setup: () =>
			host({
				tree: {
					"LAWMAN.md": CONSTITUTION,
					".lawman/departments/fixtures.md": departmentPage("other"),
				},
			}),
		outcome: "stopped-bad-department",
		report: "Department page check failed: fixtures",
		taken: true,
	},
	{
		name: "a department page in no place",
		role: "patrol",
		order: { department: "nowhere" },
		setup: () => host(),
		outcome: "stopped-bad-department",
		report: "Department page check failed: nowhere",
		taken: true,
	},
];

const TEXT_FENCES = [
	"~title",
	"~constitution",
	"~department",
	"~issue",
	"~pull",
	"~comment",
];

describe("an outcome the journal writes", () => {
	test.each(ENDINGS)("$name ends the tick with $outcome", (e) => {
		setUp();
		seed((d) => order(d, "main", e.role, e.order));
		e.setup();
		const r = start(e.role);
		expect(r.code).toBe(0);
		expect(lines(r.out)[0]).toBe(HEAD(e.role));
		expect(lines(r.out).slice(-3)).toEqual([
			`ended ${e.outcome}`,
			`report ${e.report}`,
			END,
		]);
		expect(skeleton(r.out).filter((l) => TEXT_FENCES.includes(l))).toEqual([]);
		expect(ticks()[0]).toMatchObject({ outcome: e.outcome, parts: null });
		if (e.taken) {
			expect(orders()).toEqual([{ id: 1, taken_at: BASE, outcome: e.outcome }]);
			return;
		}
		expect(orders()).toEqual([{ id: 1, taken_at: null, outcome: null }]);
		config(CONFIG);
		lawVersion();
		CASES.investigation?.setup();
		expect(start(e.role, 1, later(1)).out).toContain(
			"\norder 1 main o/main - 3\n",
		);
	});

	test("the constitution outcomes and the department outcomes print only the lint fence", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({
			tree: {
				"LAWMAN.md": CONSTITUTION,
				".lawman/departments/fixtures.md": departmentPage("other"),
			},
		});
		expect(
			skeleton(start("patrol").out).filter((l) => l.startsWith("~")),
		).toEqual(["~lint", "~lint"]);
	});

	test("an order another run closed first ends the tick silent with no order", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures") } });
		const closer = `const { open } = await import(${JSON.stringify(join(JOURNAL, "src", "db"))});
const db = open();
db.run("UPDATE dispatches SET outcome = ?, closed_at = ? WHERE id = 1", ["silent", process.env.LAWMAN_NOW]);
db.close();`;
		command(
			configs("main"),
			"identity",
			`${process.execPath} -e '${closer}' > /dev/null\necho ${TRUSTED}`,
		);
		const r = start("investigation");
		expect(lines(r.out).slice(-3)).toEqual([
			"ended silent",
			"report No order.",
			END,
		]);
		expect(rows("SELECT outcome, dispatch FROM ticks")).toEqual([
			{ outcome: "silent", dispatch: null },
		]);
		expect(orders()).toEqual([{ id: 1, taken_at: null, outcome: "silent" }]);
	});
});

describe("an order the start cannot take", () => {
	test.each([
		["another role's order", { role: "court" }],
		["a closed order", { outcome: "silent" }],
	])("%s prints one line and starts no tick", (_, f) => {
		setUp();
		const { role = "investigation", ...rest } = f as { role?: string };
		seed((d) => order(d, "main", role, { issue: 3, ...rest }));
		expect(start("investigation")).toMatchObject({
			code: 0,
			out: "order 1 untakeable\n",
		});
		expect(ticks()).toEqual([]);
	});

	test("a taken order is started like an untaken one", () => {
		setUp();
		seed((d) => order(d, "main", "investigation", { issue: 3, takenAt: BASE }));
		CASES.investigation?.setup();
		const r = start("investigation");
		expect(r.code).toBe(0);
		expect(r.out).not.toContain("untakeable");
		expect(orders()).toEqual([{ id: 1, taken_at: BASE, outcome: null }]);
		expect(ticks()[0]).toMatchObject({
			role: "investigation",
			dispatch: 1,
			outcome: null,
		});
	});

	test.each(["defender", "court"])(
		"a department of - skips the page for %s",
		(role) => {
			setUp();
			orderOf(role, { issue: 3 });
			const marks =
				role === "court"
					? [caseMark(), charge(), defence()]
					: [caseMark(), charge()];
			host({
				issues: {
					3: {
						body: [leadIn("-", "response-unit")],
						comments: marks.map((b, i) => [T(10 + i), b]),
					},
				},
			});
			const r = start(role);
			expect(r.out).toContain(`need=${role} `);
			expect(r.out).toContain(" department=- ");
			expect(r.out).not.toContain("\ndepartment ");
			expect(skeleton(r.out)).not.toContain("~department");
		},
	);
});

describe("the law folder at the start", () => {
	test("without a law-version command the role reads the facts: self law-version comes first", () => {
		setUp();
		rmSync(join(shared(), "law-version"));
		orderOf("investigation", { issue: 3 });
		CASES.investigation?.setup();
		const r = start("investigation");
		const selfs = lines(r.out).filter((l) => l.startsWith("self "));
		expect(selfs[0]).toBe("self law-version");
		expect(orders()).toEqual([{ id: 1, taken_at: BASE, outcome: null }]);
		expect(ticks()[0]).toMatchObject({ outcome: null });
	});

	test.each([
		["fails", () => command(shared(), "law-version", "exit 1")],
		["does not start", () => command(shared(), "law-version", "true", 0o644)],
		[
			"prints outside the form",
			() =>
				command(
					shared(),
					"law-version",
					`printf 'revision=${LAW_COMMIT}\\nchanged=maybe\\ntag=\\n'`,
				),
		],
	])(
		"a law-version command that %s gives the self step, as an absent one does",
		(_name, broken) => {
			setUp();
			broken();
			orderOf("investigation", { issue: 3 });
			CASES.investigation?.setup();
			const r = start("investigation");
			expect(lines(r.out).filter((l) => l.startsWith("self "))[0]).toBe(
				"self law-version",
			);
			expect(r.out).not.toContain("stopped-law-drift");
			expect(orders()).toEqual([{ id: 1, taken_at: BASE, outcome: null }]);
			expect(ticks()[0]).toMatchObject({ outcome: null });
		},
	);

	test("wake, the start and tick input run law-version and nothing else of the installation", () => {
		setUp();
		for (const op of ["release", "verify"])
			command(shared(), op, recording("true"));
		command(
			shared(),
			"law-version",
			recording(`printf 'revision=${LAW_COMMIT}\\nchanged=no\\ntag=\\n'`),
		);
		orderOf("investigation", { issue: 3 });
		CASES.investigation?.setup();
		const records = () =>
			existsSync(join(shared(), RECORDS))
				? readFileSync(join(shared(), RECORDS), "utf8")
						.trim()
						.split("\n")
						.map((p) => basename(p))
				: [];
		expect(call(BASE, ["wake", "--role", "investigation"]).out).toStartWith(
			"lawman input ",
		);
		expect(records()).toEqual([]);
		start("investigation");
		expect(records()).toEqual(["law-version"]);
		input("1");
		expect(records()).toEqual(["law-version"]);
	});

	test.each([
		["a drift", () => lawVersion("2".repeat(40))],
		["a local change", () => lawVersion(LAW_COMMIT, "yes")],
	])("%s stops the start before any host operation runs", (_name, setup) => {
		setUp();
		orderOf("investigation", { issue: 3 });
		CASES.investigation?.setup();
		for (const op of ["identity", "fetch", "issues", "pulls", "files", "file"])
			command(configs("main"), op, recording("true"));
		setup();
		expect(lines(start("investigation").out)).toContainEqual(
			expect.stringMatching(/^ended stopped-/),
		);
		expect(existsSync(join(configs("main"), RECORDS))).toBe(false);
		expect(orders()).toEqual([{ id: 1, taken_at: null, outcome: null }]);
	});

	test("a law folder at law_commit with no change starts as before", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		CASES.investigation?.setup();
		const r = start("investigation");
		expect(r.out).not.toContain("law-version");
		expect(r.out).toContain("\norder 1 main o/main - 3\n");
	});
});

const OPERATIONS: [string, string, string][] = [
	["identity", "investigation", "identity"],
	["fetch", "investigation", "fetch"],
	["issues", "investigation", "issues"],
	["pulls", "clerk", "pulls"],
	["files", "investigation", "constitution"],
	["file", "investigation", "constitution"],
];

describe("an operation that is empty or fails", () => {
	test.each(OPERATIONS)(
		"%s gives the lines of run and a self step",
		(operation, role, step) => {
			for (const failing of [false, true]) {
				setUp();
				orderOf(role, { issue: 3 });
				CASES[role]?.setup();
				if (failing)
					command(configs("main"), operation, "echo broken >&2\nexit 1");
				else rmSync(join(configs("main"), operation));
				const r = start(role);
				expect(r.code).toBe(0);
				const own = lines(r.out);
				if (failing) {
					expect(own).toContain(`${operation} failed reason=exit`);
					expect(r.out).toContain("\n~~~error\nbroken\n~~~\n");
				} else expect(own).toContain(`${operation} empty`);
				expect(own).toContain(`self ${step}`);
				rmSync(dir, { recursive: true, force: true });
				mkdirSync(dir);
			}
		},
	);

	test("an empty fetch stops before the stage, and tick input then prints the stage, the texts and the page steps", () => {
		setUp();
		orderOf("defender", { issue: 3 });
		CASES.defender?.setup();
		rmSync(join(configs("main"), "fetch"));
		const r = start("defender");
		expect(skeleton(r.out)).toEqual([
			HEAD("defender"),
			...RAN,
			...ORDER(),
			"fetch empty",
			"issues",
			"self fetch",
			END,
		]);
		expect(ticks()[0]?.parts).toBeNull();
		const again = input("1");
		expect(skeleton(again.out)).toEqual([
			HEAD("defender"),
			"need=defender",
			...ISSUE_TEXT,
			"comment at=2026-10-14T10:00:00Z",
			"~comment",
			"comment at=2026-10-14T11:00:00Z",
			"~comment",
			"self constitution",
			"self department fixtures",
			"self precedents .lawman/precedents/",
			END,
		]);
		expect(input("1", "--part", "1").out).toBe(again.out);
	});

	test("an empty files never moves on to the installation's page", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host();
		mkdirSync(join(dir, "departments"));
		writeFileSync(
			join(dir, "departments", "fixtures.md"),
			departmentPage("fixtures"),
		);
		rmSync(join(configs("main"), "files"));
		const r = start("patrol");
		expect(lines(r.out).slice(-4)).toEqual([
			"self constitution",
			"self department fixtures",
			"self precedents .lawman/precedents/",
			END,
		]);
		expect(r.out).not.toContain("place=");
	});

	test("a failed page read stands as a self step and moves on to no other place", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({
			tree: {
				"LAWMAN.md": CONSTITUTION,
				".lawman/departments/fixtures.md": departmentPage("fixtures"),
			},
		});
		command(
			configs("main"),
			"file",
			`case "$2" in LAWMAN.md) cat "tree/$2";; *) exit 1;; esac`,
		);
		const r = start("patrol");
		expect(lines(r.out).slice(-2)).toEqual(["self department fixtures", END]);
		expect(r.out).not.toContain("place=");
	});
});

describe("a department outside its class in tick input", () => {
	test("gives the self step without the name", () => {
		setUp();
		seed((d) => order(d, "main", "patrol", { department: "Bad" }));
		host();
		rmSync(join(configs("main"), "fetch"));
		expect(lines(start("patrol").out).slice(-2)).toEqual(["self fetch", END]);
		const r = input("1");
		expect(r.code).toBe(0);
		expect(lines(r.out).slice(-4)).toEqual([
			"self constitution",
			"self department",
			"self precedents .lawman/precedents/",
			END,
		]);
		expect(r.out).not.toContain("Bad");
	});
});

describe("the precinct of a tick that stops before the take", () => {
	test("is on the tick row, so tick-failing counts stops on that precinct only", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ login: "someone-else", issues: { 3: withLead("fixtures") } });
		const r = start("investigation");
		expect(lines(r.out)).toContain("ended stopped-identity-changed");
		expect(rows("SELECT precinct, department, outcome FROM ticks")).toEqual([
			{
				precinct: "main",
				department: null,
				outcome: "stopped-identity-changed",
			},
		]);
	});
});

describe("the link of the case", () => {
	// the host's own address for an issue or a pull request, written into the command's output
	const withUrl = (file: string, list: string, url: (n: number) => string) => {
		const path = join(configs("main"), file);
		const form = JSON.parse(readFileSync(path, "utf8"));
		for (const e of form[list]) e.url = url(e.number);
		writeFileSync(path, JSON.stringify(form));
	};

	test("an issue role gets a link line right after the stage line, and the same line at tick input", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures") } });
		withUrl(
			"issues.json",
			"issues",
			(n) => `https://git.example/o/main/issues/${n}`,
		);
		const r = lines(start("investigation").out);
		const at = r.findIndex((l) => l.startsWith("need="));
		expect(r[at + 1]).toBe("link main#3 https://git.example/o/main/issues/3");
		expect(lines(input("1").out)).toContain(
			"link main#3 https://git.example/o/main/issues/3",
		);
	});

	test("a pull request role gets the link of its pull request", () => {
		setUp();
		orderOf("spec-writer", { issue: 7 });
		put({ 3: handed(7) });
		host({ pulls: [{ number: 7, author: TRUSTED, closes: [3] }] });
		withUrl(
			"pulls.json",
			"pulls",
			(n) => `https://git.example/o/main/pull/${n}`,
		);
		expect(lines(start("spec-writer").out)).toContain(
			"link main#7 https://git.example/o/main/pull/7",
		);
	});

	test("a cache with no link prints no link line", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures") } });
		expect(start("investigation").out).not.toContain("\nlink ");
	});
});

describe("tick input after a self step", () => {
	test("--part 1 builds and stores the group like the form without a part, and a later part comes from the stored group", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures", caseMark()) } });
		rmSync(join(configs("main"), "issues"));
		start("investigation");
		put({ 3: withLead("fixtures", caseMark()) });
		const first = input("1", "--part", "1");
		expect(first.code).toBe(0);
		expect(first.out).toStartWith(`${HEAD("investigation")}\n`);
		expect(input("1", "--part", "1")).toEqual(first);
		expect(input("1", "--part", "2").err).toContain("there is 1 part");
	});

	test("a part outside the group of an unbuilt tick exits 1 with the count of parts", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		host({ issues: { 3: withLead("fixtures", caseMark()) } });
		rmSync(join(configs("main"), "issues"));
		start("investigation");
		put({ 3: withLead("fixtures", caseMark()) });
		const r = input("1", "--part", "9");
		expect(r.code).toBe(1);
		expect(r.err).toContain("there is 1 part");
	});
});

describe("tick input usage", () => {
	test("an unknown tick, an ended tick, a tick without an order and a part outside the group exit 1", () => {
		setUp();
		expect(input("1").code).toBe(1);
		seed((d) => {
			d.run(
				"INSERT INTO ticks (role, started_at, ended_at, outcome) VALUES ('court', ?, ?, 'silent')",
				[BASE, BASE],
			);
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]);
		});
		for (const args of [
			["1"],
			["1", "--part", "1"],
			["2"],
			["2", "--part", "1"],
			["x"],
			["2", "--part", "0"],
			[],
		])
			expect([args, input(...args).code]).toEqual([args, 1]);
		expect(input("2", "--part", "1").err).toContain("has no order or input");
	});

	test("tick start with an order checks its arguments", () => {
		setUp();
		for (const args of [
			["--role", "investigation", "--order", "0"],
			["--role", "investigation", "--order"],
			["--role", "Bad", "--order", "1"],
			["--role", "judge", "--order", "1"],
			["--role", "constructor", "--order", "1"],
		])
			expect([args, call(BASE, ["tick", "start", ...args]).code]).toEqual([
				args,
				1,
			]);
	});

	test("tick start without an order is a usage error for every role but the duty desk", () => {
		setUp();
		orderOf("investigation", { issue: 3 });
		for (const role of ["investigation", "patrol", "clerk"])
			expect(call(BASE, ["tick", "start", "--role", role])).toMatchObject({
				code: 1,
				out: "",
			});
		expect(ticks()).toEqual([]);
	});

	test("an input_chars outside the class reads as the default size", () => {
		setUp(`${CONFIG}input_chars: -5\n`);
		orderOf("investigation", { issue: 3 });
		CASES.investigation?.setup();
		expect(start("investigation").code).toBe(0);
		expect(ticks()).toHaveLength(1);
	});
});

describe("in process", () => {
	test("tick start with an order and tick input print what the command line prints", async () => {
		setUp();
		orderOf("prosecutor", { issue: 3 });
		CASES.prosecutor?.setup();
		const r = await inprocAsync(BASE, [
			"tick",
			"start",
			"--role",
			"prosecutor",
			"--order",
			"1",
		]);
		expect(r.code).toBe(0);
		expect(skeleton(r.out)).toEqual([
			HEAD("prosecutor"),
			...(CASES.prosecutor?.skeleton ?? []),
			END,
		]);
		expect(
			await inprocAsync(BASE, ["tick", "input", "1", "--part", "1"]),
		).toMatchObject({ code: 0, out: r.out });
		// a built group prints as it was stored
		expect(await inprocAsync(BASE, ["tick", "input", "1"])).toMatchObject({
			code: 0,
			out: r.out,
		});
		expect((await inprocAsync(BASE, ["tick", "input", "9"])).code).toBe(1);
		// a taken order stays takeable: the second start takes it and starts a tick
		const again = await inprocAsync(BASE, [
			"tick",
			"start",
			"--role",
			"prosecutor",
			"--order",
			"1",
		]);
		expect(again.code).toBe(0);
		expect(lines(again.out)[0]).toBe(HEAD("prosecutor", 2));
	});
});

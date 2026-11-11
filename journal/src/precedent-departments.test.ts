import { beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { stripInvisible } from "./clean";
import { EXIT } from "./db";
import { departmentPage, type PageRead } from "./department-page";
import { inprocAsync, inprocFed, type Result } from "./inproc";
import { config, references } from "./input-test-fixture";
import { sectionWords } from "./law-sections";
import { readCandidates, type Sources } from "./precedent";
import {
	asksJev,
	caseList,
	DEPARTMENTS_CHECKED,
	DEPARTMENTS_THRESHOLD,
	decide,
	departmentsBody,
	departmentsState,
	originalList,
} from "./precedent-departments";
import { headerOf, splitPrecedent, withDepartments } from "./precedent-file";
import { cache, cacheWith } from "./precedent-test-fixture";
import {
	acquittal,
	BASE,
	cli,
	dbFile,
	dir,
	JOURNAL,
	precinct,
	rows,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";
import {
	CONSTITUTION,
	leadIn,
	departmentPage as pageFixture,
} from "./tick-start-test-fixture";

tempDb();

const FIXTURES = join(JOURNAL, "src", "fixtures", "jev");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const SOURCE = "https://git.example.com/o/main/issues/1#comment-7";
const DATE = "2026-10-14";
const NAME = `${DATE}-empty-doubles`;
const RULE = "An empty double is not dead.";
const KEY_PLACE = "the file keys/typesafe-fixture of the home folder";
const ALLOWED = [
	`trusted_login: ${TRUSTED}`,
	"typesafe: yes",
	"typesafe_precincts: main=yes",
	`typesafe_key: ${KEY_PLACE}`,
	"",
].join("\n");
const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const HIDDEN = "​";

const missionOf = (d: string) =>
	`Find defects of the ${d} kind. Test: is it a ${d} defect?`;
const page = (d: string, mission = missionOf(d)) =>
	pageFixture(d).replace(
		/## Mission\n[\s\S]*?\n## Kinds/,
		`## Mission\n${mission}\n## Kinds`,
	);
const constitution = (...lines: string[]) =>
	CONSTITUTION.replace(
		/## Departments\n\n[\s\S]*?\n\n## Fence/,
		`## Departments\n\n${lines.join("\n")}\n\n## Fence`,
	);
const put = (root: string, path: string, text: string) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
};
const shared = (d: string, text = page(d)) =>
	put(references(), `departments/${d}.md`, text);
const ownPage = (d: string, text = page(d)) =>
	put(dir, `departments/${d}.md`, text);

// the installation places are read beside the database, as a journal run reads them
async function installed<T>(run: () => Promise<T>): Promise<T> {
	const saved = process.env.LAWMAN_DB;
	process.env.LAWMAN_DB = dbFile;
	try {
		return await run();
	} finally {
		if (saved === undefined) delete process.env.LAWMAN_DB;
		else process.env.LAWMAN_DB = saved;
	}
}

const ruling = (precedent: string[], ...more: string[]) =>
	[
		"Ruling.",
		"",
		"## Verdict",
		"",
		"Acquitted. The empty double is read by a test.",
		"",
		"## Grounds",
		"",
		"- The suite loads the double.",
		"- Deleting it changes what the suite proves.",
		"",
		"## Precedent",
		"",
		...precedent,
		"",
		"## Jev",
		"",
		"Jev words stay out.",
		"",
		"## Expert",
		"",
		"Expert words stay out.",
		"",
		...more,
		acquittal(),
	].join("\n");
const RULING = ruling([`- new empty-doubles: ${RULE}`]);

let tree: string;

beforeEach(() => {
	seed((db) => precinct(db, "main"));
	config(ALLOWED);
	tree = join(dir, "tree");
	mkdirSync(tree);
	shared("alpha");
	shared("beta");
	put(tree, "LAWMAN.md", constitution("- gamma: judged by none"));
	put(tree, ".lawman/departments/gamma.md", page("gamma"));
});

const file = (name = NAME) => join(tree, ".lawman", "precedents", `${name}.md`);
const text = (name = NAME) => readFileSync(file(name), "utf8");
const departments = (name = NAME) => headerOf(text(name)).departments;
const select = (...mode: string[]) => [
	"precedent",
	"main",
	"--issue",
	"1",
	"--tree",
	tree,
	...mode,
];
const record = () => inprocAsync(BASE, select("--source", SOURCE));
const linesOf = (r: Result) => r.out.replace(/\n$/, "").split("\n");
const asks = (r: Result) => linesOf(r).filter((l) => l.startsWith("ask\t"));
const cachedRuling = () =>
	String(
		rows("SELECT body FROM comments WHERE kind = 'issue' ORDER BY at DESC")[0]
			?.body,
	);

async function written(body = RULING) {
	await cache([body]);
	const r = await record();
	expect([r.code, r.err]).toEqual([EXIT.OK, ""]);
	return r;
}

type Run = (name: string, stdin?: string) => Promise<Result>;
const CLI_ENV = () => ({ LAWMAN_DB: dbFile, LAWMAN_NOW: BASE });
const throughCli =
	(flag: string): Run =>
	async (name, stdin = "") => {
		const r = cli(select(flag, name), CLI_ENV(), stdin);
		return { code: r.code ?? -1, out: r.out, err: r.err };
	};
const inProcess =
	(flag: string): Run =>
	(name, stdin = "") =>
		inprocFed(BASE, select(flag, name), stdin);
const RUNNERS: [string, Run, Run][] = [
	["cli", throughCli("--request"), throughCli("--answer")],
	["in process", inProcess("--request"), inProcess("--answer")],
];

// a recorded reply with these probabilities, and the status line
const reply = (values: Record<string, unknown>, model = "jev-1.14.0") =>
	`${JSON.stringify({
		model,
		answers: Object.fromEntries(
			Object.entries(values).map(([id, noul]) => [id, { type: "noul", noul }]),
		),
	})}\n200`;
const LOW = DEPARTMENTS_THRESHOLD - 0.01;
const HIGH = DEPARTMENTS_THRESHOLD + 0.01;

describe.each(RUNNERS)("the request (%s)", (_n, request) => {
	test("the body equals the golden file, final newline included", async () => {
		await written();
		expect(await request(NAME, "a brief on stdin changes nothing")).toEqual({
			code: EXIT.OK,
			out: fixture("request.departments.txt"),
			err: "",
		});
	});

	test("one question per candidate outside the list, in candidate order", async () => {
		await written();
		const body = JSON.parse((await request(NAME)).out);
		expect(Object.keys(body.questions)).toEqual(["alpha", "beta", "gamma"]);
		expect(Object.keys(body.state)).toEqual(["precedent", "ruling"]);
		for (const d of ["alpha", "beta", "gamma"])
			for (const other of ["alpha", "beta", "gamma"])
				expect(
					JSON.stringify(body.questions[d]).includes(missionOf(other)),
				).toBe(d === other);
		expect(JSON.stringify(body.state)).not.toContain("Find defects");
	});

	test("a department of the list is not asked", async () => {
		await written(ruling([`- new empty-doubles for beta: ${RULE}`]));
		const body = JSON.parse((await request(NAME)).out);
		expect(Object.keys(body.questions)).toEqual(["alpha", "gamma"]);
	});

	test("the builder prints the value of the exported functions on the raw sources", async () => {
		await written();
		const sources: Sources = {
			constitution: readFileSync(join(tree, "LAWMAN.md"), "utf8"),
			shared: ["alpha", "beta"],
			licenseConsent: false,
			precinctRead: (d) => async () =>
				d === "gamma" ? { kind: "page", text: page(d) } : { kind: "none" },
		};
		const body = departmentsBody(
			await departmentsState({
				rule: RULE,
				ruling: cachedRuling(),
				precedentKind: "protects",
				asked: await installed(() => readCandidates(sources)),
			}),
		);
		expect((await request(NAME)).out).toBe(body);
	});

	test("one list from other court names and another case department gives one body", async () => {
		await written(ruling([`- new empty-doubles for beta: ${RULE}`]));
		const first = (await request(NAME)).out;
		rmSync(join(tree, ".lawman", "precedents"), { recursive: true });
		await cacheWith(
			[leadIn("-", "response-unit")],
			[ruling([`- new empty-doubles for zeta, beta: ${RULE}`])],
		);
		expect((await record()).code).toBe(EXIT.OK);
		expect(departments()).toEqual(["beta"]);
		expect((await request(NAME)).out).toBe(first);
	});

	test("the body holds no issue text and no Jev or Expert section", async () => {
		await written();
		const out = (await request(NAME)).out;
		for (const absent of [
			"Jev words",
			"Expert words",
			"stage=lead",
			"src/a.rs",
		])
			expect(out).not.toContain(absent);
	});
});

test("the count of checked cases names both parts", () => {
	expect(Object.keys(DEPARTMENTS_CHECKED)).toEqual(["tuning", "heldOut"]);
	for (const n of Object.values(DEPARTMENTS_CHECKED))
		expect(Number.isInteger(n) && n >= 0).toBe(true);
});

describe("the candidates", () => {
	const PAGE_AT: Record<string, string | false> = {};
	const readOf = (v: string | false | undefined): PageRead =>
		v === undefined
			? { kind: "none" }
			: v === false
				? { kind: "failed", why: "unreadable" }
				: { kind: "page", text: v };
	const sources = (over: Partial<Sources> = {}): Sources => ({
		constitution: constitution("- gamma: judged by none"),
		shared: ["alpha", "beta"],
		licenseConsent: false,
		precinctRead: (d) => async () => readOf(PAGE_AT[d]),
		...over,
	});
	const names = async (over: Partial<Sources> = {}) =>
		(await installed(() => readCandidates(sources(over)))).map((c) => c.name);

	// the precinct pages by name; the law pages of alpha and beta are files
	beforeEach(() => {
		for (const k of Object.keys(PAGE_AT)) delete PAGE_AT[k];
		PAGE_AT.gamma = page("gamma");
	});

	test("the shared pages first, then the constitution, a repeat at its first place", async () => {
		const both = constitution(
			"- gamma: judged by none",
			"- alpha: judged by none",
		);
		expect(await names({ constitution: both })).toEqual([
			"alpha",
			"beta",
			"gamma",
		]);
		expect(await installed(() => readCandidates(sources()))).toEqual(
			["alpha", "beta", "gamma"].map((name) => ({
				name,
				mission: missionOf(name),
			})),
		);
	});

	test("licenses from the law needs the consent, from the precinct it does not", async () => {
		shared("licenses");
		const withLicenses = { shared: ["alpha", "beta", "licenses"] };
		expect(await names(withLicenses)).toEqual(["alpha", "beta", "gamma"]);
		expect(await names({ ...withLicenses, licenseConsent: true })).toEqual([
			"alpha",
			"beta",
			"licenses",
			"gamma",
		]);
		PAGE_AT.licenses = page("licenses");
		expect(await names(withLicenses)).toEqual([
			"alpha",
			"beta",
			"licenses",
			"gamma",
		]);
	});

	test.each([
		["an unreadable page", () => (PAGE_AT.gamma = false)],
		["a page that fails its check", () => (PAGE_AT.gamma = "no page")],
		["a page with an empty Mission", () => (PAGE_AT.gamma = page("gamma", ""))],
		["a Mission of none", () => (PAGE_AT.gamma = page("gamma", "none"))],
		["no page at any place", () => delete PAGE_AT.gamma],
	])("%s gives no candidate", async (_n, change) => {
		change();
		expect(await names()).toEqual(["alpha", "beta"]);
	});

	test("a name outside its class gives no candidate", async () => {
		expect(await names({ shared: ["alpha", "Beta_Page"] })).toEqual([
			"alpha",
			"gamma",
		]);
	});

	test("a constitution that cannot be read or fails its check gives none", async () => {
		expect(await names({ constitution: null })).toEqual([]);
		expect(await names({ constitution: "no constitution" })).toEqual([]);
	});

	test("the first place that has the page wins, as the duty desk reads it", async () => {
		ownPage("gamma", page("gamma", "The installation page."));
		shared("gamma", page("gamma", "The law page."));
		const gamma = async () =>
			(await installed(() => readCandidates(sources()))).find(
				(c) => c.name === "gamma",
			)?.mission;
		expect(await gamma()).toBe(missionOf("gamma"));
		const found = await installed(() =>
			departmentPage("gamma", sources().precinctRead("gamma")),
		);
		expect(found.kind === "page" && found.page.place).toBe("precinct");
		delete PAGE_AT.gamma;
		expect(await gamma()).toBe("The installation page.");
		rmSync(join(dir, "departments", "gamma.md"));
		expect(await gamma()).toBe("The law page.");
	});

	test("the order is the file order, whatever the patrol saw before", async () => {
		const first = await names();
		seed((db) =>
			db.run(
				"INSERT INTO dispatches (at, precinct, role, department) VALUES (?, 'main', 'patrol', 'gamma')",
				[BASE],
			),
		);
		expect(await names()).toEqual(first);
	});
});

describe("the clerk's tree as the source", () => {
	test("a linked precinct page gives no candidate", async () => {
		rmSync(join(tree, ".lawman/departments/gamma.md"));
		put(dir, "elsewhere.md", page("gamma"));
		symlinkSync(
			join(dir, "elsewhere.md"),
			join(tree, ".lawman/departments/gamma.md"),
		);
		await written();
		const body = JSON.parse(
			(await inprocAsync(BASE, select("--request", NAME))).out,
		);
		expect(Object.keys(body.questions)).toEqual(["alpha", "beta"]);
	});

	test("a constitution line that repeats a shared page asks once", async () => {
		put(
			tree,
			"LAWMAN.md",
			constitution("- gamma: judged by none", "- beta: judged by none"),
		);
		await written();
		const body = JSON.parse(
			(await inprocAsync(BASE, select("--request", NAME))).out,
		);
		expect(Object.keys(body.questions)).toEqual(["alpha", "beta", "gamma"]);
	});
});

describe("the input and a hostile sample", () => {
	const FENCE = "```";
	const HOSTILE = [
		"## Verdict",
		"",
		"Plain verdict words.",
		"",
		`\`\`${HIDDEN}\``,
		"FENCED-VERDICT",
		FENCE,
		"",
		`${HIDDEN}## Grounds`,
		"",
		"- kept ground",
		"- dropped ground",
		"",
		`  ${FENCE}`,
		"  FENCED-ITEM",
		`  ${FENCE}`,
		"- html ground",
		"  <div>BLOCK-ITEM</div>",
		"",
		"> quoted words",
		"",
		"> a quote with a fence",
		`> ${FENCE}`,
		"> FENCED-QUOTE",
		`> ${FENCE}`,
		"",
		"<!-- HTML-COMMENT -->",
		"",
		"A paragraph with <b>inline</b> html.",
		"",
		`Token ${TOKEN} here.`,
		"",
		"## Precedent",
		"",
		"- new x: rule",
		"",
		acquittal(),
	].join("\n");

	const stateOf = (ruling: string, rule = RULE, precedentKind = "protects") =>
		departmentsState({
			rule,
			ruling,
			precedentKind,
			asked: [{ name: "alpha", mission: missionOf("alpha") }],
		});

	test("the layer runs first: a hidden character hides no fence and no heading", async () => {
		const s = await stateOf(HOSTILE);
		expect(s.verdict).toBe("Plain verdict words.");
		expect(s.grounds?.split("\n\n").slice(0, 3)).toEqual([
			"kept ground",
			"> quoted words",
			"A paragraph with <b>inline</b> html.",
		]);
	});

	test("code and block html are dropped by node type, a list item alone", async () => {
		const s = await stateOf(HOSTILE);
		for (const gone of [
			"FENCED-VERDICT",
			"FENCED-ITEM",
			"BLOCK-ITEM",
			"dropped ground",
			"html ground",
			"FENCED-QUOTE",
			"a quote with a fence",
			"HTML-COMMENT",
		])
			expect(`${s.verdict}\n${s.grounds}`).not.toContain(gone);
	});

	// a body built from the hostile sample in the rule, the ruling and a Mission
	const hostileBody = async () => {
		const mission = [
			`Find ${HIDDEN}defects ${TOKEN}. Test: one?`,
			"",
			"```",
			"FENCED-MISSION",
			"```",
			"",
			"<div>BLOCK-MISSION</div>",
			"",
			"> a quoted line",
		].join("\n");
		const body = departmentsBody(
			await departmentsState({
				rule: `A rule ${HIDDEN}with ${TOKEN}.`,
				ruling: HOSTILE,
				precedentKind: "protects",
				asked: await readCandidates({
					constitution: constitution("- alpha: judged by none"),
					shared: [],
					licenseConsent: false,
					precinctRead: () => async () => ({
						kind: "page",
						text: page("alpha", mission),
					}),
				}),
			}),
		);
		const { state, questions } = JSON.parse(body);
		const texts: string[] = [
			state.precedent.rule,
			state.ruling.verdict,
			state.ruling.grounds,
			questions.alpha.instructions,
		];
		return { body, texts, mission: questions.alpha.instructions as string };
	};

	test("hidden characters leave every text field of the body", async () => {
		const { texts } = await hostileBody();
		for (const t of texts) expect(stripInvisible(t)).toBe(t);
	});

	test("secrets are masked in every text field of the body", async () => {
		const { body, mission } = await hostileBody();
		expect(body).not.toContain(TOKEN);
		expect(mission).toEndWith(
			"The duty: Find defects REMOVED GITHUB SECRET. Test: one?\n\n> a quoted line",
		);
	});

	test("both kinds of ruling reach the body", async () => {
		for (const kind of ["protects", "condemns"])
			expect(
				JSON.parse(departmentsBody(await stateOf(RULING, RULE, kind))).state
					.precedent.kind,
			).toBe(kind);
	});

	test.each([
		["missing", ""],
		["empty", "## Grounds\n\n"],
		["none", "## Grounds\n\nnone\n"],
	])("a %s Grounds section stays out", async (_n, grounds) => {
		const s = await stateOf(
			`## Verdict\n\nWords.\n\n${grounds}\n## Precedent\n\n- new x: y\n`,
		);
		expect(s.grounds).toBeNull();
		expect(JSON.parse(departmentsBody(s)).state.ruling).toEqual({
			verdict: "Words.",
		});
	});

	test("a Mission of two paragraphs goes whole, two Mission sections in order", () => {
		expect(sectionWords("## Mission\n\nOne.\n\nTwo.\n", "Mission")).toBe(
			"One.\n\nTwo.",
		);
		expect(
			sectionWords(
				"## Mission\n\nOne.\n\n## Kinds\n\nx\n\n## Mission\n\nTwo.\n",
				"Mission",
			),
		).toBe("One.\n\nTwo.");
	});
});

describe.each(RUNNERS)("the answer (%s)", (_n, _request, answer) => {
	test("a good reply writes the list and prints it", async () => {
		await written();
		const r = await answer(NAME, reply({ alpha: 0.9, beta: 0.1, gamma: HIGH }));
		expect(r).toEqual({
			code: EXIT.OK,
			out: "jev model=jev-1.14.0 departments=core,alpha,gamma\n",
			err: "",
		});
		expect(departments()).toEqual(["core", "alpha", "gamma"]);
	});

	test.each([
		["a missing number", reply({ alpha: 0.9, beta: 0.1 }), "bad-answer"],
		[
			"a value that is no number",
			reply({ alpha: "0.9", beta: 0.1, gamma: 0.1 }),
			"bad-answer",
		],
		[
			"an infinite value",
			`{"model":"jev-1","answers":{"alpha":{"noul":1e999},"beta":{"noul":0},"gamma":{"noul":0}}}\n200`,
			"bad-answer",
		],
		["a status that is not 200", `{"error":"no"}\n401`, "status-401"],
		["no reply", "\n000", "no-reply"],
		["a status line alone", "503", "status-503"],
		["an empty body", "\n200", "bad-answer"],
		[
			"a foreign model name",
			reply({ alpha: 0.9, beta: 0.1, gamma: 0.1 }, "jev latest!"),
			"bad-answer",
		],
	])(
		"%s gives jev none and keeps the original list",
		async (_m, input, reason) => {
			await written();
			const before = text();
			const r = await answer(NAME, input);
			expect([r.code, r.out]).toEqual([EXIT.OK, `jev none reason=${reason}\n`]);
			expect(text()).toBe(before);
		},
	);
});

describe("the decision", () => {
	const t = DEPARTMENTS_THRESHOLD;
	const ALL = ["a", "b", "c", "d"];
	const at = (values: Record<string, number>) =>
		Object.entries(values) as [string, number][];

	test("a department of the list stays at any value", () => {
		expect(decide(["a"], ALL, at({ b: LOW, c: 0, d: 0 }), t)).toBeNull();
		expect(decide(["a"], ALL, at({ a: 0, b: HIGH }), t)).toEqual(["a", "b"]);
	});

	test("a department outside the list is added at the threshold and above, not below", () => {
		expect(decide(["a"], ALL, at({ b: t, c: HIGH, d: LOW }), t)).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(decide(["a"], ALL, at({ b: t - 0.004 }), t)).toEqual(["a", "b"]);
	});

	test("no addition gives unchanged", () => {
		expect(decide(["a"], ALL, at({ b: LOW, c: 0, d: 0 }), t)).toBeNull();
	});

	test("a list that covers every candidate is written empty", () => {
		expect(decide(["a"], ALL, at({ b: HIGH, c: t, d: 1 }), t)).toEqual([]);
	});

	test("the list keeps the candidate order, a case department outside first", () => {
		expect(
			decide(["core", "c"], ALL, at({ d: HIGH, a: HIGH, b: LOW }), t),
		).toEqual(["core", "a", "c", "d"]);
	});

	test("the threshold has at most two decimals", () => {
		expect(Number(DEPARTMENTS_THRESHOLD.toFixed(2))).toBe(
			DEPARTMENTS_THRESHOLD,
		);
	});

	test("the original list: all, the court names, else the case list", () => {
		const none = () => {
			throw new Error("the case is not looked up");
		};
		expect(originalList("all", ALL, none)).toEqual([]);
		expect(originalList(["c", "a", "c", "zeta"], ALL, none)).toEqual([
			"a",
			"c",
		]);
		expect(originalList(["d", "c", "b", "a"], ALL, none)).toEqual([]);
		expect(originalList(["zeta"], ALL, () => ["core"])).toEqual(["core"]);
		expect(originalList(null, ALL, () => [])).toEqual([]);
		expect(originalList(null, ["core"], () => ["core"])).toEqual(["core"]);
	});

	test("Jev is asked only for a named list that leaves a candidate out", () => {
		expect(asksJev(["a"], ALL)).toBe(true);
		expect(asksJev(["core"], ALL)).toBe(true);
		expect(asksJev([], ALL)).toBe(false);
		expect(asksJev(ALL, ALL)).toBe(false);
		expect(asksJev(["core"], ["core"])).toBe(false);
		expect(asksJev(["core"], [])).toBe(false);
	});

	test("the case list is the case department, or all for -", () => {
		expect(caseList("core")).toEqual(["core"]);
		expect(caseList("-")).toEqual([]);
	});

	test("a case department outside the candidates keeps it when none reaches", async () => {
		await written();
		const r = await inprocFed(
			BASE,
			select("--answer", NAME),
			reply({ alpha: LOW, beta: 0, gamma: 0 }),
		);
		expect(r.out).toBe("jev unchanged\n");
		expect(departments()).toEqual(["core"]);
	});
});

describe("the gate", () => {
	test.each([
		["typesafe no", ALLOWED.replace("typesafe: yes", "typesafe: no")],
		["typesafe Yes", ALLOWED.replace("typesafe: yes", "typesafe: Yes")],
		["no typesafe key", ALLOWED.replace("typesafe: yes\n", "")],
		["the pair of another precinct", ALLOWED.replace("main=yes", "other=yes")],
		["the pair main=no", ALLOWED.replace("main=yes", "main=no")],
		[
			"main=yes only as part of a word",
			ALLOWED.replace("main=yes", "amain=yes main=yesterday"),
		],
	])(
		"%s: the case list, no request line and a refused builder",
		async (_n, text) => {
			config(text);
			const r = await written();
			expect(asks(r)).toEqual([]);
			expect(departments()).toEqual(["core"]);
			const built = await inprocAsync(BASE, select("--request", NAME));
			expect([built.code === EXIT.OK, built.out]).toEqual([false, ""]);
			expect(built.err).toBe("journal: Jev is not allowed for main\n");
		},
	);

	const noPages = () => {
		for (const d of ["alpha", "beta"])
			rmSync(references("departments", `${d}.md`));
		rmSync(join(tree, ".lawman", "departments"), { recursive: true });
	};
	test.each([
		["no candidate", noPages, [`- new empty-doubles: ${RULE}`], ["core"]],
		[
			"a constitution that fails its check",
			() => put(tree, "LAWMAN.md", "no constitution"),
			[`- new empty-doubles: ${RULE}`],
			["core"],
		],
		[
			"a constitution that is no plain file",
			() => {
				rmSync(join(tree, "LAWMAN.md"));
				mkdirSync(join(tree, "LAWMAN.md"));
			},
			[`- new empty-doubles: ${RULE}`],
			["core"],
		],
		["the word all", () => {}, [`- new empty-doubles for all: ${RULE}`], []],
		[
			"names that cover every candidate",
			() => {},
			[`- new empty-doubles for gamma, beta, alpha: ${RULE}`],
			[],
		],
		[
			"one candidate that is the case department",
			() => {
				noPages();
				put(tree, "LAWMAN.md", constitution("- core: judged by none"));
				put(tree, ".lawman/departments/core.md", page("core"));
			},
			[`- new empty-doubles: ${RULE}`],
			["core"],
		],
	])(
		"%s: the original list, no request line and a refused builder",
		async (_n, change, lines, list) => {
			change();
			await cache([ruling(lines)]);
			const r = await record();
			expect([r.code, linesOf(r)]).toEqual([EXIT.OK, [`entry\t${NAME}`]]);
			expect(r.err).toBe("");
			expect(departments()).toEqual(list);
			const built = await inprocAsync(BASE, select("--request", NAME));
			expect([built.code === EXIT.OK, built.out]).toEqual([false, ""]);
			expect(built.err).toBe(
				`journal: no candidate department to add: ${NAME}\n`,
			);
		},
	);

	test.each([
		[
			"a bad-line file",
			[`- new empty-doubles: ${RULE}`, "- not a line"],
			`${DATE}-issue-1`,
		],
		["a refine-missing file", [`- refine gone: ${RULE}`], `${DATE}-issue-1`],
		["a missing file", [`- new empty-doubles: ${RULE}`], `${DATE}-other`],
		[
			"a name that leaves the folder",
			[`- new empty-doubles: ${RULE}`],
			"../LAWMAN",
		],
	])("the builder refuses %s", async (_n, lines, name) => {
		await written(ruling(lines));
		const built = await inprocAsync(BASE, select("--request", name));
		expect([built.code === EXIT.OK, built.out]).toEqual([false, ""]);
		expect(built.err).not.toBe("");
	});
});

// a file that cannot be read stays readable to root
const asRoot = process.getuid?.() === 0;

describe("a read failure is a fault", () => {
	const ALL_FAILURES: [string, () => void, () => void][] = [
		[
			"the constitution",
			() => chmodSync(join(tree, "LAWMAN.md"), 0o000),
			() => chmodSync(join(tree, "LAWMAN.md"), 0o644),
		],
		[
			"a department page of the tree",
			() => chmodSync(join(tree, ".lawman/departments/gamma.md"), 0o000),
			() => chmodSync(join(tree, ".lawman/departments/gamma.md"), 0o644),
		],
		[
			"the listing of the shared pages",
			() => rmSync(references("departments"), { recursive: true }),
			() => {
				shared("alpha");
				shared("beta");
			},
		],
	];
	const FAILURES = ALL_FAILURES.filter(
		([, fail]) => !asRoot || !String(fail).includes("chmod"),
	);
	const noJev = (r: Result) =>
		expect(linesOf(r).filter((l) => l.startsWith("jev"))).toEqual([]);

	describe.each(FAILURES)("%s", (_n, fail, mend) => {
		test.each([
			["a precinct that allows Jev", ALLOWED, `- new empty-doubles: ${RULE}`],
			[
				"a line that names a department",
				ALLOWED.replace("main=yes", "main=no"),
				`- new empty-doubles for beta: ${RULE}`,
			],
		])(
			"the write with %s writes nothing, and a retry writes",
			async (_m, text, line) => {
				config(text);
				fail();
				await cache([ruling([line])]);
				const r = await record();
				expect([r.code === EXIT.OK, r.out]).toEqual([false, ""]);
				expect(r.err).not.toBe("");
				expect(existsSync(file())).toBe(false);
				mend();
				expect((await record()).code).toBe(EXIT.OK);
				expect(existsSync(file())).toBe(true);
			},
		);

		test("the builder prints nothing, the adding step keeps the header", async () => {
			await written();
			const before = text();
			fail();
			const built = await inprocAsync(BASE, select("--request", NAME));
			expect([built.code === EXIT.OK, built.out]).toEqual([false, ""]);
			const r = await inprocFed(
				BASE,
				select("--answer", NAME),
				reply({ alpha: 1, beta: 1, gamma: 1 }),
			);
			expect(r.code).not.toBe(EXIT.OK);
			noJev(r);
			expect(text()).toBe(before);
			mend();
		});
	});

	test.each(FAILURES.map(([n, fail]) => [n, fail] as const))(
		"a ruling with no new line reads no source: %s",
		async (_n, fail) => {
			fail();
			for (const lines of [["none"], [`- cancel ${DATE}-gone`]]) {
				await cache([ruling(lines)]);
				const r = await record();
				expect([r.code, r.err]).toEqual([EXIT.OK, ""]);
				expect(linesOf(r)).toEqual(
					lines[0] === "none"
						? ["none"]
						: [`cancel\t${DATE}-gone\tmissing`, "no-entry\tno-change"],
				);
			}
		},
	);

	test("a source that is absent, no plain file or fails its check is data", async () => {
		rmSync(join(tree, ".lawman/departments/gamma.md"));
		mkdirSync(join(tree, ".lawman/departments/gamma.md"));
		const r = await written();
		expect(asks(r)).toEqual([`ask\t${NAME}`]);
		const body = JSON.parse(
			(await inprocAsync(BASE, select("--request", NAME))).out,
		);
		expect(Object.keys(body.questions)).toEqual(["alpha", "beta"]);
	});
});

describe("the case department", () => {
	test("a patrol lead names it, a response unit gives the empty list", async () => {
		await written();
		expect(departments()).toEqual(["core"]);
		await cacheWith([leadIn("-", "response-unit")], [RULING]);
		rmSync(join(tree, ".lawman", "precedents"), { recursive: true });
		await record();
		expect(departments()).toEqual([]);
	});

	test("a missing issue ends a call that writes a file with an error", async () => {
		await cache([RULING]);
		seed((db) => db.run("DELETE FROM issues"));
		const r = await record();
		expect(r.code).not.toBe(EXIT.OK);
		expect(r.out).toBe("");
		expect(r.err).toContain("unknown issue main #1");
		expect(existsSync(file())).toBe(false);
	});

	test.each([
		["a bad line", "- not a line"],
		["a refine of a missing file", `- refine gone: ${RULE}`],
	])("%s needs the case list: a missing issue is a fault", async (_n, line) => {
		await cache([ruling([line])]);
		seed((db) => db.run("DELETE FROM issues"));
		const r = await record();
		expect([r.code === EXIT.OK, r.out]).toEqual([false, ""]);
		expect(r.err).toContain("unknown issue main #1");
		expect(existsSync(file(`${DATE}-issue-1`))).toBe(false);
	});

	test("a case fault after a good new line writes no file", async () => {
		await cache([
			ruling([`- new empty-doubles for beta: ${RULE}`, "- not a line"]),
		]);
		seed((db) => db.run("DELETE FROM issues"));
		const r = await record();
		expect([r.code === EXIT.OK, r.out]).toEqual([false, ""]);
		expect(r.err).toContain("unknown issue main #1");
		expect(existsSync(join(tree, ".lawman", "precedents"))).toBe(false);
	});

	test.each([
		["a name it knows", "for beta"],
		["the word all", "for all"],
	])("%s needs no case: a missing issue fails nothing", async (_n, names) => {
		await cache([ruling([`- new empty-doubles ${names}: ${RULE}`])]);
		seed((db) => db.run("DELETE FROM issues"));
		const r = await record();
		expect([r.code, linesOf(r)[0]]).toEqual([EXIT.OK, `entry\t${NAME}`]);
	});

	test("a none ruling without the issue gives the old output", async () => {
		await cache([ruling(["none"])]);
		seed((db) => db.run("DELETE FROM issues"));
		expect(await record()).toEqual({ code: EXIT.OK, out: "none\n", err: "" });
	});
});

test("no output holds a value of the typesafe keys", async () => {
	const outputs: Result[] = [await written()];
	outputs.push(await inprocAsync(BASE, select("--request", NAME)));
	outputs.push(
		await inprocFed(BASE, select("--answer", NAME), reply({ alpha: 1 })),
	);
	config(ALLOWED.replace("main=yes", "main=no"));
	outputs.push(await inprocAsync(BASE, select("--request", NAME)));
	outputs.push(await inprocFed(BASE, select("--answer", NAME), "\n200"));
	for (const r of outputs)
		for (const value of [KEY_PLACE, "main=yes", "main=no"])
			expect(`${r.out}${r.err}`).not.toContain(value);
});

describe("the adding step", () => {
	const answer = (stdin: string, name = NAME) =>
		inprocFed(BASE, select("--answer", name), stdin);
	const GOOD = reply({ alpha: HIGH, beta: LOW, gamma: LOW });

	test("a hyphenated candidate goes out and comes back under one question id", async () => {
		shared("agent-config");
		await written();
		const body = JSON.parse(
			(await inprocAsync(BASE, select("--request", NAME))).out,
		);
		expect(Object.keys(body.questions)).toContain("agent_config");
		expect(Object.keys(body.questions)).not.toContain("agent-config");
		const r = await answer(
			reply({ agent_config: HIGH, alpha: LOW, beta: LOW, gamma: LOW }),
		);
		expect(r.out).not.toContain("bad-answer");
		expect(r.out).toBe("jev model=jev-1.14.0 departments=core,agent-config\n");
		expect(departments()).toEqual(["core", "agent-config"]);
	});

	test("it changes only the departments of the header", async () => {
		await written();
		const before = text();
		expect((await answer(GOOD)).out).toBe(
			"jev model=jev-1.14.0 departments=core,alpha\n",
		);
		const after = text();
		const fields = (t: string) => ({
			...(Bun.YAML.parse(t.split("\n---\n")[0]?.slice(4) ?? "") as object),
			departments: null,
		});
		expect(fields(after)).toEqual(fields(before));
		expect(splitPrecedent(after)?.body).toBe(splitPrecedent(before)?.body);
		expect(departments()).toEqual(["core", "alpha"]);
	});

	test("all candidates write the empty list", async () => {
		await written();
		expect((await answer(reply({ alpha: 1, beta: 1, gamma: 1 }))).out).toBe(
			"jev model=jev-1.14.0 departments=all\n",
		);
		expect(departments()).toEqual([]);
	});

	test("empty input gives brief, also on a header with additions", async () => {
		await written();
		expect((await answer("")).out).toBe("jev none reason=brief\n");
		await answer(GOOD);
		expect((await answer(" \n")).out).toBe("jev none reason=brief\n");
	});

	test("a file the gate refuses changes nothing and gives brief", async () => {
		await written();
		config(ALLOWED.replace("typesafe: yes", "typesafe: no"));
		const before = text();
		expect(await answer(GOOD)).toEqual({
			code: EXIT.OK,
			out: "jev none reason=brief\n",
			err: "journal: Jev is not allowed for main\n",
		});
		expect(text()).toBe(before);
	});

	test("a failed case lookup is a fault: no jev line and a non-zero exit", async () => {
		await written();
		seed((db) => db.run("DELETE FROM issues"));
		const before = text();
		const r = await answer(GOOD);
		expect([r.code === EXIT.OK, r.out]).toEqual([false, ""]);
		expect(r.err).toContain("unknown issue main #1");
		expect(text()).toBe(before);
	});

	test("a second run finds no original list and stays unchanged, even on a bad reply", async () => {
		await written();
		await answer(GOOD);
		const before = text();
		expect((await answer("garbage\n200")).out).toBe("jev unchanged\n");
		expect((await answer(GOOD)).out).toBe("jev unchanged\n");
		expect(text()).toBe(before);
	});

	test("a file that is no plain file is not written", async () => {
		await written();
		const real = join(dir, "real.md");
		writeFileSync(real, text());
		rmSync(file());
		symlinkSync(real, file());
		expect((await answer(GOOD)).out).toBe("jev none reason=brief\n");
		expect(readFileSync(real, "utf8")).toContain("- core");
	});

	test("the request ids, a reply with the same keys and the step give the exact header", async () => {
		await written();
		const body = JSON.parse(
			(await inprocAsync(BASE, select("--request", NAME))).out,
		);
		const ids = Object.keys(body.questions);
		const values = Object.fromEntries(
			ids.map((id, i) => [id, i === 2 ? HIGH : LOW]),
		);
		expect((await answer(reply(values))).out).toBe(
			"jev model=jev-1.14.0 departments=core,gamma\n",
		);
		// Bun.YAML.stringify leaves a space after `departments:` before Bun 1.4.3
		expect(text().replace(/^departments: $/m, "departments:")).toBe(
			[
				"---",
				"kind: protects",
				"departments:",
				"  - core",
				"  - gamma",
				"issue: 1",
				`date: ${DATE}`,
				`ruling: "${SOURCE}"`,
				"---",
				"",
				RULE,
				"",
			].join("\n"),
		);
	});
});

describe("the request lines of the write", () => {
	const recorded = async (...lines: string[]) =>
		linesOf(await written(ruling(lines)));

	test("a new line gives one request line with the name alone", async () => {
		const out = await recorded(`- new empty-doubles: ${RULE}`);
		expect(out).toEqual([`entry\t${NAME}`, `ask\t${NAME}`]);
	});

	test("a refine of a file keeps its header and asks nothing", async () => {
		put(
			tree,
			`.lawman/precedents/${NAME}.md`,
			`---\nkind: protects\ndepartments: [core]\n---\n\nOld.\n`,
		);
		const out = await recorded(`- refine ${NAME}: ${RULE}`);
		expect(out).toEqual([`entry\t${NAME}`]);
		expect(departments()).toEqual(["core"]);
	});

	test.each([
		[
			"a refine of a missing file",
			[`- refine gone: ${RULE}`],
			[`entry\t${DATE}-issue-1\trefine-missing`],
		],
		["a bad line", ["- not a line"], [`entry\t${DATE}-issue-1\tbad-line`]],
		[
			"a cancel",
			[`- new empty-doubles: ${RULE}`, `- cancel ${NAME}`],
			["no-entry\tno-change"],
		],
		[
			"a new line then a bad line",
			["- new issue-1: A rule.", "- not a line"],
			[
				`entry\t${DATE}-issue-1`,
				`entry\t${DATE}-issue-1-2\tbad-line`,
				`ask\t${DATE}-issue-1`,
			],
		],
		[
			"a bad line then a new line",
			["- not a line", "- new issue-1: A rule."],
			[
				`entry\t${DATE}-issue-1\tbad-line`,
				`entry\t${DATE}-issue-1-2\tname-taken`,
			],
		],
		[
			"a new line refined in the same call",
			[`- new empty-doubles: ${RULE}`, `- refine ${NAME}: Another rule.`],
			[`entry\t${NAME}`],
		],
		[
			"a new line with dropped names, then its cancel",
			[`- new empty-doubles for zeta: ${RULE}`, `- cancel ${NAME}`],
			["no-entry\tno-change"],
		],
		[
			"a new line whose names part the classifier does not read",
			[`- new empty-doubles for alpha,,beta: ${RULE}`],
			[`entry\t${DATE}-issue-1\tbad-line`],
		],
		[
			"two new lines with one gist",
			[`- new empty-doubles: ${RULE}`, "- new empty-doubles: Another rule."],
			[`entry\t${NAME}`, `entry\t${NAME}-2\tname-taken`, `ask\t${NAME}`],
		],
	])("%s", async (_n, lines, expected) => {
		expect(await recorded(...lines)).toEqual(expected);
	});

	test("a new line and a refine of the file it names on disk ask nothing", async () => {
		put(
			tree,
			`.lawman/precedents/${NAME}.md`,
			`---\nkind: protects\ndepartments: [tests]\n---\n\nOld.\n`,
		);
		const out = await recorded(
			`- new empty-doubles: ${RULE}`,
			`- refine ${NAME}: ${RULE}`,
		);
		expect(out).toEqual([`entry\t${NAME}-2\tname-taken`, `entry\t${NAME}`]);
		expect(departments()).toEqual(["tests"]);
	});

	test("the write form through the cli prints the entry and the request line", async () => {
		await cache([RULING]);
		const r = cli(select("--source", SOURCE), CLI_ENV());
		expect(r).toEqual({
			code: EXIT.OK,
			out: `entry\t${NAME}\nask\t${NAME}\n`,
			err: "",
		});
	});

	test("a repeated call finds the file standing and asks for neither file", async () => {
		await written();
		expect(linesOf(await record())).toEqual(["no-entry\tno-change"]);
		// a file an older runtime wrote has a space after the empty key
		writeFileSync(file(), text().replace("departments:\n", "departments: \n"));
		expect(linesOf(await record())).toEqual(["no-entry\tno-change"]);
		// the adding step changed its departments, and the standing file is still it
		writeFileSync(file(), withDepartments(text(), ["core", "beta"]));
		expect(linesOf(await record())).toEqual(["no-entry\tno-change"]);
		await cache([ruling([`- cancel ${NAME}`, `- new empty-doubles: ${RULE}`])]);
		expect(linesOf(await record())).toEqual([
			`cancel\t${NAME}`,
			`entry\t${NAME}-2\tname-taken`,
		]);
	});

	test("a ruling with two new lines writes both files with their original lists", async () => {
		const out = await recorded(
			`- new empty-doubles: ${RULE}`,
			"- new other for gamma: Another rule.",
		);
		expect(out.filter((l) => l.startsWith("entry"))).toEqual([
			`entry\t${NAME}`,
			`entry\t${DATE}-other`,
		]);
		expect(departments()).toEqual(["core"]);
		expect(departments(`${DATE}-other`)).toEqual(["gamma"]);
	});
});

describe("the court's names", () => {
	const drops = (r: Result) => linesOf(r).filter((l) => l.startsWith("drop\t"));

	describe("the line", () => {
		test("a line without names writes the old file without reading the sources", async () => {
			config(ALLOWED.replace("main=yes", "main=no"));
			rmSync(references("departments"), { recursive: true });
			await cache([RULING]);
			expect(await record()).toEqual({
				code: EXIT.OK,
				out: `entry\t${NAME}\n`,
				err: "",
			});
			expect(departments()).toEqual(["core"]);
			expect(splitPrecedent(text())?.body.trim()).toBe(RULE);
		});
	});

	describe("the names part and the rule", () => {
		test("the names never enter the body, which equals the rule as written", async () => {
			await written(ruling([`- new empty-doubles for beta: ${RULE}`]));
			expect(splitPrecedent(text())?.body.trim()).toBe(RULE);
		});

		test("a rule that starts and ends like a names part stays whole", async () => {
			const rule = "for alpha: a rule for beta";
			await written(ruling([`- new empty-doubles: ${rule}`]));
			expect(splitPrecedent(text())?.body.trim()).toBe(rule);
			expect(departments()).toEqual(["core"]);
		});

		test.each([
			["the word all", "for all"],
			["all beside names", "for zeta, all, beta"],
		])("%s gives the empty list and no drop line", async (_n, names) => {
			const r = await written(
				ruling([`- new empty-doubles ${names}: ${RULE}`]),
			);
			expect(departments()).toEqual([]);
			expect(drops(r)).toEqual([]);
		});
	});

	describe("recognition and order", () => {
		test("known names go in candidate order, a repeat once", async () => {
			await written(
				ruling([`- new empty-doubles for gamma, alpha, gamma: ${RULE}`]),
			);
			expect(departments()).toEqual(["alpha", "gamma"]);
		});

		test.each([
			["no candidate", "zeta"],
			["outside the class", "Zeta_X"],
		])(
			"a name that is %s is dropped, and the case list stays",
			async (_n, name) => {
				await written(ruling([`- new empty-doubles for ${name}: ${RULE}`]));
				expect(departments()).toEqual(["core"]);
				expect(text()).not.toContain(name);
			},
		);

		test("with no candidate at all every name is dropped", async () => {
			put(tree, "LAWMAN.md", "no constitution");
			const r = await written(
				ruling([`- new empty-doubles for alpha: ${RULE}`]),
			);
			expect(departments()).toEqual(["core"]);
			expect(drops(r)).toEqual([`drop\t${NAME}\talpha`]);
		});

		test("a case without a department gives the empty list", async () => {
			await cacheWith(
				[leadIn("-", "response-unit")],
				[ruling([`- new empty-doubles for zeta: ${RULE}`])],
			);
			expect((await record()).code).toBe(EXIT.OK);
			expect(departments()).toEqual([]);
		});
	});

	describe("the dropped name", () => {
		test("a name in its class is printed, one outside prints a fixed word", async () => {
			const r = await written(
				ruling([`- new empty-doubles for zeta, beta, zeta, Zeta_X: ${RULE}`]),
			);
			expect(linesOf(r)).toEqual([
				`entry\t${NAME}`,
				`drop\t${NAME}\tzeta`,
				`drop\t${NAME}\t-`,
				`ask\t${NAME}`,
			]);
			expect(departments()).toEqual(["beta"]);
		});

		test("a hostile name leaks nothing", async () => {
			const names = [`Ze${HIDDEN}ta`, TOKEN, "../LAWMAN", "a\u2028b"];
			const r = await written(
				ruling([`- new empty-doubles for ${names.join(", ")}: ${RULE}`]),
			);
			expect(drops(r)).toEqual(names.map(() => `drop\t${NAME}\t-`));
			for (const n of [...names, HIDDEN, "LAWMAN"])
				expect(`${r.out}${r.err}`).not.toContain(n);
		});

		test("a name shaped like a secret never prints", async () => {
			const secret = [
				"xoxb",
				"123456789012-1234567890123-abcdefghijklmnopqrstuvwx",
			].join("-");
			const r = await written(
				ruling([`- new empty-doubles for ${secret}, beta: ${RULE}`]),
			);
			// the cache masks the secret, and the mask is outside the class
			expect(drops(r)).toEqual([`drop\t${NAME}\t-`]);
			expect(r.out).not.toContain(secret);
		});
	});
});

describe("the forms of precedent", () => {
	const USAGE =
		"journal: usage: journal precedent <precinct> --issue <n> --source <ruling comment URL> --tree <folder>|precedent <precinct> --issue <n> --tree <folder> --request <name>|precedent <precinct> --issue <n> --tree <folder> --answer <name>\n";

	test.each([
		["no mode", select()],
		["two modes", select("--request", NAME, "--answer", NAME)],
	])(
		"%s is a usage error, in process and through the cli",
		async (_n, args) => {
			const inside = await inprocAsync(BASE, args);
			expect(inside.code).toBe(EXIT.USAGE);
			expect(cli(args, CLI_ENV())).toEqual({
				code: EXIT.USAGE,
				out: "",
				err: USAGE,
			});
		},
	);
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
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
import { inprocAsync, inprocFed, type Result } from "./inproc";
import { config, references } from "./input-test-fixture";
import {
	DEPARTMENTS_CHECKED,
	DEPARTMENTS_THRESHOLD,
	departmentsBody,
} from "./jev";
import {
	candidates,
	decide,
	departmentsState,
	fallbackList,
	type Sources,
	sectionWords,
} from "./precedent";
import { headerOf, splitPrecedent } from "./precedent-file";
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
import { departmentPage, type PageRead } from "./tick-start";
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

	test("one question per candidate, in candidate order", async () => {
		await written();
		const body = JSON.parse((await request(NAME)).out);
		expect(Object.keys(body.questions)).toEqual(["alpha", "beta", "gamma"]);
		expect(Object.keys(body.state.departments)).toEqual([
			"alpha",
			"beta",
			"gamma",
		]);
	});

	test("the builder prints the value of the exported functions on the raw sources", async () => {
		await written();
		const sources: Sources = {
			constitution: readFileSync(join(tree, "LAWMAN.md"), "utf8"),
			shared: ["alpha", "beta"],
			licenses: false,
			read: (d) => async (place) =>
				place === (d === "gamma" ? "precinct" : "law")
					? { kind: "page", text: page(d) }
					: { kind: "none" },
		};
		const body = departmentsBody(
			await departmentsState(
				RULE,
				cachedRuling(),
				"protects",
				await candidates(sources),
			),
		);
		expect((await request(NAME)).out).toBe(body);
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
	expect(DEPARTMENTS_CHECKED.tuning).toBeGreaterThan(0);
	expect(DEPARTMENTS_CHECKED.heldOut).toBeGreaterThan(0);
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
		licenses: false,
		read: (d) => async (place) => readOf(PAGE_AT[`${place}:${d}`]),
		...over,
	});
	const names = async (over: Partial<Sources> = {}) =>
		(await candidates(sources(over))).map(([d]) => d);

	beforeEach(() => {
		for (const k of Object.keys(PAGE_AT)) delete PAGE_AT[k];
		PAGE_AT["law:alpha"] = page("alpha");
		PAGE_AT["law:beta"] = page("beta");
		PAGE_AT["precinct:gamma"] = page("gamma");
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
		expect(await candidates(sources())).toEqual([
			["alpha", missionOf("alpha")],
			["beta", missionOf("beta")],
			["gamma", missionOf("gamma")],
		]);
	});

	test("licenses from the law needs the consent, from the precinct it does not", async () => {
		PAGE_AT["law:licenses"] = page("licenses");
		const withLicenses = { shared: ["alpha", "beta", "licenses"] };
		expect(await names(withLicenses)).toEqual(["alpha", "beta", "gamma"]);
		expect(await names({ ...withLicenses, licenses: true })).toEqual([
			"alpha",
			"beta",
			"licenses",
			"gamma",
		]);
		PAGE_AT["precinct:licenses"] = page("licenses");
		expect(await names(withLicenses)).toEqual([
			"alpha",
			"beta",
			"licenses",
			"gamma",
		]);
	});

	test.each([
		["an unreadable page", () => (PAGE_AT["precinct:gamma"] = false)],
		[
			"a page that fails its check",
			() => (PAGE_AT["precinct:gamma"] = "no page"),
		],
		[
			"a page with an empty Mission",
			() => (PAGE_AT["precinct:gamma"] = page("gamma", "")),
		],
		[
			"a Mission of none",
			() => (PAGE_AT["precinct:gamma"] = page("gamma", "none")),
		],
		["no page at any place", () => delete PAGE_AT["precinct:gamma"]],
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
		PAGE_AT["installation:gamma"] = page("gamma", "The installation page.");
		PAGE_AT["law:gamma"] = page("gamma", "The law page.");
		const s = sources();
		expect(await candidates(s)).toContainEqual(["gamma", missionOf("gamma")]);
		const found = await departmentPage("gamma", s.read("gamma"));
		expect(found.kind === "page" && found.page.place).toBe(1);
		delete PAGE_AT["precinct:gamma"];
		expect(await candidates(sources())).toContainEqual([
			"gamma",
			"The installation page.",
		]);
		delete PAGE_AT["installation:gamma"];
		expect(await candidates(sources())).toContainEqual([
			"gamma",
			"The law page.",
		]);
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

	const stateOf = (ruling: string, rule = RULE, kind = "protects") =>
		departmentsState(rule, ruling, kind, [["alpha", missionOf("alpha")]]);

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

	test("hidden characters and secrets leave every text field of the body", async () => {
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
		const s = await departmentsState(
			`A rule ${HIDDEN}with ${TOKEN}.`,
			HOSTILE,
			"protects",
			await candidates({
				constitution: constitution("- alpha: judged by none"),
				shared: [],
				licenses: false,
				read: () => async (place) =>
					place === "precinct"
						? { kind: "page", text: page("alpha", mission) }
						: { kind: "none" },
			}),
		);
		const body = departmentsBody(s);
		expect(body).not.toContain(TOKEN);
		const fields = JSON.parse(body).state;
		const texts = [
			fields.precedent.rule,
			fields.ruling.verdict,
			fields.ruling.grounds,
			fields.departments.alpha,
		];
		for (const t of texts) expect(stripInvisible(t)).toBe(t);
		expect(fields.departments.alpha).toBe(
			"Find defects REMOVED GITHUB SECRET. Test: one?\n\n> a quoted line",
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
			out: "jev model=jev-1.14.0 departments=alpha,gamma\n",
			err: "",
		});
		expect(departments()).toEqual(["alpha", "gamma"]);
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
	])("%s gives jev none and keeps the fallback", async (_m, input, reason) => {
		await written();
		const before = text();
		const r = await answer(NAME, input);
		expect([r.code, r.out]).toEqual([EXIT.OK, `jev none reason=${reason}\n`]);
		expect(text()).toBe(before);
	});
});

describe("the decision", () => {
	const t = DEPARTMENTS_THRESHOLD;
	const scored = (names: string[], values: number[]) =>
		names.map((d, i): [string, number] => [d, values[i] ?? Number.NaN]);

	test("the value with two decimals meets the threshold", () => {
		expect(
			decide(scored(["a", "b", "c", "d"], [t, LOW, HIGH, t - 0.004]), t, [
				"core",
			]),
		).toEqual(["a", "c", "d"]);
	});

	test("every candidate gives the empty list", () => {
		expect(decide(scored(["a", "b"], [HIGH, t]), t, ["core"])).toEqual([]);
	});

	test("no candidate gives unchanged, so the fallback stays", () => {
		expect(decide(scored(["a", "b"], [LOW, 0]), t, ["core"])).toBeNull();
	});

	test("a list equal to the header gives unchanged", () => {
		expect(decide(scored(["a", "b"], [HIGH, LOW]), t, ["a"])).toBeNull();
	});

	test("the list keeps the candidate order", () => {
		expect(decide(scored(["c", "a", "b"], [HIGH, HIGH, LOW]), t, [])).toEqual([
			"c",
			"a",
		]);
	});

	test("the fallback list is the case department, or all for -", () => {
		expect(fallbackList("core")).toEqual(["core"]);
		expect(fallbackList("-")).toEqual([]);
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
		"%s: the fallback, no request line and a refused builder",
		async (_n, text) => {
			config(text);
			const r = await written();
			expect(asks(r)).toEqual([]);
			expect(departments()).toEqual(["core"]);
			const built = await inprocAsync(BASE, select("--request", NAME));
			expect([built.code === EXIT.OK, built.out]).toEqual([false, ""]);
		},
	);

	test.each([
		[
			"no candidate",
			() => {
				for (const d of ["alpha", "beta"])
					rmSync(references("departments", `${d}.md`));
				rmSync(join(tree, ".lawman", "departments"), { recursive: true });
			},
			"no candidate department",
		],
		[
			"a constitution that fails its check",
			() => put(tree, "LAWMAN.md", "no constitution"),
			"no candidate department",
		],
		[
			"a constitution that cannot be read",
			() => {
				rmSync(join(tree, "LAWMAN.md"));
				mkdirSync(join(tree, "LAWMAN.md"));
			},
			"no candidate department",
		],
		[
			"a failed listing of the shared pages",
			() => rmSync(references("departments"), { recursive: true }),
			"shared department pages: the listing failed",
		],
	])(
		"%s: the fallback, no request line and the cause on stderr",
		async (_n, change, cause) => {
			change();
			await cache([RULING]);
			const r = await record();
			expect([r.code, linesOf(r)]).toEqual([EXIT.OK, [`entry\t${NAME}`]]);
			expect(r.err).toBe(`journal: ${cause}\n`);
			expect(departments()).toEqual(["core"]);
			const built = await inprocAsync(BASE, select("--request", NAME));
			expect([built.code === EXIT.OK, built.out]).toEqual([false, ""]);
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

describe("the narrowing step", () => {
	const answer = (stdin: string, name = NAME) =>
		inprocFed(BASE, select("--answer", name), stdin);
	const GOOD = reply({ alpha: HIGH, beta: LOW, gamma: LOW });

	test("it changes only the departments of the header", async () => {
		await written();
		const before = text();
		expect((await answer(GOOD)).out).toBe(
			"jev model=jev-1.14.0 departments=alpha\n",
		);
		const after = text();
		const fields = (t: string) => ({
			...(Bun.YAML.parse(t.split("\n---\n")[0]?.slice(4) ?? "") as object),
			departments: null,
		});
		expect(fields(after)).toEqual(fields(before));
		expect(splitPrecedent(after)?.body).toBe(splitPrecedent(before)?.body);
		expect(departments()).toEqual(["alpha"]);
	});

	test("all candidates write the empty list", async () => {
		await written();
		expect((await answer(reply({ alpha: 1, beta: 1, gamma: 1 }))).out).toBe(
			"jev model=jev-1.14.0 departments=all\n",
		);
		expect(departments()).toEqual([]);
	});

	test("empty input gives brief, also on a narrowed header", async () => {
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

	test("a second run finds no fallback and stays unchanged, even on a bad reply", async () => {
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
			"jev model=jev-1.14.0 departments=gamma\n",
		);
		expect(text()).toBe(
			[
				"---",
				"kind: protects",
				"departments: ",
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

	test("a repeated call writes a copy and asks for neither file", async () => {
		await written();
		const again = await record();
		expect(linesOf(again)).toEqual([`entry\t${NAME}-2\tname-taken`]);
	});

	test("a ruling with two new lines writes both files with the fallback", async () => {
		const out = await recorded(
			`- new empty-doubles: ${RULE}`,
			"- new other: Another rule.",
		);
		expect(out.filter((l) => l.startsWith("entry"))).toEqual([
			`entry\t${NAME}`,
			`entry\t${DATE}-other`,
		]);
		expect(departments()).toEqual(["core"]);
		expect(departments(`${DATE}-other`)).toEqual(["core"]);
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

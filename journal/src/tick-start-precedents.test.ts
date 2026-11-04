import { describe, expect, test } from "bun:test";
import { handed, human, put, type Spec, T } from "./cases-fixture";
import { inprocAsync } from "./inproc";
import { lines } from "./input-test-fixture";
import { command, configs } from "./operations-test-fixture";
import {
	BASE,
	caseMark,
	charge,
	defence,
	TRUSTED,
	tempDb,
} from "./test-helpers";
import {
	CONSTITUTION,
	departmentPage,
	host,
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
const file = (header: string, text = "A rule.") =>
	`---\n${header}\n---\n\n${text}\n`;
const PRECEDENTS: Record<string, string> = {
	"a.md": file("kind: protects\ndepartments: []"),
	"b.md": file("kind: condemns\ndepartments: [fixtures]"),
	"c.md": file("kind: protects\ndepartments: [logic, core]"),
	"d.md": file("kind: maybe\ndepartments: Bad"),
	"e.md": file("kind: *missing"),
	"sub/f.md": file("kind: protects\ndepartments: []"),
	"g.txt": "not a precedent",
};
const LINES = {
	a: "precedent a kind=protects departments=all",
	b: "precedent b kind=condemns departments=fixtures",
	c: "precedent c kind=protects departments=logic,core",
	d: "precedent d kind=- departments=-",
	e: "precedent e kind=- departments=-",
};
const ALL = Object.values(LINES);
const FIXTURES = [LINES.a, LINES.b, LINES.d, LINES.e];
const SELF = "self precedents .lawman/precedents/";

const tree = (precedents = PRECEDENTS) => ({
	"LAWMAN.md": CONSTITUTION,
	".lawman/departments/fixtures.md": departmentPage("fixtures"),
	".lawman/departments/logic.md": departmentPage("logic"),
	...Object.fromEntries(
		Object.entries(precedents).map(([name, text]) => [
			`.lawman/precedents/${name}`,
			text,
		]),
	),
});
const precedentLines = (out: string) =>
	skeleton(out).filter((l) => l.startsWith("precedent") || l === SELF);

type Role = {
	order: { issue?: number; department?: string };
	setup: (t: Record<string, string>) => void;
	expected: string[];
};
const PULL = { number: 7, author: TRUSTED, closes: [3] };
const ROLES: Record<string, Role> = {
	patrol: {
		order: { department: "fixtures" },
		setup: (t) => host({ tree: t }),
		expected: FIXTURES,
	},
	"response-unit": {
		order: { issue: 3 },
		setup: (t) => host({ tree: t, issues: { 3: human("OPEN") } }),
		expected: ALL,
	},
	investigation: {
		order: { issue: 3 },
		setup: (t) => host({ tree: t, issues: { 3: withLead("fixtures") } }),
		expected: FIXTURES,
	},
	prosecutor: {
		order: { issue: 3 },
		setup: (t) =>
			host({ tree: t, issues: { 3: withLead("fixtures", caseMark()) } }),
		expected: ALL,
	},
	court: {
		order: { issue: 3 },
		setup: (t) =>
			host({
				tree: t,
				issues: { 3: withLead("logic", caseMark(), charge(), defence()) },
			}),
		expected: ALL,
	},
	"spec-writer": {
		order: { issue: 7 },
		setup: (t) => {
			host({ tree: t, pulls: [PULL] });
			put({ 3: handed(7) });
		},
		expected: ALL,
	},
	clerk: {
		order: { issue: 3 },
		setup: (t) =>
			host({ tree: t, issues: { 3: human("OPEN") }, pulls: [PULL] }),
		expected: [],
	},
};

describe("the precedents of the tick group", () => {
	test.each(Object.keys(ROLES))(
		"%s gets the precedents of its table row",
		(role) => {
			const r = ROLES[role] as Role;
			setUp();
			orderOf(role, r.order);
			r.setup(tree());
			const out = start(role).out;
			expect(precedentLines(out)).toEqual(r.expected);
			expect(out.includes("precedents none")).toBe(false);
		},
	);

	test("each printed file follows its line in a precedent fence, after the department page", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree() });
		const s = skeleton(start("patrol").out);
		const at = s.indexOf(LINES.a);
		expect(s[at + 1]).toBe("~precedent");
		expect(at).toBeGreaterThan(s.indexOf("~department"));
	});

	test("the fenced text is the whole file", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree({ "a.md": file("kind: protects\ndepartments: []") }) });
		expect(start("patrol").out).toContain(
			`${LINES.a}\n~~~precedent\n${file("kind: protects\ndepartments: []")}~~~\n`,
		);
	});

	test("an empty or missing folder gives precedents none", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree({}) });
		expect(lines(start("patrol").out)).toContain("precedents none");
	});

	test("a folder whose files all serve another department gives precedents none", () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree({ "c.md": PRECEDENTS["c.md"] ?? "" }) });
		expect(lines(start("patrol").out)).toContain("precedents none");
	});

	test("a file the journal cannot read gives one self line, the others print", () => {
		setUp();
		orderOf("prosecutor", { issue: 3 });
		ROLES.prosecutor?.setup(
			tree({ ...PRECEDENTS, "bad name.md": file("kind: protects") }),
		);
		command(
			configs("main"),
			"file",
			`case "$2" in .lawman/precedents/c.md) exit 1;; *) cat "tree/$2";; esac`,
		);
		const out = start("prosecutor").out;
		expect(precedentLines(out)).toEqual([
			LINES.a,
			LINES.b,
			LINES.d,
			LINES.e,
			SELF,
		]);
		expect(out).not.toContain("bad name");
	});

	test("the rebuild of tick input names the folder as a self step", async () => {
		setUp();
		orderOf("prosecutor", { issue: 3 });
		ROLES.prosecutor?.setup(tree());
		command(configs("main"), "fetch", "exit 0");
		expect(lines(start("prosecutor").out)).toContain("self fetch");
		const r = await inprocAsync(BASE, ["tick", "input", "1"]);
		expect(precedentLines(r.out)).toEqual([SELF]);
	});
});

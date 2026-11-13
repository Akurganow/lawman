import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { handed, human, issuesJson, type Spec, T } from "./cases-fixture";
import { inprocAsync, inprocFed } from "./inproc";
import { lines } from "./input-test-fixture";
import { command, configs } from "./operations-test-fixture";
import {
	BASE,
	caseMark,
	charge,
	defence,
	LEAD_ID,
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
	"h.md":
		"---\r\nkind: condemns\r\ndepartments: [fixtures]\r\n---\r\n\r\nA rule.\r\n",
	"i.md": "---\nkind: protects\nA rule under an unclosed header.\n",
	"j.md": file(`kind: dismissal\ndepartments: [fixtures]\nfinding: ${LEAD_ID}`),
	"k.md": file("kind: dismissal\ndepartments: [logic]\nfinding: not-an-id"),
};
const LINES = {
	a: "precedent a kind=protects departments=all",
	b: "precedent b kind=condemns departments=fixtures",
	c: "precedent c kind=protects departments=logic,core",
	d: "precedent d kind=- departments=-",
	e: "precedent e kind=- departments=-",
	h: "precedent h kind=condemns departments=fixtures",
	i: "precedent i kind=- departments=-",
	j: `precedent j kind=dismissal departments=fixtures finding=${LEAD_ID}`,
	k: "precedent k kind=dismissal departments=logic finding=-",
};
const ALL = Object.values(LINES);
// the roles that do not receive a dismissal
const PLAIN = ALL.filter((l) => l !== LINES.j && l !== LINES.k);
const FIXTURES = [LINES.a, LINES.b, LINES.d, LINES.e, LINES.h, LINES.i];
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
const start = async (role: string) =>
	(await inprocAsync(BASE, ["tick", "start", "--role", role, "--order", "1"]))
		.out;
const precedentLines = (out: string) =>
	skeleton(out).filter((l) => l.startsWith("precedent") || l === SELF);

type Role = {
	order: { issue?: number; department?: string };
	setup: (t: Record<string, string>) => void | Promise<void>;
	expected: string[];
};
const PULL = { number: 7, author: TRUSTED, closes: [3] };
const ROLES: Record<string, Role> = {
	patrol: {
		order: { department: "fixtures" },
		setup: (t) => host({ tree: t }),
		expected: [...FIXTURES, LINES.j],
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
		expected: PLAIN,
	},
	court: {
		order: { issue: 3 },
		setup: (t) =>
			host({
				tree: t,
				issues: { 3: withLead("logic", caseMark(), charge(), defence()) },
			}),
		expected: PLAIN,
	},
	"spec-writer": {
		order: { issue: 7 },
		setup: async (t) => {
			host({ tree: t, pulls: [PULL] });
			const synced = await inprocFed(
				BASE,
				["sync", "main", "--author", TRUSTED],
				issuesJson({ 3: handed(7) }),
			);
			expect(synced.code).toBe(0);
		},
		expected: PLAIN,
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
		async (role) => {
			const r = ROLES[role] as Role;
			setUp();
			orderOf(role, r.order);
			await r.setup(tree());
			const out = await start(role);
			expect(precedentLines(out)).toEqual(r.expected);
			expect(out.includes("precedents none")).toBe(false);
		},
	);

	test("a dismissal is handed out unless the issue it names is open or closed as completed", async () => {
		const dismissal = (issue?: number) =>
			file(
				`kind: dismissal\ndepartments: []\n${issue === undefined ? "" : `issue: ${issue}\n`}finding: ${LEAD_ID}`,
			);
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({
			tree: tree({
				"1-open.md": dismissal(3),
				"2-done.md": dismissal(4),
				"3-declined.md": dismissal(5),
				"4-absent.md": dismissal(9),
				"5-bare.md": dismissal(),
			}),
		});
		// a sync replaces the cache rows, so the closed reasons go in through the host
		const form = JSON.parse(
			issuesJson({
				3: { state: "OPEN" },
				4: { state: "CLOSED" },
				5: { state: "CLOSED" },
			}),
		);
		form.issues[1].stateReason = "COMPLETED";
		form.issues[2].stateReason = "NOT_PLANNED";
		writeFileSync(join(configs("main"), "issues.json"), JSON.stringify(form));
		const handedOut = precedentLines(await start("patrol")).map(
			(l) => l.split(" ")[1],
		);
		expect(handedOut).toEqual(["3-declined", "4-absent", "5-bare"]);
	});

	test("each printed file follows its line in a precedent fence, after the department page", async () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree() });
		const s = skeleton(await start("patrol"));
		const at = s.indexOf(LINES.a);
		expect(s[at + 1]).toBe("~precedent");
		expect(at).toBeGreaterThan(s.indexOf("~department"));
	});

	test("the fenced text is the whole file, a file with an unclosed header too", async () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree() });
		const out = await start("patrol");
		expect(out).toContain(
			`${LINES.a}\n~~~precedent\n${PRECEDENTS["a.md"]}~~~\n`,
		);
		expect(out).toContain(
			`${LINES.i}\n~~~precedent\n${PRECEDENTS["i.md"]}~~~\n`,
		);
	});

	test("an empty or missing folder gives precedents none", async () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree({}) });
		expect(lines(await start("patrol"))).toContain("precedents none");
	});

	test("a folder whose files all serve another department gives precedents none", async () => {
		setUp();
		orderOf("patrol", { department: "fixtures" });
		host({ tree: tree({ "c.md": PRECEDENTS["c.md"] ?? "" }) });
		expect(lines(await start("patrol"))).toContain("precedents none");
	});

	test("a file the journal cannot read gives one self line, the others print", async () => {
		setUp();
		orderOf("prosecutor", { issue: 3 });
		await ROLES.prosecutor?.setup(
			tree({ ...PRECEDENTS, "bad name.md": file("kind: protects") }),
		);
		command(
			configs("main"),
			"file",
			`case "$2" in .lawman/precedents/c.md) exit 1;; *) cat "tree/$2";; esac`,
		);
		const out = await start("prosecutor");
		expect(precedentLines(out)).toEqual([
			LINES.a,
			LINES.b,
			LINES.d,
			LINES.e,
			LINES.h,
			LINES.i,
			SELF,
		]);
		expect(out).not.toContain("bad name");
	});

	test("the rebuild of tick input names the folder as a self step", async () => {
		setUp();
		orderOf("prosecutor", { issue: 3 });
		await ROLES.prosecutor?.setup(tree());
		command(configs("main"), "fetch", "exit 0");
		expect(lines(await start("prosecutor"))).toContain("self fetch");
		const r = await inprocAsync(BASE, ["tick", "input", "1"]);
		expect(precedentLines(r.out)).toEqual([SELF]);
	});
});

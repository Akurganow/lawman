import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { human, issuesJson, type Spec, T } from "./cases-fixture";
import { inprocAsync, inprocFed } from "./inproc";
import { CONFIG, lines } from "./input-test-fixture";
import { command, configs } from "./operations-test-fixture";
import { BASE, caseMark, dir, LEAD_ID, TRUSTED, tempDb } from "./test-helpers";
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

	test("a file that the command wrote is handed out as a dismissal with its finding", async () => {
		setUp(`${CONFIG}dismissals_since: 2026-10-01T00:00:00Z\n`);
		orderOf("patrol", { department: "fixtures" });
		const form = JSON.parse(
			issuesJson({ 3: { body: [leadIn("fixtures")], state: "CLOSED" } }),
		);
		Object.assign(form.issues[0], {
			stateReason: "NOT_PLANNED",
			closedAt: "2026-10-15T08:00:00Z",
			url: "https://git.example.com/o/main/issues/3",
		});
		const synced = await inprocFed(
			BASE,
			["sync", "main", "--author", TRUSTED],
			JSON.stringify(form),
		);
		expect(synced.code).toBe(0);
		const written = join(dir, "written");
		mkdirSync(written);
		const object = JSON.stringify({ lastActor: "owner", writers: ["owner"] });
		const wrote = await inprocFed(
			BASE,
			["precedent", "main", "--issue", "3", "--tree", written],
			object,
		);
		expect(wrote.code).toBe(0);
		const [name] = readdirSync(join(written, ".lawman", "precedents"));
		const text = readFileSync(
			join(written, ".lawman", "precedents", name ?? ""),
			"utf8",
		);
		expect(text).toContain("issue: 3\n");
		host({
			tree: tree({ [name ?? ""]: text }),
			issues: { 3: { body: [leadIn("fixtures")], state: "CLOSED" } },
		});
		expect(precedentLines(await start("patrol"))).toEqual([
			`precedent ${(name ?? "").replace(/\.md$/, "")} kind=dismissal departments=fixtures finding=${LEAD_ID}`,
		]);
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
});

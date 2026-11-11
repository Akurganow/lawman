import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Comment, issuesJson, T } from "./cases-fixture";
import { EXIT } from "./db";
import { inprocAsync, inprocFed } from "./inproc";
import { config } from "./input-test-fixture";
import { command, configs } from "./operations-test-fixture";
import { headerOf, splitPrecedent } from "./precedent-file";
import {
	acquittal,
	addPrecincts,
	BASE,
	cli,
	conviction,
	dbFile,
	dir,
	mark,
	rows,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const LINK = "https://git.example.com/o/main/issues/2#comment-7";
const page = (...lines: string[]) =>
	[
		"# Constitution",
		"",
		"## Precedents",
		"",
		...lines,
		"",
		"## Notes",
		"",
		"Kept.",
		"",
	].join("\n");
// the line numbers of the section differ from the issues the links name
const PAGE = page(
	`- 2026-09-02 #1: An unused callback parameter is not dead. (${LINK})`,
	`- 2026-09-03 #2: A rule of the owner.`,
);

let tree: string;

beforeEach(() => {
	addPrecincts({ main: 1 });
	config(`trusted_login: ${TRUSTED}\n`);
	tree = join(dir, "tree");
	mkdirSync(tree);
	writeFileSync(join(tree, "LAWMAN.md"), PAGE);
});

const form = (specs: Record<number, Comment[]>) =>
	issuesJson(
		Object.fromEntries(
			Object.entries(specs).map(([n, comments]) => [n, { comments }]),
		),
	);
const ruled = (...markers: string[]) =>
	markers.map((m, i): Comment => [T(10 + i), `Ruling.\n\n${m}`]);
const check = (stdin: string, ...pairs: string[]) =>
	inprocFed(BASE, ["old-precedent", "check", "main", ...pairs], stdin);
const move = (stdin: string, ...args: string[]) =>
	inprocFed(
		BASE,
		[
			"old-precedent",
			"move",
			"main",
			"--tree",
			tree,
			"--gist",
			"callbacks",
			...args,
		],
		stdin,
	);
const fileOf = (name: string) =>
	readFileSync(join(tree, ".lawman", "precedents", `${name}.md`), "utf8");
const lawman = () => readFileSync(join(tree, "LAWMAN.md"), "utf8");

describe("old-precedent list", () => {
	test("each line prints its number, date, link and rule in a fence", async () => {
		const r = await inprocFed(BASE, ["old-precedent", "list"], PAGE);
		expect(r).toEqual({
			code: EXIT.OK,
			out: [
				"line 1 date=2026-09-02 link=yes position=1",
				"~~~rule",
				"An unused callback parameter is not dead.",
				"~~~",
				"line 2 date=2026-09-03 link=no position=2",
				"~~~rule",
				"A rule of the owner.",
				"~~~",
				"",
			].join("\n"),
			err: "",
		});
	});

	test("an item outside the form prints by its position, and none is no item", async () => {
		const text = page("- none", "- a loose note", "- 2026-09-02 #1: Rule.");
		expect((await inprocFed(BASE, ["old-precedent", "list"], text)).out).toBe(
			"outside position=1\nline 1 date=2026-09-02 link=no position=2\n~~~rule\nRule.\n~~~\n",
		);
	});

	test("a page with no old line prints none", async () => {
		expect(
			(await inprocFed(BASE, ["old-precedent", "list"], page("none"))).out,
		).toBe("none\n");
	});

	test("a hostile rule stays inside a longer fence, without hidden characters", async () => {
		const text = page("- 2026-09-02 #1: Close ``` and ~~~ here​.");
		const r = await inprocFed(BASE, ["old-precedent", "list"], text);
		expect(r.out).toBe(
			"line 1 date=2026-09-02 link=no position=1\n~~~~rule\nClose ``` and ~~~ here.\n~~~~\n",
		);
	});

	test("carriage returns end the lines of a page", async () => {
		const r = await inprocFed(
			BASE,
			["old-precedent", "list"],
			PAGE.replaceAll("\n", "\r\n"),
		);
		expect(r.out).toContain(
			"line 2 date=2026-09-03 link=no position=2\n~~~rule\nA rule of the owner.\n~~~\n",
		);
	});
});

describe("old-precedent added", () => {
	const write = (name: string, text: string) => {
		const path = join(dir, name);
		writeFileSync(path, text);
		return path;
	};
	const added = (base: string, head: string) =>
		inprocAsync(BASE, [
			"old-precedent",
			"added",
			"--base",
			write("base.md", base),
			"--head",
			write("head.md", head),
		]);

	test("only the lines the pull request adds to its merge base print", async () => {
		const base = page("- 2026-09-02 #1: First.", "- 2026-09-03 #2: Second.");
		const head = page(
			"- 2026-09-02 #1: First.",
			"- 2026-09-03 #2: Second.",
			"- 2026-09-04 #3: Third.",
		);
		expect((await added(base, head)).out).toBe(
			"line 3 date=2026-09-04 link=no position=3\n~~~rule\nThird.\n~~~\n",
		);
	});

	// the default branch moved line 1 after the pull request branched off
	test("a pull request that is stale after the move gets no moved line", async () => {
		const tip = page("none");
		const base = page("- 2026-09-02 #1: First.");
		const head = page("- 2026-09-02 #1: First.", "- 2026-09-04 #2: Second.");
		expect((await added(base, head)).out).toBe(
			"line 2 date=2026-09-04 link=no position=2\n~~~rule\nSecond.\n~~~\n",
		);
		// against the tip the moved line would count again
		expect((await added(tip, head)).out).toContain("line 1 ");
	});

	test("an edited old line and a free note are not added old lines", async () => {
		const base = page("- 2026-09-02 #1: First rule.");
		const head = page("- 2026-09-02 #1: First rules.", "- a new free note");
		expect((await added(base, head)).out).toBe("none\n");
	});
});

describe("old-precedent check", () => {
	test("one counted ruling gives its kind, a line with no issue gives ask", async () => {
		const r = await check(form({ 2: ruled(conviction()) }), "1:2", "2");
		expect(r).toEqual({
			code: EXIT.OK,
			out: "line 1 kind=condemns\nline 2 ask reason=no-issue\n",
			err: "",
		});
	});

	test("rulings of one kind give that kind, a stage of another kind changes nothing", async () => {
		const stdin = form({
			2: ruled(acquittal(), mark("court", "refer"), acquittal()),
		});
		expect((await check(stdin, "1:2")).out).toBe("line 1 kind=protects\n");
	});

	test.each([
		["rulings of two kinds", { 2: ruled(acquittal(), conviction()) }, "mixed"],
		["an issue the form lacks", { 1: ruled(acquittal()) }, "absent"],
		[
			"an issue with no ruling",
			{ 2: ruled(mark("executor", "acquittal")) },
			"no-ruling",
		],
		[
			"a court stage named like an object member",
			{ 2: ruled(mark("court", "constructor")) },
			"no-ruling",
		],
	])("%s gives ask", async (_, specs, reason) => {
		expect((await check(form(specs), "1:2")).out).toBe(
			`line 1 ask reason=${reason}\n`,
		);
	});

	test("a ruling of another author is not counted", async () => {
		const json = JSON.parse(form({ 2: ruled(conviction()) }));
		json.issues[0].comments[0].author = { login: "someone" };
		expect((await check(JSON.stringify(json), "1:2")).out).toBe(
			"line 1 ask reason=no-ruling\n",
		);
	});

	test("an issue that the form holds twice gives ask for its lines only", async () => {
		const json = JSON.parse(
			form({ 1: ruled(acquittal()), 2: ruled(acquittal()) }),
		);
		json.issues.push(json.issues[1]);
		expect((await check(JSON.stringify(json), "1:2", "2:1")).out).toBe(
			"line 1 ask reason=repeated\nline 2 kind=protects\n",
		);
	});

	test.each([
		["a form outside its shape", "[]", "form"],
		["no JSON", "x", "form"],
	])("%s gives ask for every line", async (_, stdin, reason) => {
		expect((await check(stdin, "1:2", "2:1")).out).toBe(
			`line 1 ask reason=${reason}\nline 2 ask reason=${reason}\n`,
		);
	});

	test("the precinct's issues command gives the form, and the cache stays as it was", async () => {
		const path = join(dir, "form.json");
		writeFileSync(path, form({ 2: ruled(conviction()) }));
		command(configs("main"), "issues", `cat '${path}'`);
		const before = rows("SELECT * FROM issues");
		expect((await check("", "1:2")).out).toBe("line 1 kind=condemns\n");
		expect(rows("SELECT * FROM issues")).toEqual(before);
		expect(rows("SELECT * FROM comments")).toEqual([]);
	});

	test("a failed issues command prints its refusal", async () => {
		command(configs("main"), "issues", "echo broken >&2\nexit 1");
		expect(await check("", "1:2")).toEqual({
			code: EXIT.COMMAND,
			out: "issues failed reason=exit\n~~~error\nbroken\n~~~\n",
			err: "",
		});
	});
});

describe("old-precedent move", () => {
	test("the kind of the ruling writes the file and takes the line out of the page", async () => {
		const r = await move(
			form({ 2: ruled(conviction()) }),
			"--line",
			"1",
			"--issue",
			"2",
		);
		expect(r).toEqual({
			code: EXIT.OK,
			out: "entry 2026-09-02-callbacks\n",
			err: "",
		});
		const text = fileOf("2026-09-02-callbacks");
		expect(headerOf(text)).toEqual({ kind: "condemns", departments: [] });
		expect(text).toContain("date: 2026-09-02");
		expect(text).toContain(`ruling: "${LINK}"`);
		expect(text).not.toContain("issue:");
		expect(splitPrecedent(text)?.body.trim()).toBe(
			"An unused callback parameter is not dead.",
		);
		expect(lawman()).toBe(page("- 2026-09-03 #2: A rule of the owner."));
	});

	test("an undecided kind asks and writes nothing", async () => {
		const r = await move(
			form({ 2: ruled(acquittal(), conviction()) }),
			"--line",
			"1",
			"--issue",
			"2",
		);
		expect(r.out).toBe("ask reason=mixed\n");
		expect(lawman()).toBe(PAGE);
	});

	test("the user's kind writes a line with no link, and the last line leaves none", async () => {
		await move("", "--line", "1", "--issue", "2", "--kind", "protects");
		const r = await inprocFed(
			BASE,
			[
				"old-precedent",
				"move",
				"main",
				"--tree",
				tree,
				"--gist",
				"owner",
				"--line",
				"2",
				"--kind",
				"protects",
			],
			"",
		);
		expect(r.out).toBe("entry 2026-09-03-owner\n");
		expect(fileOf("2026-09-03-owner")).not.toContain("ruling:");
		expect(lawman()).toBe(page("none"));
	});

	test("a kind from the rulings outranks the user's kind", async () => {
		await move(
			form({ 2: ruled(conviction()) }),
			"--line",
			"1",
			"--issue",
			"2",
			"--kind",
			"protects",
		);
		expect(headerOf(fileOf("2026-09-02-callbacks")).kind).toBe("condemns");
	});

	test("carriage returns stay, and only the moved line leaves", async () => {
		writeFileSync(join(tree, "LAWMAN.md"), PAGE.replaceAll("\n", "\r\n"));
		await move("", "--line", "2", "--kind", "protects");
		expect(lawman()).toBe(
			page(
				`- 2026-09-02 #1: An unused callback parameter is not dead. (${LINK})`,
			).replaceAll("\n", "\r\n"),
		);
	});

	test("a missing line fails and writes nothing", async () => {
		const r = await move("", "--line", "9", "--kind", "protects");
		expect(r.code).toBe(EXIT.USAGE);
		expect(lawman()).toBe(PAGE);
	});
});

describe("old-precedent as a program", () => {
	test("list reads the page on stdin and exits 0", () => {
		expect(cli(["old-precedent", "list"], { LAWMAN_DB: dbFile }, PAGE)).toEqual(
			{
				code: 0,
				out: [
					"line 1 date=2026-09-02 link=yes position=1",
					"~~~rule",
					"An unused callback parameter is not dead.",
					"~~~",
					"line 2 date=2026-09-03 link=no position=2",
					"~~~rule",
					"A rule of the owner.",
					"~~~",
					"",
				].join("\n"),
				err: "",
			},
		);
	});

	test("move with the user's kind writes the file and the page", () => {
		const r = cli(
			[
				"old-precedent",
				"move",
				"main",
				"--tree",
				tree,
				"--gist",
				"owner",
				"--line",
				"2",
				"--kind",
				"protects",
			],
			{ LAWMAN_DB: dbFile },
			"",
		);
		expect(r).toEqual({ code: 0, out: "entry 2026-09-03-owner\n", err: "" });
		expect(lawman()).not.toContain("#2:");
	});
});

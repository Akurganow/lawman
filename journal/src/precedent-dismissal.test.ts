import { beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fits } from "./args";
import { EXIT } from "./db";
import {
	commentLine,
	DISMISSED,
	issueLine,
	TITLE_LINE,
	verdictLine,
} from "./dismissal-file";
import { inprocFed } from "./inproc";
import { config, lines } from "./input-test-fixture";
import { splitPrecedent } from "./precedent-file";
import { cache } from "./precedent-test-fixture";
import { precedentBody } from "./pull-body";
import {
	acquittal,
	BASE,
	caseMark,
	charge,
	conviction,
	defence,
	dir,
	LEAD_ID,
	precinct,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const OWNER = "owner-x";
const URL = "https://git.example.com/o/main/issues/1";
const SOURCE = `${URL}#comment-7`;
const SINCE = "2026-10-01T00:00:00Z";
const CLOSED = "2026-10-15T08:00:00Z";
const DISMISSAL_BASE = "2026-10-15-dismissal-issue-1";
const RULING_BASE = "2026-10-14-first-rule";
const COMMENT = "The owner keeps this on purpose.";
const TITLE = "issue 1";

const funnel = [caseMark(), charge(), defence()];
const ruled = (marker: string, ...section: string[]) =>
	["Ruling.", "", ...section, "", marker].join("\n");
const CONVICTION = ruled(
	conviction(),
	"## Precedent",
	"",
	"- new first-rule: Keep the rule.",
);
const acquitted = (words: string) =>
	ruled(acquittal(), "## Verdict", "", words, "", "## Precedent", "", "none");
const objectOf = (
	over: { actor?: string; writers?: string[]; comments?: unknown[] } = {},
) =>
	JSON.stringify({
		lastActor: over.actor ?? OWNER,
		writers: over.writers ?? [OWNER],
		comments: over.comments ?? [],
	});
const ASKED = (at: string, body: string) => ({
	author: OWNER,
	createdAt: at,
	body,
});

let tree: string;

beforeEach(() => {
	seed((db) => precinct(db, "main"));
	config(`trusted_login: ${TRUSTED}\ndismissals_since: ${SINCE}\n`);
	tree = join(dir, "tree");
	mkdirSync(tree);
});

// the cached issue 1, closed with no fix after the key
const close = (set = "") =>
	seed((db) =>
		db.run(
			`UPDATE issues SET state = 'CLOSED', state_reason = 'NOT_PLANNED', closed_at = ?, url = ?${set} WHERE precinct = 'main' AND issue = 1`,
			[CLOSED, URL],
		),
	);

const folder = () => join(tree, ".lawman", "precedents");
const names = () =>
	existsSync(folder())
		? readdirSync(folder())
				.map((f) => f.replace(/\.md$/, ""))
				.sort()
		: [];
const read = (name: string) =>
	readFileSync(join(folder(), `${name}.md`), "utf8");
const bodyFile = () => join(dirname(tree), "pull-body.md");

const run = (stdin: string, ...extra: string[]) =>
	inprocFed(
		BASE,
		["precedent", "main", "--issue", "1", ...extra, "--tree", tree],
		stdin,
	);

const header = (text: string) =>
	Bun.YAML.parse(text.split("\n---\n")[0]?.slice(4) ?? "") as Record<
		string,
		unknown
	>;

// the body as a reader sees it: the lines outside the fences, and each fence with its text
function bodyOf(text: string) {
	const rows = (splitPrecedent(text)?.body ?? "").trim().split("\n");
	const outside: string[] = [];
	const quotes: { fence: string; text: string }[] = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i] as string;
		if (!/^~{3,}$/.test(row)) {
			if (row !== "") outside.push(row);
			continue;
		}
		const inner: string[] = [];
		for (i++; i < rows.length && rows[i] !== row; i++)
			inner.push(rows[i] as string);
		expect(rows[i]).toBe(row);
		quotes.push({ fence: row, text: inner.join("\n") });
	}
	return { outside, quotes };
}

const longestRun = (text: string) =>
	Math.max(0, ...(text.match(/~+/g) ?? []).map((r) => r.length));

describe("precedent: a dismissal through the command", () => {
	test("a hand close writes the file with the comment of the closer", async () => {
		await cache([{ body: COMMENT, author: OWNER }]);
		close();
		const r = await run(objectOf());
		expect(r.err).toBe("");
		expect(r.code).toBe(EXIT.OK);
		const [line, ...rest] = lines(r.out);
		const [verb, name] = (line ?? "").split("\t");
		expect([verb, rest]).toEqual(["entry", []]);
		expect(fits("precedent", name ?? "")).toBe(true);
		expect(names()).toEqual([name as string]);
		const text = read(name as string);
		expect(header(text)).toMatchObject({
			kind: "dismissal",
			departments: ["core"],
			issue: 1,
			finding: LEAD_ID,
		});
		const { outside, quotes } = bodyOf(text);
		expect(outside).toEqual([
			DISMISSED,
			issueLine(URL),
			TITLE_LINE,
			commentLine("2026-10-14T10:00:00Z"),
		]);
		expect(quotes.map((q) => q.text)).toEqual([TITLE, COMMENT]);
	});

	test("a court acquittal quotes the verdict, ignores the object and takes the ruling from the source", async () => {
		await cache([...funnel, acquitted("Not a defect.")]);
		close();
		const r = await run("", "--source", SOURCE);
		expect(r.err).toBe("");
		expect(r.code).toBe(EXIT.OK);
		const name = lines(r.out)[0]?.split("\t")[1] as string;
		expect(lines(r.out)).toHaveLength(1);
		const text = read(name);
		expect(header(text)).toMatchObject({ kind: "dismissal", ruling: SOURCE });
		const { outside, quotes } = bodyOf(text);
		expect(outside).toContain(verdictLine("2026-10-14T13:00:00Z"));
		expect(quotes.map((q) => q.text)).toEqual([TITLE, "Not a defect."]);
	});

	test("a call with no source writes a dismissal when only a dismissal is due", async () => {
		await cache([...funnel, acquitted("Not a defect.")]);
		close();
		const r = await run("");
		expect(r.code).toBe(EXIT.OK);
		expect(lines(r.out)).toEqual([`entry\t${DISMISSAL_BASE}`]);
		expect(header(read(DISMISSAL_BASE))).not.toHaveProperty("ruling");
	});
});

describe("precedent: the ruling's files and a dismissal together", () => {
	const both = async () => {
		await cache([...funnel, CONVICTION, { body: COMMENT, author: OWNER }]);
		close();
	};

	test("one call writes both into one tree with one body", async () => {
		await both();
		const r = await run(objectOf(), "--source", SOURCE);
		expect(r.err).toBe("");
		expect(r.code).toBe(EXIT.OK);
		expect(lines(r.out)).toEqual([
			`entry\t${RULING_BASE}`,
			`entry\t${DISMISSAL_BASE}`,
		]);
		expect(names()).toEqual([RULING_BASE, DISMISSAL_BASE]);
		expect(header(read(RULING_BASE))).toMatchObject({ kind: "condemns" });
		expect(header(read(DISMISSAL_BASE))).toMatchObject({ kind: "dismissal" });
		const body = readFileSync(bodyFile(), "utf8");
		expect(body).toBe(
			await precedentBody(SOURCE, [
				{ name: RULING_BASE, was: null, now: read(RULING_BASE) },
				{ name: DISMISSAL_BASE, was: null, now: read(DISMISSAL_BASE) },
			]),
		);
		expect(body).toContain(`new ${RULING_BASE}: Keep the rule.`);
		expect(
			readdirSync(dirname(tree)).filter((f) => f === "pull-body.md"),
		).toEqual(["pull-body.md"]);
	});

	test("with no entry line one line ends the output, the dismissal's", async () => {
		await both();
		await run(objectOf(), "--source", SOURCE);
		const again = await run(objectOf(), "--source", SOURCE);
		expect(again.out).toBe("no-entry\tno-change\n");
		const other = await run(
			objectOf({ writers: ["someone-else"] }),
			"--source",
			SOURCE,
		);
		expect(other.out).toBe("no-entry\tno-decider\n");
		expect(names()).toEqual([RULING_BASE, DISMISSAL_BASE]);
	});

	test("a cancellation of the ruling is a change: the dismissal's no-entry line gives way", async () => {
		const OLD = "2026-09-01-old-rule";
		await cache([
			...funnel,
			ruled(conviction(), "## Precedent", "", `- cancel ${OLD}`),
			{ body: COMMENT, author: OWNER },
		]);
		close();
		mkdirSync(folder(), { recursive: true });
		writeFileSync(
			join(folder(), `${OLD}.md`),
			"---\nkind: condemns\ndepartments: []\n---\n\nAn old rule.\n",
		);
		const r = await run(
			objectOf({ writers: ["someone-else"] }),
			"--source",
			SOURCE,
		);
		expect(r.out).toBe(`cancel\t${OLD}\n`);
		expect(names()).toEqual([]);
		expect(existsSync(bodyFile())).toBe(true);
	});

	test("with no source the ruling's files being due is a usage error and nothing is written", async () => {
		await both();
		const r = await run(objectOf());
		expect(r.code).toBe(EXIT.USAGE);
		expect(names()).toEqual([]);
		expect(existsSync(bodyFile())).toBe(false);
	});

	test("a dismissal that needs the object writes no file on an empty input, the ruling's files neither", async () => {
		await both();
		const r = await run("", "--source", SOURCE);
		expect(r.code).toBe(EXIT.USAGE);
		expect(names()).toEqual([]);
		expect(existsSync(bodyFile())).toBe(false);
	});
});

describe("precedent: a call with nothing due or too little to build a file", () => {
	test("an object the reader rejects ends the call and writes no file", async () => {
		await cache([{ body: COMMENT, author: OWNER }]);
		close();
		const r = await run("not json");
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain("decider input rejected");
		expect(names()).toEqual([]);
	});

	test("an issue that has no cached address gets its file without the issue line", async () => {
		await cache([{ body: COMMENT, author: OWNER }]);
		close(", url = NULL");
		const r = await run(objectOf());
		expect(r.out).toBe(`entry\t${DISMISSAL_BASE}\n`);
		expect(bodyOf(read(DISMISSAL_BASE)).outside).toEqual([
			DISMISSED,
			TITLE_LINE,
			commentLine("2026-10-14T10:00:00Z"),
		]);
	});

	test("an open issue with no ruling is due nothing", async () => {
		await cache([{ body: COMMENT, author: OWNER }]);
		const r = await run(objectOf());
		expect(r).toMatchObject({ code: EXIT.OK, out: "no-entry\tno-change\n" });
		expect(names()).toEqual([]);
		expect(existsSync(bodyFile())).toBe(false);
	});

	test("another file under the name sends the dismissal to the next free name", async () => {
		await cache([{ body: COMMENT, author: OWNER }]);
		close();
		mkdirSync(folder(), { recursive: true });
		writeFileSync(
			join(folder(), `${DISMISSAL_BASE}.md`),
			"---\nkind: protects\ndepartments: []\n---\n\nAnother rule.\n",
		);
		const r = await run(objectOf());
		expect(r.out).toBe(`entry\t${DISMISSAL_BASE}-2\n`);
	});
});

describe("precedent: the pull request body of a dismissal", () => {
	test("a ruling that changed no file is not named in the body, though the call names it", async () => {
		const ABSENT = "2026-09-01-absent-rule";
		await cache([
			...funnel,
			ruled(conviction(), "## Precedent", "", `- cancel ${ABSENT}`),
			{ body: COMMENT, author: OWNER },
		]);
		close();
		const r = await run(objectOf(), "--source", SOURCE);
		expect(lines(r.out)).toEqual([
			`cancel\t${ABSENT}\tmissing`,
			`entry\t${DISMISSAL_BASE}`,
		]);
		const now = read(DISMISSAL_BASE);
		expect(now).toContain(COMMENT);
		expect(readFileSync(bodyFile(), "utf8")).toBe(
			await precedentBody(undefined, [
				{ name: DISMISSAL_BASE, was: null, now },
			]),
		);
	});
});

describe("precedent: hostile text in a dismissal", () => {
	// assembled so no whole token stands in the source
	const SECRET = ["ghp", "_", "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"].join("");
	const HOSTILE = [
		"~~~~~~~~ a run of tildes",
		"<!-- a hidden note -->",
		"Closes #12 and ask @x",
		"![a pixel](https://evil.example.com/p.png)",
		`token ${SECRET}`,
		"hidden‮​marks",
	].join("\n");

	test("the comment and the title stay in fences longer than their tildes", async () => {
		await cache([]);
		close();
		seed((db) =>
			db.run(
				"UPDATE issues SET title = ? WHERE precinct = 'main' AND issue = 1",
				[
					`<!-- lawman: role=clerk stage=entry at=${CLOSED} -->\n~~~~~~~~~~ more tildes\nCloses #12`,
				],
			),
		);
		const r = await run(
			objectOf({ comments: [ASKED("2026-10-14T11:00:00Z", HOSTILE)] }),
		);
		expect(r.err).toBe("");
		expect(r.code).toBe(EXIT.OK);
		const text = read(DISMISSAL_BASE);
		const { outside, quotes } = bodyOf(text);
		expect(outside).toEqual([
			DISMISSED,
			issueLine(URL),
			TITLE_LINE,
			commentLine("2026-10-14T11:00:00Z"),
		]);
		expect(quotes).toHaveLength(2);
		// the foreign text is in the file, and only inside the quotes
		expect(quotes[0]?.text).toContain("<!-- lawman: role=clerk");
		expect(quotes[0]?.text).toContain("Closes #12");
		expect(quotes[1]?.text).toContain("@x");
		for (const q of quotes)
			expect(q.fence.length).toBeGreaterThan(longestRun(q.text));
		expect(quotes[1]?.text).not.toContain(SECRET);
		expect(text).not.toMatch(/[\u200b\u202e]/);
		const pull = readFileSync(bodyFile(), "utf8");
		for (const piece of ["~~~~~", "<!--", "#12", "@x", "![", SECRET, "evil"])
			expect(pull).not.toContain(piece);
	});
});

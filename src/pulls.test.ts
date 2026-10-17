import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/pulls.json";
import { readPulls } from "./pulls";
import {
	BOT,
	type Comment,
	page,
	REPO,
	type Reactions,
	SPEC,
} from "./pulls-fixture";
import { mark } from "./test-helpers";

const read = (pages: unknown, repo = REPO) =>
	readPulls(JSON.stringify(pages), BOT, repo);
const voteOf = (comments: Comment[]) =>
	read([page([{ number: 1, comments }])])[0]?.spec;
const spec = (r: Reactions): Comment => ({ body: `Spec\n\n${SPEC}`, ...r });

function rejects(input: string, why: RegExp): void {
	expect(() => readPulls(input, BOT, REPO)).toThrow(why);
}

describe("readPulls validity", () => {
	test("stdin that is not JSON or not an array is rejected", () => {
		rejects("{", /not valid JSON/);
		rejects("{}", /not a JSON array/);
		rejects("[]", /no page/);
	});

	test("a page with errors, or without the pull request list, is rejected", () => {
		rejects(JSON.stringify([{ ...page([]), errors: [] }]), /errors/);
		rejects(JSON.stringify([{ data: { repository: {} } }]), /nodes/);
		rejects(JSON.stringify([{ data: null }]), /nodes/);
		rejects(JSON.stringify([page([]), "x"]), /nodes/);
	});

	test("a last page that has a next page is rejected", () => {
		rejects(JSON.stringify([page([], { next: true })]), /hasNextPage/);
		rejects(
			JSON.stringify([page([], { next: false }), page([], { next: true })]),
			/hasNextPage/,
		);
	});

	test("more than one page of collaborators is rejected on any page", () => {
		rejects(JSON.stringify([page([], { collabNext: true })]), /collaborators/);
		rejects(
			JSON.stringify([page([], { next: true, collabNext: true }), page([])]),
			/collaborators/,
		);
	});

	test("a pull request without an integer number is rejected", () => {
		const bad = page([]);
		bad.data.repository.pullRequests.nodes = [{ number: "7" } as never];
		rejects(JSON.stringify([bad]), /number/);
	});

	test("a well-formed list with no pull requests reads as no rows", () => {
		expect(read([page([])])).toEqual([]);
	});

	test("the committed fixture reads across two pages", () => {
		expect(readPulls(JSON.stringify(fixture), BOT, REPO)).toEqual([
			{ number: 7, issues: "3,4,5", spec: "up" },
			{ number: 12, issues: "", spec: "none" },
		]);
	});
});

describe("readPulls rows", () => {
	test("only pull requests of the author enter, ignoring ASCII case", () => {
		const rows = read([
			page([
				{ number: 1, author: "Lawman-Bot" },
				{ number: 2, author: "stranger" },
				{ number: 3, author: "lawman-bot" },
			]),
			page([{ number: 4 }]),
		]);
		expect(rows.map((r) => r.number)).toEqual([1, 3, 4]);
	});

	test("a pull request with no link keeps an empty issues string", () => {
		expect(read([page([{ number: 1 }])])[0]?.issues).toBe("");
	});

	test("a reference to another repository is dropped, the own one ignores case", () => {
		const issues = read([
			page([
				{
					number: 1,
					refs: [
						[5, "acme/widgets"],
						[2, "O/Main"],
					],
				},
			]),
		])[0]?.issues;
		expect(issues).toBe("2");
	});

	test("references and fingerprint sources merge ascending without repeats", () => {
		const body = [
			"text",
			"<!-- pipeline-work-fingerprint: a-1 sources=#12,#3 -->",
			"<!-- pipeline-work-fingerprint: b-2 sources=#3,#40 -->",
		].join("\n");
		const issues = read([
			page([
				{
					number: 1,
					body,
					refs: [
						[12, REPO],
						[7, REPO],
					],
				},
			]),
		])[0]?.issues;
		expect(issues).toBe("3,7,12,40");
	});

	test("a fingerprint line that is not exact is ignored", () => {
		const lines = [
			" <!-- pipeline-work-fingerprint: a-1 sources=#1 -->",
			"<!-- pipeline-work-fingerprint: A sources=#2 -->",
			"<!-- pipeline-work-fingerprint: a sources=#3, #4 -->",
			"<!-- pipeline-work-fingerprint: a sources=3 -->",
			"<!-- pipeline-work-fingerprint: a sources=#5 --> tail",
		];
		expect(
			read([page([{ number: 1, body: lines.join("\n") }])])[0]?.issues,
		).toBe("");
	});

	test("a CRLF fingerprint line still counts", () => {
		const body = "<!-- pipeline-work-fingerprint: a sources=#6 -->\r\nmore";
		expect(read([page([{ number: 1, body }])])[0]?.issues).toBe("6");
	});

	test("a precinct repo of another case matches the reference", () => {
		const rows = read([page([{ number: 1, refs: [[2, "o/main"]] }])], "O/MAIN");
		expect(rows[0]?.issues).toBe("2");
	});
});

describe("readPulls spec vote", () => {
	test("none: no Spec comment", () => {
		expect(voteOf([])).toBe("none");
		expect(voteOf([{ body: "plain", up: ["maint-a"] }])).toBe("none");
	});

	test("waiting: a Spec comment without a decider reaction", () => {
		expect(voteOf([spec({})])).toBe("waiting");
	});

	test("up and down from one decider", () => {
		expect(voteOf([spec({ up: ["maint-a"] })])).toBe("up");
		expect(voteOf([spec({ down: ["maint-a"] })])).toBe("down");
	});

	test("one decider with both reactions gives down", () => {
		expect(voteOf([spec({ up: ["maint-a"], down: ["maint-a"] })])).toBe("down");
	});

	test("two deciders who disagree give down", () => {
		expect(voteOf([spec({ up: ["maint-a"], down: ["maint-b"] })])).toBe("down");
	});

	test("reactions of non-deciders never count", () => {
		expect(voteOf([spec({ up: ["triager", "reader", "ghost"] })])).toBe(
			"waiting",
		);
		expect(
			voteOf([spec({ up: ["maint-a"], down: ["reader", "triager"] })]),
		).toBe("up");
	});

	test("login case does not matter on either side", () => {
		expect(voteOf([spec({ up: ["MAINT-A"] })])).toBe("up");
		expect(voteOf([spec({ down: ["Maint-C"] })])).toBe("down");
	});

	test("the newest Spec marker names the comment", () => {
		const old = { ...spec({ down: ["maint-a"] }), at: "2026-10-14T09:00:00Z" };
		const fresh = { ...spec({ up: ["maint-a"] }), at: "2026-10-14T11:00:00Z" };
		expect(voteOf([fresh, old])).toBe("up");
		expect(voteOf([old, fresh])).toBe("up");
	});

	test("a Spec marker inside a fence, or by another author, is ignored", () => {
		const fenced = { body: `\`\`\`\n${SPEC}\n\`\`\``, up: ["maint-a"] };
		const foreign = { ...spec({ up: ["maint-a"] }), author: "stranger" };
		expect(voteOf([fenced])).toBe("none");
		expect(voteOf([foreign])).toBe("none");
		expect(voteOf([foreign, spec({})])).toBe("waiting");
	});

	test("an indented or quoted Spec marker is ignored", () => {
		expect(voteOf([{ body: ` ${SPEC}`, up: ["maint-a"] }])).toBe("none");
		expect(voteOf([{ body: `> ${SPEC}` }])).toBe("none");
	});

	test("other markers do not name the Spec comment", () => {
		const other = { body: mark("clerk", "handoff"), up: ["maint-a"] };
		expect(voteOf([other])).toBe("none");
	});

	test("a pull request body marker does not name the Spec comment", () => {
		const rows = read([page([{ number: 1, body: SPEC }])]);
		expect(rows[0]?.spec).toBe("none");
	});

	test("deciders come from every page", () => {
		const first = page([], { next: true, collabs: [] });
		const second = page([{ number: 1, comments: [spec({ up: ["late"] })] }], {
			collabs: [["late", "WRITE"]],
		});
		expect(read([first, second])[0]?.spec).toBe("up");
	});
});

import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/pulls.json";
import { readPulls } from "./pulls";
import {
	BOT,
	type Comment,
	FIXTURE_ROWS,
	hostPulls,
	type Pull,
	type Reactions,
	SPEC,
} from "./pulls-fixture";
import { mark } from "./test-helpers";

const read = (input: unknown) => readPulls(JSON.stringify(input), BOT);
const readOf = (pulls: Pull[], writers?: string[]) =>
	read(hostPulls(pulls, writers));
const voteOf = (comments: Comment[]) =>
	readOf([{ number: 1, comments }])[0]?.spec;
const spec = (r: Reactions): Comment => ({ body: `Spec\n\n${SPEC}`, ...r });

function rejects(input: string, why: RegExp): void {
	expect(() => readPulls(input, BOT)).toThrow(why);
}

describe("readPulls validity", () => {
	test("stdin that is not JSON or not an object is rejected", () => {
		rejects("{", /not valid JSON/);
		rejects("[]", /not a JSON object/);
		rejects("null", /not a JSON object/);
	});

	test("writers and pulls must be lists", () => {
		rejects("{}", /writers is not a list/);
		rejects(JSON.stringify({ writers: [] }), /pulls is not a list/);
		rejects(
			JSON.stringify({ writers: {}, pulls: [] }),
			/writers is not a list/,
		);
		rejects(JSON.stringify({ writers: [7], pulls: [] }), /non-text entry/);
	});

	test("a pull request without an integer number is rejected", () => {
		const bad = { writers: [], pulls: [{ number: "7" }] };
		rejects(JSON.stringify(bad), /number/);
		rejects(JSON.stringify({ writers: [], pulls: ["x"] }), /number/);
	});

	test("a well-formed list with no pull requests reads as no rows", () => {
		expect(readOf([])).toEqual([]);
	});

	test("the committed fixture reads", () => {
		expect(readPulls(JSON.stringify(fixture), BOT)).toEqual(FIXTURE_ROWS);
	});
});

describe("readPulls rows", () => {
	test("only pull requests of the author enter, ignoring ASCII case", () => {
		const rows = readOf([
			{ number: 1, author: "Lawman-Bot" },
			{ number: 2, author: "stranger" },
			{ number: 3, author: "lawman-bot" },
			{ number: 4 },
		]);
		expect(rows.map((r) => r.number)).toEqual([1, 3, 4]);
	});

	test("a pull request with no link keeps an empty issues string", () => {
		expect(readOf([{ number: 1 }])[0]?.issues).toBe("");
	});

	test("closes names the issues, ascending", () => {
		expect(readOf([{ number: 1, closes: [12, 2, 7] }])[0]?.issues).toBe(
			"2,7,12",
		);
	});

	test("closes that is not a list of integers is rejected", () => {
		const bad = hostPulls([{ number: 1 }]);
		for (const closes of [null, ["2"], [1.5]]) {
			Object.assign(bad.pulls[0] as object, { closes });
			expect(() => read(bad)).toThrow(/closes/);
		}
	});

	test("closes and fingerprint sources merge ascending without repeats", () => {
		const body = [
			"text",
			"<!-- pipeline-work-fingerprint: a-1 sources=#12,#3 -->",
			"<!-- pipeline-work-fingerprint: b-2 sources=#3,#40 -->",
		].join("\n");
		const issues = readOf([{ number: 1, body, closes: [12, 7] }])[0]?.issues;
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
		expect(readOf([{ number: 1, body: lines.join("\n") }])[0]?.issues).toBe("");
	});

	test("a CRLF fingerprint line still counts", () => {
		const body = "<!-- pipeline-work-fingerprint: a sources=#6 -->\r\nmore";
		expect(readOf([{ number: 1, body }])[0]?.issues).toBe("6");
	});
});

describe("readPulls times", () => {
	const withTime = (change: object) => {
		const input = hostPulls([{ number: 1, comments: [spec({})] }]);
		Object.assign(input.pulls[0]?.comments[0] as object, change);
		return input;
	};

	test("a comment time is normalised to UTC seconds", () => {
		const input = withTime({ createdAt: "2026-10-14T12:00:00+03:00" });
		expect(read(input)[0]?.spec).toBe("waiting");
	});

	test("a comment time that is no time is rejected", () => {
		for (const createdAt of ["yesterday", "", null, 5])
			expect(() => read(withTime({ createdAt }))).toThrow(/is not a time/);
	});

	test("a review time that is no time is rejected", () => {
		const input = hostPulls([{ number: 1 }]);
		Object.assign(input.pulls[0] as object, {
			changesRequested: [{ login: "maint-a", at: "soon" }],
		});
		expect(() => read(input)).toThrow(/is not a time/);
	});

	test("times in another zone order by the instant", () => {
		const old = {
			...spec({ down: ["maint-a"] }),
			at: "2026-10-14T12:00:00+03:00",
		};
		const fresh = { ...spec({ up: ["maint-a"] }), at: "2026-10-14T10:00:00Z" };
		expect(voteOf([old, fresh])).toBe("up");
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
		const rows = readOf([{ number: 1, body: SPEC }]);
		expect(rows[0]?.spec).toBe("none");
	});

	test("a writer named in any case counts", () => {
		const comments = [spec({ up: ["late"] })];
		expect(readOf([{ number: 1, comments }], ["LATE"])[0]?.spec).toBe("up");
	});
});

import { beforeEach, describe, expect, test } from "bun:test";
import {
	addPrecincts,
	caseMark,
	cli,
	conviction,
	dbFile,
	issuesForm,
	mark,
	rows,
	SHA,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const WRITER = "maintainer-fictional";
const OUTSIDER = "passerby-fictional";
const referral = () => mark("court", "referral", ` sha=${SHA}`);
const acquittal = () => mark("court", "acquittal");

type Spec = {
	at: number;
	by?: string;
	body?: string;
	up?: string[];
	down?: string[];
};

// A comment `at` hours after midnight; the id says which comment it is.
const comment = (s: Spec) => ({
	id: `IC_${s.at}`,
	author: { login: s.by ?? TRUSTED },
	body: s.body ?? "",
	createdAt: `2026-10-14T${String(s.at).padStart(2, "0")}:00:00Z`,
	approvedBy: s.up ?? [],
	rejectedBy: s.down ?? [],
});

beforeEach(() => addPrecincts({ main: 1 }));

const answerOf = (comments: Spec[], writers = [WRITER], state = "OPEN") => {
	const form = issuesForm(
		[
			{
				number: 1,
				state,
				createdAt: "2026-10-14T01:00:00Z",
				author: { login: "reporter-fictional" },
				comments: comments.map(comment),
			},
		],
		writers,
	);
	const r = cli(
		["sync", "main", "--author", TRUSTED],
		{ LAWMAN_DB: dbFile },
		JSON.stringify(form),
	);
	expect(r.code).toBe(0);
	const [row] = rows("SELECT answer, answer_id FROM issues WHERE issue = 1");
	return [row?.answer, row?.answer_id];
};

const REFERRED: Spec = { at: 10, body: referral() };
const NONE = [null, null];

describe("sync derives the answer", () => {
	test("a thumbs up of a writer on the referral is up", () => {
		expect(answerOf([{ ...REFERRED, up: [WRITER] }])).toEqual(["up", "-"]);
	});

	test("a thumbs down of a writer on the referral is down", () => {
		expect(answerOf([{ ...REFERRED, down: [WRITER] }])).toEqual(["down", "-"]);
	});

	test("a comment of a writer after the referral is comment, with its id", () => {
		const reply = { at: 12, by: WRITER, body: "do it" };
		expect(answerOf([REFERRED, reply])).toEqual(["comment", "IC_12"]);
	});

	test("the newest decider comment gives the id", () => {
		const first = { at: 12, by: WRITER, body: "one" };
		const second = { at: 14, by: WRITER, body: "two" };
		expect(answerOf([REFERRED, second, first])).toEqual(["comment", "IC_14"]);
	});

	test("a closed issue keeps no answer", () => {
		const reply = { at: 12, by: WRITER, body: "do it" };
		expect(answerOf([REFERRED, reply], [WRITER], "CLOSED")).toEqual(NONE);
	});

	test("an empty writer never makes an authorless comment an answer", () => {
		const ghost = { at: 12, by: "", body: "deleted account" };
		expect(answerOf([REFERRED, ghost], [WRITER, ""])).toEqual(NONE);
		expect(answerOf([{ ...REFERRED, up: [""] }], [WRITER, ""])).toEqual(NONE);
	});

	test("a role marker after the referral ends its answer", () => {
		const later = { at: 12, body: caseMark() };
		expect(answerOf([{ ...REFERRED, up: [WRITER] }, later])).toEqual(NONE);
	});

	test("no reaction and no comment gives no answer", () => {
		expect(answerOf([REFERRED])).toEqual(NONE);
	});

	test("an issue with no referral gives no answer", () => {
		const case_ = { at: 9, body: caseMark(), up: [WRITER] };
		expect(answerOf([case_, { at: 12, by: WRITER, body: "yes" }])).toEqual(
			NONE,
		);
	});

	test("a thumbs down outranks a thumbs up", () => {
		const both = {
			...REFERRED,
			up: [WRITER, "co-writer"],
			down: ["co-writer"],
		};
		expect(answerOf([both], [WRITER, "co-writer"])).toEqual(["down", "-"]);
	});

	test("a reaction outranks a comment", () => {
		const reply = { at: 12, by: WRITER, body: "do it" };
		expect(answerOf([{ ...REFERRED, up: [WRITER] }, reply])).toEqual([
			"up",
			"-",
		]);
		expect(answerOf([{ ...REFERRED, down: [WRITER] }, reply])).toEqual([
			"down",
			"-",
		]);
	});

	test("a thumb on a court comment counts wherever it stands in the thread", () => {
		const before = { at: 8, by: OUTSIDER, body: "a question" };
		const after = { at: 11, by: OUTSIDER, body: "another" };
		expect(answerOf([before, { ...REFERRED, up: [WRITER] }, after])).toEqual([
			"up",
			"-",
		]);
	});
});

describe("sync ignores what is no answer", () => {
	test("a thumb of a non-writer changes nothing", () => {
		expect(
			answerOf([{ ...REFERRED, up: [OUTSIDER], down: [OUTSIDER] }]),
		).toEqual(NONE);
	});

	test("a comment of a non-writer changes nothing", () => {
		expect(answerOf([REFERRED, { at: 12, by: OUTSIDER, body: "yes" }])).toEqual(
			NONE,
		);
	});

	test("a thumb named in a comment body changes nothing", () => {
		const body = `👍 approvedBy: ["${WRITER}"] writers: ["${OUTSIDER}"]`;
		expect(answerOf([REFERRED, { at: 12, by: OUTSIDER, body }])).toEqual(NONE);
	});

	test("a comment that holds a marker line changes nothing", () => {
		const body = `go ahead\n${mark("clerk", "entry")}`;
		expect(answerOf([REFERRED, { at: 12, by: WRITER, body }])).toEqual(NONE);
	});

	test("a comment before the referral changes nothing", () => {
		expect(answerOf([{ at: 8, by: WRITER, body: "early" }, REFERRED])).toEqual(
			NONE,
		);
	});

	test("a thumb on a comment that is no court comment changes nothing", () => {
		const other = { at: 9, body: caseMark(), up: [WRITER] };
		expect(answerOf([other, REFERRED])).toEqual(NONE);
	});

	test("a thumb on an older court comment counts for the newest referral", () => {
		const older = { at: 8, body: referral(), up: [WRITER] };
		expect(answerOf([older, REFERRED])).toEqual(["up", "-"]);
		expect(answerOf([older, { ...REFERRED, down: [WRITER] }])).toEqual([
			"down",
			"-",
		]);
	});

	test("a comment between two referrals does not answer the newer one", () => {
		const between = { at: 9, by: WRITER, body: "answer to the first" };
		expect(answerOf([{ at: 8, body: referral() }, between, REFERRED])).toEqual(
			NONE,
		);
	});

	test("a ruling after the referral ends the answer", () => {
		const convicted = { at: 14, body: conviction() };
		const reply = { at: 12, by: WRITER, body: "do it" };
		expect(answerOf([{ ...REFERRED, up: [WRITER] }, reply, convicted])).toEqual(
			NONE,
		);
		expect(
			answerOf([
				{ ...REFERRED, up: [WRITER] },
				{ at: 14, body: acquittal() },
			]),
		).toEqual(NONE);
	});
});

describe("sync reads deciders by login", () => {
	test("a writer in mixed case counts for a reactor in lower case", () => {
		expect(
			answerOf([{ ...REFERRED, up: [WRITER] }], ["Maintainer-Fictional"]),
		).toEqual(["up", "-"]);
	});

	test("a reactor in mixed case counts for a writer in lower case", () => {
		expect(answerOf([{ ...REFERRED, down: ["MAINTAINER-fictional"] }])).toEqual(
			["down", "-"],
		);
	});

	test("a comment of the trusted login with no marker line counts when it is a writer", () => {
		const plain = { at: 12, body: "my decision" };
		expect(answerOf([REFERRED, plain], [TRUSTED.toUpperCase()])).toEqual([
			"comment",
			"IC_12",
		]);
		expect(answerOf([REFERRED, plain], [WRITER])).toEqual(NONE);
	});
});

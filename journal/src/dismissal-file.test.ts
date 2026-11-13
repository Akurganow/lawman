import { describe, expect, test } from "bun:test";
import type { CheckComment, CheckObject } from "./decider";
import {
	commentLine,
	DISMISSED,
	type DismissalFacts,
	dismissalFile,
	issueLine,
	NO_COMMENT,
	TITLE_LINE,
	verdictLine,
} from "./dismissal-file";
import { parseMarker } from "./markers";
import { headerOf, splitPrecedent } from "./precedent-file";

const OWNER = "Owner";
const URL = "https://example.test/o/r/issues/12";
const FINDING = "tests::dead-code::src/a.ts";
const CLOSED = "2026-11-12T10:30:00Z";
const NOTICE = "The owner keeps this on purpose.";

const objectComment = (
	at: string,
	body: string,
	author = OWNER,
): CheckComment => ({ author, createdAt: at, body });

const checked = (
	comments: CheckComment[] = [],
	actor: string | null = OWNER,
	writers: string[] = [OWNER.toLowerCase()],
): CheckObject => ({ actor, writers, comments });

const facts = (over: Partial<DismissalFacts> = {}): DismissalFacts => ({
	issue: 12,
	url: URL,
	title: "Dead code in the parser",
	leadId: FINDING,
	department: "tests",
	closedAt: CLOSED,
	ruling: null,
	thread: [],
	object: checked(),
	...over,
});

const cached = (at: string, body: string, author: string | null = OWNER) => ({
	author,
	at,
	body,
});

const ACQUITTAL = (words: string) =>
	`## Verdict\n\n${words}\n\n## Rule\n\nnone\n`;

async function written(over: Partial<DismissalFacts> = {}) {
	const result = await dismissalFile(facts(over));
	if ("reason" in result) throw new Error(`no file: ${result.reason}`);
	return result;
}

function headerFields(text: string): Record<string, unknown> {
	const split = splitPrecedent(text);
	if (split === null) throw new Error("no header");
	const lines = split.header.split("\n");
	return Bun.YAML.parse(lines.slice(1, -1).join("\n")) as Record<
		string,
		unknown
	>;
}

// the body read as a reader would: lines outside the fences, and the text of each fence
function bodyOf(text: string) {
	const split = splitPrecedent(text);
	if (split === null) throw new Error("no header");
	const lines = split.body.trim().split("\n");
	const outside: string[] = [];
	const quotes: { fence: string; text: string }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		if (!/^~{3,}$/.test(line)) {
			outside.push(line);
			continue;
		}
		const inner: string[] = [];
		i++;
		while (
			i < lines.length &&
			!(
				/^ {0,3}~+\s*$/.test(lines[i] as string) &&
				(lines[i] as string).trim().length >= line.length
			)
		)
			inner.push(lines[i++] as string);
		if (i >= lines.length) throw new Error("a fence never closes");
		expect((lines[i] as string).trim()).toBe(line);
		quotes.push({ fence: line, text: inner.join("\n") });
	}
	return { outside, quotes };
}

describe("the header and the name", () => {
	test("the fields come in order and the file reads back as a dismissal", async () => {
		const { base, text } = await written();
		expect(base).toBe("2026-11-12-dismissal-issue-12");
		expect(Object.keys(headerFields(text))).toEqual([
			"kind",
			"departments",
			"issue",
			"date",
			"finding",
		]);
		expect(headerFields(text)).toEqual({
			kind: "dismissal",
			departments: ["tests"],
			issue: 12,
			date: "2026-11-12",
			finding: FINDING,
		});
		expect(headerOf(text)).toEqual({
			kind: "dismissal",
			departments: ["tests"],
			finding: FINDING,
			issue: 12,
		});
	});

	test("a department outside its class gives an empty list", async () => {
		const { text } = await written({ department: "-" });
		expect(headerFields(text).departments).toEqual([]);
		const odd = await written({ department: "Not A Department" });
		expect(headerFields(odd.text).departments).toEqual([]);
	});

	test("the date is the UTC date of the close", async () => {
		const { base, text } = await written({
			closedAt: "2026-11-13T01:30:00+03:00",
		});
		expect(base).toBe("2026-11-12-dismissal-issue-12");
		expect(headerFields(text).date).toBe("2026-11-12");
	});

	test("the body runs in order: sentence, issue, title, one varying part", async () => {
		const { text } = await written({
			thread: [cached("2026-11-12T09:00:00Z", NOTICE)],
		});
		const { outside, quotes } = bodyOf(text);
		expect(outside).toEqual([
			DISMISSED,
			"",
			issueLine(URL),
			"",
			TITLE_LINE,
			"",
			commentLine("2026-11-12T09:00:00Z"),
		]);
		expect(quotes.map((q) => q.text)).toEqual([
			"Dead code in the parser",
			NOTICE,
		]);
	});
});

describe("which part varies", () => {
	test("no comment gives the fallback sentence alone", async () => {
		const { text } = await written();
		const { outside, quotes } = bodyOf(text);
		expect(outside.at(-1)).toBe(NO_COMMENT);
		expect(
			outside.some((l) => l.startsWith("The comment of the decider")),
		).toBe(false);
		expect(quotes).toHaveLength(1);
	});

	test("an acquittal quotes its Verdict and ignores the object", async () => {
		const ruling = {
			stage: "acquittal",
			text: ACQUITTAL("The code is used by the loader."),
			at: "2026-11-11T08:00:00Z",
			url: "https://example.test/o/r/issues/12#issuecomment-1",
		};
		const { text, cites } = await written({
			ruling,
			// no decider closed it: an acquittal asks for none
			object: checked([], null, []),
			thread: [cached("2026-11-12T09:00:00Z", NOTICE)],
		});
		expect(cites).toBe(true);
		const { outside, quotes } = bodyOf(text);
		expect(outside).toContain(verdictLine("2026-11-11T08:00:00Z"));
		expect(
			outside.some((l) => l.startsWith("The comment of the decider")),
		).toBe(false);
		expect(outside).not.toContain(NO_COMMENT);
		expect(quotes[1]?.text).toBe("The code is used by the loader.");
		expect(headerFields(text).ruling).toBe(ruling.url);
	});

	test("an acquittal without a ruling URL has no ruling field", async () => {
		const { text } = await written({
			ruling: {
				stage: "acquittal",
				text: ACQUITTAL("Used."),
				at: "2026-11-11T08:00:00Z",
				url: null,
			},
			object: null,
		});
		expect(headerFields(text)).not.toHaveProperty("ruling");
		expect(bodyOf(text).quotes[1]?.text).toBe("Used.");
	});

	test("an acquittal with no Verdict words has no varying part and no ruling field", async () => {
		const { text, cites } = await written({
			ruling: {
				stage: "acquittal",
				text: "## Verdict\n\nnone\n",
				at: "2026-11-11T08:00:00Z",
				url: "https://example.test/o/r/issues/12#issuecomment-1",
			},
			object: null,
			thread: [cached("2026-11-12T09:00:00Z", NOTICE)],
		});
		const { outside, quotes } = bodyOf(text);
		expect(outside).toEqual([DISMISSED, "", issueLine(URL), "", TITLE_LINE]);
		expect(cites).toBe(false);
		expect(quotes).toHaveLength(1);
		expect(headerFields(text)).not.toHaveProperty("ruling");
	});

	test("a ruling that is not an acquittal leaves the comment route", async () => {
		const { text } = await written({
			ruling: {
				stage: "conviction",
				text: ACQUITTAL("Words that must not be quoted."),
				at: "2026-11-11T08:00:00Z",
				url: "https://example.test/o/r/issues/12#issuecomment-1",
			},
			thread: [cached("2026-11-12T09:00:00Z", NOTICE)],
		});
		expect(bodyOf(text).quotes[1]?.text).toBe(NOTICE);
		expect(headerFields(text)).not.toHaveProperty("ruling");
	});
});

describe("the closer's comment", () => {
	const at = (h: number) => `2026-11-12T${String(h).padStart(2, "0")}:00:00Z`;
	const CLERK = `<!-- lawman: role=clerk stage=entry at=${at(8)} -->`;
	const PATROL = `<!-- lawman: role=patrol stage=entry at=${at(8)} -->`;

	async function quoted(over: Partial<DismissalFacts>) {
		const { text } = await written(over);
		const { quotes } = bodyOf(text);
		return quotes[1]?.text ?? null;
	}

	test("the comment of another writer is not quoted", async () => {
		const thread = [cached(at(9), NOTICE, "Intruder")];
		expect(await quoted({ thread })).toBeNull();
	});

	test("a comment of the closer is matched ignoring ASCII case", async () => {
		const thread = [cached(at(9), NOTICE, "OWNER")];
		expect(await quoted({ thread })).toBe(NOTICE);
	});

	test("a comment with a marker line is not quoted", async () => {
		const thread = [cached(at(9), `${NOTICE}\n${PATROL}`)];
		const { text } = await written({ thread });
		expect(bodyOf(text).outside.at(-1)).toBe(NO_COMMENT);
		expect(text).not.toContain(NOTICE);
	});

	test("a comment that another author's comment follows is not quoted", async () => {
		const thread = [cached(at(9), NOTICE), cached(at(10), "Why?", "Intruder")];
		expect(await quoted({ thread })).toBeNull();
	});

	test("a comment that only clerk markers follow is quoted", async () => {
		const thread = [
			cached(at(9), NOTICE),
			cached(at(10), CLERK, "Bot"),
			cached(at(11), `Some words\n${CLERK}`, "Bot"),
		];
		expect(await quoted({ thread })).toBe(NOTICE);
	});

	test("an earlier comment is not quoted when a newer one of the closer stands", async () => {
		const thread = [cached(at(9), "older"), cached(at(10), NOTICE)];
		expect(await quoted({ thread })).toBe(NOTICE);
	});

	test("a newer comment with a marker of another role leaves nothing to quote", async () => {
		const thread = [cached(at(9), NOTICE), cached(at(10), PATROL)];
		expect(await quoted({ thread })).toBeNull();
	});

	test("of the two threads the newer candidate is quoted", async () => {
		const newerInObject = await quoted({
			thread: [cached(at(9), "from the cache")],
			object: checked([objectComment(at(10), "from the object")]),
		});
		expect(newerInObject).toBe("from the object");
		const newerInCache = await quoted({
			thread: [cached(at(11), "from the cache")],
			object: checked([objectComment(at(10), "from the object")]),
		});
		expect(newerInCache).toBe("from the cache");
	});

	test("at equal times the comment of the object is quoted", async () => {
		const got = await quoted({
			thread: [cached(at(9), "from the cache")],
			object: checked([objectComment(at(9), "from the object")]),
		});
		expect(got).toBe("from the object");
	});

	test("a thread with no candidate leaves the other thread's candidate", async () => {
		const got = await quoted({
			thread: [
				cached(at(9), "from the cache"),
				cached(at(10), "x", "Intruder"),
			],
			object: checked([objectComment(at(8), "from the object")]),
		});
		expect(got).toBe("from the object");
	});

	test("the comments of the object are quoted", async () => {
		const got = await quoted({
			object: checked([
				objectComment(at(9), "other", "Intruder"),
				objectComment(at(10), NOTICE),
			]),
		});
		expect(got).toBe(NOTICE);
	});

	test("a text the cache withheld stands as stored", async () => {
		const stored = "This text could not be cleaned and is withheld.";
		expect(await quoted({ thread: [cached(at(9), stored)] })).toBe(stored);
	});

	test("a comment of the cache without an author is no candidate", async () => {
		expect(await quoted({ thread: [cached(at(9), NOTICE, null)] })).toBeNull();
	});
});

describe("the decider", () => {
	test("an actor outside the writers gives no-decider and no file", async () => {
		const got = await dismissalFile(
			facts({ object: checked([], "Intruder", ["owner"]) }),
		);
		expect(got).toEqual({ reason: "no-decider" });
	});

	test("a null actor gives no-decider", async () => {
		const got = await dismissalFile(
			facts({ object: checked([], null, ["owner"]) }),
		);
		expect(got).toEqual({ reason: "no-decider" });
	});

	test("the actor is compared with the writers ignoring ASCII case", async () => {
		const got = await dismissalFile(
			facts({ object: checked([], "OWNER", ["owner"]) }),
		);
		expect("reason" in got).toBe(false);
	});

	test("the comment route without the object is a caller error", async () => {
		await expect(dismissalFile(facts({ object: null }))).rejects.toThrow();
	});
});

describe("the hostile sample", () => {
	const TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;
	const LONG_RUN = "~".repeat(9);
	const MARKER =
		"<!-- lawman: role=patrol stage=entry at=2026-11-12T08:00:00Z -->";
	const hostile = (extra = "") =>
		[
			"start",
			LONG_RUN,
			`inline ${LONG_RUN} run`,
			"<!-- hidden note -->",
			"see #12 and @x",
			"![pic](https://example.test/x.png)",
			"zero​width and ‮flip",
			`token ${TOKEN}`,
			extra,
			"end",
		].join("\n");
	test("a stored comment with a line of tildes stays inside a longer fence", async () => {
		const stored = `before\n${LONG_RUN}\nafter ${LONG_RUN}\n~~~`;
		const { text } = await written({
			thread: [cached("2026-11-12T09:00:00Z", stored)],
		});
		const { outside, quotes } = bodyOf(text);
		expect(quotes[1]?.text).toBe(stored);
		expect(quotes[1]?.fence.length).toBeGreaterThan(9);
		expect(outside.at(-1)).toBe(commentLine("2026-11-12T09:00:00Z"));
	});

	test("a marker line as text inside a longer comment keeps the comment out of the file", async () => {
		expect(parseMarker(MARKER)).not.toBeNull();
		const { text } = await written({
			object: checked([objectComment("2026-11-12T09:00:00Z", hostile(MARKER))]),
		});
		const { outside, quotes } = bodyOf(text);
		expect(outside.at(-1)).toBe(NO_COMMENT);
		expect(quotes).toHaveLength(1);
		expect(text).not.toContain("hidden note");
		expect(text).not.toContain(MARKER);
	});
});

import { describe, expect, test } from "bun:test";
import { readPulls } from "./pulls";
import {
	BOT,
	type Comment,
	page,
	READY,
	REPO,
	type Review,
	SPEC,
} from "./pulls-fixture";

const SPEC_AT = "2026-10-14T09:00:00Z";
const READY_AT = "2026-10-14T11:00:00Z";
const BEFORE = "2026-10-14T10:00:00Z";
const AFTER = "2026-10-14T12:00:00Z";

const spec = (extra: Partial<Comment> = {}): Comment => ({
	body: `Spec\n\n${SPEC}`,
	id: "SPEC_1",
	at: SPEC_AT,
	up: ["maint-a"],
	...extra,
});
const ready = (extra: Partial<Comment> = {}): Comment => ({
	body: `Executor\n\n${READY}`,
	id: "READY_1",
	at: READY_AT,
	...extra,
});
const review = (state: string, at: string, author = "maint-a"): Review => ({
	state,
	at,
	author,
});

function rowOf(comments: Comment[], reviews: Review[] = []) {
	const pages = [page([{ number: 1, comments, reviews }])];
	return readPulls(JSON.stringify(pages), BOT, REPO)[0];
}
const workOf = (comments: Comment[], reviews: Review[] = []) =>
	rowOf(comments, reviews)?.work;

describe("readPulls spec_id", () => {
	test("the id of the newest counted Spec comment", () => {
		const newer = spec({ id: "SPEC_2", at: AFTER });
		expect(rowOf([spec(), newer])?.spec_id).toBe("SPEC_2");
		expect(rowOf([newer, spec()])?.spec_id).toBe("SPEC_2");
	});

	test("a dash when no Spec comment counts", () => {
		expect(rowOf([])?.spec_id).toBe("-");
		expect(rowOf([ready()])?.spec_id).toBe("-");
		expect(rowOf([spec({ author: "stranger" })])?.spec_id).toBe("-");
	});
});

describe("readPulls work without a return", () => {
	test("todo when there is no executor marker", () => {
		expect(workOf([spec()])).toBe("todo");
	});

	test("todo when there is no Spec at all", () => {
		expect(workOf([ready()])).toBe("todo");
	});

	test("todo when the executor marker is older than the Spec", () => {
		expect(workOf([ready({ at: "2026-10-14T08:00:00Z" }), spec()])).toBe(
			"todo",
		);
	});

	test("a marker with the same time counts by comment order", () => {
		expect(workOf([spec({ at: READY_AT }), ready()])).toBe("ready");
		expect(workOf([ready(), spec({ at: READY_AT })])).toBe("todo");
	});

	test("todo when a newer Spec follows the executor marker", () => {
		const fresh = spec({ id: "SPEC_2", at: AFTER });
		expect(workOf([spec(), ready(), fresh])).toBe("todo");
	});

	test("ready when a counted executor marker follows the Spec", () => {
		expect(workOf([spec(), ready()])).toBe("ready");
	});

	test("an executor marker of another author does not count", () => {
		expect(workOf([spec(), ready({ author: "stranger" })])).toBe("todo");
	});

	test("an executor marker of another stage does not count", () => {
		const other = ready({
			body: `Executor\n\n${READY.replace("ready", "done")}`,
		});
		expect(workOf([spec(), other])).toBe("todo");
	});
});

describe("readPulls work returned by a thumbs down", () => {
	test("a decider thumbs down on the executor comment returns it", () => {
		expect(workOf([spec(), ready({ down: ["maint-b"] })])).toBe("returned");
	});

	test("a thumbs down of a non-decider does not return it", () => {
		const down = ["triager", "reader", "stranger"];
		expect(workOf([spec(), ready({ down })])).toBe("ready");
	});

	test("a thumbs up on the executor comment does not return it", () => {
		expect(workOf([spec(), ready({ up: ["maint-a"] })])).toBe("ready");
	});

	test("a thumbs down on an older executor comment does not return it", () => {
		const old = ready({ id: "READY_0", at: BEFORE, down: ["maint-a"] });
		expect(workOf([spec(), old, ready()])).toBe("ready");
	});

	test("login case does not matter for the thumbs down", () => {
		expect(workOf([spec(), ready({ down: ["MAINT-A"] })])).toBe("returned");
	});
});

describe("readPulls work returned by a review", () => {
	const after = (state: string, author?: string) => [
		review(state, AFTER, author),
	];
	const run = (reviews: Review[]) => workOf([spec(), ready()], reviews);

	test("Request changes of a decider after the marker returns it", () => {
		expect(run(after("CHANGES_REQUESTED"))).toBe("returned");
	});

	test("the review is not compared with any commit", () => {
		expect(run(after("CHANGES_REQUESTED", "maint-c"))).toBe("returned");
	});

	test("Request changes from before the marker does not return it", () => {
		expect(run([review("CHANGES_REQUESTED", BEFORE)])).toBe("ready");
	});

	test("Request changes at the exact time of the marker does not return it", () => {
		expect(run([review("CHANGES_REQUESTED", READY_AT)])).toBe("ready");
	});

	test("Request changes of a non-decider does not return it", () => {
		expect(run(after("CHANGES_REQUESTED", "triager"))).toBe("ready");
		expect(run(after("CHANGES_REQUESTED", "stranger"))).toBe("ready");
	});

	test("DISMISSED, APPROVED and COMMENTED reviews do not return it", () => {
		expect(run(after("DISMISSED"))).toBe("ready");
		expect(run(after("APPROVED"))).toBe("ready");
		expect(run(after("COMMENTED"))).toBe("ready");
	});

	test("login case does not matter for the review", () => {
		expect(run(after("CHANGES_REQUESTED", "Maint-A"))).toBe("returned");
	});

	test("the review also returns work the thumbs down did not", () => {
		const reviews = [
			review("APPROVED", AFTER, "maint-b"),
			review("CHANGES_REQUESTED", AFTER),
		];
		expect(run(reviews)).toBe("returned");
	});

	test("a review after R with no executor marker leaves work todo", () => {
		expect(workOf([spec()], after("CHANGES_REQUESTED"))).toBe("todo");
	});
});

describe("readPulls sync input checks", () => {
	const read = (pages: unknown[]) =>
		readPulls(JSON.stringify(pages), BOT, REPO);
	const withReviews = (latestOpinionatedReviews: unknown) => {
		const bad = page([{ number: 1 }]);
		Object.assign(bad.data.repository.pullRequests.nodes[0] as object, {
			latestOpinionatedReviews,
		});
		return bad;
	};

	test("a pull request of the author without the review nodes is rejected", () => {
		const missing = page([{ number: 1, noReviews: true }]);
		for (const bad of [missing, withReviews({}), withReviews(null)])
			expect(() => read([bad])).toThrow(/latestOpinionatedReviews/);
	});

	test("a comment without an id is rejected", () => {
		const bad = page([{ number: 1, comments: [spec({ noId: true })] }]);
		const empty = page([{ number: 1, comments: [spec({ id: "" })] }]);
		expect(() => read([bad])).toThrow(/comment has no id/);
		expect(() => read([empty])).toThrow(/comment has no id/);
	});

	test("a comment of another author without an id is rejected too", () => {
		const bad = page([
			{ number: 1, comments: [{ body: "hi", author: "x", noId: true }] },
		]);
		expect(() => read([bad])).toThrow(/comment has no id/);
	});

	test("a pull request of another author is skipped without either field", () => {
		const other = page([
			{
				number: 2,
				author: "stranger",
				noReviews: true,
				comments: [{ body: "hi", noId: true }],
			},
			{ number: 3 },
		]);
		expect(read([other]).map((r) => r.number)).toEqual([3]);
	});
});

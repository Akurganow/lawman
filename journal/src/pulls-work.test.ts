import { describe, expect, test } from "bun:test";
import { readPulls } from "./pulls";
import {
	BOT,
	type Comment,
	hostPulls,
	READY,
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
const review = (at: string, author = "maint-a"): Review => ({ at, author });

function rowOf(comments: Comment[], reviews: Review[] = []) {
	const input = hostPulls([{ number: 1, comments, reviews }]);
	return readPulls(JSON.stringify(input), BOT)[0];
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
	const after = (author?: string) => [review(AFTER, author)];
	const run = (reviews: Review[]) => workOf([spec(), ready()], reviews);

	test("Request changes of a writer after the marker returns it", () => {
		expect(run(after())).toBe("returned");
	});

	test("the review is not compared with any commit", () => {
		expect(run(after("maint-c"))).toBe("returned");
	});

	test("Request changes from before the marker does not return it", () => {
		expect(run([review(BEFORE)])).toBe("ready");
	});

	test("Request changes at the exact time of the marker does not return it", () => {
		expect(run([review(READY_AT)])).toBe("ready");
	});

	test("the same instant in another zone does not return it either", () => {
		expect(run([review("2026-10-14T14:00:00+03:00")])).toBe("ready");
		expect(run([review("2026-10-14T14:00:01+03:00")])).toBe("returned");
	});

	test("Request changes of a non-writer does not return it", () => {
		expect(run(after("triager"))).toBe("ready");
		expect(run(after("stranger"))).toBe("ready");
	});

	test("login case does not matter for the review", () => {
		expect(run(after("Maint-A"))).toBe("returned");
	});

	test("one old and one new request return it", () => {
		expect(run([review(BEFORE, "maint-b"), review(AFTER)])).toBe("returned");
	});

	test("a review after R with no executor marker leaves work todo", () => {
		expect(workOf([spec()], after())).toBe("todo");
	});
});

describe("readPulls sync input checks", () => {
	const read = (input: unknown) => readPulls(JSON.stringify(input), BOT);
	const patched = (change: object) => {
		const bad = hostPulls([{ number: 1, comments: [spec()] }]);
		Object.assign(bad.pulls[0] as object, change);
		return bad;
	};

	test("a pull request of the author without the review list is rejected", () => {
		for (const changesRequested of [undefined, {}, null])
			expect(() => read(patched({ changesRequested }))).toThrow(
				/changesRequested/,
			);
	});

	test("a review entry without a text login is rejected", () => {
		const bad = patched({ changesRequested: [{ login: 5, at: AFTER }] });
		expect(() => read(bad)).toThrow(/changesRequested login/);
	});

	test("a pull request of the author without the comment list is rejected", () => {
		expect(() => read(patched({ comments: null }))).toThrow(/comments/);
		expect(() => read(patched({ comments: ["x"] }))).toThrow(/not an object/);
	});

	test("a comment without an id is rejected", () => {
		const bad = hostPulls([{ number: 1, comments: [spec({ noId: true })] }]);
		const empty = hostPulls([{ number: 1, comments: [spec({ id: "" })] }]);
		expect(() => read(bad)).toThrow(/comment has no id/);
		expect(() => read(empty)).toThrow(/comment has no id/);
	});

	test("a comment whose id is a number is rejected", () => {
		const bad = patched({
			comments: [{ ...spec(), id: 12, createdAt: AFTER }],
		});
		expect(() => read(bad)).toThrow(/comment has no id/);
	});

	test("a comment of another author without an id is rejected too", () => {
		const bad = hostPulls([
			{ number: 1, comments: [{ body: "hi", author: "x", noId: true }] },
		]);
		expect(() => read(bad)).toThrow(/comment has no id/);
	});

	test("a comment without its reaction lists is rejected", () => {
		for (const field of ["approvedBy", "rejectedBy"]) {
			const bad = hostPulls([{ number: 1, comments: [spec()] }]);
			Object.assign(bad.pulls[0]?.comments[0] as object, { [field]: null });
			expect(() => read(bad)).toThrow(new RegExp(`${field} is not a list`));
		}
	});

	test("a pull request of another author is skipped without either field", () => {
		const other = hostPulls([{ number: 3 }]);
		other.pulls.unshift({
			number: 2,
			author: "stranger",
			comments: [{ body: "hi" }],
		} as never);
		expect(read(other).map((r) => r.number)).toEqual([3]);
	});
});

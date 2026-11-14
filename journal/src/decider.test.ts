import { describe, expect, test } from "bun:test";
import { EXIT, Fail } from "./db";
import { decide, decider, readCheckObject } from "./decider";
import { captured } from "./inproc";

const answer = (lastActor: unknown, writers: unknown) =>
	JSON.stringify({ lastActor, writers });

const closedBy = (login: string, writers: string[]) =>
	decide(answer(login, writers));

const rejected = (raw: string) => {
	try {
		decide(raw);
	} catch (e) {
		expect(e).toBeInstanceOf(Fail);
		expect((e as Fail).code).toBe(EXIT.SYNC_INPUT);
		return (e as Fail).message;
	}
	throw new Error("expected a Fail");
};

describe("decide", () => {
	test("a writer decides", () => {
		expect(closedBy("maint-a", ["maint-a", "maint-b"])).toBe(
			"decider=yes actor=maint-a",
		);
	});

	test("an actor who is no writer does not", () => {
		expect(closedBy("stranger", ["maint-a"])).toBe("decider=no actor=stranger");
		expect(closedBy("maint-a", [])).toBe("decider=no actor=maint-a");
	});

	test("logins compare ignoring ASCII case on both sides", () => {
		expect(closedBy("Maint-A", ["maint-a"])).toBe("decider=yes actor=Maint-A");
		expect(closedBy("maint-a", ["MAINT-A"])).toBe("decider=yes actor=maint-a");
	});

	test("no last actor is no with a dash", () => {
		expect(decide(answer(null, []))).toBe("decider=no actor=-");
		expect(decide(answer(null, ["maint-a"]))).toBe("decider=no actor=-");
	});

	test("an actor login outside the login class is rejected", () => {
		rejected(answer("bad login", []));
		rejected(answer("-lead", []));
	});

	test("bad input is rejected", () => {
		rejected("not json");
		rejected("null");
		rejected("[]");
		rejected(JSON.stringify({ writers: [] }));
		rejected(answer(5, []));
		rejected(answer("a", "maint-a"));
		rejected(answer("a", [1]));
		rejected(JSON.stringify({ lastActor: "a" }));
	});
});

describe("readCheckObject", () => {
	const comment = {
		author: "maint-a",
		createdAt: "2026-10-14T09:00:00Z",
		body: "text",
	};

	test("reads the actor, the writers and the comments", () => {
		const got = readCheckObject(
			JSON.stringify({
				lastActor: "Maint-A",
				writers: ["Maint-A"],
				// the second is of an account that is gone
				comments: [comment, { ...comment, author: null }],
			}),
		);
		expect(got).toEqual({
			actor: "Maint-A",
			writers: ["maint-a"],
			comments: [comment, { ...comment, author: "" }],
		});
	});

	test("an absent comments field is an empty list, and decide ignores it", () => {
		expect(readCheckObject(answer(null, [])).comments).toEqual([]);
		expect(readCheckObject(answer(null, [])).actor).toBeNull();
		expect(
			decide(JSON.stringify({ lastActor: "a", writers: ["a"], comments: 5 })),
		).toBe("decider=yes actor=a");
	});

	test("a comments field that is not a list, or a bad item, is rejected", () => {
		const base = { lastActor: "a", writers: [] };
		for (const comments of ["x", {}, [5], [{ ...comment, createdAt: "x" }]]) {
			try {
				readCheckObject(JSON.stringify({ ...base, comments }));
			} catch (e) {
				expect((e as Fail).message).toContain("decider input rejected");
				continue;
			}
			throw new Error("expected a Fail");
		}
	});
});

describe("decider command", () => {
	test("in process, an argument fails with the usage line", () => {
		const r = captured("2026-05-01T00:00:00Z", () => decider(["x"]));
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.err).toContain("usage: journal decider");
	});
});

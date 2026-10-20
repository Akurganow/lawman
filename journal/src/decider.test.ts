import { describe, expect, test } from "bun:test";
import { EXIT, Fail } from "./db";
import { decide, decider } from "./decider";
import { exampleOf } from "./form";
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

	test("the example of the form decides yes", () => {
		expect(decide(exampleOf("decider"))).toBe("decider=yes actor=maintainer");
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

	test("a rejection prints the form and its example", () => {
		const message = rejected("not json");
		expect(message).toContain("decider input rejected");
		expect(message).toContain("lastActor");
		expect(message).toContain(`Example:\n${exampleOf("decider")}`);
	});
});

describe("decider command", () => {
	test("any argument is a usage error", () => {
		expect(() => decider(["response.json"])).toThrow(Fail);
	});

	test("in process, an argument fails with the usage line", () => {
		const r = captured("2026-05-01T00:00:00Z", () => decider(["x"]));
		expect(r.code).toBe(EXIT.USAGE);
		expect(r.err).toContain("usage: journal decider");
	});
});

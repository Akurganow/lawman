import { describe, expect, test } from "bun:test";
import { EXIT, Fail } from "./db";
import { decide } from "./decider";

const answer = (
	event: { type?: string; actor?: { login: string } | null } | null,
	edges: { permission: string; login: string }[],
	more = false,
) =>
	JSON.stringify({
		data: {
			repository: {
				issueOrPullRequest: {
					timelineItems: {
						nodes: event
							? [
									{
										__typename: event.type ?? "ClosedEvent",
										actor: event.actor,
									},
								]
							: [],
					},
				},
				collaborators: {
					pageInfo: { hasNextPage: more },
					edges: edges.map((e) => ({
						permission: e.permission,
						node: { login: e.login },
					})),
				},
			},
		},
	});

const closedBy = (login: string, permission: string) =>
	decide(answer({ actor: { login } }, [{ login, permission }]));

const rejected = (raw: string) => {
	try {
		decide(raw);
	} catch (e) {
		expect(e).toBeInstanceOf(Fail);
		expect((e as Fail).code).toBe(EXIT.SYNC_INPUT);
		return;
	}
	throw new Error("expected a Fail");
};

describe("decide", () => {
	test.each(["ADMIN", "MAINTAIN", "WRITE"])("%s decides", (permission) => {
		expect(closedBy("maint-a", permission)).toBe("decider=yes actor=maint-a");
	});

	test.each(["TRIAGE_PLUS", "TRIAGE", "READ"])("%s does not", (permission) => {
		expect(closedBy("maint-a", permission)).toBe("decider=no actor=maint-a");
	});

	test("reopen events count the same way", () => {
		const raw = answer({ type: "ReopenedEvent", actor: { login: "maint-a" } }, [
			{ login: "maint-a", permission: "WRITE" },
		]);
		expect(decide(raw)).toBe("decider=yes actor=maint-a");
	});

	test("actor absent from collaborators is no", () => {
		const raw = answer({ actor: { login: "stranger" } }, [
			{ login: "maint-a", permission: "ADMIN" },
		]);
		expect(decide(raw)).toBe("decider=no actor=stranger");
	});

	test("logins compare case-insensitively", () => {
		const raw = answer({ actor: { login: "Maint-A" } }, [
			{ login: "maint-a", permission: "ADMIN" },
		]);
		expect(decide(raw)).toBe("decider=yes actor=Maint-A");
	});

	test("no event or null actor is no with a dash", () => {
		expect(decide(answer(null, []))).toBe("decider=no actor=-");
		expect(decide(answer({ actor: null }, []))).toBe("decider=no actor=-");
	});

	test("an actor login outside the login class is rejected", () => {
		rejected(answer({ actor: { login: "bad login" } }, []));
	});

	test("bad input is rejected", () => {
		rejected("not json");
		rejected("null");
		rejected(JSON.stringify({ errors: [{ message: "x" }], data: null }));
		rejected(JSON.stringify({ data: {} }));
		rejected(JSON.stringify({ data: { repository: null } }));
		rejected(answer({ actor: { login: "a" } }, [], true));
		rejected(
			JSON.stringify({
				data: { repository: { issueOrPullRequest: {}, collaborators: {} } },
			}),
		);
		rejected(
			JSON.stringify({
				data: {
					repository: {
						issueOrPullRequest: { timelineItems: { nodes: [{ actor: 5 }] } },
						collaborators: { pageInfo: { hasNextPage: false }, edges: [] },
					},
				},
			}),
		);
	});
});

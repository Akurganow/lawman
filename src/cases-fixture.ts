import { expect } from "bun:test";
import {
	BASE,
	call,
	caseMark,
	charge,
	defence,
	lead,
	mark,
	SHA,
	seed,
	TRUSTED,
} from "./test-helpers";

export type Comment = [createdAt: string, body: string];
export type Spec = {
	body?: string[];
	comments?: Comment[];
	state?: string;
	createdAt?: string;
};

export const T = (hour: number) =>
	`2026-10-14T${String(hour).padStart(2, "0")}:00:00Z`;

export function put(specs: Record<number, Spec>) {
	const data = Object.entries(specs).map(([n, s]) => ({
		number: Number(n),
		state: s.state ?? "OPEN",
		stateReason: null,
		title: `issue ${n}`,
		createdAt: s.createdAt ?? T(9),
		closedAt: null,
		author: { login: TRUSTED },
		body: (s.body ?? []).join("\n"),
		comments: (s.comments ?? []).map(([createdAt, body]) => ({
			author: { login: TRUSTED },
			body,
			createdAt,
		})),
	}));
	const r = call(
		BASE,
		["sync", "main", "--author", TRUSTED],
		JSON.stringify(data),
	);
	expect(r.code).toBe(0);
}

export const need = (n: number) => {
	const r = call(BASE, ["case", "main", String(n)]);
	expect(r.code).toBe(0);
	return r.out.trim();
};
export const needOnly = (n: number) => need(n).split(" ")[0];

export const withLead = (...comments: string[]): Spec => ({
	body: [lead()],
	comments: comments.map((body, i): Comment => [T(10 + i), body]),
});

export const fields = (n: number) =>
	Object.fromEntries(
		need(n)
			.split(" ")
			.map((pair) => pair.split("=")),
	) as Record<string, string>;

export const pairMark = (stage: string, pull: number | string, issue: string) =>
	mark("clerk", stage, ` pull=${pull} issue=${issue}`);

export const human = (state: string, ...marks: string[]): Spec => ({
	body: ["a human issue"],
	comments: marks.map((body, i): Comment => [T(10 + i), body]),
	state,
});

export const handed = (pull: number, ...more: string[]): Spec =>
	human("OPEN", pairMark("handed", pull, "open"), ...more);

export const convicted = (priority: string): Spec =>
	withLead(
		caseMark(),
		charge(),
		defence(),
		mark("court", "conviction", ` sha=${SHA} priority=${priority}`),
	);

export function cache(...pulls: [number, number[], string?][]) {
	seed((db) => {
		db.run("DELETE FROM pulls");
		for (const [number, issues, spec] of pulls)
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec) VALUES ('main', ?, ?, ?)",
				[number, issues.join(","), spec ?? "none"],
			);
	});
}

export const ruled = (ruling: () => string, ...rest: string[]) =>
	withLead(caseMark(), charge(), defence(), ruling(), ...rest);

export const closed = (spec: Spec): Spec => ({ ...spec, state: "CLOSED" });

export function expectNeed(spec: Spec, expected: string) {
	put({ 1: spec });
	expect(needOnly(1)).toBe(`need=${expected}`);
}

export function expectRoundKept(spec: Spec) {
	put({ 1: spec });
	expect(need(1).split(" ").slice(0, 3)).toEqual([
		"need=none",
		"round=1",
		"returned=-",
	]);
}

export function dueOut(
	run: (args: string[]) => { code: number; out: string },
	role: string,
	exclude: string[],
): string {
	const r = run([
		"due",
		"--role",
		role,
		...exclude.flatMap((p) => ["--exclude", p]),
	]);
	expect(r.code).toBe(0);
	return r.out;
}

export const order = (role: string, issue: number, at: string, open = false) =>
	seed((db) =>
		db.run(
			"INSERT INTO dispatches (at, precinct, role, issue, outcome) VALUES (?, 'main', ?, ?, ?)",
			[at, role, issue, open ? null : "ok"],
		),
	);

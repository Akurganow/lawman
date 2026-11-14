import { expect } from "bun:test";
import { open } from "./db";
import { dueEntries } from "./due";
import {
	BASE,
	call,
	caseMark,
	charge,
	dbFile,
	defence,
	issuesForm,
	lead,
	mark,
	SHA,
	seed,
	TRUSTED,
} from "./test-helpers";

export type Comment = [
	createdAt: string,
	body: string,
	approvedBy?: string[],
	rejectedBy?: string[],
];
export type Spec = {
	body?: string[];
	comments?: Comment[];
	state?: string;
	createdAt?: string;
};

export const T = (hour: number) =>
	`2026-10-14T${String(hour).padStart(2, "0")}:00:00Z`;

// the issues form that sync reads, for the given issues
export function issuesJson(specs: Record<number, Spec>): string {
	const data = Object.entries(specs).map(([n, s]) => ({
		number: Number(n),
		state: s.state ?? "OPEN",
		stateReason: null,
		title: `issue ${n}`,
		createdAt: s.createdAt ?? T(9),
		closedAt: null,
		author: { login: TRUSTED },
		body: (s.body ?? []).join("\n"),
		comments: (s.comments ?? []).map(
			([createdAt, body, approvedBy = [], rejectedBy = []]) => ({
				author: { login: TRUSTED },
				body,
				createdAt,
				approvedBy,
				rejectedBy,
			}),
		),
	}));
	return JSON.stringify(issuesForm(data, [TRUSTED]));
}

export function put(specs: Record<number, Spec>, precinct = "main") {
	const r = call(
		BASE,
		["sync", precinct, "--author", TRUSTED],
		issuesJson(specs),
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

// traced: the pull request carries a trace of a role
export function cache(...pulls: [number, number[], string?, boolean?][]) {
	seed((db) => {
		db.run("DELETE FROM pulls");
		for (const [number, issues, spec, traced] of pulls)
			db.run(
				"INSERT INTO pulls (precinct, number, issues, spec, traced) VALUES ('main', ?, ?, ?, ?)",
				[number, issues.join(","), spec ?? "none", Number(traced ?? false)],
			);
	});
}

export const ruled = (ruling: () => string, ...rest: string[]) =>
	withLead(caseMark(), charge(), defence(), ruling(), ...rest);

// a ruling with a Precedent line, so the clerk has a precedent to record
export const lined =
	(ruling: () => string, line = "new gate: A rule.") =>
	() =>
		`## Precedent\n\n- ${line}\n\n${ruling()}`;

export const referral = () => mark("court", "referral", ` sha=${SHA}`);

export const answer = (n: number, value: string, id = "-", name = "main") =>
	seed((db) =>
		db.run(
			"UPDATE issues SET answer = ?, answer_id = ? WHERE precinct = ? AND issue = ?",
			[value, id, name, n],
		),
	);

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

// The first case or pull request the role is due on, as the duty desk would order it first.
export function due(role: string): string {
	const db = open(dbFile);
	try {
		const first = dueEntries(db, role)[0];
		return first === undefined ? "" : `${first.precinct}\t${first.number}\n`;
	} finally {
		db.close();
	}
}

export const order = (role: string, issue: number, at: string, open = false) =>
	seed((db) =>
		db.run(
			"INSERT INTO dispatches (at, precinct, role, issue, outcome) VALUES (?, 'main', ?, ?, ?)",
			[at, role, issue, open ? null : "ok"],
		),
	);

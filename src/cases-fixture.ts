import { expect } from "bun:test";
import { BASE, call, lead, TRUSTED } from "./test-helpers";

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

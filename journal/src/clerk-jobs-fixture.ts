import type { CaseMarker } from "./cases";
import { type CachedPull, type ClerkCase, clerkCase } from "./clerk-jobs";

export type Spec = [stage: string, pull: string, issue: string];

const ORD_PAD = 6;
export const ordAt = (i: number) => String(i).padStart(ORD_PAD, "0");

export const marker = (
	role: string,
	stage: string,
	i: number,
	fields: Record<string, string> = {},
): CaseMarker => ({
	role,
	stage,
	fields: { role, stage, at: "2026-10-14T09:30:00Z", ...fields },
	ord: ordAt(i),
});

export const pairs = (...specs: Spec[]) =>
	specs.map(([stage, pull, issue], i) =>
		marker("clerk", stage, i, { pull, issue }),
	);

export type Scene = {
	state?: string;
	markers?: CaseMarker[];
	pulls?: CachedPull[];
	closed?: number[];
	ruling?: CaseMarker;
	others?: Record<number, CaseMarker[]>;
};

export const run = (s: Scene): ClerkCase =>
	clerkCase({
		issue: 1,
		state: s.state ?? "OPEN",
		markers: s.markers ?? [],
		pulls: s.pulls ?? [],
		isClosed: (n) => (s.closed ?? []).includes(n),
		ruling: s.ruling,
		others: () =>
			new Map(Object.entries(s.others ?? {}).map(([n, m]) => [Number(n), m])),
	});

export const conviction = (i = 0) => marker("court", "conviction", i);
export const acquittal = (i = 0) => marker("court", "acquittal", i);
export const pull = (number: number, ...issues: number[]): CachedPull => ({
	number,
	issues,
});

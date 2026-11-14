import type { CaseMarker } from "./cases";
import {
	type CachedPull,
	type ClerkCase,
	type ClerkInput,
	clerkCase,
} from "./clerk-jobs";

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
	// whether the ruling holds a Precedent line other than none; true when absent
	holds?: boolean;
	others?: Record<number, CaseMarker[]>;
	// whether the close leaves a dismissal; false when absent
	dismissible?: boolean;
};

export const inputOf = (s: Scene): ClerkInput => ({
	issue: 1,
	state: s.state ?? "OPEN",
	markers: s.markers ?? [],
	pulls: s.pulls ?? [],
	isClosed: (n) => (s.closed ?? []).includes(n),
	ruling: s.ruling,
	holdsPrecedent: () => s.holds ?? true,
	dismissible: () => s.dismissible ?? false,
	others: () =>
		new Map(Object.entries(s.others ?? {}).map(([n, m]) => [Number(n), m])),
});

export const run = (s: Scene): ClerkCase => clerkCase(inputOf(s));

export const conviction = (i = 0) => marker("court", "conviction", i);
export const acquittal = (i = 0) => marker("court", "acquittal", i);
// a pull request of the owner's own work, with no trace of a role
export const pull = (number: number, ...issues: number[]): CachedPull => ({
	number,
	issues,
	adoptable: false,
});
// a pull request that carries a trace of a role
export const traced = (number: number, ...issues: number[]): CachedPull => ({
	...pull(number, ...issues),
	adoptable: true,
});

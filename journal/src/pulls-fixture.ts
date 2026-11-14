import type { PullRow } from "./pulls";
import { mark, SHA } from "./test-helpers";

export const BOT = "lawman-bot";
export const SPEC = mark("spec-writer", "spec", ` sha=${SHA}`);

export const READY = mark("executor", "ready", ` sha=${SHA}`);

export const FIXTURE_ROWS: PullRow[] = [
	{
		number: 7,
		issues: "3,4,5",
		spec: "up",
		work: "ready",
		spec_id: "IC_spec_7",
	},
	{ number: 12, issues: "", spec: "none", work: "todo", spec_id: "-" },
];

export type Reactions = { up?: string[]; down?: string[] };
export type Comment = Reactions & {
	body: string;
	id?: string;
	author?: string;
	at?: string;
	noId?: boolean;
};
export type Review = { at: string; author?: string };
export type Pull = {
	number: number;
	author?: string;
	body?: string;
	closes?: number[];
	comments?: Comment[];
	reviews?: Review[];
};

const comment = (c: Comment, i: number) => ({
	...(c.noId ? {} : { id: c.id ?? `IC_${i}` }),
	author: c.author ?? BOT,
	createdAt: c.at ?? "2026-10-14T09:00:00Z",
	body: c.body,
	approvedBy: c.up ?? [],
	rejectedBy: c.down ?? [],
});
const pull = (p: Pull) => ({
	number: p.number,
	author: p.author ?? BOT,
	body: p.body ?? "",
	closes: p.closes ?? [],
	comments: (p.comments ?? []).map(comment),
	changesRequested: (p.reviews ?? []).map((r) => ({
		login: r.author ?? "maint-a",
		at: r.at,
	})),
});
export const WRITERS = ["maint-a", "maint-b", "maint-c"];
export const hostPulls = (pulls: Pull[], writers: string[] = WRITERS) => ({
	writers,
	pulls: pulls.map(pull),
});

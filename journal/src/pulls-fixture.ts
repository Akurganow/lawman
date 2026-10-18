import type { PullRow } from "./pulls";
import { mark, SHA } from "./test-helpers";

export const BOT = "lawman-bot";
export const REPO = "o/main";
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
export type Review = { state: string; at: string; author?: string };
export type Pull = {
	number: number;
	author?: string;
	body?: string;
	refs?: [number, string][];
	comments?: Comment[];
	reviews?: Review[];
	noReviews?: boolean;
};

const reactions = (logins: string[] = []) => ({
	nodes: logins.map((login) => ({
		user: { login },
		createdAt: "2026-10-14T10:00:00Z",
	})),
});
const comment = (c: Comment, i: number) => ({
	...(c.noId ? {} : { id: c.id ?? `IC_${i}` }),
	author: { login: c.author ?? BOT },
	createdAt: c.at ?? "2026-10-14T09:00:00Z",
	body: c.body,
	up: reactions(c.up),
	down: reactions(c.down),
});
const review = (r: Review) => ({
	state: r.state,
	submittedAt: r.at,
	author: { login: r.author ?? "maint-a" },
});
const pull = (p: Pull) => ({
	number: p.number,
	author: { login: p.author ?? BOT },
	body: p.body ?? "",
	closingIssuesReferences: {
		nodes: (p.refs ?? []).map(([number, nameWithOwner]) => ({
			number,
			repository: { nameWithOwner },
		})),
	},
	comments: { nodes: (p.comments ?? []).map(comment) },
	...(p.noReviews
		? {}
		: { latestOpinionatedReviews: { nodes: (p.reviews ?? []).map(review) } }),
});
export type Collab = [string, string];
export const DECIDERS: Collab[] = [
	["maint-a", "ADMIN"],
	["maint-b", "WRITE"],
	["maint-c", "MAINTAIN"],
	["triager", "TRIAGE"],
	["reader", "READ"],
];
export const page = (
	pulls: Pull[],
	o: { next?: boolean; collabNext?: boolean; collabs?: Collab[] } = {},
) => ({
	data: {
		repository: {
			collaborators: {
				pageInfo: { hasNextPage: o.collabNext ?? false },
				edges: (o.collabs ?? DECIDERS).map(([login, permission]) => ({
					permission,
					node: { login },
				})),
			},
			pullRequests: {
				pageInfo: { hasNextPage: o.next ?? false, endCursor: null },
				nodes: pulls.map(pull),
			},
		},
	},
});

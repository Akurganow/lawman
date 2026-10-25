import { pick, usage } from "./args";
import { LIST_EXAMPLE, LIST_FORM } from "./catalog";
import { EXIT, Fail, normalizeTime, out } from "./db";
import { asciiLower } from "./markers";

export type FormKind = "issues" | "pulls" | "decider" | "catalog";

const FORM_USAGE = "form <issues|pulls|decider|catalog>";

const COMMON = `A login compares ignoring ASCII case.
The journal normalises every time to YYYY-MM-DDTHH:MM:SSZ, in UTC.
A list field is empty when the host has no such thing.`;

const TEXTS: Record<FormKind, string> = {
	issues: `issues, for sync. A list with one entry per issue of the repository, open and closed.
${COMMON}

Each issue:
  number: the issue number, an integer
  state: OPEN or CLOSED
  stateReason: COMPLETED when closed as done, NOT_PLANNED when closed otherwise, null when open or unknown
  title: the title
  createdAt, closedAt: times. closedAt is null while the issue is open
  author: login, and is_bot, true for an automated account
  body: the body text
  comments: comments by people and accounts, oldest first, each with author.login, body and createdAt.
    The host's own event notes are not comments`,
	pulls: `pulls, for sync --pulls. One object.
${COMMON}

Fields:
  writers: the logins that may write to the repository, access inherited from a group included
  pulls: one entry per open pull request

Each entry of pulls:
  number: the pull request number, an integer
  author: the login of its author
  body: its body text
  closes: the numbers of the issues of the same repository that it closes when merged
  comments: its conversation comments, oldest first
  changesRequested: each reviewer whose latest review asks for changes, with login and at

Each comment:
  id: the host's id of the comment, as text, the one that reads it back later
  author: the login of its author
  createdAt: a time
  body: the body text
  approvedBy: the logins that reacted with approval, the thumbs up reaction
  rejectedBy: the logins that reacted with rejection, the thumbs down reaction`,
	decider: `decider, for decider. One object.
${COMMON}

Fields:
  lastActor: the login of whoever made the last close or reopen of the number in question, null when none
  writers: as in pulls`,
	catalog: LIST_FORM,
};

const EXAMPLES: Record<FormKind, unknown> = {
	issues: [
		{
			number: 3,
			state: "CLOSED",
			stateReason: "COMPLETED",
			title: "Example issue",
			createdAt: "2026-10-14T09:00:00Z",
			closedAt: "2026-10-15T09:00:00Z",
			author: { login: "reporter", is_bot: false },
			body: "Example body",
			comments: [
				{
					author: { login: "maintainer" },
					body: "Example comment",
					createdAt: "2026-10-14T10:00:00Z",
				},
			],
		},
	],
	pulls: {
		writers: ["maintainer"],
		pulls: [
			{
				number: 7,
				author: "lawman-bot",
				body: "Example body",
				closes: [3],
				comments: [
					{
						id: "IC_example_1",
						author: "lawman-bot",
						createdAt: "2026-10-14T09:00:00Z",
						body: "Example comment",
						approvedBy: ["maintainer"],
						rejectedBy: [],
					},
				],
				changesRequested: [{ login: "maintainer", at: "2026-10-14T12:00:00Z" }],
			},
		],
	},
	decider: { lastActor: "maintainer", writers: ["maintainer", "co-writer"] },
	catalog: LIST_EXAMPLE,
};

export const exampleOf = (kind: FormKind) => {
	const example = EXAMPLES[kind];
	return typeof example === "string"
		? example
		: JSON.stringify(example, null, 2);
};

export const formText = (kind: FormKind) =>
	`${TEXTS[kind]}\n\nExample:\n${exampleOf(kind)}`;

export const inputRejected = (kind: FormKind, message: string) =>
	new Fail(EXIT.SYNC_INPUT, `${message}\n\n${formText(kind)}`);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

export const text = (v: unknown) => (typeof v === "string" ? v : "");

export function timeOf(
	value: unknown,
	what: string,
	reject: (why: string) => Fail,
): string {
	const time = normalizeTime(text(value));
	if (time === null) throw reject(`${what} is not a time`);
	return time;
}

export function loginList(
	value: unknown,
	what: string,
	reject: (why: string) => Fail,
): string[] {
	if (!Array.isArray(value)) throw reject(`${what} is not a list`);
	return value.map((login) => {
		if (typeof login !== "string")
			throw reject(`${what} holds a non-text entry`);
		return asciiLower(login);
	});
}

export function form(args: string[]): void {
	const [kind] = args;
	if (args.length !== 1 || pick(TEXTS, kind) === undefined)
		throw usage(FORM_USAGE);
	out(formText(kind as FormKind));
}

import { pick, usage } from "./args";
import { LIST_EXAMPLE, LIST_FORM } from "./catalog-entries";
import { EXIT, Fail, normalizeTime, out } from "./db";
import { asciiLower } from "./markers";

export type FormKind = "issues" | "pulls" | "decider" | "catalog";

const FORM_USAGE = "form <issues|pulls|decider|catalog>";

const COMMON = `A login compares ignoring ASCII case.
The journal normalises every time to YYYY-MM-DDTHH:MM:SSZ, in UTC.
A list field is empty when the host has no such thing.`;

const WHOLE =
	"The command returns the whole list and exits non-zero when it cannot.";

const TEXTS: Record<FormKind, string> = {
	issues: `issues, for sync. One object.
${COMMON}
${WHOLE}

Fields:
  writers: the logins that may write to the repository, access inherited from a group included
  issues: one entry per issue of the repository, open and closed

Each entry of issues:
  number: the issue number, an integer
  state: OPEN or CLOSED
  stateReason: COMPLETED when closed as done, NOT_PLANNED when closed otherwise, null when open or unknown
  title: the title
  url: the address that opens the issue in a browser, as the host reports it. Leave it out when the host gives none
  createdAt, closedAt: times. closedAt is null while the issue is open
  author: login, and is_bot, true for an automated account
  body: the body text
  comments: comments by people and accounts, oldest first.
    The host's own event notes are not comments

Each comment:
  id: the host's id of the comment, as text, the one that reads it back later
  author.login: the login of its author
  body: the body text
  createdAt: a time
  approvedBy: the logins that reacted with the thumbs up reaction, every page read
  rejectedBy: the logins that reacted with the thumbs down reaction, every page read
  Both lists matter only on comments written by the trusted login on open issues. Leave them empty elsewhere.`,
	pulls: `pulls, for sync --pulls. One object.
${COMMON}
${WHOLE}

Fields:
  writers: the logins that may write to the repository, access inherited from a group included
  pulls: one entry per open pull request

Each entry of pulls:
  number: the pull request number, an integer
  url: the address that opens the pull request in a browser, as the host reports it. Leave it out when the host gives none
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
  writers: as in pulls
  comments: optional. The conversation comments of the pull request in question, oldest first, each with author (login), createdAt and body. The precedent command reads them.`,
	catalog: LIST_FORM,
};

const EXAMPLES: Record<FormKind, unknown> = {
	issues: {
		writers: ["maintainer"],
		issues: [
			{
				number: 3,
				state: "CLOSED",
				stateReason: "COMPLETED",
				title: "Example issue",
				url: "https://host.example/owner/repo/issues/3",
				createdAt: "2026-10-14T09:00:00Z",
				closedAt: "2026-10-15T09:00:00Z",
				author: { login: "reporter", is_bot: false },
				body: "Example body",
				comments: [
					{
						id: "IC_example_1",
						author: { login: "maintainer" },
						body: "Example comment",
						createdAt: "2026-10-14T10:00:00Z",
						approvedBy: [],
						rejectedBy: [],
					},
				],
			},
		],
	},
	pulls: {
		writers: ["maintainer"],
		pulls: [
			{
				number: 7,
				url: "https://host.example/owner/repo/pull/7",
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
	decider: {
		lastActor: "maintainer",
		writers: ["maintainer", "co-writer"],
		comments: [
			{
				author: "lawman-bot",
				createdAt: "2026-10-14T09:00:00Z",
				body: "Example comment",
			},
		],
	},
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

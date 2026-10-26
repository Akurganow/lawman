import { EXIT, Fail } from "./db";
import { inputRejected, isRecord, loginList, text, timeOf } from "./form";
import type { GhIssue } from "./markers";

export const SYNC_LIMIT = 1000;

const STATE_REASON = /^[A-Z_]+$/;
// The case line prints the id as answer_id=<id> among space-separated fields.
const COMMENT_ID = /^[A-Za-z0-9_=-]+$/;
const OLD_FORM =
	"the issues form is now one object with writers and issues. Run the assembly, finish any amendment it offers, then choose Host once to rewrite host.md.";

export type SyncComment = GhIssue["comments"][number] & {
	id: string;
	approvedBy: string[];
	rejectedBy: string[];
};
export type SyncIssue = Omit<GhIssue, "comments"> & {
	bot: boolean;
	state: string;
	stateReason: string | null;
	title: string;
	closedAt: string | null;
	comments: SyncComment[];
};
export type IssuesInput = { writers: Set<string>; issues: SyncIssue[] };

const textOrNull = (v: unknown) =>
	typeof v === "string" && v !== "" ? v : null;
export const syncInput = (why: string) =>
	inputRejected("issues", `sync input rejected, cache untouched: ${why}`);
const timeField = (v: unknown, what: string) => timeOf(v, what, syncInput);
const logins = (v: unknown, what: string) => loginList(v, what, syncInput);

function readComment(c: Record<string, unknown>): SyncComment {
	if (!COMMENT_ID.test(text(c.id)))
		throw syncInput("a comment id is letters, digits, _, = or -");
	const login = isRecord(c.author) ? text(c.author.login) : "";
	return {
		id: text(c.id),
		author: login === "" ? null : { login },
		body: text(c.body),
		createdAt: timeField(c.createdAt, "a comment createdAt"),
		approvedBy: logins(c.approvedBy, "a comment approvedBy"),
		rejectedBy: logins(c.rejectedBy, "a comment rejectedBy"),
	};
}

function readIssue(raw: unknown): SyncIssue {
	if (
		!isRecord(raw) ||
		!Number.isInteger(raw.number) ||
		typeof raw.state !== "string"
	) {
		throw syncInput("every element needs an integer number and a state");
	}
	// Every reader compares the stored values with the form's upper-case words.
	if (raw.state !== "OPEN" && raw.state !== "CLOSED") {
		throw syncInput("a state is OPEN or CLOSED");
	}
	// An open issue's reason may be absent, null or empty.
	const reason = raw.stateReason;
	if (
		reason !== undefined &&
		reason !== null &&
		reason !== "" &&
		(typeof reason !== "string" || !STATE_REASON.test(reason))
	) {
		throw syncInput("a stateReason is upper case, such as COMPLETED");
	}
	const closed = textOrNull(raw.closedAt);
	const login = isRecord(raw.author) ? text(raw.author.login) : "";
	const comments = Array.isArray(raw.comments)
		? raw.comments.filter(isRecord)
		: [];
	return {
		number: raw.number as number,
		bot: isRecord(raw.author) && raw.author.is_bot === true,
		state: raw.state,
		stateReason: textOrNull(reason),
		title: text(raw.title),
		createdAt: timeField(raw.createdAt, "an issue createdAt"),
		closedAt: closed === null ? null : timeField(closed, "an issue closedAt"),
		author: login === "" ? null : { login },
		body: text(raw.body),
		comments: comments.map(readComment),
	};
}

export function readIssues(input: string): IssuesInput {
	let data: unknown;
	try {
		data = JSON.parse(input);
	} catch {
		throw syncInput("stdin is not valid JSON");
	}
	if (Array.isArray(data)) throw syncInput(OLD_FORM);
	if (!isRecord(data)) throw syncInput("stdin is not a JSON object");
	const writers = new Set(logins(data.writers, "writers"));
	if (!Array.isArray(data.issues)) throw syncInput("issues is not a list");
	const issues = data.issues.map(readIssue);
	if (issues.length === SYNC_LIMIT) {
		throw new Fail(
			EXIT.SYNC_LIMIT,
			`${SYNC_LIMIT} issues reached the limit: the list may be truncated, cache untouched`,
		);
	}
	return { writers, issues };
}

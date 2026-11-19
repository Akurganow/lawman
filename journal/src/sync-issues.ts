import {
	authorLogin,
	inputRejected,
	isRecord,
	loginList,
	text,
	timeOf,
} from "./form";
import { linkOrNull } from "./link";
import type { GhIssue } from "./markers";

const STATE_REASON = /^[A-Z_]+$/;
// The case line prints the id as answer_id=<id> among space-separated fields.
const COMMENT_ID = /^[A-Za-z0-9_=-]+$/;
const OLD_FORM =
	"the issues form is one object with writers and issues. Run the assembly, finish any amendment it offers, then choose Host once to rewrite host.md.";

export type SyncComment = GhIssue["comments"][number] & {
	id: string;
	approvedBy: string[];
	rejectedBy: string[];
};
export type SyncIssue = Omit<GhIssue, "comments"> & {
	state: string;
	stateReason: string | null;
	title: string;
	url: string | null;
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

// the author as { login }, or null when the host gives none
function authorOf(raw: Record<string, unknown>, what: string) {
	const login = authorLogin(raw.author, what, syncInput);
	return login === "" ? null : { login };
}

function readComment(c: unknown): SyncComment {
	if (!isRecord(c)) throw syncInput("a comment is not an object");
	if (!COMMENT_ID.test(text(c.id)))
		throw syncInput("a comment id is letters, digits, _, = or -");
	return {
		id: text(c.id),
		author: authorOf(c, "a comment author"),
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
	if (!Array.isArray(raw.comments)) throw syncInput("comments is not a list");
	return {
		number: raw.number as number,
		state: raw.state,
		stateReason: textOrNull(reason),
		title: text(raw.title),
		url: linkOrNull(raw.url),
		createdAt: timeField(raw.createdAt, "an issue createdAt"),
		closedAt: closed === null ? null : timeField(closed, "an issue closedAt"),
		author: authorOf(raw, "an author"),
		body: text(raw.body),
		comments: raw.comments.map(readComment),
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
	return { writers, issues };
}

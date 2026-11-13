import { fits } from "./args";
import { cleanCharacters } from "./clean";
import { cleanEach } from "./clean-run";
import { normalizeTime } from "./db";
import type { CheckObject } from "./decider";
import { fenceOf } from "./fence";
import { sectionWords } from "./law-sections";
import { asciiLower, parseMarker, stripCr } from "./markers";
import { buildPrecedent, DISMISSAL, type Fields } from "./precedent-file";

export const DISMISSED = "The finding is dismissed.";
export const NO_COMMENT = "No comment of the decider was found.";
export const TITLE_LINE = "Title of the lead:";
export const issueLine = (url: string) => `Issue: ${url}`;
export const commentLine = (at: string) =>
	`The comment of the decider who closed the lead, written ${at}:`;
export const verdictLine = (at: string) =>
	`The court's verdict, written ${at}:`;

const ACQUITTAL = "acquittal";

export type ThreadComment = {
	author: string | null;
	at: string;
	body: string;
};

export type DismissalFacts = {
	issue: number;
	// null when the host gives no address
	url: string | null;
	title: string;
	leadId: string;
	department: string;
	closedAt: string;
	// the counted ruling: the creation time and text of its comment, and the ruling URL when given
	ruling: {
		stage: string;
		text: string;
		at: string;
		url: string | null;
	} | null;
	// the comments of the issue as the cache holds them, already cleaned
	thread: ThreadComment[];
	object: CheckObject | null;
};

export type Dismissal =
	| { base: string; text: string }
	| { reason: "no-decider" };

// only the comment route reads the check object
export const needsObject = (ruling: { stage: string } | null) =>
	ruling?.stage !== ACQUITTAL;

const markersOf = (body: string) =>
	body
		.split("\n")
		.map(stripCr)
		.flatMap((line) => parseMarker(line) ?? []);

// The newest comment of a thread that carries no clerk marker, when the closer wrote
// it and no line of it is a marker. A later comment wins an equal time.
function closersCandidate(
	closer: string,
	comments: ThreadComment[],
): ThreadComment | null {
	let newest: ThreadComment | null = null;
	for (const c of comments)
		if (
			!markersOf(c.body).some((m) => m.role === "clerk") &&
			(newest === null || c.at >= newest.at)
		)
			newest = c;
	return newest !== null &&
		newest.author !== null &&
		asciiLower(newest.author) === closer &&
		markersOf(newest.body).length === 0
		? newest
		: null;
}

// Of the two threads the newer candidate; the object wins an equal time.
// The comment of the object is cleaned as the sync cleans a body, the cached one is clean.
async function closersComment(
	closer: string,
	thread: ThreadComment[],
	object: CheckObject,
): Promise<{ at: string; text: string } | null> {
	const cached = closersCandidate(closer, thread);
	const fromObject = closersCandidate(
		closer,
		object.comments.map((c) => ({
			author: c.author,
			at: c.createdAt,
			body: c.body,
		})),
	);
	if (fromObject !== null && (cached === null || fromObject.at >= cached.at)) {
		const cleaned = (await cleanEach([fromObject.body])).get(fromObject.body);
		if (cleaned === undefined) throw new Error("the comment was not cleaned");
		return { at: fromObject.at, text: cleaned.text };
	}
	return cached && { at: cached.at, text: cached.body };
}

const fenced = (label: string, text: string) => {
	const fence = fenceOf(text);
	return `${label}\n${fence}\n${text}\n${fence}`;
};

function dateOf(closedAt: string): string {
	const time = normalizeTime(closedAt);
	if (time === null) throw new Error("closedAt is not a time");
	return time.slice(0, 10);
}

// The base name and the text of the dismissal file of a closed lead, or the reason none is written.
export async function dismissalFile(facts: DismissalFacts): Promise<Dismissal> {
	const { ruling, object } = facts;
	const date = dateOf(facts.closedAt);
	const verdict =
		ruling?.stage === ACQUITTAL ? sectionWords(ruling.text, "Verdict") : null;
	let varying: string[] = [];
	if (ruling?.stage === ACQUITTAL) {
		if (verdict !== null) varying = [fenced(verdictLine(ruling.at), verdict)];
	} else {
		if (object === null)
			throw new Error(
				"a dismissal that quotes a comment needs the check object",
			);
		if (
			object.actor === null ||
			!object.writers.map(asciiLower).includes(asciiLower(object.actor))
		)
			return { reason: "no-decider" };
		const comment = await closersComment(
			asciiLower(object.actor),
			facts.thread,
			object,
		);
		varying = [
			comment === null
				? NO_COMMENT
				: fenced(commentLine(comment.at), comment.text),
		];
	}
	const fields: Fields = {
		kind: DISMISSAL,
		departments: fits("department", facts.department) ? [facts.department] : [],
		issue: facts.issue,
		date,
		finding: facts.leadId,
		...(verdict !== null && ruling?.url ? { ruling: ruling.url } : {}),
	};
	const body = [
		DISMISSED,
		...(facts.url === null ? [] : [issueLine(facts.url)]),
		fenced(TITLE_LINE, await cleanCharacters(facts.title)),
		...varying,
	].join("\n\n");
	return {
		base: `${date}-dismissal-issue-${facts.issue}`,
		text: buildPrecedent(fields, body),
	};
}

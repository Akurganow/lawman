import { asciiLower, collectIssueMarkers } from "./markers";
import type { SyncComment, SyncIssue } from "./sync-issues";

export const MARKER_PREFIX = "<!-- lawman:";

export type Answer = { answer: "up" | "down" | "comment"; id: string };

export const hasMarkerLine = (body: string) =>
	body.split("\n").some((l) => l.startsWith(MARKER_PREFIX));

const rankOf = (ord: string) => Number(ord.split("|")[1]);

// The newest decider answer to the newest referral, or null while none stands.
// Only the object's own fields count: reactions come from the reader, never from a body.
export function answerOf(
	issue: SyncIssue,
	login: string,
	writers: Set<string>,
): Answer | null {
	if (issue.state !== "OPEN") return null;
	const { markers } = collectIssueMarkers(issue, login);
	const newestCourt = markers.filter((m) => m.marker.role === "court").at(-1);
	if (newestCourt?.marker.stage !== "referral") return null;
	// A newer marker of another role means a new round, so the referral no longer waits.
	if (markers.at(-1) !== newestCourt) return null;
	const referralRank = rankOf(newestCourt.ord);
	// A reaction carries no time, so a thumb on any court comment answers the newest referral.
	const courtRanks = new Set(
		markers.filter((m) => m.marker.role === "court").map((m) => rankOf(m.ord)),
	);
	// collectIssueMarkers ranks the body 0 and the comments by time from 1
	const ranked = [...issue.comments]
		.sort((a, b) =>
			a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
		)
		.map((comment, i) => ({ comment, rank: i + 1 }));
	const isDecider = (who: string) => who !== "" && writers.has(asciiLower(who));
	const reactedBy = (pick: (c: SyncComment) => string[]) =>
		ranked.some(
			({ comment, rank }) =>
				courtRanks.has(rank) && pick(comment).some(isDecider),
		);
	if (reactedBy((c) => c.rejectedBy)) return { answer: "down", id: "-" };
	if (reactedBy((c) => c.approvedBy)) return { answer: "up", id: "-" };
	const reply = ranked.findLast(
		({ comment, rank }) =>
			rank > referralRank &&
			isDecider(comment.author?.login ?? "") &&
			!hasMarkerLine(comment.body),
	);
	return reply ? { answer: "comment", id: reply.comment.id } : null;
}

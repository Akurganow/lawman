import type { Database } from "bun:sqlite";
import { answerOf, hasMarkerLine, MARKER_PREFIX } from "./answer";
import { check, parseArgs, usage } from "./args";
import {
	type Cleaned,
	cleanTexts,
	dropComments,
	type HostText,
	storeComments,
	uncleanedField,
} from "./cache-text";
import {
	EXIT,
	Fail,
	inTransaction,
	isConstraint,
	now,
	out,
	readStdin,
	withDb,
} from "./db";
import { asciiLower, collectIssueMarkers } from "./markers";
import { syncPulls } from "./pulls";
import { readIssues, type SyncIssue, syncInput } from "./sync-issues";

const SYNC_USAGE = "sync <precinct> --author <login> [--reset | --pulls]";

type SyncStats = {
	issues: number;
	leads: number;
	markers: number;
	invalid: number;
	skipped: number;
};

const markerShaped = (issue: SyncIssue) =>
	[issue.body, ...issue.comments.map((c) => c.body)]
		.flatMap((t) => t.split("\n"))
		.filter((l) => l.startsWith(MARKER_PREFIX)).length;

const APP_LOGIN_PREFIX = "app/";

const isHuman = (issue: SyncIssue) =>
	issue.author !== null &&
	!issue.bot &&
	!issue.author.login.startsWith(APP_LOGIN_PREFIX);

// The newest comment by the issue author that carries no marker line.
function repliedAt(issue: SyncIssue): string | null {
	const author = asciiLower(issue.author?.login ?? "");
	const times = issue.comments
		.filter(
			(c) =>
				asciiLower(c.author?.login ?? "") === author && !hasMarkerLine(c.body),
		)
		.map((c) => c.createdAt);
	return times.length === 0 ? null : times.reduce((a, b) => (a > b ? a : b));
}

type Trust = { login: string; writers: Set<string> };

function storeMarkers(
	db: Database,
	name: string,
	issue: SyncIssue,
	login: string,
	stats: SyncStats,
): void {
	const { markers, leadOrigin } = collectIssueMarkers(issue, login);
	for (const { ord, marker } of markers) {
		const isLead = marker.stage === "lead";
		db.run(
			"INSERT INTO markers (precinct, issue, ord, role, stage, department, lead_id, fields, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			[
				name,
				issue.number,
				ord,
				marker.role,
				marker.stage,
				isLead ? (marker.fields.department ?? null) : null,
				isLead ? (marker.fields.id ?? null) : null,
				JSON.stringify(marker.fields),
				marker.raw,
			],
		);
	}
	stats.leads += leadOrigin ? 1 : 0;
	stats.markers += markers.length;
	stats.invalid +=
		markerShaped(issue) -
		markers.filter((m) => m.marker.fields.legacy === undefined).length;
}

const issueText = (issue: SyncIssue): HostText => ({
	body: issue.body,
	comments: issue.comments.map((c) => ({
		id: c.id,
		author: c.author?.login ?? null,
		at: c.createdAt,
		body: c.body,
	})),
});

function storeIssue(
	db: Database,
	name: string,
	issue: SyncIssue,
	text: HostText,
	trust: Trust,
	stats: SyncStats,
): void {
	const answer = answerOf(issue, trust.login, trust.writers);
	db.run(
		"INSERT INTO issues (precinct, issue, state, state_reason, title, created_at, closed_at, replied_at, answer, answer_id, body, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		[
			name,
			issue.number,
			issue.state,
			issue.stateReason,
			issue.title,
			issue.createdAt,
			issue.closedAt,
			repliedAt(issue),
			answer?.answer ?? null,
			answer?.id ?? null,
			text.body,
			issue.url,
		],
	);
	storeComments(db, name, "issue", issue.number, text.comments, syncInput);
	storeMarkers(db, name, issue, trust.login, stats);
	stats.issues++;
}

function replaceCache(
	db: Database,
	name: string,
	trust: Trust,
	issues: SyncIssue[],
	texts: Map<SyncIssue, HostText>,
	reset: boolean,
): SyncStats {
	const stats: SyncStats = {
		issues: 0,
		leads: 0,
		markers: 0,
		invalid: 0,
		skipped: 0,
	};
	if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(name))
		throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
	const cached = db
		.query("SELECT count(*) AS n FROM issues WHERE precinct = ?")
		.get(name) as { n: number };
	if (issues.length === 0 && cached.n > 0 && !reset)
		throw syncInput("empty list over a filled cache needs --reset");
	db.run("DELETE FROM markers WHERE precinct = ?", [name]);
	db.run("DELETE FROM issues WHERE precinct = ?", [name]);
	dropComments(db, name, "issue");
	for (const issue of issues) {
		const text = texts.get(issue);
		if (text === undefined) stats.skipped++;
		else storeIssue(db, name, issue, text, trust, stats);
	}
	db.run("UPDATE precincts SET synced_at = ? WHERE name = ?", [now(), name]);
	return stats;
}

// removes one flag from the list, and says whether it was there; a repeat is a usage error
function takeFlag(args: string[], flag: string): [string[], boolean] {
	const rest = args.filter((a) => a !== flag);
	if (args.length - rest.length > 1) throw usage(SYNC_USAGE);
	return [rest, rest.length < args.length];
}

// Each text is cleaned before the transaction, alone. A text that fails is stored as a placeholder and named in the line.
export async function syncIssues(
	name: string,
	login: string,
	input: string,
	reset: boolean,
): Promise<string> {
	const { writers, issues } = readIssues(input);
	const stored = issues.filter(isHuman);
	const cleaned = await cleanTexts(stored.map(issueText));
	const texts = new Map(
		stored.map((issue, i) => [issue, (cleaned[i] as Cleaned).text]),
	);
	return withDb((db) => {
		let stats: SyncStats;
		try {
			stats = inTransaction(db, () =>
				replaceCache(db, name, { login, writers }, issues, texts, reset),
			);
		} catch (e) {
			if (!isConstraint(e)) throw e;
			throw syncInput(
				"the issues break a cache constraint, for example a repeated number",
			);
		}
		const held = stored.map((issue, i) => ({
			number: issue.number,
			failed: (cleaned[i] as Cleaned).failed,
		}));
		return `issues=${stats.issues} leads=${stats.leads} markers=${stats.markers} invalid=${stats.invalid} skipped=${stats.skipped}${uncleanedField("issue", held)}`;
	});
}

export async function sync(args: string[]): Promise<number> {
	const [withoutReset, reset] = takeFlag(args, "--reset");
	const [rest, pulls] = takeFlag(withoutReset, "--pulls");
	if (reset && pulls) throw usage(SYNC_USAGE);
	const { pos, opt } = parseArgs(rest, 1, ["author"], SYNC_USAGE);
	const name = check("precinct", pos[0]);
	const login = check("login", opt.author);
	const input = readStdin();
	out(
		pulls
			? await syncPulls(name, login, input)
			: await syncIssues(name, login, input, reset),
	);
	return EXIT.OK;
}

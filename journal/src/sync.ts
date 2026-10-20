import type { Database } from "bun:sqlite";
import { check, parseArgs, usage } from "./args";
import {
	EXIT,
	Fail,
	inTransaction,
	isConstraint,
	normalizeTime,
	now,
	out,
	readStdin,
	withDb,
} from "./db";
import { inputRejected } from "./form";
import { asciiLower, collectIssueMarkers, type GhIssue } from "./markers";
import { syncPulls } from "./pulls";

export const SYNC_LIMIT = 1000;

const SYNC_USAGE = "sync <precinct> --author <login> [--reset | --pulls]";
const MARKER_PREFIX = "<!-- lawman:";

type SyncIssue = GhIssue & {
	bot: boolean;
	state: string;
	stateReason: string | null;
	title: string;
	closedAt: string | null;
};
type SyncStats = {
	issues: number;
	leads: number;
	markers: number;
	invalid: number;
	skipped: number;
};

const text = (v: unknown) => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown) =>
	typeof v === "string" && v !== "" ? v : null;
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null;
const syncInput = (why: string) =>
	inputRejected("issues", `sync input rejected, cache untouched: ${why}`);
const timeOf = (v: unknown, what: string): string => {
	const time = typeof v === "string" ? normalizeTime(v) : null;
	if (time === null) throw syncInput(`${what} is not a time`);
	return time;
};

function readIssue(raw: unknown): SyncIssue {
	if (
		!isRecord(raw) ||
		!Number.isInteger(raw.number) ||
		typeof raw.state !== "string"
	) {
		throw syncInput("every element needs an integer number and a state");
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
		stateReason: textOrNull(raw.stateReason),
		title: text(raw.title),
		createdAt: timeOf(raw.createdAt, "an issue createdAt"),
		closedAt: closed === null ? null : timeOf(closed, "an issue closedAt"),
		author: login === "" ? null : { login },
		body: text(raw.body),
		comments: comments.map((c) => ({
			author:
				isRecord(c.author) && text(c.author.login) !== ""
					? { login: text(c.author.login) }
					: null,
			body: text(c.body),
			createdAt: timeOf(c.createdAt, "a comment createdAt"),
		})),
	};
}

function readIssues(input: string): SyncIssue[] {
	let data: unknown;
	try {
		data = JSON.parse(input);
	} catch {
		throw syncInput("stdin is not valid JSON");
	}
	if (!Array.isArray(data)) throw syncInput("stdin is not a JSON array");
	const issues = data.map(readIssue);
	if (issues.length === SYNC_LIMIT) {
		throw new Fail(
			EXIT.SYNC_LIMIT,
			`${SYNC_LIMIT} issues reached the limit: the list may be truncated, cache untouched`,
		);
	}
	return issues;
}

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
				asciiLower(c.author?.login ?? "") === author &&
				!c.body.split("\n").some((l) => l.startsWith(MARKER_PREFIX)),
		)
		.map((c) => c.createdAt);
	return times.length === 0 ? null : times.reduce((a, b) => (a > b ? a : b));
}

function storeIssue(
	db: Database,
	name: string,
	issue: SyncIssue,
	login: string,
	stats: SyncStats,
): void {
	db.run(
		"INSERT INTO issues (precinct, issue, state, state_reason, title, created_at, closed_at, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		[
			name,
			issue.number,
			issue.state,
			issue.stateReason,
			issue.title,
			issue.createdAt,
			issue.closedAt,
			repliedAt(issue),
		],
	);
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
	stats.issues++;
	stats.leads += leadOrigin ? 1 : 0;
	stats.markers += markers.length;
	stats.invalid +=
		markerShaped(issue) -
		markers.filter((m) => m.marker.fields.legacy === undefined).length;
}

function replaceCache(
	db: Database,
	name: string,
	login: string,
	issues: SyncIssue[],
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
	for (const issue of issues) {
		if (!isHuman(issue)) stats.skipped++;
		else storeIssue(db, name, issue, login, stats);
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

export function sync(args: string[]): void {
	const [withoutReset, reset] = takeFlag(args, "--reset");
	const [rest, pulls] = takeFlag(withoutReset, "--pulls");
	if (reset && pulls) throw usage(SYNC_USAGE);
	const { pos, opt } = parseArgs(rest, 1, ["author"], SYNC_USAGE);
	const name = check("precinct", pos[0]);
	const login = check("login", opt.author);
	if (pulls) {
		syncPulls(name, login, readStdin());
		return;
	}
	const issues = readIssues(readStdin());
	withDb((db) => {
		let stats: SyncStats;
		try {
			stats = inTransaction(db, () =>
				replaceCache(db, name, login, issues, reset),
			);
		} catch (e) {
			if (!isConstraint(e)) throw e;
			throw syncInput(
				"the issues break a cache constraint, for example a repeated number",
			);
		}
		out(
			`issues=${stats.issues} leads=${stats.leads} markers=${stats.markers} invalid=${stats.invalid} skipped=${stats.skipped}`,
		);
	});
}

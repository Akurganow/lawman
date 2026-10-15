import type { Database } from "bun:sqlite";
import { EXIT, Fail, LEAD_ORIGIN_FROM, LEAD_PREFIX, inTransaction, isConstraint, now, out, readStdin, withDb } from "./db";
import { check, parseArgs, usage } from "./args";
import { type GhIssue, asciiLower, canonicalId, collectIssueMarkers } from "./markers";

export const SYNC_LIMIT = 1000;

const SYNC_USAGE = "sync <precinct> --author <login> [--reset]";
const MARKER_PREFIX = "<!-- lawman:";

type SyncIssue = GhIssue & { state: string; stateReason: string | null; title: string; closedAt: string | null };
type SyncStats = { issues: number; leads: number; markers: number; invalid: number; skipped: number };

const text = (v: unknown) => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const syncInput = (why: string) => new Fail(EXIT.SYNC_INPUT, `sync input rejected, cache untouched: ${why}`);

function readIssue(raw: unknown): SyncIssue {
  if (!isRecord(raw) || !Number.isInteger(raw.number) || typeof raw.state !== "string") {
    throw syncInput("every element needs an integer number and a state");
  }
  const login = isRecord(raw.author) ? text(raw.author.login) : "";
  const comments = Array.isArray(raw.comments) ? raw.comments.filter(isRecord) : [];
  return {
    number: raw.number as number,
    state: raw.state,
    stateReason: textOrNull(raw.stateReason),
    title: text(raw.title),
    createdAt: text(raw.createdAt),
    closedAt: textOrNull(raw.closedAt),
    author: login === "" ? null : { login },
    body: text(raw.body),
    comments: comments.map((c) => ({
      author: isRecord(c.author) && text(c.author.login) !== "" ? { login: text(c.author.login) } : null,
      body: text(c.body),
      createdAt: text(c.createdAt),
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
    throw new Fail(EXIT.SYNC_LIMIT, `${SYNC_LIMIT} issues reached the gh limit: the list may be truncated, cache untouched`);
  }
  return issues;
}

const markerShaped = (issue: SyncIssue) =>
  [issue.body, ...issue.comments.map((c) => c.body)].flatMap((t) => t.split("\n")).filter((l) => l.startsWith(MARKER_PREFIX)).length;

function storeIssue(db: Database, name: string, issue: SyncIssue, login: string, stats: SyncStats): void {
  db.run("INSERT INTO issues (precinct, issue, state, state_reason, title, created_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    name,
    issue.number,
    issue.state,
    issue.stateReason,
    issue.title,
    issue.createdAt,
    issue.closedAt,
  ]);
  const { markers, leadOrigin } = collectIssueMarkers(issue, login);
  for (const { ord, marker } of markers) {
    const isLead = marker.stage === "lead";
    db.run("INSERT INTO markers (precinct, issue, ord, role, stage, department, lead_id, fields, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      name,
      issue.number,
      ord,
      marker.role,
      marker.stage,
      isLead ? (marker.fields.department ?? null) : null,
      isLead ? (marker.fields.id ?? null) : null,
      JSON.stringify(marker.fields),
      marker.raw,
    ]);
  }
  stats.issues++;
  stats.leads += leadOrigin ? 1 : 0;
  stats.markers += markers.length;
  stats.invalid += markerShaped(issue) - markers.filter((m) => m.marker.fields.legacy === undefined).length;
}

function replaceCache(db: Database, name: string, login: string, issues: SyncIssue[], reset: boolean): SyncStats {
  const stats: SyncStats = { issues: 0, leads: 0, markers: 0, invalid: 0, skipped: 0 };
  if (!db.query("SELECT 1 FROM precincts WHERE name = ?").get(name)) throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
  const cached = db.query("SELECT count(*) AS n FROM issues WHERE precinct = ?").get(name) as { n: number };
  if (issues.length === 0 && cached.n > 0 && !reset) throw syncInput("empty list over a filled cache needs --reset");
  db.run("DELETE FROM markers WHERE precinct = ?", [name]);
  db.run("DELETE FROM issues WHERE precinct = ?", [name]);
  for (const issue of issues) {
    if (asciiLower(issue.author?.login ?? "") !== asciiLower(login)) stats.skipped++;
    else storeIssue(db, name, issue, login, stats);
  }
  db.run("UPDATE precincts SET synced_at = ? WHERE name = ?", [now(), name]);
  return stats;
}

export function sync(args: string[]): void {
  const rest = args.filter((a) => a !== "--reset");
  if (args.length - rest.length > 1) throw usage(SYNC_USAGE);
  const { pos, opt } = parseArgs(rest, 1, ["author"], SYNC_USAGE);
  const name = check("precinct", pos[0]);
  const login = check("login", opt.author);
  const issues = readIssues(readStdin());
  withDb((db) => {
    let stats: SyncStats;
    try {
      stats = inTransaction(db, () => replaceCache(db, name, login, issues, rest.length < args.length));
    } catch (e) {
      if (!isConstraint(e)) throw e;
      throw syncInput("the issues break a cache constraint, for example a repeated number");
    }
    out(`issues=${stats.issues} leads=${stats.leads} markers=${stats.markers} invalid=${stats.invalid} skipped=${stats.skipped}`);
  });
}

export const CAP_TABLE: { upTo: number | null; cap: number }[] = [
  { upTo: 2, cap: 3 },
  { upTo: 4, cap: 1 },
  { upTo: null, cap: 0 },
];

const LEADS_USAGE = "leads <precinct> [--department <d>] [--state open|all]";
const SEEN_USAGE = "seen <precinct> --id <path::symbol::kind>";
const CAP_USAGE = "cap <precinct> --department <d>";
const LAST_USAGE = "last <precinct> --role <role>";
const COMPLETED = "COMPLETED";

type Origin = { issue: number; state: string; state_reason: string | null; department: string | null; lead_id: string | null; title: string };

function leadOrigins(db: Database, name: string): Origin[] {
  return db
    .query(
      `SELECT i.issue, i.state, i.state_reason, m.department, m.lead_id, i.title ${LEAD_ORIGIN_FROM} AND i.precinct = ?
       ORDER BY i.issue`,
    )
    .all(name) as Origin[];
}

export function leads(args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, [], LEADS_USAGE, ["department", "state"]);
  const name = check("precinct", pos[0]);
  const department = opt.department === undefined ? null : check("department", opt.department);
  const state = opt.state ?? "open";
  if (state !== "open" && state !== "all") throw usage(LEADS_USAGE);
  withDb((db) => {
    for (const o of leadOrigins(db, name)) {
      if ((state === "open" && o.state !== "OPEN") || (department !== null && o.department !== department)) continue;
      out(o.issue, o.state, o.state_reason ?? "", o.department ?? "", o.lead_id ?? "", o.title);
    }
  });
}

const symbolOf = (id: string) => id.slice(0, id.lastIndexOf("::"));

function seenLine(origins: Origin[], id: string): string {
  const same = origins.filter((o) => symbolOf(o.lead_id ?? "") === symbolOf(id));
  const classes: [string, Origin | undefined][] = [
    ["open", same.find((o) => o.state === "OPEN")],
    ["declined", same.find((o) => o.state === "CLOSED" && o.state_reason !== COMPLETED)],
    ["fixed", origins.find((o) => o.state === "CLOSED" && o.state_reason === COMPLETED && o.lead_id === id)],
  ];
  const hit = classes.find(([, o]) => o !== undefined);
  return hit ? `${hit[0]} #${hit[1]!.issue}` : "none";
}

export function seen(args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["id"], SEEN_USAGE);
  const name = check("precinct", pos[0]);
  if (!canonicalId(opt.id)) throw new Fail(EXIT.USAGE, `invalid id: ${JSON.stringify(opt.id)}`);
  withDb((db) => out(seenLine(leadOrigins(db, name), opt.id)));
}

function capFor(open: number): number {
  return CAP_TABLE.find((row) => row.upTo === null || open <= row.upTo)!.cap;
}

// a broken lead has the title prefix but no lead marker, so it has no origin department
function brokenCount(db: Database, name: string, department: string): number {
  const prefix = `${LEAD_PREFIX} ${department}:`;
  const row = db
    .query(
      `SELECT count(*) AS n FROM issues i
       WHERE precinct = ? AND state = 'OPEN' AND substr(title, 1, length(?)) = ?
         AND NOT EXISTS (SELECT 1 FROM markers m WHERE m.precinct = i.precinct AND m.issue = i.issue AND m.stage = 'lead')`,
    )
    .get(name, prefix, prefix) as { n: number };
  return row.n;
}

export function cap(args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["department"], CAP_USAGE);
  const name = check("precinct", pos[0]);
  const department = check("department", opt.department);
  withDb((db) => {
    const origins = leadOrigins(db, name).filter((o) => o.state === "OPEN" && o.department === department);
    const open = origins.length + brokenCount(db, name, department);
    out(`cap=${capFor(open)} open=${open}`);
  });
}

export function last(args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["role"], LAST_USAGE);
  const name = check("precinct", pos[0]);
  const roleName = check("role", opt.role);
  withDb((db) => {
    const rows = db
      .query(
        `SELECT department, max(at) AS at FROM dispatches
         WHERE precinct = ? AND role = ? AND department IS NOT NULL
         GROUP BY department ORDER BY max(at), department`,
      )
      .all(name, roleName) as { department: string; at: string }[];
    for (const r of rows) out(r.department, r.at);
  });
}

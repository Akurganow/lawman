import { afterEach, beforeEach, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectIssueMarkers, extractMarkers } from "./markers";
import issues from "./fixtures/issues.json";

export { issues };

export const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src", "journal.ts");
const HARNESS = `
const j = await import(${JSON.stringify(SRC)});
j.COMMANDS["open-db"] = () => { j.open().close(); };
process.exitCode = j.main(["open-db"]);
`;

export let dir: string;
export let dbFile: string;

export function tempDb(): void {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lawman-test-"));
    dbFile = join(dir, "journal.sqlite");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
}

export function env(extra: Record<string, string> = {}): Record<string, string> {
  return { PATH: process.env.PATH ?? "", ...extra };
}

export function cli(args: string[], extra: Record<string, string> = {}) {
  const r = Bun.spawnSync(["bun", "src/journal.ts", ...args], { cwd: ROOT, env: env(extra) });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

export function harness(extra: Record<string, string>) {
  return Bun.spawn(["bun", "-e", HARNESS], { cwd: ROOT, env: env(extra), stdout: "pipe", stderr: "pipe" });
}

export function tables(db: Database): string[] {
  const rows = db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function userVersion(db: Database): number {
  return (db.query("PRAGMA user_version").get() as { user_version: number }).user_version;
}

export function run(args: string[]) {
  return cli(args, { LAWMAN_DB: dbFile });
}

export function addPrecincts(weights: Record<string, number>): void {
  for (const [name, weight] of Object.entries(weights)) {
    expect(run(["precinct", "add", name, "--repo", `o/${name}`, "--weight", String(weight)]).code).toBe(0);
  }
}

export const TRUSTED = "octocat-lawman";
export const SHA = "0123456789abcdef0123456789abcdef01234567";
export const AT = "at=2026-10-14T09:30:00Z";
export const LEAD_ID = "src/a.rs::f::dead-code";
export const lead = (extra = "", id = LEAD_ID) =>
  `<!-- lawman: role=patrol stage=lead department=core id=${id} sha=${SHA} ${AT}${extra} -->`;
export const ret = (extra = "") => `<!-- lawman: role=judge stage=return to=patrol round=1 ${AT}${extra} -->`;

export function collect(n: number) {
  const issue = issues.find((i) => i.number === n)!;
  return collectIssueMarkers(issue, TRUSTED);
}

export const rounds = (n: number) => collect(n).markers.map((m) => m.marker.fields.round);

export function carrier(text: string, author = TRUSTED) {
  return extractMarkers({ text, createdAt: "2026-10-14T09:00:00Z", rank: 0, author }, TRUSTED);
}

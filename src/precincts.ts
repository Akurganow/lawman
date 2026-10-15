import type { Database } from "bun:sqlite";
import { EXIT, Fail, inTransaction, isConstraint, now, out, withDb } from "./db";
import { check, count, parseArgs, usage } from "./args";

const PRECINCT_USAGE = "precinct <add <name> --repo <owner/repo> --weight <n>|set <name> --weight <n>|list>";

function precinctAdd(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["repo", "weight"], PRECINCT_USAGE);
  const name = check("precinct", pos[0]);
  const repo = check("repo", opt.repo);
  const weight = count(opt.weight, "weight", 0);
  try {
    db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [name, repo, weight]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    throw new Fail(EXIT.USAGE, `precinct or repo already registered: ${name} ${repo}`);
  }
}

function precinctSet(db: Database, args: string[]): void {
  const { pos, opt } = parseArgs(args, 1, ["weight"], PRECINCT_USAGE);
  const name = check("precinct", pos[0]);
  const weight = count(opt.weight, "weight", 0);
  inTransaction(db, () => {
    if (db.run("UPDATE precincts SET weight = ? WHERE name = ?", [weight, name]).changes === 0) {
      throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
    }
    db.run("UPDATE precincts SET credit = 0");
  });
}

function precinctList(db: Database, args: string[]): void {
  if (args.length > 0) throw usage(PRECINCT_USAGE);
  const rows = db.query("SELECT name, repo, weight, credit, synced_at FROM precincts ORDER BY name").all();
  for (const r of rows as { name: string; repo: string; weight: number; credit: number; synced_at: string | null }[]) {
    out(r.name, r.repo, r.weight, r.credit, r.synced_at ?? "");
  }
}

const PRECINCT_COMMANDS: Record<string, (db: Database, args: string[]) => void> = {
  add: precinctAdd,
  set: precinctSet,
  list: precinctList,
};

export function precinct(args: string[]): void {
  const [sub, ...rest] = args;
  if (sub === undefined || !Object.hasOwn(PRECINCT_COMMANDS, sub)) throw usage(PRECINCT_USAGE);
  withDb((db) => PRECINCT_COMMANDS[sub](db, rest));
}

export function role(args: string[]): void {
  const text = "role set <role> --every <minutes>";
  if (args[0] !== "set") throw usage(text);
  const { pos, opt } = parseArgs(args.slice(1), 1, ["every"], text);
  const name = check("role", pos[0]);
  const minutes = count(opt.every, "minutes", 1);
  withDb((db) => {
    db.run(
      "INSERT INTO roles (name, every_minutes) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET every_minutes = excluded.every_minutes",
      [name, minutes],
    );
  });
}

type Admitted = { name: string; repo: string; weight: number; credit: number };

export function pickNext(db: Database, roleName: string): { name: string; repo: string } | null {
  return inTransaction(db, () => {
    const admitted = db
      .query(
        `SELECT name, repo, weight, credit FROM precincts p
         WHERE weight > 0 AND NOT EXISTS (
           SELECT 1 FROM dispatches d
           WHERE d.precinct = p.name AND d.role = ? AND d.outcome IS NULL AND d.issue IS NULL)
         ORDER BY name`,
      )
      .all(roleName) as Admitted[];
    if (admitted.length === 0) return null;
    const total = admitted.reduce((sum, p) => sum + p.weight, 0);
    const bump = db.query("UPDATE precincts SET credit = credit + weight WHERE name = ?");
    for (const p of admitted) {
      bump.run(p.name);
      p.credit += p.weight;
    }
    const chosen = admitted.reduce((best, p) => (p.credit > best.credit ? p : best));
    db.run("UPDATE precincts SET credit = credit - ? WHERE name = ?", [total, chosen.name]);
    return { name: chosen.name, repo: chosen.repo };
  });
}

export function next(args: string[]): void {
  const { opt } = parseArgs(args, 0, ["role"], "next --role <role>");
  const roleName = check("role", opt.role);
  withDb((db) => {
    const pick = pickNext(db, roleName);
    if (pick) out(pick.name, pick.repo);
  });
}

const PAUSE_USAGE = "pause <set|clear>";

function pauseSet(db: Database): void {
  try {
    db.run("INSERT INTO pauses (started_at) VALUES (?)", [now()]);
  } catch (e) {
    if (!isConstraint(e)) throw e;
    throw new Fail(EXIT.USAGE, "a pause is already open");
  }
}

function pauseClear(db: Database): void {
  if (db.run("UPDATE pauses SET ended_at = ? WHERE ended_at IS NULL", [now()]).changes === 0) {
    throw new Fail(EXIT.USAGE, "no open pause");
  }
}

export function pause(args: string[]): void {
  if (args.length !== 1 || (args[0] !== "set" && args[0] !== "clear")) throw usage(PAUSE_USAGE);
  withDb((db) => (args[0] === "set" ? pauseSet(db) : pauseClear(db)));
}

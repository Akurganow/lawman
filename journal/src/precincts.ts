import type { Database } from "bun:sqlite";
import { check, count, parseArgs, subcommand, usage } from "./args";
import { EXIT, Fail, inTransaction, isConstraint, out, withDb } from "./db";

const PRECINCT_USAGE =
	"precinct <add <name> --repo <owner/repo> --weight <n>|set <name> --weight <n>|list>";

function precinctAdd(db: Database, args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["repo", "weight"], PRECINCT_USAGE);
	const name = check("precinct", pos[0]);
	const repo = check("repo", opt.repo);
	const weight = count(opt.weight, "weight", 0);
	try {
		db.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [
			name,
			repo,
			weight,
		]);
	} catch (e) {
		if (!isConstraint(e)) throw e;
		throw new Fail(
			EXIT.USAGE,
			`precinct or repo already registered: ${name} ${repo}`,
		);
	}
}

function precinctSet(db: Database, args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["weight"], PRECINCT_USAGE);
	const name = check("precinct", pos[0]);
	const weight = count(opt.weight, "weight", 0);
	inTransaction(db, () => {
		if (
			db.run("UPDATE precincts SET weight = ? WHERE name = ?", [weight, name])
				.changes === 0
		) {
			throw new Fail(EXIT.USAGE, `unknown precinct: ${name}`);
		}
		db.run("UPDATE precincts SET credit = 0");
	});
}

function precinctList(db: Database, args: string[]): void {
	if (args.length > 0) throw usage(PRECINCT_USAGE);
	const rows = db
		.query(
			"SELECT name, repo, weight, credit, synced_at FROM precincts ORDER BY name",
		)
		.all();
	for (const r of rows as {
		name: string;
		repo: string;
		weight: number;
		credit: number;
		synced_at: string | null;
	}[]) {
		out(r.name, r.repo, r.weight, r.credit, r.synced_at ?? "");
	}
}

const PRECINCT_COMMANDS: Record<
	string,
	(db: Database, args: string[]) => void
> = {
	add: precinctAdd,
	set: precinctSet,
	list: precinctList,
};

export function precinct(args: string[]): void {
	const { run, rest } = subcommand(PRECINCT_COMMANDS, args, PRECINCT_USAGE);
	withDb((db) => run(db, rest));
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

// every admitted precinct gains its weight, the chosen one loses their sum
export function creditVisit(
	db: Database,
	admitted: string[],
	chosen: string,
): void {
	const bump = db.query(
		"UPDATE precincts SET credit = credit + weight WHERE name = ? RETURNING weight",
	);
	const total = admitted.reduce(
		(sum, name) =>
			sum + ((bump.get(name) as { weight: number } | null)?.weight ?? 0),
		0,
	);
	db.run("UPDATE precincts SET credit = credit - ? WHERE name = ?", [
		total,
		chosen,
	]);
}

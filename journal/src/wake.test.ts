import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS } from "./db";
import {
	BASE,
	call,
	cli,
	dir,
	later,
	order,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

const wake = (clock = BASE, role = "patrol") =>
	call(clock, ["wake", "--role", role]);
const take = (clock = BASE, role = "patrol") =>
	call(clock, ["dispatch", "take", "--role", role]);
const DAY = BASE.slice(0, 10);

function seedOrders(body: (db: Database) => void): void {
	seed((db) => {
		db.run(
			"INSERT OR IGNORE INTO precincts (name, repo, weight) VALUES ('main', 'o/main', 1)",
		);
		body(db);
	});
}

const checkedAt = () =>
	rows("SELECT name, checked_at FROM roles ORDER BY name");

describe("wake", () => {
	test("prints idle with no order and for another role's order", () => {
		seedOrders(() => {});
		expect(wake()).toMatchObject({ code: 0, out: "idle\n" });
		seedOrders((db) => order(db, "main", "judge"));
		expect(wake()).toMatchObject({ code: 0, out: "idle\n" });
	});

	test("prints an untaken order and the UTC day, then idle once it is taken", () => {
		seedOrders((db) => order(db, "main", "patrol"));
		const id = rows("SELECT id FROM dispatches")[0]?.id;
		expect(wake().out).toBe(`order ${id}\nday ${DAY}\n`);
		expect(take().code).toBe(0);
		expect(wake().out).toBe("idle\n");
	});

	test("prints a taken order older than the claim limit and not one second inside it", () => {
		seedOrders((db) => order(db, "main", "patrol", { takenAt: BASE }));
		expect(wake(later(24, -1)).out).toBe("idle\n");
		expect(wake(later(24)).out).toBe("idle\n");
		expect(wake(later(24, 1)).out).toMatch(/^order \d+\nday /);
	});

	test("the day line follows the UTC date and two calls the same day print the same bytes", () => {
		seedOrders((db) => order(db, "main", "patrol"));
		const evening = "2026-05-01T23:59:59Z";
		const first = wake(evening);
		expect(first.out).toEndWith("day 2026-05-01\n");
		expect(wake(evening).out).toBe(first.out);
		expect(wake("2026-05-02T00:00:00Z").out).toEndWith("day 2026-05-02\n");
	});

	test("lists several orders oldest first and prints no precinct or issue text", () => {
		seedOrders((db) => {
			order(db, "main", "patrol", { at: later(2), issue: 3 });
			order(db, "main", "patrol", {
				at: later(1),
				issue: 4,
				department: "core",
			});
			order(db, "main", "patrol", { at: later(1), issue: 5 });
		});
		const ids = rows("SELECT id FROM dispatches ORDER BY issue").map(
			(r) => r.id,
		);
		const [late, early, tie] = ids;
		expect(wake(later(3)).out).toBe(
			`order ${early}\norder ${tie}\norder ${late}\nday ${DAY}\n`,
		);
	});

	test("records the check time for a role with a row only", () => {
		seedOrders((db) => {
			db.run(
				"INSERT INTO roles (name, every_minutes) VALUES ('patrol', 5), ('judge', 5)",
			);
		});
		expect(wake(later(1)).code).toBe(0);
		expect(checkedAt()).toEqual([
			{ name: "judge", checked_at: null },
			{ name: "patrol", checked_at: later(1) },
		]);
		expect(wake(later(2), "clerk")).toMatchObject({ code: 0, out: "idle\n" });
		expect(checkedAt()).toHaveLength(2);
	});

	test("a newer schema or an unreadable path exits non-zero with empty stdout", () => {
		seedOrders((db) => order(db, "main", "patrol"));
		seed((db) => db.run(`PRAGMA user_version = ${MIGRATIONS.length + 1}`));
		const newer = wake();
		expect([newer.code, newer.out]).toEqual([6, ""]);
		const folder = join(dir, "folder");
		mkdirSync(folder);
		const garbage = join(dir, "garbage.sqlite");
		writeFileSync(garbage, "not a database".repeat(100));
		for (const path of [folder, garbage, join(dir, "missing", "x.sqlite")]) {
			const r = cli(["wake", "--role", "patrol"], {
				LAWMAN_DB: path,
				LAWMAN_NOW: BASE,
			});
			expect([path, r.code === 0, r.out]).toEqual([path, false, ""]);
		}
	});

	test("usage errors exit 1 with empty stdout", () => {
		const bad = [
			["wake"],
			["wake", "--role"],
			["wake", "--role", "Bad"],
			["wake", "--role", "patrol", "--extra", "x"],
			["wake", "patrol"],
		];
		for (const args of bad) {
			const r = call(BASE, args);
			expect([args, r.code, r.out]).toEqual([args, 1, ""]);
		}
	});
});

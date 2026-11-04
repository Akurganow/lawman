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
const ordersOf = (out: string) =>
	out.split("\n").filter((line) => line.startsWith("order "));
const head = (clock = BASE, role = "patrol") =>
	`lawman input 1 role=${role} at=${clock} part 1 of 1`;

describe("wake", () => {
	test("prints nothing with no order and for another role's order", () => {
		seedOrders(() => {});
		expect(wake()).toMatchObject({ code: 0, out: "" });
		seedOrders((db) => order(db, "main", "judge"));
		expect(wake()).toMatchObject({ code: 0, out: "" });
	});

	test("prints an untaken order behind the check time, then nothing once it is taken", () => {
		seedOrders((db) => order(db, "main", "patrol"));
		const id = rows("SELECT id FROM dispatches")[0]?.id;
		const r = wake();
		expect(r.out).toStartWith(`${head()}\n`);
		expect(r.out).toEndWith(`order ${id} main o/main - -\nend part 1 of 1\n`);
		expect(take().code).toBe(0);
		expect(wake().out).toBe("");
	});

	test("an order left untaken changes the output at every check, no work stays the same", () => {
		seedOrders(() => {});
		expect(wake(later(1)).out).toBe(wake(later(2)).out);
		seedOrders((db) => order(db, "main", "patrol"));
		expect(wake(later(1)).out).not.toBe(wake(later(2)).out);
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
		expect(ordersOf(wake(later(3)).out)).toEqual([
			`order ${early} main o/main core 4`,
			`order ${tie} main o/main - 5`,
			`order ${late} main o/main - 3`,
		]);
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
		expect(wake(later(2), "clerk")).toMatchObject({ code: 0, out: "" });
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

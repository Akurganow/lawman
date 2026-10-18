import { describe, expect, test } from "bun:test";
import { inproc } from "./inproc";
import {
	BASE,
	later,
	order,
	precinct,
	seed,
	tempDb,
	tick,
} from "./test-helpers";

tempDb();

const alarm = (clock: string, ...flags: string[]) =>
	inproc(clock, ["alarm", ...flags]).out;
const role = (
	db: Parameters<Parameters<typeof seed>[0]>[0],
	minutes: number,
	checkedAt: string | null = null,
) =>
	db.run(
		"INSERT INTO roles (name, every_minutes, checked_at) VALUES ('patrol', ?, ?)",
		[minutes, checkedAt],
	);

describe("order-untaken in process", () => {
	test("fires 48 hours after the order and not before", () => {
		seed((db) => {
			precinct(db, "a");
			order(db, "a", "patrol");
		});
		expect(alarm(later(48))).toBe("");
		expect(alarm(later(48, 1))).toMatch(/^ALARM order-untaken 1 a patrol /);
	});

	test("a long role interval raises the limit", () => {
		seed((db) => {
			precinct(db, "a");
			role(db, 5760);
			order(db, "a", "patrol");
		});
		expect(alarm(later(120))).toBe("");
		expect(alarm(later(120, 1))).toMatch(/^ALARM order-untaken /);
	});

	test("a taken order adds the claim limit and a closed one never fires", () => {
		seed((db) => {
			precinct(db, "a");
			order(db, "a", "patrol", { takenAt: BASE });
			order(db, "a", "judge", { outcome: "silent" });
		});
		expect(alarm(later(72))).toBe("");
		expect(alarm(later(72, 1))).toMatch(/^ALARM order-untaken 1 /);
	});

	test("--repeat prints an open alarm again after a day only", () => {
		seed((db) => {
			precinct(db, "a");
			order(db, "a", "patrol");
		});
		alarm(later(49));
		expect(alarm(later(72), "--repeat")).toBe("");
		expect(alarm(later(73, 1), "--repeat")).toMatch(/^ALARM order-untaken 1 /);
	});

	test("a bad flag is a usage error", () => {
		expect(inproc(BASE, ["alarm", "--bogus"]).code).toBe(1);
	});
});

describe("role-silent in process", () => {
	test("fires after three intervals from the last tick start", () => {
		seed((db) => {
			role(db, 10);
			tick(db, "patrol", BASE, later(0, 60), "silent");
		});
		expect(alarm(later(0, 1800))).toBe("");
		expect(alarm(later(0, 1801))).toMatch(
			/^ALARM role-silent patrol last tick started /,
		);
	});

	test("a later check moves the start of the silence", () => {
		seed((db) => {
			role(db, 10, later(0, 1500));
			tick(db, "patrol", BASE, later(0, 60), "silent");
		});
		expect(alarm(later(0, 3300))).toBe("");
		expect(alarm(later(0, 3301))).toMatch(
			/^ALARM role-silent patrol last check /,
		);
	});

	test("a role without an ended tick never fires", () => {
		seed((db) => {
			role(db, 10, BASE);
			tick(db, "patrol", BASE, null, null);
		});
		expect(alarm(later(1000))).not.toContain("role-silent");
	});
});

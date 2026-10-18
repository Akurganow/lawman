import { describe, expect, test } from "bun:test";
import {
	alarm,
	BASE,
	later,
	order,
	precinct,
	seed,
	tempDb,
	tick,
} from "./test-helpers";

tempDb();

describe("alarm cadence", () => {
	describe("order-untaken follows the role's interval", () => {
		const orderFor = (everyMinutes: number | null, takenAt?: string) =>
			seed((db) => {
				precinct(db, "a");
				if (everyMinutes !== null)
					db.run(
						"INSERT INTO roles (name, every_minutes) VALUES ('patrol', ?)",
						[everyMinutes],
					);
				order(db, "a", "patrol", takenAt ? { takenAt } : {});
			});
		const limits: [string, number | null, number][] = [
			["no roles row", null, 48],
			["a daily role", 1440, 48],
			["a four-day role", 5760, 120],
			["a weekly role", 10080, 192],
			["a short interval", 10, 48],
		];
		for (const [name, minutes, hours] of limits) {
			test(`${name} fires after ${hours} hours and not before`, () => {
				orderFor(minutes);
				expect(alarm(later(hours)).out).toBe("");
				expect(alarm(later(hours, 1)).out).toMatch(
					/^ALARM order-untaken 1 .+\n$/,
				);
			});
		}

		test("a taken order adds the claim limit to the interval limit", () => {
			orderFor(5760, BASE);
			expect(alarm(later(144)).out).toBe("");
			expect(alarm(later(144, 1)).out).toMatch(/^ALARM order-untaken 1 .+\n$/);
		});
	});

	describe("role-silent counts from the later of the last tick and the last check", () => {
		const THREE_INTERVALS_S = 1800;
		const gated = (checkedAt: string | null, tickStart = BASE) =>
			seed((db) => {
				db.run(
					"INSERT INTO roles (name, every_minutes, checked_at) VALUES ('patrol', 10, ?)",
					[checkedAt],
				);
				tick(db, "patrol", tickStart, later(0, 60), "silent");
			});

		test("a check keeps an idle role quiet for three intervals after it", () => {
			gated(later(0, 1500));
			expect(alarm(later(0, 1500 + THREE_INTERVALS_S)).out).toBe("");
			expect(alarm(later(0, 1501 + THREE_INTERVALS_S)).out).toMatch(
				/^ALARM role-silent patrol .+\n$/,
			);
		});

		test("no check and an old tick fire after three intervals", () => {
			gated(null);
			expect(alarm(later(0, THREE_INTERVALS_S)).out).toBe("");
			expect(alarm(later(0, THREE_INTERVALS_S + 1)).out).toMatch(
				/^ALARM role-silent patrol /,
			);
		});

		test("a check without any ended tick never fires", () => {
			seed((db) => {
				db.run(
					"INSERT INTO roles (name, every_minutes, checked_at) VALUES ('patrol', 10, ?)",
					[BASE],
				);
				tick(db, "patrol", BASE, null, null);
			});
			expect(alarm(later(1000)).out).not.toContain("role-silent");
		});

		test("a check older than the last tick uses the tick", () => {
			gated(BASE, later(0, 1200));
			expect(alarm(later(0, 1200 + THREE_INTERVALS_S)).out).toBe("");
			expect(alarm(later(0, 1201 + THREE_INTERVALS_S)).out).toMatch(
				/^ALARM role-silent patrol /,
			);
		});

		test("the detail names the later time", () => {
			gated(later(0, 1500));
			expect(alarm(later(1)).out).toBe(
				`ALARM role-silent patrol last check ${later(0, 1500)}\n`,
			);
		});

		test("the detail names the tick start when the tick is later", () => {
			gated(BASE, later(0, 1200));
			expect(alarm(later(1)).out).toBe(
				`ALARM role-silent patrol last tick started ${later(0, 1200)}\n`,
			);
		});
	});
});

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
	describe("order-untaken ignores the role's interval", () => {
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
		const intervals: [string, number | null][] = [
			["no roles row", null],
			["a daily role", 1440],
			["a four-day role", 5760],
			["a weekly role", 10080],
			["a short interval", 10],
		];
		for (const [name, minutes] of intervals) {
			test(`${name}: a taken order fires 24 hours after the claim and not before`, () => {
				orderFor(minutes, BASE);
				expect(alarm(later(24)).out).toBe("");
				expect(alarm(later(24, 1)).out).toMatch(
					/^ALARM order-untaken 1 a patrol taken .+\n$/,
				);
			});

			test(`${name}: an untaken order of any age raises nothing`, () => {
				orderFor(minutes);
				expect(alarm(later(24 * 30)).out).toBe("");
			});
		}
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

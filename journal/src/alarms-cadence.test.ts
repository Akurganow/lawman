import { describe, expect, test } from "bun:test";
import { alarm, BASE, later, seed, tempDb, tick } from "./test-helpers";

tempDb();

describe("alarm cadence", () => {
	describe("tick-hung on the ticks of one role", () => {
		test("a tick with no end record alarms when a later tick of its role exists", () => {
			seed((db) => {
				tick(db, "patrol", BASE, null, null);
				tick(db, "patrol", later(1), null, null);
			});
			expect(alarm(later(3)).out).toBe(
				`ALARM tick-hung 1 patrol started ${BASE}\n`,
			);
		});

		test("a tick with no end record and no later tick of its role raises nothing", () => {
			seed((db) => tick(db, "patrol", BASE, null, null));
			expect(alarm(later(3)).out).toBe("");
		});
	});

	describe("the repetition of an open alarm", () => {
		const dead = () =>
			seed((db) => {
				tick(db, "patrol", BASE, null, null);
				tick(db, "patrol", later(1), null, null);
			});
		const HUNG = `ALARM tick-hung 1 patrol started ${BASE}\n`;

		test("--repeat prints an open alarm once at every call and nothing without --repeat", () => {
			dead();
			alarm(later(2));
			expect(alarm(later(3), "--repeat").out).toBe(HUNG);
			expect(alarm(later(4), "--repeat").out).toBe(HUNG);
			expect(alarm(later(5)).out).toBe("");
		});

		test("an alarm raised in the call is not repeated in the same call", () => {
			dead();
			expect(alarm(later(2), "--repeat").out.trim().split("\n")).toHaveLength(
				1,
			);
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

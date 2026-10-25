import { beforeEach, describe, expect, test } from "bun:test";
import { handed, human, put } from "./cases-fixture";
import { BOT, hostPulls, READY, SPEC } from "./pulls-fixture";
import {
	addPrecincts,
	alarm,
	BASE,
	cachePull,
	call,
	later,
	order,
	precinct,
	rows,
	seed,
	tempDb,
	tick,
	WAITS_SPEC,
	WAITS_WORK,
} from "./test-helpers";

tempDb();

const alarmsOnce = (at: string, pattern: RegExp) => {
	const r = alarm(at);
	expect(r.out).toMatch(pattern);
	expect(r.out.trim().split("\n")).toHaveLength(1);
};

describe("alarms and status", () => {
	describe("alarm kinds", () => {
		test("order-untaken fires after 48 hours and not before", () => {
			seed((db) => {
				precinct(db, "a");
				order(db, "a", "patrol");
			});
			expect(alarm(later(48))).toMatchObject({ code: 0, out: "" });
			expect(alarm(later(48, 1)).out).toMatch(/^ALARM order-untaken 1 .+\n$/);
		});

		test("an order that was taken or closed does not alarm", () => {
			seed((db) => {
				precinct(db, "a");
				order(db, "a", "patrol", { takenAt: BASE });
				order(db, "a", "duty-desk", { outcome: "silent" });
			});
			expect(alarm(later(72)).out).toBe("");
		});

		test("a taken order whose claim expired alarms 48 hours after the claim TTL", () => {
			seed((db) => precinct(db, "a"));
			expect(
				call(BASE, ["dispatch", "add", "--precinct", "a", "--role", "patrol"])
					.code,
			).toBe(0);
			expect(call(BASE, ["dispatch", "take", "--role", "patrol"]).code).toBe(0);
			expect(alarm(later(72)).out).toBe("");
			expect(alarm(later(72, 1)).out).toMatch(/^ALARM order-untaken 1 .+\n$/);
		});

		test("tick-hung fires after 2 hours and not before", () => {
			seed((db) => tick(db, "patrol", BASE, null, null));
			expect(alarm(later(2)).out).toBe("");
			expect(alarm(later(2, 1)).out).toMatch(/^ALARM tick-hung 1 .+\n$/);
		});

		test("role-silent fires after three intervals and not before", () => {
			seed((db) => {
				db.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 10)");
				tick(db, "patrol", BASE, later(0, 60), "silent");
			});
			expect(alarm(later(0, 1800)).out).toBe("");
			expect(alarm(later(0, 1801)).out).toMatch(
				/^ALARM role-silent patrol .+\n$/,
			);
		});

		test("role-silent measures from the latest tick start", () => {
			seed((db) => {
				db.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 10)");
				tick(db, "patrol", BASE, later(0, 60), "silent");
				tick(db, "patrol", later(0, 1200), later(0, 1260), "silent");
			});
			expect(alarm(later(0, 3000)).out).toBe("");
			expect(alarm(later(0, 3001)).out).toMatch(/^ALARM role-silent patrol /);
		});

		test("a role with no ticks, or no ended tick, never raises role-silent", () => {
			seed((db) => {
				db.run("INSERT INTO roles (name, every_minutes) VALUES ('ghost', 1)");
				db.run("INSERT INTO roles (name, every_minutes) VALUES ('starter', 1)");
				tick(db, "starter", BASE, null, null);
			});
			expect(alarm(later(1000)).out).not.toContain("role-silent");
		});

		test("tick-failing needs the three latest ended ticks of one role and precinct to fail", () => {
			seed((db) => {
				tick(db, "patrol", later(0), later(0, 60), "filed", "a");
				tick(db, "patrol", later(1), later(1, 60), "failed", "a");
				tick(db, "patrol", later(2), later(2, 60), "stopped-host-auth", "a");
				tick(
					db,
					"patrol",
					later(3),
					later(3, 60),
					"skipped-no-constitution",
					"b",
				);
				tick(db, "patrol", later(4), later(4, 60), "failed", "b");
				tick(db, "duty-desk", later(5), later(5, 60), "failed", "a");
			});
			expect(alarm(later(6)).out).toBe("");
			seed((db) =>
				tick(
					db,
					"patrol",
					later(6),
					later(6, 60),
					"skipped-no-constitution",
					"a",
				),
			);
			alarmsOnce(later(7), /^ALARM tick-failing patrol\/a .+\n$/);
		});

		test("a newer success ends tick-failing", () => {
			seed((db) => {
				for (let i = 0; i < 3; i++)
					tick(db, "patrol", later(i), later(i, 60), "failed", "a");
			});
			expect(alarm(later(4)).out).toContain("tick-failing patrol/a");
			seed((db) => tick(db, "patrol", later(5), later(5, 60), "silent", "a"));
			alarm(later(6));
			expect(rows("SELECT cleared_at FROM alarms")).toEqual([
				{ cleared_at: later(6) },
			]);
		});

		test("unended ticks do not count towards tick-failing", () => {
			seed((db) => {
				tick(db, "patrol", later(0), later(0, 60), "failed", "a");
				tick(db, "patrol", later(1), later(1, 60), "failed", "a");
				tick(db, "patrol", later(2), null, null, "a");
				tick(db, "patrol", later(3), later(3, 60), "stopped-sync");
				tick(db, "patrol", later(4), later(4, 60), "stopped-sync");
			});
			expect(alarm(later(6, 120)).out).not.toContain("tick-failing");
		});

		test("three stopped ticks without a precinct raise tick-failing under role/-", () => {
			seed((db) => {
				tick(db, "patrol", later(0), later(0, 60), "stopped-law-drift");
				tick(db, "patrol", later(1), later(1, 60), "stopped-dirty-law");
				tick(db, "patrol", later(2), later(2, 60), "stopped-host-auth");
			});
			alarmsOnce(later(3), /^ALARM tick-failing patrol\/- .+\n$/);
		});

		test("broken-lead fires for a [Lead] issue without a lead marker", () => {
			seed((db) => {
				const issue = (n: number, title: string) =>
					db.run(
						"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('a', ?, 'OPEN', ?, ?)",
						[n, title, BASE],
					);
				const marker = (n: number, stage: string) =>
					db.run(
						"INSERT INTO markers (precinct, issue, ord, role, stage, fields, raw) VALUES ('a', ?, '1', 'patrol', ?, '{}', 'raw')",
						[n, stage],
					);
				issue(7, "[Lead] broken");
				issue(8, "[Lead] fine");
				marker(8, "lead");
				issue(9, "ordinary issue about [Lead]");
				issue(10, "[Lead] only a later stage");
				marker(10, "verify");
			});
			const r = alarm(BASE);
			expect(
				r.out
					.trim()
					.split("\n")
					.map((l) => l.split(" ").slice(0, 3).join(" ")),
			).toEqual(["ALARM broken-lead a#7", "ALARM broken-lead a#10"]);
		});
	});

	describe("alarm lifecycle", () => {
		const untaken = () =>
			seed((db) => {
				precinct(db, "a");
				order(db, "a", "patrol");
			});

		test("a new alarm prints once and is silent without --repeat", () => {
			untaken();
			expect(alarm(later(49)).out).toMatch(/^ALARM order-untaken 1 .+\n$/);
			expect(alarm(later(50)).out).toBe("");
			expect(alarm(later(80)).out).toBe("");
			expect(
				rows(
					"SELECT kind, ref, raised_at, notified_at, cleared_at FROM alarms",
				),
			).toEqual([
				{
					kind: "order-untaken",
					ref: "1",
					raised_at: later(49),
					notified_at: later(49),
					cleared_at: null,
				},
			]);
		});

		test("--repeat prints an open alarm only after 24 hours and renews the notice time", () => {
			untaken();
			alarm(later(49));
			expect(alarm(later(72), "--repeat").out).toBe("");
			expect(alarm(later(73), "--repeat").out).toBe("");
			expect(alarm(later(73, 1), "--repeat").out).toMatch(
				/^ALARM order-untaken 1 .+\n$/,
			);
			expect(alarm(later(73, 2), "--repeat").out).toBe("");
			expect(rows("SELECT notified_at FROM alarms")).toEqual([
				{ notified_at: later(73, 1) },
			]);
		});

		test("--repeat prints a new alarm once, not twice", () => {
			untaken();
			expect(alarm(later(49), "--repeat").out.trim().split("\n")).toHaveLength(
				1,
			);
		});

		test("the alarm clears when the condition ends and returns as new if it comes back", () => {
			untaken();
			alarm(later(49));
			call(later(50), ["dispatch", "take", "--role", "patrol"]);
			expect(alarm(later(51), "--repeat").out).toBe("");
			expect(rows("SELECT cleared_at FROM alarms")).toEqual([
				{ cleared_at: later(51) },
			]);
			seed((db) => db.run("UPDATE dispatches SET taken_at = NULL"));
			expect(alarm(later(52)).out).toMatch(/^ALARM order-untaken 1 /);
			expect(rows("SELECT cleared_at FROM alarms ORDER BY id")).toEqual([
				{ cleared_at: later(51) },
				{ cleared_at: null },
			]);
		});

		test("alarm prints order-untaken when every precinct has an open order and next is empty", () => {
			untaken();
			expect(call(later(49), ["next", "--role", "patrol"]).out).toBe("");
			expect(alarm(later(49)).out).toMatch(/^ALARM order-untaken 1 /);
		});

		test("bad arguments exit 1", () => {
			for (const args of [
				["alarm", "--bogus"],
				["alarm", "--repeat", "x"],
				["alarm", "x"],
			]) {
				expect([args, call(BASE, args).code]).toEqual([args, 1]);
			}
		});
	});

	describe("status", () => {
		test("prints open orders, last ticks, alarms, and leads", () => {
			seed((db) => {
				precinct(db, "alpha");
				precinct(db, "beta");
				db.run("UPDATE precincts SET synced_at = ? WHERE name = 'alpha'", [
					BASE,
				]);
				order(db, "alpha", "patrol", { department: "billing" });
				tick(db, "patrol", BASE, later(0, 60), "filed", "alpha");
				tick(db, "patrol", later(1), null, null);
				tick(db, "duty-desk", later(1), later(1, 60), "ordered", "alpha");
				const issue = (n: number, state: string) =>
					db.run(
						"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('alpha', ?, ?, '[Lead] t', ?)",
						[n, state, BASE],
					);
				const marker = (n: number, department: string) =>
					db.run(
						"INSERT INTO markers (precinct, issue, ord, role, stage, department, fields, raw) VALUES ('alpha', ?, '1', 'patrol', 'lead', ?, '{}', 'r')",
						[n, department],
					);
				issue(1, "OPEN");
				marker(1, "billing");
				issue(2, "OPEN");
				marker(2, "billing");
				issue(3, "CLOSED");
				marker(3, "billing");
				issue(4, "OPEN");
				marker(4, "search");
			});
			alarm(later(60));
			const r = call(later(62), ["status"]);
			expect(r.code).toBe(0);
			const lines = r.out.trim().split("\n");
			expect(lines.filter((l) => l.startsWith("precinct "))).toEqual([]);
			expect(lines.filter((l) => l.startsWith("order "))).toHaveLength(1);
			expect(lines).toContain(
				`order 1 alpha patrol billing - since ${BASE} untaken`,
			);
			expect(lines).toContain(`last-tick patrol running since ${later(1)}`);
			expect(lines).toContain(`last-tick duty-desk ordered at ${later(1, 60)}`);
			expect(
				lines
					.filter((l) => l.startsWith("alarm "))
					.map((l) => l.split(" ").slice(0, 3).join(" ")),
			).toEqual(["alarm order-untaken 1", "alarm tick-hung 2"]);
			expect(lines).toContain("leads billing 2");
			expect(lines).toContain("leads search 1");
		});

		test("prints no precincts and zero leads on an empty journal and rejects arguments", () => {
			seed((db) => precinct(db, "solo"));
			const r = call(BASE, ["status"]);
			expect(r.out).not.toContain("precinct ");
			expect(r.out).toContain("leads 0");
			expect(call(BASE, ["status", "x"]).code).toBe(1);
		});
	});
});

describe("decision-waiting", () => {
	beforeEach(() => addPrecincts({ main: 1, other: 1 }));

	const line = (ref: string, detail: string) =>
		`ALARM decision-waiting ${ref} ${detail}\n`;
	const waitingSpec = () => {
		put({ 3: handed(7) });
		cachePull("main", 7, [3], "waiting");
	};
	const open = () =>
		rows("SELECT ref, cleared_at FROM alarms ORDER BY id") as {
			ref: string;
			cleared_at: string | null;
		}[];
	const setPull = (sql: string) => seed((db) => db.run(sql));

	test("a handed pull request that waits for a vote on its spec alarms", () => {
		waitingSpec();
		expect(alarm(BASE).out).toBe(line("main#7", WAITS_SPEC));
	});

	test("a handed pull request with finished work alarms", () => {
		put({ 3: handed(7) });
		cachePull("main", 7, [3], "up", "ready");
		expect(alarm(BASE).out).toBe(line("main#7", WAITS_WORK));
	});

	test("the review text wins when both conditions hold", () => {
		put({ 3: handed(7) });
		cachePull("main", 7, [3], "waiting", "ready");
		expect(alarm(BASE).out).toBe(line("main#7", WAITS_WORK));
	});

	test.each([
		["none", "todo"],
		["up", "todo"],
		["down", "todo"],
		["up", "returned"],
		["down", "returned"],
	])("spec %s with work %s does not alarm", (spec, work) => {
		put({ 3: handed(7) });
		cachePull("main", 7, [3], spec, work);
		expect(alarm(BASE).out).toBe("");
	});

	test("a pull request that is not handed does not alarm", () => {
		put({ 3: human("OPEN"), 4: handed(8) });
		cachePull("main", 7, [3, 4], "waiting", "ready");
		cachePull("main", 9, [], "waiting");
		expect(alarm(BASE).out).toBe("");
	});

	test("a precinct of weight 0 does not alarm and its open alarm clears", () => {
		waitingSpec();
		expect(alarm(BASE).out).toBe(line("main#7", WAITS_SPEC));
		call(BASE, ["precinct", "set", "main", "--weight", "0"]);
		expect(alarm(later(1)).out).toBe("");
		expect(open()).toEqual([{ ref: "main#7", cleared_at: later(1) }]);
	});

	test("a vote on the spec clears the alarm and a return brings it back", () => {
		waitingSpec();
		alarm(BASE);
		setPull("UPDATE pulls SET spec = 'up'");
		expect(alarm(later(1)).out).toBe("");
		setPull("UPDATE pulls SET spec = 'waiting'");
		expect(alarm(later(2)).out).toBe(line("main#7", WAITS_SPEC));
		expect(open()).toEqual([
			{ ref: "main#7", cleared_at: later(1) },
			{ ref: "main#7", cleared_at: null },
		]);
	});

	test("a removed row clears the alarm", () => {
		waitingSpec();
		alarm(BASE);
		setPull("DELETE FROM pulls");
		expect(alarm(later(1)).out).toBe("");
		expect(open()).toEqual([{ ref: "main#7", cleared_at: later(1) }]);
	});

	test("a return of the finished work clears the alarm", () => {
		put({ 3: handed(7) });
		cachePull("main", 7, [3], "up", "ready");
		alarm(BASE);
		setPull("UPDATE pulls SET work = 'returned'");
		expect(alarm(later(1)).out).toBe("");
		expect(open()[0]?.cleared_at).toBe(later(1));
	});

	describe("finished work in a synced cache", () => {
		const comments = (readyUp: string[]) => [
			{ body: `Spec\n\n${SPEC}`, id: "SPEC_1", up: ["maint-a"] },
			{
				body: `Executor\n\n${READY}`,
				id: "READY_1",
				at: "2026-10-14T11:00:00Z",
				up: readyUp,
			},
		];
		const syncPulls = (readyUp: string[]) =>
			expect(
				call(
					BASE,
					["sync", "main", "--pulls", "--author", BOT],
					JSON.stringify(
						hostPulls([
							{ number: 7, closes: [3], comments: comments(readyUp) },
						]),
					),
				).code,
			).toBe(0);

		test("a thumbs up on the finished work does not clear the alarm", () => {
			put({ 3: handed(7) });
			syncPulls([]);
			expect(alarm(BASE).out).toBe(line("main#7", WAITS_WORK));
			syncPulls(["maint-a"]);
			expect(rows("SELECT work FROM pulls")).toEqual([{ work: "ready" }]);
			expect(alarm(later(1)).out).toBe("");
			expect(open()).toEqual([{ ref: "main#7", cleared_at: null }]);
		});
	});

	test("the daily repeat prints only with --repeat", () => {
		waitingSpec();
		alarm(BASE);
		expect(alarm(later(24, 1)).out).toBe("");
		expect(alarm(later(24, 1), "--repeat").out).toBe(
			line("main#7", WAITS_SPEC),
		);
		expect(alarm(later(25), "--repeat").out).toBe("");
	});

	test("candidates come in the order of precinct, then pull request number", () => {
		put({ 3: handed(1) }, "other");
		put({ 3: handed(9), 4: handed(10) });
		cachePull("other", 1, [3], "waiting");
		cachePull("main", 10, [4], "waiting");
		cachePull("main", 9, [3], "waiting");
		expect(alarm(BASE).out).toBe(
			line("main#9", WAITS_SPEC) +
				line("main#10", WAITS_SPEC) +
				line("other#1", WAITS_SPEC),
		);
	});
});

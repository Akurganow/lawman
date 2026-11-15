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
	mark,
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
		test("an untaken order of any age raises nothing", () => {
			seed((db) => {
				precinct(db, "a");
				order(db, "a", "patrol");
			});
			expect(alarm(later(48, 1))).toMatchObject({ code: 0, out: "" });
			expect(alarm(later(24 * 30)).out).toBe("");
		});

		test("a tick with no end record and no later tick of its role raises nothing", () => {
			seed((db) => tick(db, "patrol", BASE, null, null));
			expect(alarm(later(3)).out).toBe("");
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

		test("three stopped ticks without a precinct raise tick-failing under duty-desk/- and none for an unsynced precinct", () => {
			seed((db) => {
				precinct(db, "a");
				tick(db, "duty-desk", later(0), later(0, 60), "stopped-law-drift");
				tick(db, "duty-desk", later(1), later(1, 60), "stopped-dirty-law");
				tick(db, "duty-desk", later(2), later(2, 60), "stopped-host-auth");
			});
			alarmsOnce(later(3), /^ALARM tick-failing duty-desk\/- .+\n$/);
		});

		test("a precinct that three duty desk ticks in a row could not sync raises tick-failing duty-desk/<precinct>, not after two", () => {
			const failures = (n: number) =>
				seed((db) => {
					db.run("UPDATE precincts SET sync_failures = ? WHERE name = 'a'", [
						n,
					]);
				});
			seed((db) => {
				precinct(db, "a");
				precinct(db, "b");
			});
			failures(2);
			expect(alarm(later(1)).out).toBe("");
			failures(3);
			alarmsOnce(
				later(2),
				/^ALARM tick-failing duty-desk\/a last 3 duty desk ticks did not sync it\n$/,
			);
			failures(0);
			expect(alarm(later(4)).out).toBe("");
			expect(rows("SELECT cleared_at FROM alarms")).toEqual([
				{ cleared_at: later(4) },
			]);
		});
	});

	describe("alarm lifecycle", () => {
		// the tick-hung example: a tick with no end record while a later tick of its role exists
		const dead = () =>
			seed((db) => {
				tick(db, "clerk", BASE, null, null);
				tick(db, "clerk", later(1), null, null);
			});
		const HUNG = `ALARM tick-hung 1 clerk started ${BASE}\n`;

		test("a new alarm prints once and is silent without --repeat", () => {
			dead();
			expect(alarm(later(2)).out).toBe(HUNG);
			expect(alarm(later(3)).out).toBe("");
			expect(alarm(later(80)).out).toBe("");
			expect(
				rows("SELECT kind, ref, raised_at, cleared_at FROM alarms"),
			).toEqual([
				{ kind: "tick-hung", ref: "1", raised_at: later(2), cleared_at: null },
			]);
		});

		test("--repeat prints an open alarm once at every call, whatever the times", () => {
			dead();
			alarm(later(2));
			expect(alarm(later(3), "--repeat").out).toBe(HUNG);
			expect(alarm(later(4), "--repeat").out).toBe(HUNG);
			expect(alarm(later(5)).out).toBe("");
		});

		test("--repeat prints a new alarm once, not twice", () => {
			dead();
			expect(alarm(later(2), "--repeat").out).toBe(HUNG);
		});

		test("the alarm clears when the condition ends and returns as new if it comes back", () => {
			dead();
			alarm(later(2));
			seed((db) =>
				db.run("UPDATE ticks SET ended_at = ? WHERE id = 1", [later(3)]),
			);
			expect(alarm(later(4), "--repeat").out).toBe("");
			expect(rows("SELECT cleared_at FROM alarms")).toEqual([
				{ cleared_at: later(4) },
			]);
			// the condition returns: the tick 2 gets a later tick of its role
			seed((db) => tick(db, "clerk", later(5), null, null));
			expect(alarm(later(6)).out).toMatch(/^ALARM tick-hung 2 /);
			expect(rows("SELECT cleared_at FROM alarms ORDER BY id")).toEqual([
				{ cleared_at: later(4) },
				{ cleared_at: null },
			]);
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
				order(db, "alpha", "patrol", { department: "billing", takenAt: BASE });
				order(db, "beta", "patrol", { at: later(1) });
				tick(db, "patrol", BASE, later(0, 60), "filed", "alpha");
				tick(db, "patrol", later(1), null, null);
				tick(db, "duty-desk", later(1), later(1, 60), "ordered", "alpha");
				tick(db, "clerk", later(2), null, null);
				tick(db, "clerk", later(3), null, null);
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
			expect(lines.filter((l) => l.startsWith("order "))).toHaveLength(2);
			expect(lines).toContain(
				`order 1 alpha patrol billing - since ${BASE} taken ${BASE}`,
			);
			expect(lines).toContain(
				`order 2 beta patrol - - since ${later(1)} untaken`,
			);
			expect(lines.filter((l) => l.startsWith("queue "))).toEqual([
				`queue patrol 2 oldest ${BASE}`,
			]);
			expect(lines).toContain(`last-tick patrol running since ${later(1)}`);
			expect(lines).toContain(`last-tick duty-desk ordered at ${later(1, 60)}`);
			expect(
				lines
					.filter((l) => l.startsWith("alarm "))
					.map((l) => l.split(" ").slice(0, 3).join(" ")),
			).toEqual(["alarm tick-hung 4"]);
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

	test("a handed pull request that a precedent entry marker also names raises one alarm, and the tick start does not fail", () => {
		put({
			3: handed(7),
			4: human("CLOSED", mark("clerk", "entry", " pull=7")),
		});
		cachePull("main", 7, [3], "waiting");
		const r = alarm(BASE);
		expect(r.code).toBe(0);
		expect(r.out).toBe(line("main#7", WAITS_SPEC));
		expect(alarm(later(1))).toMatchObject({ code: 0, out: "" });
		expect(rows("SELECT ref FROM alarms WHERE cleared_at IS NULL")).toEqual([
			{ ref: "main#7" },
		]);
	});

	test("an alarm about a pull request ends with the link the host reported; a link that arrives later opens no new alarm", () => {
		waitingSpec();
		expect(alarm(BASE).out).toBe(line("main#7", WAITS_SPEC));
		setPull("UPDATE pulls SET url = 'https://git.example/o/main/pull/7'");
		expect(alarm(later(1)).out).toBe("");
		const repeat = alarm(later(2), "--repeat");
		expect(repeat.out).toContain(
			line("main#7", `${WAITS_SPEC} https://git.example/o/main/pull/7`).trim(),
		);
	});

	test("a vote alarm ends with the link of the newest spec comment, or of the pull request when the cache has none", () => {
		const PULL = "https://git.example/o/main/pull/7";
		const COMMENT = `${PULL}#issuecomment-1`;
		put({ 3: handed(7) });
		cachePull("main", 7, [3], "waiting", "todo", "IC_spec");
		setPull(`UPDATE pulls SET url = '${PULL}'`);
		const addComment = (url: string | null) =>
			seed((db) =>
				db.run(
					"INSERT INTO comments (precinct, kind, number, id, at, body, url) VALUES ('main', 'pull', 7, 'IC_spec', 't', 'b', ?)",
					[url],
				),
			);
		addComment(null);
		expect(alarm(BASE).out).toBe(line("main#7", `${WAITS_SPEC} ${PULL}`));
		setPull(`UPDATE comments SET url = '${COMMENT}'`);
		expect(alarm(later(1), "--repeat").out).toBe(
			line("main#7", `${WAITS_SPEC} ${COMMENT}`),
		);
		setPull("UPDATE pulls SET spec = 'up', work = 'ready'");
		expect(alarm(later(2)).out).toBe(line("main#7", `${WAITS_WORK} ${PULL}`));
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

	test("a newer spec on finished work raises the vote alarm in place of the review alarm", () => {
		put({ 3: handed(7) });
		cachePull("main", 7, [3], "up", "ready");
		alarm(BASE);
		setPull("UPDATE pulls SET spec = 'waiting', work = 'todo'");
		expect(alarm(later(1)).out).toBe(line("main#7", WAITS_SPEC));
		expect(open()).toEqual([
			{ ref: "main#7", cleared_at: later(1) },
			{ ref: "main#7", cleared_at: null },
		]);
		expect(alarm(later(2), "--repeat").out).toBe(line("main#7", WAITS_SPEC));
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

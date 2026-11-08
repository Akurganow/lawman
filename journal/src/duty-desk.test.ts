import type { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { convicted, human, T } from "./cases-fixture";
import { open } from "./db";
import { dueEntries } from "./due";
import {
	DESK,
	dispatches,
	failing,
	type Host,
	hostOf,
	openOrders,
	orderLines,
	proceed,
	reportOf,
	setUp,
	startDesk,
	started,
	syncBy,
	ticks,
	WORK,
	without,
} from "./duty-desk-fixture";
import { inprocAsync } from "./inproc";
import { LAW_COMMIT, lawVersion, lines } from "./input-test-fixture";
import { intakeWaiting } from "./intake";
import {
	command,
	configs,
	RECORDS,
	recording,
	shared,
} from "./operations-test-fixture";
import {
	BASE,
	call,
	dbFile,
	dir,
	issuesForm,
	later,
	order,
	rows,
	seed,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const CASE_ROLES = [
	"investigation",
	"prosecutor",
	"defender",
	"court",
	"clerk",
	"spec-writer",
	"executor",
];
const key = (o: Record<string, unknown>) =>
	`${o.precinct} ${o.role} ${o.issue ?? "-"}`;

// What WORK gives each of main and beta, sorted: a case at each stage of the funnel (issues 1 to 4),
// the human issue 5 that pull request 9 closes (the clerk), the pull request 7 without a spec and 8 with a vote-won one.
const PINNED = ["main", "beta"]
	.flatMap((p) =>
		[
			"investigation 1",
			"prosecutor 2",
			"defender 3",
			"court 4",
			"clerk 5",
			"spec-writer 7",
			"executor 8",
		].map((k) => `${p} ${k}`),
	)
	.sort();

// the cache of a precinct as it is before the precinct has weight 0
function idle(name: string) {
	expect(syncBy(name, WORK).code).toBe(0);
	expect(syncBy(name, WORK, BASE, true).code).toBe(0);
	seed((d) => d.run("UPDATE precincts SET weight = 0 WHERE name = ?", [name]));
}

describe("the orders of the duty desk start", () => {
	// The orders of a case role are every dueEntries entry of the role on a precinct that has weight;
	// the cache is what the start synced. The keys are pinned from the fixture, so the check
	// does not compare the function only with itself.
	test("orders are every entry each case role is due on", () => {
		setUp({ main: 2, beta: 1, idle: 1 });
		hostOf("main", WORK);
		hostOf("beta", WORK);
		idle("idle");
		const r = startDesk();
		expect(r.code).toBe(0);
		const db = open(dbFile);
		const eligible = new Set(["main", "beta"]);
		const chain = CASE_ROLES.flatMap((role) =>
			dueEntries(db, role)
				.filter((e) => eligible.has(e.precinct))
				.map((e) => key({ precinct: e.precinct, role, issue: e.number })),
		);
		db.close();
		const written = openOrders()
			.filter((o) => CASE_ROLES.includes(String(o.role)))
			.map(key);
		expect(written.sort()).toEqual(chain.sort());
		expect(written.sort()).toEqual(PINNED);
		for (const role of CASE_ROLES)
			expect(chain.filter((k) => k.includes(` ${role} `)).length).toBe(2);
	});

	test("the patrol and response-unit orders are one per eligible precinct and waiting issue", () => {
		setUp({ main: 2, beta: 1, idle: 1 });
		hostOf("main", WORK);
		hostOf("beta", WORK);
		idle("idle");
		startDesk();
		const db = open(dbFile);
		const waiting = ["beta", "main"].flatMap((p) =>
			intakeWaiting(db, p).map((n) => `${p} response-unit ${n}`),
		);
		db.close();
		expect(waiting.length).toBe(4);
		const of = (role: string) => openOrders().filter((o) => o.role === role);
		expect(of("response-unit").map(key).sort()).toEqual(waiting.sort());
		expect(
			of("patrol").map((o) => [o.precinct, o.department, o.issue]),
		).toEqual([
			["beta", "abstraction", null],
			["main", "abstraction", null],
		]);
	});

	test("a precinct of weight 0 gets no order of the spec-writer or the executor", () => {
		setUp({ main: 1, idle: 1 });
		hostOf("main", WORK);
		idle("idle");
		// the cache holds the pull requests of the idle precinct, so the absence of orders is the weight
		expect(
			rows("SELECT number FROM pulls WHERE precinct = 'idle'").length,
		).toBe(3);
		startDesk();
		expect(openOrders().filter((o) => o.precinct === "idle")).toEqual([]);
		expect(openOrders().filter((o) => o.role === "spec-writer").length).toBe(1);
		expect(openOrders().filter((o) => o.role === "executor").length).toBe(1);
	});

	test("a repeat start writes no second order for the same precinct, role and issue", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		startDesk();
		const first = dispatches().length;
		const r = startDesk(later(0, 1));
		expect(r.code).toBe(0);
		expect(dispatches().length).toBe(first);
		expect(orderLines(r.out)).toEqual([]);
		expect(ticks().map((t) => t.outcome)).toEqual(["ordered", "silent"]);
	});
});

// The orders of one tick share one `at`, so their ids carry the order they were written in.
describe("the write order", () => {
	// the list the start reads, taken from the cache the start will sync again
	function listed<T>(h: Host, read: (db: Database) => T): T {
		expect(syncBy("main", h).code).toBe(0);
		expect(syncBy("main", h, BASE, true).code).toBe(0);
		const db = open(dbFile);
		try {
			return read(db);
		} finally {
			db.close();
		}
	}
	const issuesOf = (role: string) =>
		dispatches()
			.filter((o) => o.role === role && o.outcome === null)
			.map((o) => o.issue);

	test("the clerk orders follow dueEntries: priority, then the oldest last order", () => {
		const h: Host = {
			issues: {
				1: convicted("P2"),
				2: convicted("P0"),
				3: convicted("P2"),
				4: convicted("P1"),
				5: convicted("P2"),
			},
		};
		setUp({ main: 1 });
		hostOf("main", h);
		// 5 was ordered before 3, so inside P2 the issue 1 (never ordered) goes first, then 5, then 3
		seed((d) => {
			order(d, "main", "clerk", {
				issue: 3,
				at: "2026-04-03T00:00:00Z",
				outcome: "ok",
			});
			order(d, "main", "clerk", {
				issue: 5,
				at: "2026-04-02T00:00:00Z",
				outcome: "ok",
			});
		});
		const due = listed(h, (db) => dueEntries(db, "clerk").map((e) => e.number));
		expect(due).toEqual([2, 4, 1, 5, 3]);
		expect(due).not.toEqual([...due].sort((a, b) => a - b));
		startDesk();
		expect(issuesOf("clerk")).toEqual(due);
	});

	test("the response-unit orders follow intakeWaiting: the oldest last order first, then the age of the issue", () => {
		const waiting = (hour: number) => ({
			...human("OPEN"),
			createdAt: T(hour),
		});
		const h: Host = {
			issues: { 1: waiting(12), 2: waiting(8), 3: waiting(7) },
		};
		setUp({ main: 1 });
		hostOf("main", h);
		// the issue 3 is the oldest but was ordered already, so it goes last
		seed((d) =>
			order(d, "main", "response-unit", {
				issue: 3,
				at: "2026-04-02T00:00:00Z",
				outcome: "ok",
			}),
		);
		const due = listed(h, (db) => intakeWaiting(db, "main"));
		expect(due).toEqual([2, 1, 3]);
		expect(due).not.toEqual([...due].sort((a, b) => a - b));
		startDesk();
		expect(issuesOf("response-unit")).toEqual(due);
	});
});

describe("the walk", () => {
	test("every precinct of weight above 0 is read, a precinct of weight 0 runs no operation and gets no order", () => {
		setUp({ alpha: 1, main: 3, zero: 0 });
		for (const p of ["alpha", "main", "zero"])
			hostOf(p, { ...WORK, record: true });
		const r = startDesk();
		expect(r.code).toBe(0);
		expect(started("zero")).toEqual([]);
		for (const p of ["alpha", "main"])
			expect(started(p).length).toBeGreaterThan(0);
		expect(new Set(openOrders().map((o) => o.precinct))).toEqual(
			new Set(["alpha", "main"]),
		);
		expect(reportOf(r.out, "Coverage")).toContain("precincts: alpha, main");
	});

	test("the start runs no operation that writes: only the six reads and law-version start", () => {
		setUp({ main: 1 });
		hostOf("main", { ...WORK, record: true });
		for (const op of ["decider", "release", "verify"]) {
			command(configs("main"), op, recording("true"));
			command(shared(), op, recording("true"));
		}
		command(
			shared(),
			"law-version",
			recording(`printf 'revision=${LAW_COMMIT}\\nchanged=no\\ntag=\\n'`),
		);
		startDesk();
		expect(new Set(started("main"))).toEqual(
			new Set(["identity", "issues", "pulls", "fetch", "files", "file"]),
		);
		expect(
			readFileSync(join(shared(), RECORDS), "utf8")
				.trim()
				.split("\n")
				.map((p) => basename(p)),
		).toEqual(["law-version"]);
	});

	test("the host is read once per precinct per tick", () => {
		setUp({ alpha: 1, main: 1 });
		for (const p of ["alpha", "main"]) hostOf(p, { ...WORK, record: true });
		startDesk();
		for (const p of ["alpha", "main"]) {
			const ops = started(p);
			expect(ops.filter((o) => o === "fetch").length).toBe(1);
			expect(ops.filter((o) => o === "identity").length).toBe(1);
			expect(ops.filter((o) => o === "files").length).toBe(1);
		}
	});
});

describe("the sync", () => {
	test("a failed tracker stops the tick and writes no order anywhere", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", WORK);
		hostOf("main", WORK);
		failing("main", "issues");
		const r = startDesk();
		expect(r.code).toBe(0);
		expect(lines(r.out)).toContain("ended stopped-sync");
		expect(r.out).toContain(
			"Tracker sync failed at main: issues failed reason=exit",
		);
		expect(dispatches()).toEqual([]);
		expect(ticks()[0]?.outcome).toBe("stopped-sync");
	});

	test("a tracker list at the limit stops the tick as stopped-sync-limit", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		const many = Array.from({ length: 1000 }, (_, i) => ({
			number: i + 1,
			state: "OPEN",
			createdAt: "2026-10-14T09:00:00Z",
			author: { login: TRUSTED },
		}));
		writeFileSync(
			join(configs("main"), "issues.json"),
			JSON.stringify(issuesForm(many, [TRUSTED])),
		);
		const r = startDesk();
		expect(lines(r.out)).toContain("ended stopped-sync-limit");
		expect(dispatches()).toEqual([]);
	});

	test("a failed pull request sync leaves that precinct without orders of any role, the others go on", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", WORK);
		hostOf("main", WORK);
		failing("alpha", "pulls");
		const r = startDesk();
		expect(r.code).toBe(0);
		expect(new Set(openOrders().map((o) => o.precinct))).toEqual(
			new Set(["main"]),
		);
		expect(reportOf(r.out, "Blockers")).toBe(
			"Blockers: alpha: pull request sync failed",
		);
		expect(reportOf(r.out, "Coverage")).toContain("precincts: main");
		expect(lines(r.out)).toContain("ended ordered");
	});

	test("a pull request sync that failed closes no stale order of its precinct", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", WORK);
		hostOf("main", WORK);
		failing("alpha", "pulls");
		seed((d) => {
			for (const p of ["alpha", "main"])
				d.run(
					"INSERT INTO dispatches (at, precinct, role, issue) VALUES (?, ?, 'court', 3)",
					[BASE, p],
				);
		});
		startDesk();
		const court = dispatches().filter(
			(o) => o.role === "court" && o.issue === 3,
		);
		expect(court.map((o) => [o.precinct, o.outcome])).toEqual([
			["alpha", null],
			["main", "silent"],
		]);
	});

	test("all pull request syncs failed: no precinct, no order, outcome silent", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		failing("main", "pulls");
		const r = startDesk();
		expect(lines(r.out)).toContain("ended silent");
		expect(reportOf(r.out, "Coverage")).toContain("precincts: none");
		expect(dispatches()).toEqual([]);
	});
});

describe("the self steps", () => {
	test("the start prints each with its precinct, stops without orders and reads no host for the tree", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", { ...WORK, record: true });
		hostOf("main", { ...WORK, record: true });
		without("main", "identity", "issues", "pulls");
		const r = startDesk();
		expect(r.code).toBe(0);
		const out = lines(r.out);
		expect(out.slice(1, -1)).toEqual([
			"self identity main o/main",
			"self issues main o/main",
			"self pulls main o/main",
		]);
		expect(out[0]).toBe("lawman input 1 role=duty-desk tick=1 part 1 of 1");
		expect(dispatches()).toEqual([]);
		expect(ticks()[0]?.outcome).toBeNull();
		for (const p of ["alpha", "main"])
			expect(
				started(p).filter((o) => ["fetch", "files", "file"].includes(o)),
			).toEqual([]);
	});

	test("the continuation after the model synced writes the orders and reads the host once", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", { ...WORK, record: true });
		hostOf("main", { ...WORK, record: true });
		without("main", "issues", "pulls");
		const first = startDesk();
		expect(lines(first.out).slice(1, -1)).toEqual([
			"self issues main o/main",
			"self pulls main o/main",
		]);
		expect(started("main").filter((o) => o === "fetch")).toEqual([]);
		expect(syncBy("main", WORK).code).toBe(0);
		expect(syncBy("main", WORK, BASE, true).code).toBe(0);
		const r = proceed(1);
		expect(r.code).toBe(0);
		expect(lines(r.out)).toContain("ended ordered");
		expect(new Set(openOrders().map((o) => o.precinct))).toEqual(
			new Set(["alpha", "main"]),
		);
		expect(ticks()).toMatchObject([{ id: 1, outcome: "ordered" }]);
		for (const p of ["alpha", "main"])
			expect(started(p).filter((o) => o === "fetch").length).toBe(1);
	});

	test("a pull request sync the model left undone leaves that precinct without orders and without a stale close", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", WORK);
		hostOf("main", WORK);
		without("main", "issues", "pulls");
		seed((d) =>
			d.run(
				"INSERT INTO dispatches (at, precinct, role, issue) VALUES (?, 'main', 'court', 3)",
				[BASE],
			),
		);
		startDesk();
		expect(syncBy("main", WORK).code).toBe(0);
		const r = proceed(1);
		expect(lines(r.out)).toContain("ended ordered");
		expect(reportOf(r.out, "Blockers")).toBe(
			"Blockers: main: pull request sync failed",
		);
		expect(new Set(openOrders().map((o) => o.precinct))).toEqual(
			new Set(["alpha", "main"]),
		);
		// the only order of main is the one that was there before the start
		expect(openOrders().filter((o) => o.precinct === "main")).toEqual([
			{ precinct: "main", role: "court", department: null, issue: 3 },
		]);
	});

	test("a continuation whose tracker stamp is older than the tick start ends stopped-sync", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", WORK);
		hostOf("main", WORK);
		without("main", "issues", "pulls");
		startDesk(later(1));
		expect(syncBy("main", WORK, BASE).code).toBe(0);
		expect(syncBy("main", WORK, BASE, true).code).toBe(0);
		const r = proceed(1, later(1));
		expect(lines(r.out)).toContain("ended stopped-sync");
		expect(r.out).toContain("report Tracker not synced in this tick: main");
		expect(dispatches()).toEqual([]);
		expect(ticks()[0]?.outcome).toBe("stopped-sync");
	});

	test("a continuation of an ended tick fails, reads no host and writes no order", () => {
		setUp({ main: 1 });
		hostOf("main", { ...WORK, record: true });
		startDesk();
		const written = dispatches();
		const before = started("main").length;
		const r = proceed(1);
		expect(r.code).toBe(1);
		expect(r.err).toContain("no open tick with id 1");
		expect(started("main").length).toBe(before);
		expect(dispatches()).toEqual(written);
		for (const id of ["9", "x"])
			expect(call(BASE, ["tick", "continue", id]).code).toBe(1);
	});

	test("a continuation of an open tick of another role fails", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		seed((d) =>
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]),
		);
		const r = proceed(1);
		expect(r.code).toBe(1);
		expect(r.err).toContain("no open tick with id 1");
		expect(dispatches()).toEqual([]);
	});

	test("the continuation prints no ALARM line, the start prints them", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		without("main", "issues", "pulls");
		// a tick with no end record while a later tick of its role exists
		seed((d) => {
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]);
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]);
		});
		const first = startDesk(later(3));
		expect(lines(first.out)).toContain(
			`ALARM tick-hung 1 court started ${BASE}`,
		);
		seed((d) =>
			d.run("INSERT INTO ticks (role, started_at) VALUES ('clerk', ?)", [BASE]),
		);
		syncBy("main", WORK, later(3));
		syncBy("main", WORK, later(3), true);
		const r = proceed(3, later(3));
		expect(r.out).not.toContain("ALARM");
		expect(lines(r.out)).toContain("ended ordered");
	});
});

describe("the failures of the start", () => {
	test.each([
		["no config.yaml", null, "config.yaml is missing"],
		[
			"no trusted_login",
			"harness: hermes\n",
			"config.yaml has no trusted_login",
		],
	])("%s ends the tick failed", (_name, config, report) => {
		setUp({ main: 1 }, config);
		hostOf("main", WORK);
		const r = startDesk();
		expect(lines(r.out)).toContain("ended failed");
		expect(r.out).toContain(`report ${report}`);
		expect(ticks()[0]).toMatchObject({ outcome: "failed", report });
		expect(dispatches()).toEqual([]);
	});

	test.each([
		[
			"a law folder at another commit",
			() => lawVersion("2".repeat(40)),
			"stopped-law-drift",
			"the law folder is not at law_commit",
		],
		[
			"a law folder with a local change",
			() => lawVersion(LAW_COMMIT, "yes"),
			"stopped-dirty-law",
			"the law folder has a local change",
		],
		[
			"a law folder at another commit with a local change",
			() => lawVersion("2".repeat(40), "yes"),
			"stopped-dirty-law",
			"the law folder has a local change",
		],
		[
			"a revision outside its class",
			() => lawVersion("x"),
			"stopped-law-drift",
			"a value is not safe",
		],
		[
			"a law-version command that fails",
			() => command(shared(), "law-version", "exit 1"),
			"stopped-law-drift",
			"the law-version command failed",
		],
		[
			"a config.yaml without law_commit",
			() =>
				writeFileSync(join(dir, "config.yaml"), `trusted_login: ${TRUSTED}\n`),
			"failed",
			"config.yaml has no law_commit",
		],
	] as [string, () => void, string, string][])(
		"%s ends the tick before the walk",
		(_name, setup, outcome, report) => {
			setUp({ main: 1 });
			hostOf("main", { ...WORK, record: true });
			setup();
			const r = startDesk();
			expect(lines(r.out)).toContain(`ended ${outcome}`);
			expect(r.out).toContain(`report ${report}`);
			expect(ticks()[0]).toMatchObject({ outcome, report });
			expect(dispatches()).toEqual([]);
			expect(started("main")).toEqual([]);
		},
	);

	test("three law stops in a row raise tick-failing duty-desk/-", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		lawVersion("2".repeat(40));
		for (const n of [0, 1, 2]) startDesk(later(n));
		expect(startDesk(later(3)).out).toContain("ALARM tick-failing duty-desk/-");
	});

	test("without a law-version command the first self line is law-version, with no precinct", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		rmSync(join(shared(), "law-version"));
		const selfs = lines(startDesk().out).filter((l) => l.startsWith("self "));
		expect(selfs).toEqual(["self law-version"]);
		expect(lines(proceed(1).out)).toContain("ended ordered");
	});

	test("an identity that differs stops the tick and writes no order", () => {
		setUp({ alpha: 1, main: 1 });
		hostOf("alpha", WORK);
		hostOf("main", { ...WORK, login: "someone-else", record: true });
		const r = startDesk();
		expect(lines(r.out)).toContain("ended stopped-identity-changed");
		expect(r.out).toContain("Host identity changed at main: someone-else");
		expect(dispatches()).toEqual([]);
		expect(started("main")).toEqual(["identity"]);
	});

	test("an identity that differs only in ASCII case is the trusted login", () => {
		setUp({ main: 1 });
		hostOf("main", { ...WORK, login: TRUSTED.toUpperCase() });
		expect(lines(startDesk().out)).toContain("ended ordered");
	});

	const patrolOrResponse = (role: string) =>
		role === "patrol" || role === "response-unit";

	test.each([
		[
			"a fetch that fails",
			() => failing("main", "fetch"),
			"main: fetch failed reason=exit",
		],
		[
			"a file listing that fails",
			() => failing("main", "files"),
			"main: files failed reason=exit",
		],
		[
			"a tree without the constitution",
			() => hostOf("main", { ...WORK, tree: { "README.md": "x" } }),
			"main: skipped-no-constitution",
		],
		[
			"a constitution that fails the check",
			() =>
				hostOf("main", {
					...WORK,
					tree: { "LAWMAN.md": "not a constitution" },
				}),
			"main: skipped-bad-constitution",
		],
	])(
		"%s leaves that precinct without patrol and response-unit orders, the other roles get theirs",
		(_name, break_, blocker) => {
			setUp({ alpha: 1, main: 1 });
			hostOf("alpha", WORK);
			hostOf("main", WORK);
			break_();
			const r = startDesk();
			expect(lines(r.out)).toContain("ended ordered");
			const main = openOrders().filter((o) => o.precinct === "main");
			expect(main.some((o) => patrolOrResponse(String(o.role)))).toBe(false);
			expect(new Set(main.map((o) => o.role))).toEqual(new Set(CASE_ROLES));
			expect(
				openOrders().some((o) => o.precinct === "alpha" && o.role === "patrol"),
			).toBe(true);
			expect(reportOf(r.out, "Blockers")).toContain(blocker);
		},
	);

	test("a constitution of another contract version is skipped with its own cause", () => {
		setUp({ main: 1 });
		const tree = { "LAWMAN.md": "---\ncontract_version: 99\n---\n\n# x\n" };
		hostOf("main", { ...WORK, tree });
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).toContain(
			"main: skipped-contract-version",
		);
	});
});

describe("the output of the start", () => {
	test("alarms first, then the orders, then the end and the five report lines", () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		// a tick with no end record while a later tick of its role exists
		seed((d) => {
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]);
			d.run("INSERT INTO ticks (role, started_at) VALUES ('court', ?)", [BASE]);
		});
		const r = startDesk(later(3));
		const out = lines(r.out);
		expect(out[0]).toBe("lawman input 1 role=duty-desk tick=3 part 1 of 1");
		expect(out.at(-1)).toBe("end part 1 of 1");
		const body = out.slice(1, -1);
		const shape = body.map((l) => l.split(" ")[0]);
		expect(shape).toEqual([
			"ALARM",
			...openOrders().map(() => "order"),
			"ended",
			...Array(5).fill("report"),
		]);
		expect(
			body.filter((l) => l.startsWith("report ")).map((l) => l.split(":")[0]),
		).toEqual([
			"report Coverage",
			"report Candidates",
			"report Filed",
			"report Strongest rejected",
			"report Blockers",
		]);
		expect(body[1]).toMatch(/^order \d+ main o\/main - 1$/);
		expect(ticks().at(-1)?.report).toContain("Coverage: orders: ");
	});

	test("a start without a role or with another role is a usage error", () => {
		setUp({ main: 1 });
		expect(call(BASE, ["tick", "start", "--role", "clerk"]).code).toBe(1);
		expect(call(BASE, ["tick", "start"]).code).toBe(1);
		expect(ticks()).toEqual([]);
		expect(rows("SELECT * FROM dispatches")).toEqual([]);
	});
});

describe("the command forms in process", () => {
	test("tick start --role duty-desk", async () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		const r = await inprocAsync(BASE, DESK);
		expect(r.code).toBe(0);
		expect(lines(r.out)).toContain("ended ordered");
		expect(openOrders().length).toBeGreaterThan(0);
	});

	test("tick continue <id>", async () => {
		setUp({ main: 1 });
		hostOf("main", WORK);
		without("main", "issues", "pulls");
		const first = await inprocAsync(BASE, DESK);
		expect(lines(first.out)).toContain("self issues main o/main");
		syncBy("main", WORK);
		syncBy("main", WORK, BASE, true);
		const r = await inprocAsync(BASE, ["tick", "continue", "1"]);
		expect(r.code).toBe(0);
		expect(lines(r.out)).toContain("ended ordered");
		const again = await inprocAsync(BASE, ["tick", "continue", "1"]);
		expect(again.code).toBe(1);
		expect(again.err).toContain("no open tick with id 1");
	});
});

describe("the repetition of an open alarm", () => {
	// a tick with no end record while a later tick of its role exists; the alarm
	// an earlier call raised is open and was mentioned at the current time
	const HUNG = `ALARM tick-hung 1 clerk started ${later(-5)}`;
	const hungAlarm = () =>
		seed((d) => {
			d.run("INSERT INTO ticks (role, started_at) VALUES ('clerk', ?)", [
				later(-5),
			]);
			d.run("INSERT INTO ticks (role, started_at) VALUES ('clerk', ?)", [
				later(-4),
			]);
			d.run(
				"INSERT INTO alarms (kind, ref, detail, raised_at, notified_at) VALUES ('tick-hung', '1', ?, ?, ?)",
				[`clerk started ${later(-5)}`, later(-48), BASE],
			);
		});

	test("the duty desk start repeats an open alarm at each of its ticks", () => {
		setUp({ main: 1 });
		hungAlarm();
		expect(lines(startDesk().out)).toContain(HUNG);
	});

	test("a role start does not repeat it", () => {
		setUp({ main: 1 });
		hungAlarm();
		seed((d) => order(d, "main", "investigation", { issue: 1 }));
		const r = call(BASE, [
			"tick",
			"start",
			"--role",
			"investigation",
			"--order",
			"1",
		]);
		expect(r.code).toBe(0);
		expect(r.out).toContain("role=investigation tick=");
		expect(lines(r.out)).not.toContain(HUNG);
	});
});

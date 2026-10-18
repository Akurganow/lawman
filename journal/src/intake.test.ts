import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { T } from "./cases-fixture";
import { Fail } from "./db";
import { intakeCommand } from "./intake";
import {
	addPrecincts,
	cli,
	dbFile,
	lead,
	order,
	precinct,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

const UNIT = "response-unit";
const ENV_KEY = "LAWMAN_DB";
let saved: string | undefined;
let written: string[];

beforeEach(() => {
	saved = process.env[ENV_KEY];
	process.env[ENV_KEY] = dbFile;
	written = [];
	spyOn(process.stdout, "write").mockImplementation((chunk) => {
		written.push(String(chunk));
		return true;
	});
	spyOn(process.stderr, "write").mockImplementation(() => true);
	addPrecincts({ main: 1 });
});

afterEach(() => {
	if (saved === undefined) delete process.env[ENV_KEY];
	else process.env[ENV_KEY] = saved;
	spyOn(process.stdout, "write").mockRestore();
	spyOn(process.stderr, "write").mockRestore();
});

const intake = (...args: string[]) => {
	written = [];
	let code = 0;
	try {
		intakeCommand(["main", ...args]);
	} catch (e) {
		code = e instanceof Fail ? e.code : -1;
	}
	return { code, out: written.join("").trim() };
};

type IssueSpec = { state?: string; createdAt?: string; repliedAt?: string };

const addIssue = (n: number, s: IssueSpec = {}) =>
	seed((db) =>
		db.run(
			"INSERT INTO issues (precinct, issue, state, title, created_at, replied_at) VALUES ('main', ?, ?, 't', ?, ?)",
			[n, s.state ?? "OPEN", s.createdAt ?? T(8), s.repliedAt ?? null],
		),
	);

const PAIR = { pull: "7", issue: "open" };

const ordOf = (stamp: string, rank = 1) =>
	`${stamp}|${String(rank).padStart(6, "0")}|000001`;

const addMarker = (
	n: number,
	stage: string,
	stamp: string,
	role = UNIT,
	markerAt = "2026-10-14T09:30:00Z",
	extra: Record<string, string> = {},
) =>
	seed((db) =>
		db.run("INSERT INTO markers VALUES ('main', ?, ?, ?, ?, '-', ?, ?, ?)", [
			n,
			ordOf(stamp),
			role,
			stage,
			stage === "lead" ? "src/a.rs::f::dead-code" : null,
			JSON.stringify({ role, stage, at: markerAt, ...extra }),
			lead(),
		]),
	);

const unitOrder = (n?: number, f: Parameters<typeof order>[3] = {}) =>
	seed((db) =>
		order(db, "main", UNIT, n === undefined ? f : { ...f, issue: n }),
	);

describe("intake", () => {
	test("prints nothing when no issue is cached", () => {
		expect(intake()).toEqual({ code: 0, out: "" });
	});

	test("an open issue without markers waits", () => {
		addIssue(5);
		expect(intake().out).toBe("5");
	});

	test("a closed issue does not wait", () => {
		addIssue(5, { state: "CLOSED" });
		expect(intake().out).toBe("");
	});

	test("an issue with a pair marker is skipped, with or without a pull request", () => {
		addIssue(5);
		addIssue(6);
		addMarker(5, "handed", T(10), "clerk", undefined, PAIR);
		expect(intake().out).toBe("6");
		expect(intake("--issue", "5").out).toBe("need=none state=OPEN");
	});

	test("a pair marker with a bad pull does not skip the issue", () => {
		addIssue(5);
		addMarker(5, "handed", T(10), "clerk", undefined, { ...PAIR, pull: "07" });
		expect(intake().out).toBe("5");
	});

	test.each([
		["an issue with a lead origin", "patrol"],
		["a response-unit lead origin", UNIT],
	])("%s does not wait", (_name, role) => {
		addIssue(5);
		addMarker(5, "lead", T(9), role);
		expect(intake().out).toBe("");
	});

	test("an out marker never waits, even after a reply", () => {
		addIssue(5, { repliedAt: T(20) });
		addMarker(5, "out", T(10));
		expect(intake().out).toBe("");
	});

	test("an await without a reply does not wait", () => {
		addIssue(5);
		addMarker(5, "await", T(10));
		expect(intake().out).toBe("");
	});

	test.each([
		["an await with a newer reply waits", 11, "5"],
		["a reply older than the await does not wait", 9, ""],
		["a reply at the carrier time does not wait", 10, ""],
	])("%s", (_name, repliedAt, out) => {
		addIssue(5, { repliedAt: T(repliedAt) });
		addMarker(5, "await", T(10));
		expect(intake().out).toBe(out);
	});

	test("the carrier time decides, not the at field", () => {
		addIssue(5, { repliedAt: T(11) });
		addMarker(5, "await", T(12), UNIT, T(10));
		expect(intake().out).toBe("");
		addIssue(6, { repliedAt: T(11) });
		addMarker(6, "await", T(10), UNIT, T(12));
		expect(intake().out).toBe("6");
	});

	test("only the newest response-unit marker counts", () => {
		addIssue(5, { repliedAt: T(11) });
		addMarker(5, "await", T(10));
		addMarker(5, "out", T(12));
		expect(intake().out).toBe("");
	});

	test("markers of other roles are ignored", () => {
		addIssue(5);
		addMarker(5, "case", T(10), "investigation");
		expect(intake().out).toBe("5");
	});

	test.each([
		["on this precinct", 5],
		["without an issue", undefined],
	])("an open response-unit order %s blocks", (_name, issue) => {
		addIssue(5);
		unitOrder(issue);
		expect(intake().out).toBe("");
	});

	test("an open response-unit order on another precinct does not block", () => {
		addIssue(5);
		seed((db) => {
			precinct(db, "other");
			order(db, "other", UNIT, { issue: 5 });
		});
		expect(intake().out).toBe("5");
	});

	test("a closed response-unit order does not block", () => {
		addIssue(5);
		unitOrder(5, { outcome: "asked" });
		expect(intake().out).toBe("5");
	});

	test("an open order of another role does not block", () => {
		addIssue(5);
		seed((db) => order(db, "main", "court", { issue: 5 }));
		expect(intake().out).toBe("5");
	});
});

describe("intake order", () => {
	test.each<[string, [number, number][]]>([
		["an issue with no order goes before one with an earlier order", [[1, 3]]],
		[
			"the oldest last order goes first",
			[
				[1, 6],
				[2, 5],
			],
		],
		[
			"the last order of an issue is the newest one",
			[
				[1, 3],
				[1, 7],
				[2, 5],
			],
		],
	])("%s", (_name, orders) => {
		addIssue(1, { createdAt: T(1) });
		addIssue(2, { createdAt: T(2) });
		for (const [n, at] of orders)
			unitOrder(n, { at: T(at), outcome: "failed" });
		expect(intake().out).toBe("2");
	});

	test("ties go by creation time", () => {
		addIssue(1, { createdAt: T(5) });
		addIssue(2, { createdAt: T(4) });
		expect(intake().out).toBe("2");
	});

	test("equal creation times go by number", () => {
		addIssue(2, { createdAt: T(4) });
		addIssue(1, { createdAt: T(4) });
		expect(intake().out).toBe("1");
	});

	test("the order of another precinct does not shift the rotation", () => {
		addIssue(1, { createdAt: T(1) });
		addIssue(2, { createdAt: T(2) });
		seed((db) => {
			precinct(db, "other");
			order(db, "other", UNIT, { issue: 1, outcome: "failed" });
		});
		expect(intake().out).toBe("1");
	});
});

describe("intake --issue", () => {
	test("prints need=intake for a waiting open issue", () => {
		addIssue(5);
		expect(intake("--issue", "5")).toEqual({
			code: 0,
			out: "need=intake state=OPEN",
		});
	});

	test("prints need=none for an open issue that does not wait", () => {
		addIssue(5);
		addMarker(5, "await", T(10));
		expect(intake("--issue", "5").out).toBe("need=none state=OPEN");
	});

	test("prints need=none for a closed issue", () => {
		addIssue(5, { state: "CLOSED" });
		expect(intake("--issue", "5").out).toBe("need=none state=CLOSED");
	});

	test("ignores open orders", () => {
		addIssue(5);
		unitOrder(5);
		expect(intake("--issue", "5").out).toBe("need=intake state=OPEN");
	});

	test("exits 1 for an unknown issue", () => {
		const r = intake("--issue", "9");
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
	});

	test("exits 1 on a bad usage", () => {
		expect(() => intakeCommand([])).toThrow("usage: journal intake");
		expect(intake("--issue", "x").code).toBe(1);
	});
});

describe("intake through the command line", () => {
	test("the dispatcher runs the command", () => {
		addIssue(5);
		const r = cli(["intake", "main"], { LAWMAN_DB: dbFile });
		expect(r).toMatchObject({ code: 0, out: "5\n" });
	});
});

import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as db from "./db";
import { inproc } from "./inproc";
import {
	BASE,
	later,
	order,
	precinct,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => seed((d) => precinct(d, "main")));

const DAY = BASE.slice(0, 10);
const wake = (clock = BASE, role = "patrol") =>
	inproc(clock, ["wake", "--role", role]);
const take = (clock = BASE, role = "patrol") =>
	inproc(clock, ["dispatch", "take", "--role", role]);
const idOf = () => rows("SELECT id FROM dispatches")[0]?.id;

describe("wake in process", () => {
	test("prints idle, then an untaken order with the UTC day", () => {
		expect(wake()).toMatchObject({ code: 0, out: "idle\n" });
		seed((d) => order(d, "main", "patrol"));
		expect(wake().out).toBe(`order ${idOf()}\nday ${DAY}\n`);
	});

	test("a taken order shows again only after the claim limit", () => {
		seed((d) => order(d, "main", "patrol", { takenAt: BASE }));
		expect(wake(later(24)).out).toBe("idle\n");
		expect(wake(later(24, 1)).out).toMatch(/^order \d+\nday /);
	});

	test("records the check time of a role that has a row", () => {
		seed((d) =>
			d.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 5)"),
		);
		wake(later(1));
		expect(rows("SELECT checked_at FROM roles")).toEqual([
			{ checked_at: later(1) },
		]);
	});

	test("usage errors exit 1 with empty stdout", () => {
		expect(inproc(BASE, ["wake"])).toMatchObject({ code: 1, out: "" });
	});
});

describe("dispatch take in process", () => {
	test("takes the oldest open order and prints its fields", () => {
		seed((d) => {
			order(d, "main", "patrol", { at: later(1), issue: 4 });
			order(d, "main", "patrol", { at: BASE, department: "core" });
		});
		expect(take(later(2)).out).toBe("2\tmain\to/main\tcore\t\n");
		expect(rows("SELECT taken_at FROM dispatches WHERE id = 2")).toEqual([
			{ taken_at: later(2) },
		]);
		expect(take(later(2)).out).toBe("1\tmain\to/main\t\t4\n");
		expect(take(later(2)).out).toBe("");
	});

	test("skips closed orders and orders of another role", () => {
		seed((d) => {
			order(d, "main", "patrol", { outcome: "silent" });
			order(d, "main", "judge");
		});
		expect(take().out).toBe("");
	});

	test("add opens an order and refuses a duplicate", () => {
		const add = ["dispatch", "add", "--precinct", "main", "--role", "patrol"];
		expect(inproc(BASE, add)).toMatchObject({ code: 0, out: "1\n" });
		expect(inproc(BASE, add).code).not.toBe(0);
		expect(
			inproc(BASE, [...add.slice(0, 3), "ghost", ...add.slice(4)]).code,
		).toBe(1);
	});
});

describe("rotation in process", () => {
	const rotation = (names: string[]) => {
		const stdin = spyOn(db, "readStdin").mockReturnValue(
			names.map((n) => `${n}\n`).join(""),
		);
		const r = inproc(BASE, ["rotation", "main", "--role", "patrol"]);
		stdin.mockRestore();
		return r;
	};
	const lead = (n: number, department: string) =>
		seed((d) =>
			d.run(
				"INSERT INTO issues (precinct, issue, state, title, created_at) VALUES ('main', ?, 'OPEN', ?, 't')",
				[n, `[Lead] ${department}: x`],
			),
		);

	test("unvisited first by name, then the oldest visit, with the cap", () => {
		seed((d) => {
			order(d, "main", "patrol", {
				department: "web",
				at: later(2),
				outcome: "filed",
			});
			order(d, "main", "patrol", {
				department: "api",
				at: later(1),
				outcome: "filed",
			});
		});
		expect(rotation(["web", "zeta", "api", "beta", "web"]).out).toBe(
			`beta\t-\t3\nzeta\t-\t3\napi\t${later(1)}\t3\nweb\t${later(2)}\t3\n`,
		);
	});

	test("open broken leads of a department lower its cap", () => {
		for (const n of [1, 2, 3]) lead(n, "core");
		expect(rotation(["core", "web"]).out).toBe("core\t-\t1\nweb\t-\t3\n");
		expect(inproc(BASE, ["cap", "main", "--department", "core"]).out).toBe(
			"cap=1 open=3\n",
		);
	});

	test("a department name outside the class exits 1", () => {
		expect(rotation(["Bad"])).toMatchObject({ code: 1, out: "" });
	});
});

describe("next --exclude in process", () => {
	const next = (...excluded: string[]) =>
		inproc(BASE, [
			"next",
			"--role",
			"patrol",
			...excluded.flatMap((name) => ["--exclude", name]),
		]).out;

	test("excluded precincts are skipped", () => {
		seed((d) => precinct(d, "side"));
		expect(next("main")).toBe("side\to/side\n");
		expect(next("main", "side")).toBe("");
	});

	test("a bad or missing value exits 1", () => {
		expect(inproc(BASE, ["next", "--role", "patrol", "--exclude"]).code).toBe(
			1,
		);
		expect(
			inproc(BASE, ["next", "--role", "patrol", "--exclude", "Bad"]).code,
		).toBe(1);
	});
});

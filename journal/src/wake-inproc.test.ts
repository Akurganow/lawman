import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { inTransaction, open } from "./db";
import { takeableOrders, takeOrder } from "./dispatch";
import { inproc, inprocAsync } from "./inproc";
import { rotationOrder } from "./rotation";
import {
	BASE,
	dbFile,
	later,
	order,
	precinct,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => seed((d) => precinct(d, "main")));

const wake = (clock = BASE, role = "patrol") =>
	inprocAsync(clock, ["wake", "--role", role]);
// the first takeable order, taken as the start does it, in the line the old take printed
const take = (clock = BASE, role = "patrol") => {
	const d = open(dbFile);
	try {
		const o = takeableOrders(d, role, clock)[0];
		if (o === undefined) return { out: "" };
		inTransaction(d, () => takeOrder(d, role, o.id, clock));
		return {
			out: `${o.id}\t${o.precinct}\t${o.repo}\t${o.department ?? ""}\t${o.issue ?? ""}\n`,
		};
	} finally {
		d.close();
	}
};
const idOf = () => rows("SELECT id FROM dispatches")[0]?.id;

describe("wake in process", () => {
	test("prints nothing, then an untaken order behind the check time", async () => {
		expect(await wake()).toMatchObject({ code: 0, out: "" });
		seed((d) => order(d, "main", "patrol"));
		const r = await wake();
		expect(r.out).toStartWith(
			`lawman input 1 role=patrol at=${BASE} part 1 of 1\n`,
		);
		expect(r.out).toContain(`\norder ${idOf()} main o/main - -\n`);
	});

	test("a taken order shows again only after the claim limit", async () => {
		seed((d) => order(d, "main", "patrol", { takenAt: BASE }));
		expect((await wake(later(24, -1))).out).toBe("");
		expect((await wake(later(24))).out).toBe("");
		expect((await wake(later(24, 1))).out).toContain("\norder ");
	});

	test("agrees with the take on every case, the boundary second included", async () => {
		const cases: Record<string, (d: Database) => void> = {
			none: () => {},
			untaken: (d) => order(d, "main", "patrol"),
			closed: (d) => order(d, "main", "patrol", { outcome: "silent" }),
			taken: (d) => order(d, "main", "patrol", { takenAt: BASE }),
			other: (d) => order(d, "main", "judge"),
		};
		const clocks = [BASE, later(24, -1), later(24), later(24, 1)];
		for (const [name, body] of Object.entries(cases)) {
			for (const clock of clocks) {
				for (const file of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`])
					rmSync(file, { force: true });
				seed((d) => {
					precinct(d, "main");
					body(d);
				});
				const ready = (await wake(clock)).out !== "";
				expect([name, clock, take(clock).out !== ""]).toEqual([
					name,
					clock,
					ready,
				]);
			}
		}
	});

	test("records the check time of a role that has a row", async () => {
		seed((d) =>
			d.run("INSERT INTO roles (name, every_minutes) VALUES ('patrol', 5)"),
		);
		await wake(later(1));
		expect(rows("SELECT checked_at FROM roles")).toEqual([
			{ checked_at: later(1) },
		]);
	});

	test("usage errors exit 1 with empty stdout", async () => {
		expect(await inprocAsync(BASE, ["wake"])).toMatchObject({
			code: 1,
			out: "",
		});
	});
});

describe("the take in process", () => {
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
		const d = open(dbFile);
		try {
			return {
				out: rotationOrder(d, "main", "patrol", names)
					.map((t) => `${t.department}\t${t.at ?? "-"}\t${t.cap}\n`)
					.join(""),
			};
		} finally {
			d.close();
		}
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
});

describe("removed commands in process", () => {
	test.each<string[]>([
		["next", "--role", "patrol"],
		["rotation", "main", "--role", "patrol"],
		["dispatch", "take", "--role", "patrol"],
	])("%s is a usage error", (...args) => {
		expect(inproc(BASE, args)).toMatchObject({ code: 1, out: "" });
	});
});

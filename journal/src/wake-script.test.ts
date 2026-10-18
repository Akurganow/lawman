import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	BASE,
	dbFile,
	dir,
	env,
	JOURNAL,
	order,
	precinct,
	ROOT,
	rows,
	seed,
	tempDb,
} from "./test-helpers";

tempDb();

const ROLE = "patrol";
const PRINTF = /^printf '%s\\n' ((?:'[^']*' ?)+) > .+\/lawman-<role>\.sh$/m;

function gateLines(): string[] {
	const page = readFileSync(
		join(ROOT, "skills", "assembly", "references", "roles.md"),
		"utf8",
	);
	const args = PRINTF.exec(page)?.[1];
	if (args === undefined) throw new Error("roles.md has no gate file command");
	return [...args.matchAll(/'([^']*)'/g)].map((m) => (m[1] ?? "").trim());
}

function gate() {
	const installation = join(dir, "installation");
	mkdirSync(join(installation, "bin"), { recursive: true });
	const wrapper = join(installation, "bin", "journal");
	writeFileSync(
		wrapper,
		`#!/bin/bash\nexec ${process.execPath} ${join(JOURNAL, "src", "journal.ts")} "$@"\n`,
	);
	chmodSync(wrapper, 0o755);
	const file = join(dir, `lawman-${ROLE}.sh`);
	writeFileSync(file, `${gateLines().join("\n").replace("<role>", ROLE)}\n`);
	const r = Bun.spawnSync(["bash", file], {
		cwd: installation,
		env: env({ LAWMAN_DB: dbFile, LAWMAN_NOW: BASE }),
	});
	return { code: r.exitCode, out: r.stdout.toString() };
}

describe("gate file", () => {
	test("has the interpreter line and one exec line without pipe, grep or fallback", () => {
		const lines = gateLines();
		expect(lines).toEqual([
			"#!/bin/bash",
			`exec bin/journal wake --role <role>`,
		]);
		expect(lines.join("\n")).not.toMatch(/\||grep|\|\| true/);
	});

	test("prints idle with no order", () => {
		seed(() => {});
		expect(gate()).toEqual({ code: 0, out: "idle\n" });
	});

	test("prints the order and the day for a takeable order", () => {
		seed((db) => {
			precinct(db, "main");
			order(db, "main", ROLE);
		});
		const id = rows("SELECT id FROM dispatches")[0]?.id;
		expect(gate()).toEqual({
			code: 0,
			out: `order ${id}\nday ${BASE.slice(0, 10)}\n`,
		});
	});

	test("passes a broken database through as a non-zero exit and empty stdout", () => {
		writeFileSync(dbFile, "not a database".repeat(100));
		const r = gate();
		expect([r.code === 0, r.out]).toEqual([false, ""]);
	});
});

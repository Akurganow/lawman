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
const HARNESS = join(
	ROOT,
	"skills",
	"lawman-law",
	"references",
	"harnesses",
	"hermes.md",
);
const ENTRY_SECTION = /^### Role entry\n([\s\S]*?)(?=^### )/m;
const PRINTF =
	/^printf '%s\\n' ((?:'[^']*' ?)+) > "[^"]+\/lawman-<role>\.sh"$/m;

function entryLines(): string[] {
	const section = ENTRY_SECTION.exec(readFileSync(HARNESS, "utf8"))?.[1] ?? "";
	const args = PRINTF.exec(section)?.[1];
	if (args === undefined) {
		throw new Error("hermes.md Role entry section has no entry file command");
	}
	return [...args.matchAll(/'([^']*)'/g)].map((m) => (m[1] ?? "").trim());
}

function entry() {
	const installation = join(dir, "installation");
	mkdirSync(join(installation, "bin"), { recursive: true });
	const wrapper = join(installation, "bin", "journal");
	writeFileSync(
		wrapper,
		`#!/bin/bash\nexec ${process.execPath} ${join(JOURNAL, "src", "journal.ts")} "$@"\n`,
	);
	chmodSync(wrapper, 0o755);
	const file = join(dir, `lawman-${ROLE}.sh`);
	writeFileSync(file, `${entryLines().join("\n").replace("<role>", ROLE)}\n`);
	const r = Bun.spawnSync(["bash", file], {
		cwd: installation,
		env: env({ LAWMAN_DB: dbFile, LAWMAN_NOW: BASE }),
	});
	return { code: r.exitCode, out: r.stdout.toString() };
}

describe("role entry file", () => {
	test("has the interpreter line and one exec line without pipe, grep or fallback", () => {
		const lines = entryLines();
		expect(lines).toEqual([
			"#!/bin/bash",
			`exec bin/journal wake --role <role>`,
		]);
		expect(lines.join("\n")).not.toMatch(/\||grep|\|\| true/);
	});

	test("names the safe size of a part", () => {
		const section =
			ENTRY_SECTION.exec(readFileSync(HARNESS, "utf8"))?.[1] ?? "";
		expect(section).toContain("\ninput_chars: 49000\n");
	});

	test("prints nothing with no order", () => {
		seed(() => {});
		expect(entry()).toEqual({ code: 0, out: "" });
	});

	test("prints the role's input behind the check time for a takeable order", () => {
		seed((db) => {
			precinct(db, "main");
			order(db, "main", ROLE);
		});
		const id = rows("SELECT id FROM dispatches")[0]?.id;
		const r = entry();
		expect(r.code).toBe(0);
		expect(r.out).toStartWith(
			`lawman input 1 role=${ROLE} at=${BASE} part 1 of 1\n`,
		);
		expect(r.out).toEndWith(`\norder ${id} main o/main - -\nend part 1 of 1\n`);
	});

	test("passes a broken database through as a non-zero exit and empty stdout", () => {
		writeFileSync(dbFile, "not a database".repeat(100));
		const r = entry();
		expect([r.code === 0, r.out]).toEqual([false, ""]);
	});
});

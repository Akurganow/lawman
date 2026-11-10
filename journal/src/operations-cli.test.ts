import { beforeEach, describe, expect, test } from "bun:test";
import { command, configs } from "./operations-test-fixture";
import {
	addPrecincts,
	cli,
	dbFile,
	dir,
	env,
	JOURNAL,
	SHA,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const journal = (args: string[]) => cli(args, { LAWMAN_DB: dbFile });

describe("commands and run as programs", () => {
	test("commands prints the folder of the database and the empty operations", () => {
		const r = journal(["commands"]);
		expect(r).toEqual({
			code: 0,
			out: `folder ${dir}\nrelease empty\nverify empty\nlaw-version empty\n`,
			err: "",
		});
	});

	test("run prints the output of the command in its form", () => {
		command(configs("main"), "fetch", `printf '%s\\n' ${SHA}`);
		expect(journal(["run", "main", "fetch"])).toEqual({
			code: 0,
			out: `revision=${SHA}\n`,
			err: "",
		});
	});

	test("run exits 5 with the reason of a failure", () => {
		command(configs("main"), "fetch", "exit 2");
		expect(journal(["run", "main", "fetch"])).toEqual({
			code: 5,
			out: "fetch failed reason=exit\n~~~error\n~~~\n",
			err: "",
		});
	});

	test("a wrong call is a usage error with exit 1", () => {
		const r = journal(["run", "main"]);
		expect(r.code).toBe(1);
		expect(r.err).toContain("usage: journal run");
		const p = cli(["old-precedent", "check"], { LAWMAN_DB: dbFile });
		expect(p.code).toBe(1);
		expect(p.err).toContain("usage: journal old-precedent");
	});

	// the journal's own input stays open here, so an inherited input would hang the command
	test("the command does not wait for the journal's standard input", async () => {
		command(configs("main"), "fetch", `cat\nprintf '%s\\n' ${SHA}`);
		const child = Bun.spawn(["bun", "src/journal.ts", "run", "main", "fetch"], {
			cwd: JOURNAL,
			env: env({ LAWMAN_DB: dbFile }),
			stdin: "pipe",
			stdout: "pipe",
		});
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stdout).text()).toBe(`revision=${SHA}\n`);
		child.stdin.end();
	});
});

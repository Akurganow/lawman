import { describe, expect, test } from "bun:test";
import { COMMANDS } from "./journal";
import { addPrecincts, BASE, call, rows, tempDb } from "./test-helpers";

tempDb();

describe("registration", () => {
	test.each(["pull", "handoff", "decider"])(
		"%s is a registered command",
		(name) => {
			expect(Object.keys(COMMANDS)).toContain(name);
		},
	);

	test("an unknown command lists the new commands in its usage", () => {
		const err = call(BASE, ["frobnicate"]).err;
		for (const name of ["pull", "handoff", "decider"])
			expect(err).toContain(name);
	});

	test.each(["handed", "shut", "settled", "kept", "specified"])(
		"tick end accepts the outcome %s",
		(outcome) => {
			const id = call(BASE, ["tick", "start", "--role", "clerk"]).out.trim();
			const end = call(BASE, ["tick", "end", id, "--outcome", outcome]);
			expect(end.code).toBe(0);
			expect(rows("SELECT outcome FROM ticks")).toEqual([{ outcome }]);
		},
	);

	test("the spec-writer role passes every role pattern", () => {
		addPrecincts({ main: 1 });
		const ok = (args: string[]) => expect(call(BASE, args).code).toBe(0);
		ok(["role", "set", "spec-writer", "--every", "5"]);
		ok(["tick", "start", "--role", "spec-writer"]);
		ok([
			"dispatch",
			"add",
			"--precinct",
			"main",
			"--role",
			"spec-writer",
			"--issue",
			"7",
		]);
		ok(["dispatch", "take", "--role", "spec-writer"]);
		expect(rows("SELECT role, issue FROM dispatches")).toEqual([
			{ role: "spec-writer", issue: 7 },
		]);
	});
});

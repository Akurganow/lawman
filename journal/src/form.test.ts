import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { EXIT, Fail } from "./db";
import { decide } from "./decider";
import {
	exampleOf,
	type FormKind,
	formText,
	inputRejected,
	loginList,
} from "./form";
import { inproc } from "./inproc";
import { readPulls } from "./pulls";
import { addPrecincts, BASE, cli, dbFile, rows, tempDb } from "./test-helpers";

tempDb();

const KINDS: FormKind[] = ["issues", "pulls", "decider"];
const FIELDS = {
	issues: ["number", "state", "stateReason", "createdAt", "closedAt", "is_bot"],
	pulls: ["writers", "closes", "changesRequested", "approvedBy", "rejectedBy"],
	decider: ["lastActor", "writers"],
};

describe("form command", () => {
	test.each(KINDS)("%s prints its form and one example", (kind) => {
		const r = cli(["form", kind]);
		expect(r.code).toBe(0);
		expect(r.out).toBe(`${formText(kind)}\n`);
		for (const field of FIELDS[kind]) expect(r.out).toContain(field);
		expect(r.out).toContain("YYYY-MM-DDTHH:MM:SSZ");
		expect(r.out).toContain(`Example:\n${exampleOf(kind)}`);
	});

	test.each(KINDS)("%s in process prints the same text", (kind) => {
		const r = inproc(BASE, ["form", kind]);
		expect(r).toEqual({ code: 0, out: `${formText(kind)}\n`, err: "" });
	});

	test("a missing, unknown or extra argument is a usage error", () => {
		for (const args of [[], ["other"], ["issues", "pulls"], ["toString"]]) {
			const r = inproc(BASE, ["form", ...args]);
			expect(r.code).toBe(EXIT.USAGE);
			expect(r.err).toContain("usage: journal form <issues|pulls|decider>");
		}
	});
});

describe("each example passes its reader", () => {
	beforeEach(() => addPrecincts({ main: 1 }));

	test("pulls", () => {
		const input = exampleOf("pulls");
		expect(readPulls(input, "lawman-bot")).toEqual([
			{
				number: 7,
				issues: "3",
				spec: "none",
				work: "todo",
				spec_id: "-",
			},
		]);
		const r = cli(
			["sync", "main", "--pulls", "--author", "lawman-bot"],
			{ LAWMAN_DB: dbFile },
			input,
		);
		expect(r).toMatchObject({ code: 0, out: "pulls=1\n" });
	});

	test("decider", () => {
		expect(decide(exampleOf("decider"))).toBe("decider=yes actor=maintainer");
		const r = cli(["decider"], {}, exampleOf("decider"));
		expect(r).toMatchObject({
			code: 0,
			out: "decider=yes actor=maintainer\n",
		});
	});

	test("issues", () => {
		const r = cli(
			["sync", "main", "--author", "lawman-bot"],
			{ LAWMAN_DB: dbFile },
			exampleOf("issues"),
		);
		expect(r).toMatchObject({
			code: 0,
			out: "issues=1 leads=0 markers=0 invalid=0 skipped=0\n",
		});
		expect(
			rows("SELECT issue, state, created_at, closed_at FROM issues"),
		).toEqual([
			{
				issue: 3,
				state: "CLOSED",
				created_at: "2026-10-14T09:00:00Z",
				closed_at: "2026-10-15T09:00:00Z",
			},
		]);
	});
});

describe("a rejection of host data prints the form and its example", () => {
	beforeEach(() => addPrecincts({ main: 1 }));

	test.each([
		["issues", ["sync", "main", "--author", "lawman-bot"], "{"],
		["issues", ["sync", "main", "--author", "lawman-bot"], "[{}]"],
		["pulls", ["sync", "main", "--pulls", "--author", "lawman-bot"], "{"],
		["decider", ["decider"], "{"],
	] as const)("%s from %j", (kind, args, stdin) => {
		const r = cli([...args], { LAWMAN_DB: dbFile }, stdin);
		expect(r.code).toBe(EXIT.SYNC_INPUT);
		expect(r.err).toContain(formText(kind));
	});

	test("inputRejected exits with the sync input code", () => {
		const fail = inputRejected("issues", "why");
		expect(fail.code).toBe(EXIT.SYNC_INPUT);
		expect(fail.message).toStartWith("why\n\n");
	});
});

describe("loginList", () => {
	const reject = (why: string) => new Fail(EXIT.SYNC_INPUT, why);

	test("lowercases ASCII letters only", () => {
		expect(loginList(["Maint-A", "ÀB"], "x", reject)).toEqual([
			"maint-a",
			"Àb",
		]);
	});

	test("a non-list or a non-text entry is rejected with the field", () => {
		expect(() => loginList("a", "the field", reject)).toThrow(
			"the field is not a list",
		);
		expect(() => loginList([1], "the field", reject)).toThrow(
			"the field holds a non-text entry",
		);
	});
});

describe("the readers in process", () => {
	beforeEach(() => addPrecincts({ main: 1 }));

	// readStdin reads file descriptor 0, so the test answers that read
	const fed = (stdin: string, args: string[]) => {
		const spy = spyOn(fs, "readFileSync").mockReturnValue(stdin);
		try {
			return inproc(BASE, args);
		} finally {
			spy.mockRestore();
		}
	};

	test("decider reads its example", () => {
		const r = fed(exampleOf("decider"), ["decider"]);
		expect(r).toEqual({
			code: 0,
			out: "decider=yes actor=maintainer\n",
			err: "",
		});
	});

	test("sync reads the example of issues", () => {
		const r = fed(exampleOf("issues"), [
			"sync",
			"main",
			"--author",
			"lawman-bot",
		]);
		expect(r.out).toBe("issues=1 leads=0 markers=0 invalid=0 skipped=0\n");
	});

	test("sync rejects bad issue input and prints the form", () => {
		const args = ["sync", "main", "--author", "lawman-bot"];
		for (const stdin of ["{", "{}", "[{}]", '[{"number":1,"state":"OPEN"}]']) {
			const r = fed(stdin, args);
			expect(r.code).toBe(EXIT.SYNC_INPUT);
			expect(r.err).toContain(formText("issues"));
		}
	});
});

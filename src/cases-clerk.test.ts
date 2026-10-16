import { beforeEach, describe, expect, test } from "bun:test";
import { need, needOnly, put, withLead } from "./cases-fixture";
import {
	acquittal,
	addPrecincts,
	BASE,
	call,
	caseMark,
	charge,
	conviction,
	defence,
	entry,
	noEntry,
	returnTo,
	tempDb,
} from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1 }));

const ruled = (ruling: () => string, ...rest: string[]) =>
	withLead(caseMark(), charge(), defence(), ruling(), ...rest);
const closed = (spec: ReturnType<typeof withLead>) => ({
	...spec,
	state: "CLOSED",
});

describe("case: clerk stage", () => {
	test.each([
		["an open conviction needs the clerk", ruled(conviction), "clerk"],
		["an open acquittal needs the clerk", ruled(acquittal), "clerk"],
		["a closed acquittal needs the clerk", closed(ruled(acquittal)), "clerk"],
		["a closed conviction needs the clerk", closed(ruled(conviction)), "clerk"],
		[
			"an entry newer than the conviction needs nobody",
			ruled(conviction, entry()),
			"none",
		],
		[
			"a no-entry newer than the acquittal needs nobody",
			ruled(acquittal, noEntry()),
			"none",
		],
		[
			"a closed entry newer than the conviction needs nobody",
			closed(ruled(conviction, entry())),
			"none",
		],
		[
			"a closed no-entry newer than the acquittal needs nobody",
			closed(ruled(acquittal, noEntry())),
			"none",
		],
		[
			"a clerk marker older than the court marker needs the clerk",
			withLead(caseMark(), charge(), defence(), entry(), conviction()),
			"clerk",
		],
		[
			"a new cycle after an entry needs the clerk",
			ruled(conviction, entry(), caseMark(), charge(), defence(), acquittal()),
			"clerk",
		],
		[
			"a court return needs nobody",
			ruled(() => returnTo("investigation", 1, "court")),
			"none",
		],
		[
			"a closed charge with a clerk marker needs nobody",
			closed(withLead(caseMark(), charge(), entry())),
			"none",
		],
		["a closed lead needs nobody", closed(withLead()), "none"],
	])("%s", (_name, spec, expected) => {
		put({ 1: spec });
		expect(needOnly(1)).toBe(`need=${expected}`);
	});

	test("a clerk marker leaves the prosecutor need alone", () => {
		put({ 1: withLead(caseMark(), entry()) });
		expect(needOnly(1)).toBe("need=prosecutor");
	});

	test("clerk markers leave round and returned unchanged", () => {
		put({ 1: ruled(conviction, entry()) });
		expect(need(1).split(" ").slice(0, 3)).toEqual([
			"need=none",
			"round=1",
			"returned=-",
		]);
	});

	test("due for the clerk lists open charges and closed acquittals only", () => {
		const due = () => call(BASE, ["due", "--role", "clerk"]).out;
		put({ 1: ruled(conviction) });
		expect(due()).toBe("main\t1\n");
		put({
			1: ruled(conviction, entry()),
			2: closed(ruled(acquittal)),
		});
		expect(due()).toBe("main\t2\n");
		put({ 2: closed(ruled(acquittal, noEntry())) });
		expect(due()).toBe("");
	});
});

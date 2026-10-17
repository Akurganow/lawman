import { beforeEach, describe, expect, test } from "bun:test";
import { cache, closed, human, pairMark, put } from "./cases-fixture";
import { clerkMarkersOf, closedIn, pullsOf } from "./clerk-jobs";
import { open } from "./db";
import { addPrecincts, dbFile, tempDb } from "./test-helpers";

tempDb();
beforeEach(() => addPrecincts({ main: 1, side: 1 }));

function inDb<T>(body: (db: ReturnType<typeof open>) => T): T {
	const db = open(dbFile);
	try {
		return body(db);
	} finally {
		db.close();
	}
}

describe("clerk-job readers", () => {
	test("pullsOf lists the cached pull requests with numeric sources", () => {
		cache([7, [1, 2]], [9, []]);
		expect(inDb((db) => pullsOf(db, "main"))).toEqual([
			{ number: 7, issues: [1, 2] },
			{ number: 9, issues: [] },
		]);
		expect(inDb((db) => pullsOf(db, "side"))).toEqual([]);
	});

	test("closedIn is true for a closed issue only", () => {
		put({ 1: human("OPEN"), 2: closed(human("OPEN")) });
		const isClosed = inDb((db) => {
			const read = closedIn(db, "main");
			return [read(1), read(2), read(3)];
		});
		expect(isClosed).toEqual([false, true, false]);
	});

	test("clerkMarkersOf groups the clerk markers by issue", () => {
		put({
			1: human(
				"OPEN",
				pairMark("handed", 7, "open"),
				pairMark("kept", 7, "open"),
			),
			2: human("OPEN", pairMark("shut", 8, "closed")),
			3: human("OPEN"),
		});
		const byIssue = inDb((db) => clerkMarkersOf(db, "main"));
		expect([...byIssue.keys()]).toEqual([1, 2]);
		expect(byIssue.get(1)?.map((m) => m.stage)).toEqual(["handed", "kept"]);
		expect(byIssue.get(2)?.[0]?.fields).toMatchObject({
			pull: "8",
			issue: "closed",
		});
		expect(inDb((db) => clerkMarkersOf(db, "side")).size).toBe(0);
	});
});

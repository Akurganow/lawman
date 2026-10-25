import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { BATCH_LIMIT, cutParts, UNRESOLVED_VERSION } from "./catalog";
import {
	entry,
	inProcess,
	list,
	prepare,
	RUNNERS,
	type Run,
	throughCli,
} from "./catalog-test-run";
import { dbFile, tempDb } from "./test-helpers";

tempDb();

const first = (tick: string, extra: string[] = []) => [
	"request",
	"--kind",
	"batch",
	"--tick",
	tick,
	...extra,
];

const queries = (
	body: string,
): { package: { name: string }; version: string }[] => JSON.parse(body).queries;

function allBodies(run: Run, tick: string, input: string): string[] {
	const bodies = [
		run([...first(tick, ["--precinct", "alpha"])], input).out.trim(),
	];
	for (;;) {
		const next = run(first(tick));
		if (next.code !== 0) return bodies;
		bodies.push(next.out.trim());
	}
}

describe.each(RUNNERS)("catalog request (%s)", (_name, run) => {
	test("the first call prints part 1 as one compact JSON line", () => {
		prepare();
		const r = run(
			first("7", ["--precinct", "alpha"]),
			`${entry(1)}\n${entry(2)}\n`,
		);
		expect(r.code).toBe(0);
		expect(r.err).toBe("");
		expect(r.out).toBe(
			`${JSON.stringify({
				queries: [1, 2].map((i) => ({
					package: { name: `pkg-${i}`, ecosystem: "npm" },
					version: "1.0.0",
				})),
			})}\n`,
		);
	});

	test("a later call prints the next part and then runs out", () => {
		prepare();
		const bodies = allBodies(run, "7", list(BATCH_LIMIT + 5));
		expect(bodies.map((b) => queries(b).length)).toEqual([BATCH_LIMIT, 5]);
		const done = run(first("7"));
		expect(done.code).toBe(1);
		expect(done.err).toContain("no part");
	});

	test("a later call without state fails", () => {
		prepare();
		const r = run(first("9"));
		expect(r.code).toBe(1);
		expect(r.err).toContain("no list");
	});

	test("a list with nothing to send prints counts only", () => {
		prepare();
		const input = `${entry(1, UNRESOLVED_VERSION)}\nbad line\n${entry(3, UNRESOLVED_VERSION)}\n`;
		const r = run(first("7", ["--precinct", "alpha"]), input);
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
		expect(r.err).toContain("catalog none entries=3 refused=2 not-sent=1,3");
		expect(run(first("7")).code).toBe(1);
	});

	test("a hostile line is refused by number and shown nowhere", () => {
		prepare();
		const hostile = "../../etc/passwd\tnpm\t`curl evil`\t1.0.0";
		const r = run(
			first("7", ["--precinct", "alpha"]),
			`${entry(1)}\n${hostile}\n`,
		);
		expect(r.code).toBe(0);
		for (const stream of [r.out, r.err])
			for (const piece of ["passwd", "curl", "evil"])
				expect(stream).not.toContain(piece);
	});

	test("the database must be a file", () => {
		const r = run(first("7", ["--precinct", "alpha"]), entry(1));
		expect(r.code).toBe(1);
		expect(r.err).toContain("database");
	});

	test.each([
		[["request", "--kind", "batch"]],
		[["request", "--kind", "batch", "--tick", "x1", "--precinct", "alpha"]],
		[["request", "--kind", "other", "--tick", "7"]],
		[["request", "--kind", "batch", "--tick", "7", "--precinct", "Alpha"]],
		[["frobnicate", "--kind", "batch"]],
	])("%j is a usage error", (args) => {
		prepare();
		const r = run(args, entry(1));
		expect(r.code).toBe(1);
		expect(r.err).not.toBe("");
	});
});

describe("state of the tick", () => {
	test("it lies in the runs folder next to the database", () => {
		prepare();
		throughCli(first("7", ["--precinct", "alpha"]), entry(1));
		expect(readdirSync(join(dirname(dbFile), "runs", "7"))).toHaveLength(1);
	});
});

describe("parts", () => {
	const sizes = [
		0,
		1,
		BATCH_LIMIT - 1,
		BATCH_LIMIT,
		BATCH_LIMIT + 1,
		2 * BATCH_LIMIT,
		2500,
	];

	test.each(sizes)("a list of %i entries is cut into whole parts", (n) => {
		const entries = Array.from({ length: n }, (_, i) => ({
			number: i + 1,
			place: `p${i % 5}/lock.json`,
			ecosystem: "npm",
			name: `pkg-${i}`,
			version: "1.0.0",
		}));
		const parts = cutParts(entries);
		expect(parts.flat()).toEqual(entries);
		for (const part of parts) {
			expect(part.length).toBeGreaterThan(0);
			expect(part.length).toBeLessThanOrEqual(BATCH_LIMIT);
		}
	});

	test("every query of every body is a sendable entry and no place is sent", () => {
		prepare();
		const lines = Array.from({ length: 2500 }, (_, i) =>
			i % 7 === 0
				? ["only/here/lock.json", "npm", `pkg-${i}`, UNRESOLVED_VERSION].join(
						"\t",
					)
				: ["only/here/lock.json", "npm", `pkg-${i}`, "1.0.0"].join("\t"),
		);
		const bodies = allBodies(inProcess, "5", lines.join("\n"));
		const sent = bodies.flatMap(queries).map((q) => q.package.name);
		const expected = lines
			.filter((l) => !l.endsWith(UNRESOLVED_VERSION))
			.map((l) => String(l.split("\t")[2]));
		expect(bodies.map((b) => queries(b).length)).toEqual([1000, 1000, 142]);
		expect(sent).toEqual(expected);
		expect(bodies.join("")).not.toContain("only/here");
	});
});

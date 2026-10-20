import { describe, expect, test } from "bun:test";
import { check, subcommand } from "./args";
import { EXIT, Fail, normalizeTime } from "./db";

describe("argument validators", () => {
	const good = {
		precinct: ["a", "widgets-api", "x1-y2"],
		role: ["patrol", "duty-desk", "a1"],
		repo: [
			"o/r",
			"Some-Org/repo.name_1",
			"a.b/c-d",
			"owner/.github",
			"group/sub/project",
			"a/b/c/d",
			"o/..r",
			"o/r...",
		],
		login: [
			"a",
			"octo-cat",
			"A1",
			"a".repeat(39),
			"a".repeat(100),
			"a_b",
			"a.b",
			"_a",
			"1",
			"a-",
			"a--b-",
		],
		outcome: [
			"silent",
			"ordered",
			"filed",
			"capped",
			"failed",
			"skipped-no-constitution",
			"stopped-host-auth",
			"stopped-issue-read",
			"investigated",
			"charged",
			"returned",
			"declined",
			"defended",
			"refuted",
			"convicted",
			"acquitted",
			"recorded",
			"admitted",
			"asked",
			"handed",
			"shut",
			"settled",
			"kept",
			"specified",
			"out",
			"executed",
			"skipped-merge-conflict",
		],
	} as const;
	const bad = {
		precinct: ["", "A", "1a", "-a", "a_b", "a b", "a\n", "a/b"],
		role: ["", "Patrol", "9", "a.b", "a\nb"],
		repo: [
			"",
			"o",
			"o/",
			"/r",
			"o//r",
			"o/r/",
			"o r/x",
			"o/r\n",
			"o/r;ls",
			"./r",
			"o/.",
			"o/..",
			"../r",
			"o/../x",
			"o/./x",
		],
		login: ["", "-a", "-", ".a", "a b", "a\n", "a/b", "a;b"],
		outcome: [
			"",
			"done",
			"skipped",
			"skipped-",
			"skipped-A",
			"stopped-x y",
			"silent\n",
			"Silent",
			"filed-extra",
			"defend",
			"refuted-",
			"defended2",
			"admit",
			"out-of-scope",
			"Out",
			"investigate",
			"charged-",
			"convict",
			"acquitted-",
			"ruled",
			"acquit",
			"convicte",
			"recorded-x",
			"record",
			"hand",
			"handed-",
			"shuts",
			"settle",
			"keep",
			"kept-x",
			"specify",
			"Specified",
			"execute",
			"executed-x",
			"Executed",
		],
	} as const;

	for (const kind of Object.keys(good) as (keyof typeof good)[]) {
		test(`${kind} accepts valid values`, () => {
			for (const v of good[kind]) expect(check(kind, v)).toBe(v);
		});

		test(`${kind} rejects invalid values with the usage code`, () => {
			for (const v of bad[kind]) {
				try {
					check(kind, v);
					throw new Error(`accepted ${JSON.stringify(v)}`);
				} catch (e) {
					expect(e).toBeInstanceOf(Fail);
					expect((e as Fail).code).toBe(EXIT.USAGE);
				}
			}
		});
	}
});

describe("subcommand", () => {
	const add = () => "add";
	const table = { add };

	test("returns the handler and the arguments after the name", () => {
		expect(subcommand(table, ["add", "--x", "1"], "t <add>")).toEqual({
			run: add,
			rest: ["--x", "1"],
		});
	});

	test("rejects a missing, unknown or inherited name with the usage text", () => {
		for (const args of [[], ["bogus"], ["toString"]]) {
			expect(() => subcommand(table, args, "t <add>")).toThrow(
				new Fail(EXIT.USAGE, "usage: journal t <add>"),
			);
		}
	});
});

describe("normalizeTime", () => {
	test("turns every accepted form into UTC seconds with a Z", () => {
		const cases: [string, string][] = [
			["2026-10-14T09:00:00Z", "2026-10-14T09:00:00Z"],
			["2026-10-14T09:00:00.987Z", "2026-10-14T09:00:00Z"],
			["2026-10-14T11:30:00+02:00", "2026-10-14T09:30:00Z"],
			["2026-10-14T05:00:00-04:30", "2026-10-14T09:30:00Z"],
			["2026-10-14T09:00:00+00:00", "2026-10-14T09:00:00Z"],
			["2026-12-31T23:59:59-01:00", "2027-01-01T00:59:59Z"],
		];
		for (const [input, want] of cases) expect(normalizeTime(input)).toBe(want);
	});

	test("rejects a value that is no time", () => {
		const bad = [
			"",
			"yesterday",
			"2026-10-14",
			"2026-10-14T09:00:00",
			"2026-10-14 09:00:00Z",
			"2026-13-14T09:00:00Z",
			"2026-02-31T09:00:00Z",
			"2026-10-14T25:00:00Z",
			"2026-10-14T09:00:00Z\n",
			"1760432400",
			"0",
		];
		for (const v of bad) expect(normalizeTime(v)).toBeNull();
	});
});

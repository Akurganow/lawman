import { describe, expect, test } from "bun:test";
import { check, subcommand } from "./args";
import { EXIT, Fail } from "./db";

describe("argument validators", () => {
	const good = {
		precinct: ["a", "widgets-api", "x1-y2"],
		role: ["patrol", "duty-desk", "a1"],
		repo: ["o/r", "Some-Org/repo.name_1", "a.b/c-d"],
		login: ["a", "octo-cat", "A1", "a".repeat(39)],
		outcome: [
			"silent",
			"ordered",
			"filed",
			"capped",
			"failed",
			"skipped-no-constitution",
			"stopped-gh-auth",
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
		],
	} as const;
	const bad = {
		precinct: ["", "A", "1a", "-a", "a_b", "a b", "a\n", "a/b"],
		role: ["", "Patrol", "9", "a.b", "a\nb"],
		repo: ["", "o", "o/", "/r", "o/r/x", "o r/x", "o/r\n", "o/r;ls"],
		login: ["", "-a", "a-", "a--b-", "a_b", "a".repeat(40), "a b", "a\n"],
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

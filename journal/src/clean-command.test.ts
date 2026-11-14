import { describe, expect, test } from "bun:test";
import { WITHHELD } from "./clean-run";
import { EXIT } from "./db";
import { cli } from "./test-helpers";

const DEEP = `${"<div>".repeat(20_000)}x`;

const run = (input: string, ...args: string[]) =>
	cli(["clean", ...args], {}, input);

describe("clean command, both forms", () => {
	// Two runs over DEEP took over 5 s, the default limit, on a macOS release runner.
	test("a text the libraries cannot clean prints as the withheld text", () => {
		expect(run(DEEP)).toEqual({ code: EXIT.OK, out: `${WITHHELD}\n`, err: "" });
		expect(run(JSON.stringify([DEEP, "ok"]), "--json")).toEqual({
			code: EXIT.OK,
			out: `["${WITHHELD}","ok"]\n`,
			err: "",
		});
	}, 30_000);

	test.each([[[]], [["--json"]]])(
		"empty input gives empty output %j",
		(args) => {
			expect(run("", ...args)).toEqual({ code: EXIT.OK, out: "", err: "" });
			expect(run(" \n", ...args)).toEqual({ code: EXIT.OK, out: "", err: "" });
		},
	);
});

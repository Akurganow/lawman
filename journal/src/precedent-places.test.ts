import { describe, expect, test } from "bun:test";
import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostOf, reportOf, setUp, startDesk } from "./duty-desk-fixture";
import { references } from "./input-test-fixture";
import { candidates } from "./precedent";
import { tempDb } from "./test-helpers";
import { installationRead } from "./tick-start";
import { CONSTITUTION, departmentPage } from "./tick-start-test-fixture";

tempDb();

const ONLY_GAMMA = CONSTITUTION.replace(
	/## Departments\n\n(- .*\n)+/,
	"## Departments\n\n- gamma: judged by none\n",
);
const FAILING =
	"---\nname: gamma\ncontract_version: 1\n---\n## Mission\nNo other section.\n";

// The duty desk and the clerk on one fixture: gamma has a failing page in the
// precinct and a good page in the law. Both must stop at the precinct page.
function fixture(precinctPage: string) {
	setUp({ main: 1 });
	for (const f of readdirSync(references("departments")))
		if (f.endsWith(".md")) rmSync(references("departments", f));
	writeFileSync(references("departments", "gamma.md"), departmentPage("gamma"));
	hostOf("main", {
		tree: {
			"LAWMAN.md": ONLY_GAMMA,
			".lawman/departments/gamma.md": precinctPage,
		},
	});
	return candidates({
		constitution: ONLY_GAMMA,
		shared: ["gamma"],
		licenses: false,
		read: (d) => async (place) =>
			place === "precinct"
				? { kind: "page", text: precinctPage }
				: installationRead(d, place),
	});
}

describe("the duty desk and the clerk read one page", () => {
	test("a failing precinct page wins over a good law page for both", async () => {
		const found = await fixture(FAILING);
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).toContain(
			"main: department gamma page check failed",
		);
		expect(found).toEqual([]);
	});

	test("a good precinct page is the one both take", async () => {
		const found = await fixture(departmentPage("gamma"));
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).not.toContain("gamma");
		expect(found.map(([d]) => d)).toEqual(["gamma"]);
	});
});

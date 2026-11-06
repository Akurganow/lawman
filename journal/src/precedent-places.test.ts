import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	hostOf,
	openOrders,
	reportOf,
	setUp,
	startDesk,
} from "./duty-desk-fixture";
import { references } from "./input-test-fixture";
import { candidates } from "./precedent";
import { dbFile, dir, tempDb } from "./test-helpers";
import { installationRead } from "./tick-start";
import { CONSTITUTION, departmentPage } from "./tick-start-test-fixture";

tempDb();

const ONLY_GAMMA = CONSTITUTION.replace(
	/## Departments\n\n(- .*\n)+/,
	"## Departments\n\n- gamma: judged by none\n",
);
const FAILING =
	"---\nname: gamma\ncontract_version: 1\n---\n## Mission\nNo other section.\n";

// The duty desk and the clerk on one fixture, with a good gamma page in the law
// and the given pages at the precinct and installation places. Both stop at the
// first place that has a page.
function fixture(at: { precinct?: string; installation?: string }) {
	setUp({ main: 1 });
	for (const f of readdirSync(references("departments")))
		if (f.endsWith(".md")) rmSync(references("departments", f));
	writeFileSync(references("departments", "gamma.md"), departmentPage("gamma"));
	if (at.installation !== undefined) {
		mkdirSync(join(dir, "departments"), { recursive: true });
		writeFileSync(join(dir, "departments", "gamma.md"), at.installation);
	}
	const own = at.precinct;
	hostOf("main", {
		tree: {
			"LAWMAN.md": ONLY_GAMMA,
			...(own === undefined ? {} : { ".lawman/departments/gamma.md": own }),
		},
	});
	return clerk({
		constitution: ONLY_GAMMA,
		shared: ["gamma"],
		licenses: false,
		read: (d) => async (place) =>
			place !== "precinct"
				? installationRead(d, place)
				: own === undefined
					? { kind: "none" }
					: { kind: "page", text: own },
	});
}
// the clerk reads the installation beside the database, as a journal run does
async function clerk(sources: Parameters<typeof candidates>[0]) {
	const saved = process.env.LAWMAN_DB;
	process.env.LAWMAN_DB = dbFile;
	try {
		return await candidates(sources);
	} finally {
		if (saved === undefined) delete process.env.LAWMAN_DB;
		else process.env.LAWMAN_DB = saved;
	}
}
const patrols = () =>
	openOrders()
		.filter((o) => o.role === "patrol")
		.map((o) => o.department);

describe("the duty desk and the clerk read one page", () => {
	test("a failing precinct page wins over a good law page for both", async () => {
		const found = await fixture({ precinct: FAILING });
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).toContain(
			"main: department gamma page check failed",
		);
		expect(patrols()).toEqual([]);
		expect(found).toEqual([]);
	});

	test("a good precinct page is the one both take", async () => {
		const found = await fixture({ precinct: departmentPage("gamma") });
		startDesk();
		expect(patrols()).toEqual(["gamma"]);
		expect(found.map(([d]) => d)).toEqual(["gamma"]);
	});

	test("a failing installation page wins over a good law page for both", async () => {
		const found = await fixture({ installation: FAILING });
		const r = startDesk();
		expect(reportOf(r.out, "Blockers")).toContain(
			"main: department gamma page check failed",
		);
		expect(patrols()).toEqual([]);
		expect(found).toEqual([]);
	});

	test("with no page before it, the law page is the one both take", async () => {
		const found = await fixture({});
		startDesk();
		expect(patrols()).toEqual(["gamma"]);
		expect(found.map(([d]) => d)).toEqual(["gamma"]);
	});
});

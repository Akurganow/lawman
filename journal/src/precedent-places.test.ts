import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	hostOf,
	openOrders,
	reportOf,
	setUp,
	startDesk,
} from "./duty-desk-fixture";
import { references } from "./input-test-fixture";
import { readCandidates } from "./precedent";
import { dbFile, dir, tempDb } from "./test-helpers";
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
function fixture(at: {
	precinct?: string;
	installation?: string;
	unreadable?: "installation" | "law";
}) {
	setUp({ main: 1 });
	for (const f of readdirSync(references("departments")))
		if (f.endsWith(".md")) rmSync(references("departments", f));
	writeFileSync(references("departments", "gamma.md"), departmentPage("gamma"));
	if (at.installation !== undefined) {
		mkdirSync(join(dir, "departments"), { recursive: true });
		writeFileSync(join(dir, "departments", "gamma.md"), at.installation);
	}
	if (at.unreadable === "installation")
		chmodSync(join(dir, "departments", "gamma.md"), 0o000);
	if (at.unreadable === "law")
		chmodSync(references("departments", "gamma.md"), 0o000);
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
		licenseConsent: false,
		precinctRead: () => async () =>
			own === undefined ? { kind: "none" } : { kind: "page", text: own },
	});
}
// the clerk reads the installation beside the database, as a journal run does
async function clerk(sources: Parameters<typeof readCandidates>[0]) {
	const saved = process.env.LAWMAN_DB;
	process.env.LAWMAN_DB = dbFile;
	try {
		return await readCandidates(sources);
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
		expect(found.map((c) => c.name)).toEqual(["gamma"]);
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
		expect(found.map((c) => c.name)).toEqual(["gamma"]);
	});

	// a file that cannot be read stays readable to root
	const asRoot = process.getuid?.() === 0;

	test.skipIf(asRoot)(
		"an unreadable installation page counts as none, and both take the law page",
		async () => {
			const found = await fixture({
				installation: FAILING,
				unreadable: "installation",
			});
			startDesk();
			expect(patrols()).toEqual(["gamma"]);
			expect(found.map((c) => c.name)).toEqual(["gamma"]);
		},
	);

	test.skipIf(asRoot)(
		"an unreadable law page counts as none for both",
		async () => {
			const found = await fixture({ unreadable: "law" });
			const r = startDesk();
			expect(reportOf(r.out, "Blockers")).toContain(
				"main: department gamma has no page",
			);
			expect(found).toEqual([]);
		},
	);
});

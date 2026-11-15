import { beforeEach, describe, expect, test } from "bun:test";
import { collectIssueMarkers, extractMarkers } from "./markers";
import {
	addPrecincts,
	carrier,
	cli,
	collect,
	dbFile,
	issueOf,
	issues,
	issuesForm,
	LEAD_ID,
	lead,
	must,
	rounds,
	run,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

describe("fixture issues", () => {
	test("#1 a lead in the body and a return in a comment", () => {
		const { markers, leadOrigin, newestByRole } = collect(1);
		expect(markers.map((m) => m.marker.stage)).toEqual(["lead", "return"]);
		expect(markers.map((m) => m.line)).toEqual([3, 3]);
		expect(must(leadOrigin).marker.fields.of).toBe("42");
		expect(must(newestByRole.get("judge")).marker.fields.round).toBe("2");
		expect([...newestByRole.keys()].sort()).toEqual(["judge", "patrol"]);
	});

	test.each([
		[5, "indented, quoted, mid-line, trailing and leading-space markers"],
		[23, "a fenced legacy line"],
	])("#%d %s does not count", (n) => {
		expect(collect(n).markers).toEqual([]);
	});

	test("#6 an untrusted author counts for nothing, body or comment", () => {
		const c = collect(6);
		expect(c.markers).toEqual([]);
		expect(c.leadOrigin).toBeNull();
		expect(c.newestByRole.size).toBe(0);
	});

	test("#8 carrier order wins over at", () => {
		const { markers, newestByRole } = collect(8);
		expect(markers.map((m) => m.marker.fields.round)).toEqual(["1", "2"]);
		expect(
			must(markers[0]).marker.fields.at > must(markers[1]).marker.fields.at,
		).toBe(true);
		expect(must(newestByRole.get("judge")).marker.fields.round).toBe("2");
	});

	test("#9 comments are ranked by creation time with a stable tie-break", () => {
		const c = collect(9);
		expect(rounds(9)).toEqual(["2", "3", "1"]);
		expect(must(c.newestByRole.get("judge")).marker.fields.round).toBe("1");
	});

	test("#17 a later marker of another role or a later lead never displaces the origin", () => {
		const c = collect(17);
		expect(c.markers.map((m) => `${m.marker.role}/${m.marker.stage}`)).toEqual([
			"patrol/lead",
			"judge/return",
			"patrol/lead",
		]);
		expect(c.leadOrigin).toBe(must(c.markers[0]));
		expect(must(c.leadOrigin).marker.fields.id).toBe(LEAD_ID);
		expect(c.newestByRole.get("patrol")).toBe(c.markers[2]);
		expect(c.newestByRole.get("judge")).toBe(c.markers[1]);
	});

	test("a null author or empty body does not throw", () => {
		const base = {
			number: 1,
			author: null,
			body: "",
			createdAt: "2026-10-14T09:00:00Z",
			comments: [],
		};
		expect(collectIssueMarkers(base, TRUSTED).markers).toEqual([]);
	});
});

describe("legacy fingerprints", () => {
	const PRECINCT = "main";
	const canonical = (n: number) => collect(n).markers.map((m) => m.marker);
	const legacyLine = (s: string) => carrier(s).map((f) => f.marker);

	test("#19 police-fingerprint becomes a lead with a department and an id", () => {
		const m = must(canonical(19)[0]);
		expect(m).toMatchObject({
			role: "patrol",
			stage: "lead",
			raw: issueOf(19).body.split("\n")[2],
		});
		expect(m.fields).toEqual({
			role: "patrol",
			stage: "lead",
			department: "text-residue",
			id: "tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
			legacy: "police-fingerprint",
			at: "2026-10-14T09:00:00Z",
		});
	});

	test("#21 role-fingerprint becomes a lead", () => {
		const m = must(canonical(21)[0]);
		expect(m.fields).toMatchObject({
			department: "text-residue",
			id: "plugins/triz::principles-subitems-attributed-to-altshuller::lying",
			legacy: "slop-police-fingerprint",
		});
	});

	test("#22 repo-audit-routine gives department repo and no id", () => {
		const m = must(canonical(22)[0]);
		expect(m.fields).toMatchObject({
			department: "claims",
			legacy: "repo-audit-routine",
		});
		expect(m.fields).not.toHaveProperty("id");
	});

	test("the department mapping", () => {
		const dept = (line: string) => legacyLine(line)[0]?.fields.department;
		const RENAMED = [
			["abstraction", "abstractions"],
			["slop", "text-residue"],
			["sanity", "proportion"],
			["repo", "claims"],
			["test", "tests"],
			["dependency", "dependencies"],
			["agent", "agent-config"],
		] as const;
		for (const [legacy, renamed] of RENAMED) {
			expect(
				dept(`<!-- police-fingerprint: ${legacy}-police a/b::c::d -->`),
			).toBe(renamed);
		}
		expect(dept("<!-- police-fingerprint: evals x -->")).toBe("evals");
		expect(dept("<!-- evals-fingerprint: x -->")).toBe("evals");
		expect(dept("<!-- repo-audit-routine:x -->")).toBe("claims");
	});

	test("a bad department or a malformed line is dropped", () => {
		expect(
			legacyLine("<!-- police-fingerprint: Slop-Police a/b::c::d -->"),
		).toEqual([]);
		expect(
			legacyLine("<!-- police-fingerprint: 9police a/b::c::d -->"),
		).toEqual([]);
		expect(legacyLine("<!-- police-fingerprint: slop-police -->")).toEqual([]);
		expect(legacyLine("<!-- repo-audit-routine: -->")).toEqual([]);
		expect(legacyLine(" <!-- repo-audit-routine:x -->")).toEqual([]);
		expect(legacyLine("<!-- repo-audit-routine:x --> tail")).toEqual([]);
		expect(
			legacyLine("> <!-- police-fingerprint: slop-police a/b::c::d -->"),
		).toEqual([]);
	});

	test("an id needs three canonical parts without a hyphen run", () => {
		const id = (v: string) =>
			must(legacyLine(`<!-- police-fingerprint: slop-police ${v} -->`)[0])
				.fields.id;
		expect(id("a/b::c::d")).toBe("a/b::c::d");
		expect(id("a/b::c--x::d")).toBeUndefined();
	});

	test("a lawman marker and a legacy marker on one issue are both kept, the earlier is the origin", () => {
		const text = `<!-- police-fingerprint: slop-police a/b::c::d -->\n${lead()}`;
		const found = extractMarkers(
			{ text, createdAt: "2026-10-14T09:00:00Z", rank: 0, author: TRUSTED },
			TRUSTED,
		);
		expect(found.map((f) => f.marker.fields.legacy ?? "lawman")).toEqual([
			"police-fingerprint",
			"lawman",
		]);
		const issue = {
			number: 1,
			author: { login: TRUSTED },
			body: text,
			createdAt: "2026-10-14T09:00:00Z",
			comments: [],
		};
		expect(
			must(collectIssueMarkers(issue, TRUSTED).leadOrigin).marker.fields.legacy,
		).toBe("police-fingerprint");
		const swapped = {
			...issue,
			body: `${lead()}\n<!-- repo-audit-routine:x -->`,
		};
		expect(
			must(collectIssueMarkers(swapped, TRUSTED).leadOrigin).marker.fields
				.legacy,
		).toBeUndefined();
	});

	describe("through the CLI", () => {
		const sync = () =>
			cli(
				["sync", PRECINCT, "--author", TRUSTED],
				{ LAWMAN_DB: dbFile },
				JSON.stringify(issuesForm(issues)),
			);
		const rows = (args: string[]) =>
			run(args)
				.out.split("\n")
				.filter((l) => l !== "");
		const legacyRows = (all: string[]) =>
			all
				.filter((l) => /^(19|2[0-4])\t/.test(l))
				.map((l) => l.split("\t").slice(0, 5).join("|"));

		beforeEach(() => {
			addPrecincts({ [PRECINCT]: 1 });
			expect(sync().code).toBe(0);
		});

		test("leads lists the open ones with their departments and ids, seen answers none for the declined one", () => {
			expect(legacyRows(rows(["leads", PRECINCT]))).toEqual([
				"19|OPEN||text-residue|tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
				"20|OPEN||agent-config|",
				"22|OPEN||claims|",
			]);
			expect(
				run([
					"seen",
					PRECINCT,
					"--id",
					"plugins/triz::principles-subitems-attributed-to-altshuller::lying",
				]).out.trim(),
			).toBe("none");
		});
	});
});

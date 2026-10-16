import { beforeEach, describe, expect, test } from "bun:test";
import {
	collectIssueMarkers,
	decodeIdPart,
	extractMarkers,
	MARKER_MAX_BYTES,
} from "./markers";
import {
	addPrecincts,
	carrier,
	cli,
	collect,
	dbFile,
	issueOf,
	issues,
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
	test("the fixture has the gh issue list shape", () => {
		for (const i of issues) {
			expect(Object.keys(i).sort()).toEqual([
				"author",
				"body",
				"closedAt",
				"comments",
				"createdAt",
				"number",
				"state",
				"stateReason",
				"title",
			]);
			expect(Object.keys(i.author)).toEqual(["login"]);
		}
	});

	test("#1 a lead in the body and a return in a comment", () => {
		const { markers, leadOrigin, newestByRole } = collect(1);
		expect(markers.map((m) => m.marker.stage)).toEqual(["lead", "return"]);
		expect(markers.map((m) => m.line)).toEqual([3, 3]);
		expect(must(leadOrigin).marker.fields.of).toBe("42");
		expect(must(newestByRole.get("judge")).marker.fields.round).toBe("2");
		expect([...newestByRole.keys()].sort()).toEqual(["judge", "patrol"]);
	});

	test.each([
		[2, "a marker in a backtick fence"],
		[3, "a marker in a tilde fence"],
		[5, "indented, quoted, mid-line, trailing and leading-space markers"],
		[23, "a fenced legacy line"],
	])("#%d %s does not count", (n) => {
		expect(collect(n).markers).toEqual([]);
	});

	test("#4 a three-backtick line does not close a four-backtick fence", () => {
		expect(rounds(4)).toEqual(["3"]);
	});

	test("#6 an untrusted author counts for nothing, body or comment", () => {
		const c = collect(6);
		expect(c.markers).toEqual([]);
		expect(c.leadOrigin).toBeNull();
		expect(c.newestByRole.size).toBe(0);
	});

	test("#7 the trusted login is compared ignoring case", () => {
		expect(collect(7).markers).toHaveLength(2);
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

	test("#10 the line number orders markers inside one carrier", () => {
		const c = collect(10);
		expect(rounds(10)).toEqual(["1", "2"]);
		expect(c.markers.map((m) => m.line)).toEqual([1, 3]);
		expect(must(c.newestByRole.get("judge")).marker.fields.round).toBe("2");
	});

	test("#11 non-canonical ids are dropped and displace nothing", () => {
		const c = collect(11);
		expect(c.markers).toHaveLength(1);
		expect(c.newestByRole.get("patrol")).toBe(must(c.leadOrigin));
	});

	test("#12 a double hyphen in a value drops the marker", () => {
		expect(rounds(12)).toEqual(["1"]);
		expect(collect(12).leadOrigin).toBeNull();
	});

	test("#13 a duplicate key drops the marker and displaces nothing", () => {
		const c = collect(13);
		expect(rounds(13)).toEqual(["1"]);
		expect(must(c.newestByRole.get("judge")).marker.fields.round).toBe("1");
	});

	test("#14 a marker over 1024 bytes drops and displaces nothing", () => {
		const comment = must(issueOf(14).comments[0]).body;
		expect(Buffer.byteLength(must(comment.split("\n").at(-1)))).toBeGreaterThan(
			MARKER_MAX_BYTES,
		);
		expect(rounds(14)).toEqual(["1"]);
	});

	test("#15 a-%2Db is valid and a--b is not", () => {
		const c = collect(15);
		expect(c.markers).toHaveLength(1);
		const id = must(c.leadOrigin).marker.fields.id;
		expect(id).toBe("src/a-%2Db.rs::f::dead-code");
		expect(decodeIdPart(must(must(id).split("::")[0]))).toBe("src/a--b.rs");
	});

	test("#16 an unknown stage with unknown keys is kept", () => {
		const m = must(collect(16).markers[0]);
		expect(m.marker.role).toBe("curator");
		expect(m.marker.stage).toBe("audit");
		expect(m.marker.fields.flavor).toBe("mint");
		expect(m.marker.fields.round_trip).toBe("3");
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

	test("#18 CRLF line endings do not hide the last line", () => {
		expect(collect(18).markers).toHaveLength(1);
		expect(must(collect(18).markers[0]).line).toBe(3);
	});

	test("the input order of comments does not matter", () => {
		const issue = structuredClone(issueOf(9));
		issue.comments.reverse();
		const reversed = must(
			collectIssueMarkers(issue, TRUSTED).newestByRole.get("judge"),
		).marker.fields.round;
		expect(reversed).toBe("1");
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
			raw: must(issues[18]).body.split("\n")[2],
		});
		expect(m.fields).toEqual({
			role: "patrol",
			stage: "lead",
			department: "slop",
			id: "tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
			legacy: "police-fingerprint",
			at: "2026-10-14T09:00:00Z",
		});
	});

	test("#20 a value with spaces gives a lead without an id", () => {
		const m = must(canonical(20)[0]);
		expect(m.fields).toEqual({
			role: "patrol",
			stage: "lead",
			department: "agent",
			legacy: "police-fingerprint",
			at: "2026-10-14T09:00:00Z",
		});
	});

	test("#21 role-fingerprint becomes a lead", () => {
		const m = must(canonical(21)[0]);
		expect(m.fields).toMatchObject({
			department: "slop",
			id: "plugins/triz::principles-subitems-attributed-to-altshuller::lying",
			legacy: "slop-police-fingerprint",
		});
	});

	test("#22 repo-audit-routine gives department repo and no id", () => {
		const m = must(canonical(22)[0]);
		expect(m.fields).toMatchObject({
			department: "repo",
			legacy: "repo-audit-routine",
		});
		expect(m.fields).not.toHaveProperty("id");
	});

	test("#24 a foreign legacy line does not count", () => {
		expect(collect(24).markers).toEqual([]);
		expect(collect(24).leadOrigin).toBeNull();
	});

	test("the department mapping", () => {
		const dept = (line: string) => legacyLine(line)[0]?.fields.department;
		expect(
			dept("<!-- police-fingerprint: abstraction-police a/b::c::d -->"),
		).toBe("abstractions");
		expect(dept("<!-- abstraction-police-fingerprint: a/b::c::d -->")).toBe(
			"abstractions",
		);
		expect(dept("<!-- police-fingerprint: evals x -->")).toBe("evals");
		expect(dept("<!-- evals-fingerprint: x -->")).toBe("evals");
		expect(dept("<!-- police-fingerprint: dependency-police x -->")).toBe(
			"dependency",
		);
		expect(dept("<!-- repo-audit-routine:x -->")).toBe("repo");
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
		expect(id("a/b::c")).toBeUndefined();
		expect(id("a/b::c::d::e")).toBeUndefined();
		expect(id("a/b::::d")).toBeUndefined();
		expect(id("A:CODE_OF_CONDUCT.md:missing-code-of-conduct")).toBeUndefined();
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

	test("an untrusted author and an oversized line count for nothing", () => {
		expect(
			carrier("<!-- repo-audit-routine:x -->", "bystander-fictional"),
		).toEqual([]);
		expect(
			legacyLine(`<!-- repo-audit-routine:${"x".repeat(MARKER_MAX_BYTES)} -->`),
		).toEqual([]);
	});

	describe("through the CLI", () => {
		const sync = () =>
			cli(
				["sync", PRECINCT, "--author", TRUSTED],
				{ LAWMAN_DB: dbFile },
				JSON.stringify(issues),
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

		test("leads lists the open ones with their departments and ids, seen finds the closed one", () => {
			expect(legacyRows(rows(["leads", PRECINCT]))).toEqual([
				"19|OPEN||slop|tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
				"20|OPEN||agent|",
				"22|OPEN||repo|",
			]);
			expect(
				run([
					"seen",
					PRECINCT,
					"--id",
					"plugins/triz::principles-subitems-attributed-to-altshuller::lying",
				]).out.trim(),
			).toBe("declined #21");
		});

		test("cap counts the open legacy leads of a department", () => {
			expect(run(["cap", PRECINCT, "--department", "slop"]).out.trim()).toBe(
				"cap=3 open=1",
			);
			expect(run(["cap", PRECINCT, "--department", "agent"]).out.trim()).toBe(
				"cap=3 open=1",
			);
		});

		test("seen finds a legacy id by its symbol", () => {
			const seen = (id: string) =>
				run(["seen", PRECINCT, "--id", id]).out.trim();
			expect(
				seen(
					"tools/check-conformance.py::skills-ref-not-pinnable-in-ci::lying",
				),
			).toBe("open #19");
			expect(
				seen(
					"tools/check-conformance.py::skills-ref-not-pinnable-in-ci::unused",
				),
			).toBe("open #19");
			expect(
				seen(
					"plugins/triz::principles-subitems-attributed-to-altshuller::lying",
				),
			).toBe("declined #21");
			expect(seen("src/f.rs::g::lying")).toBe("none");
			expect(seen("src/h.rs::i::lying")).toBe("none");
		});

		test("sync counts legacy markers as markers and not as invalid", () => {
			expect(sync().out.trim()).toBe(
				"issues=22 leads=10 markers=26 invalid=11 skipped=2",
			);
		});
	});
});

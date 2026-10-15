import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "./db";
import { CONSTITUTION_HEADINGS, DEPARTMENT_HEADINGS, lintPage } from "./lint";
import { ROOT, env } from "./test-helpers";

describe("lint-page", () => {
  const pages = join(ROOT, "src", "fixtures", "pages");
  const page = (name: string) => readFileSync(join(pages, name), "utf8");
  const reasons = (name: string, kind: "constitution" | "department" = "constitution") => lintPage(kind, page(name)).reasons;

  const headingsOf = (file: string) => {
    const text = readFileSync(join(ROOT, "law", file), "utf8");
    const block = text.split("\n## Headings, in order\n")[1].split("\n## ")[0];
    return block.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
  };

  test("the constant heading lists equal the contract blocks", () => {
    expect(CONSTITUTION_HEADINGS).toEqual(headingsOf("constitution.md"));
    expect(DEPARTMENT_HEADINGS).toEqual(headingsOf("departments.md"));
    expect(CONSTITUTION_HEADINGS).toHaveLength(8);
    expect(DEPARTMENT_HEADINGS).toHaveLength(9);
  });

  test("the constitution example passes and yields the department pairs", () => {
    expect(lintPage("constitution", page("constitution-valid.md"))).toEqual({
      reasons: [],
      departments: [
        ["abstraction", "docs/review/abstractions.md"],
        ["dead-code", "docs/review/dead-code.md"],
        ["docs-drift", "none"],
      ],
    });
  });

  test("the department example and the shipped abstractions page pass", () => {
    expect(reasons("department-valid.md", "department")).toEqual([]);
    const shipped = readFileSync(join(ROOT, "departments", "abstractions.md"), "utf8");
    expect(lintPage("department", shipped, "abstractions").reasons).toEqual([]);
  });

  test("a missing heading is named", () => {
    expect(reasons("constitution-missing-heading.md")).toEqual(['19: missing heading "Fence"']);
  });

  test("an extra heading is named", () => {
    expect(reasons("constitution-extra-heading.md")).toEqual(['44: extra heading "Notes"']);
  });

  test("headings out of order are named at the first misplaced one", () => {
    expect(reasons("constitution-wrong-order.md")).toEqual(['19: heading "Regression proof" is out of order, expected "Fence"']);
  });

  test("a repeated heading is extra", () => {
    const text = page("constitution-valid.md") + "\n## Precedents\n\nnone\n";
    expect(lintPage("constitution", text).reasons).toEqual(['49: extra heading "Precedents"']);
  });

  test("a wrong contract version is named at its line", () => {
    expect(reasons("constitution-bad-version.md")).toEqual(["2: contract_version must be 1"]);
  });

  test("missing frontmatter, an unclosed one and a missing version are named", () => {
    const body = page("constitution-valid.md").split("---\n")[2];
    expect(lintPage("constitution", body).reasons).toEqual(["1: frontmatter missing or not closed"]);
    expect(lintPage("constitution", "---\ncontract_version: 1\n" + body).reasons).toEqual([
      "1: frontmatter missing or not closed",
    ]);
    expect(lintPage("constitution", "---\nother: 1\n---\n" + body).reasons).toEqual(["1: contract_version missing"]);
  });

  test("an empty section is named, none is accepted", () => {
    expect(reasons("constitution-empty-section.md")).toEqual(['24: section "Regression proof" is empty, write none']);
    const text = page("constitution-valid.md");
    expect(lintPage("constitution", text.replace(/## Regression proof\n[\s\S]*?\n(?=## Not)/, "## Regression proof\n\nnone\n\n")).reasons).toEqual([]);
  });

  test("a heading inside a fence counts for neither the list nor a section", () => {
    expect(reasons("constitution-fenced-heading.md")).toEqual(['48: missing heading "Precedents"']);
    const text = page("constitution-valid.md").replace(
      "## Fence\n",
      "## Fence\n\n```\n## Bogus\n```\n",
    );
    expect(lintPage("constitution", text).reasons).toEqual([]);
    const onlyFence = page("constitution-valid.md").replace(/## Not judged\n\nnone\n/, "## Not judged\n\n~~~\n## Execution\n~~~\n");
    expect(lintPage("constitution", onlyFence).reasons).toEqual([]);
  });

  test("a deeper heading is not a section heading", () => {
    const text = page("constitution-valid.md").replace("## Fence\n", "## Fence\n\n### Detail\n");
    expect(lintPage("constitution", text).reasons).toEqual([]);
  });

  test("the constitution needs the title line before the first heading", () => {
    const text = page("constitution-valid.md").replace("# Constitution of example/widgets\n", "# Widgets\n");
    expect(lintPage("constitution", text).reasons).toEqual(['4: title line "# Constitution of <owner>/<repo>" missing']);
    const late = page("constitution-valid.md").replace("# Constitution of example/widgets\n\n", "").replace("## Precedents", "# Constitution of a/b\n## Precedents");
    expect(lintPage("constitution", late).reasons).toEqual(['4: title line "# Constitution of <owner>/<repo>" missing']);
  });

  test("a parent segment in a listed path is named", () => {
    expect(reasons("constitution-dotdot.md")).toEqual(["10: path holds .."]);
  });

  test("leading slashes and backslashes are named in every path section", () => {
    const text = page("constitution-valid.md")
      .replace("- README.md\n", "- /etc/passwd\n- docs\\x.md\n")
      .replace("- rules/testing.md", "- /rules/testing.md")
      .replace("## Not judged\n\nnone", "## Not judged\n\n- a/../b\n")
      .replace("judged by docs/review/dead-code.md", "judged by ../dead-code.md");
    expect(lintPage("constitution", text).reasons.map((r) => r.replace(/^\d+: /, ""))).toEqual([
      "path starts with a slash",
      "path holds a backslash",
      "path holds ..",
      "path holds ..",
      "path starts with a slash",
    ]);
  });

  test("a quoted heading after a path is not part of the path", () => {
    const text = page("constitution-valid.md").replace('"Module boundaries"', '"Wait... what"');
    expect(lintPage("constitution", text).reasons).toEqual([]);
  });

  test("a department line of the wrong shape is named", () => {
    expect(reasons("constitution-bad-department-line.md")).toEqual([
      '17: department line must read "- <name>: judged by <path or none>"',
    ]);
    for (const bad of ["- x judged by none", "- x: judged by", "- x: judged by a b", "x: judged by none", "- X: judged by none", "- x:  judged by none"]) {
      const text = page("constitution-valid.md").replace("- docs-drift: judged by none", bad);
      expect(lintPage("constitution", text).reasons).toHaveLength(1);
    }
  });

  test("a failing page yields no pairs", () => {
    expect(lintPage("constitution", page("constitution-bad-version.md")).departments).toEqual([]);
  });

  test("a Departments section of none yields no pairs and passes", () => {
    const text = page("constitution-valid.md").replace(/## Departments\n[\s\S]*?(?=## Fence)/, "## Departments\n\nnone\n\n");
    expect(lintPage("constitution", text)).toEqual({ reasons: [], departments: [] });
  });

  test("a department page needs name and version, and the name must fit", () => {
    const text = page("department-valid.md");
    expect(lintPage("department", text.replace("name: fixtures\n", "")).reasons).toEqual(["1: name missing"]);
    expect(lintPage("department", text.replace("name: fixtures", "name: Fixtures")).reasons).toEqual([
      "2: name must match [a-z][a-z0-9-]*",
    ]);
    expect(lintPage("department", text.replace("contract_version: 1", "contract_version: 3")).reasons).toEqual([
      "3: contract_version must be 1",
    ]);
  });

  test("the expected name is compared only when given", () => {
    const text = page("department-valid.md");
    expect(lintPage("department", text, "fixtures").reasons).toEqual([]);
    expect(lintPage("department", text, "other").reasons).toEqual(["2: name differs from the file name"]);
    expect(lintPage("department", text).reasons).toEqual([]);
  });

  test("a department page uses its own heading list", () => {
    expect(lintPage("department", page("constitution-valid.md")).reasons[0]).toContain("name missing");
    expect(lintPage("constitution", page("department-valid.md")).reasons).toContain('5: extra heading "Mission"');
  });

  describe("command", () => {
    const feed = (args: string[], input: string) => {
      const r = Bun.spawnSync(["bun", "src/journal.ts", "lint-page", ...args], { cwd: ROOT, env: env(), stdin: Buffer.from(input) });
      return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
    };

    test("a valid constitution prints name TAB judged-by per department and exits 0", () => {
      const r = feed(["constitution"], page("constitution-valid.md"));
      expect(r).toEqual({
        code: 0,
        out: "abstraction\tdocs/review/abstractions.md\ndead-code\tdocs/review/dead-code.md\ndocs-drift\tnone\n",
        err: "",
      });
    });

    test("a valid department page prints nothing and exits 0", () => {
      expect(feed(["department"], page("department-valid.md"))).toEqual({ code: 0, out: "", err: "" });
    });

    test("the shipped abstractions page passes through stdin", () => {
      const shipped = readFileSync(join(ROOT, "departments", "abstractions.md"), "utf8");
      expect(feed(["department", "--name", "abstractions"], shipped)).toEqual({ code: 0, out: "", err: "" });
    });

    test("reasons go to stdout, one per line, with exit 8", () => {
      const r = feed(["constitution"], page("constitution-bad-version.md"));
      expect(r).toEqual({ code: EXIT.LINT_PAGE, out: "2: contract_version must be 1\n", err: "" });
    });

    test("a name mismatch exits 8", () => {
      const r = feed(["department", "--name", "other"], page("department-valid.md"));
      expect([r.code, r.out]).toEqual([8, "2: name differs from the file name\n"]);
    });

    test("bad arguments are a usage error", () => {
      for (const args of [[], ["page"], ["constitution", "--name", "x"], ["department", "--name"], ["department", "--name", "Bad"]]) {
        const r = feed(args, "");
        expect(r.code).toBe(1);
        expect(r.out).toBe("");
      }
    });
  });
});

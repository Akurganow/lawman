import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKER_MAX_BYTES, canonicalId, decodeIdPart, encodeIdPart, extractMarkers, parseMarker } from "./markers";
import { AT, LEAD_ID, ROOT, SHA, TRUSTED, carrier, lead, ret } from "./test-helpers";

describe("parseMarker", () => {
  test("a lead keeps role, stage, every field and the raw line", () => {
    const line = lead(" of=42");
    const m = parseMarker(line)!;
    expect(m.role).toBe("patrol");
    expect(m.stage).toBe("lead");
    expect(m.raw).toBe(line);
    expect(m.fields).toEqual({
      role: "patrol",
      stage: "lead",
      department: "core",
      id: LEAD_ID,
      sha: SHA,
      at: "2026-10-14T09:30:00Z",
      of: "42",
    });
  });

  test("a return needs to and a positive round without leading zeros", () => {
    expect(parseMarker(ret())).not.toBeNull();
    for (const bad of [
      "<!-- lawman: role=judge stage=return round=1 at=2026-10-14T09:30:00Z -->",
      "<!-- lawman: role=judge stage=return to=patrol at=2026-10-14T09:30:00Z -->",
      "<!-- lawman: role=judge stage=return to=Patrol round=1 at=2026-10-14T09:30:00Z -->",
      ret().replace("round=1", "round=0"),
      ret().replace("round=1", "round=01"),
      ret().replace("round=1", "round=1.5"),
    ]) {
      expect(parseMarker(bad)).toBeNull();
    }
  });

  test("a lead needs role patrol, department, id and a lowercase 40 hex sha", () => {
    expect(parseMarker(lead())).not.toBeNull();
    expect(parseMarker(lead().replace("role=patrol", "role=judge"))).toBeNull();
    expect(parseMarker(lead().replace(" department=core", ""))).toBeNull();
    expect(parseMarker(lead().replace(` id=${LEAD_ID}`, ""))).toBeNull();
    expect(parseMarker(lead().replace(` sha=${SHA}`, ""))).toBeNull();
    expect(parseMarker(lead().replace(SHA, SHA.toUpperCase()))).toBeNull();
    expect(parseMarker(lead().replace(SHA, SHA.slice(1)))).toBeNull();
  });

  test("of is a positive integer without leading zeros", () => {
    expect(parseMarker(lead(" of=7"))).not.toBeNull();
    for (const bad of ["0", "07", "-1", "x", "1.5"]) expect(parseMarker(lead(` of=${bad}`))).toBeNull();
  });

  test("at must have the UTC shape and role, stage and at are required", () => {
    expect(parseMarker(ret().replace("2026-10-14T09:30:00Z", "2026-10-14 09:30:00Z"))).toBeNull();
    expect(parseMarker(ret().replace("2026-10-14T09:30:00Z", "2026-10-14T09:30:00+00:00"))).toBeNull();
    expect(parseMarker(ret().replace("role=judge ", ""))).toBeNull();
    expect(parseMarker(ret().replace("stage=return ", ""))).toBeNull();
    expect(parseMarker(ret().replace(` ${AT}`, ""))).toBeNull();
  });

  test("role and stage match their pattern", () => {
    expect(parseMarker("<!-- lawman: role=Judge stage=x at=2026-10-14T09:30:00Z -->")).toBeNull();
    expect(parseMarker("<!-- lawman: role=judge stage=_x at=2026-10-14T09:30:00Z -->")).toBeNull();
    expect(parseMarker("<!-- lawman: role=judge-2 stage=x-y at=2026-10-14T09:30:00Z -->")).not.toBeNull();
  });

  test("the line shape is strict", () => {
    const ok = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z -->";
    expect(parseMarker(ok)).not.toBeNull();
    for (const bad of [
      ok.replace("<!-- ", "<!--"),
      ok.replace(" -->", "-->"),
      ok.replace(" -->", "  -->"),
      ok.replace("role=judge stage", "role=judge  stage"),
      ok.replace("<!-- lawman:", "<!-- lawman:  "),
      ok.replace("role=judge", "role="),
      ok.replace("role=judge", "Role=judge"),
      ok.replace("role=judge", "role=jud>ge"),
      ok.replace("role=judge", "role=ju dge"),
      ok.replace("role=judge", "role=jüdge"),
      `${ok}\r`,
      `${ok} `,
      ` ${ok}`,
      `x ${ok}`,
    ]) {
      expect(parseMarker(bad)).toBeNull();
    }
  });

  test("values allow letters, digits and . : _ / % + - and nothing else", () => {
    const m = parseMarker("<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z v=aZ09.:_/%+-q -->")!;
    expect(m.fields.v).toBe("aZ09.:_/%+-q");
    for (const ch of ["~", "!", "=", "*", "(", ",", "'", "\\"]) {
      expect(parseMarker(`<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z v=a${ch}b -->`)).toBeNull();
    }
  });

  test("-- and :: are banned in values, except :: inside id", () => {
    const base = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z";
    expect(parseMarker(`${base} v=a--b -->`)).toBeNull();
    expect(parseMarker(`${base} v=a::b -->`)).toBeNull();
    expect(parseMarker(`${base} v=a:b -->`)).not.toBeNull();
    expect(parseMarker(`${base} v=a-b-c -->`)).not.toBeNull();
    expect(parseMarker(lead().replace("department=core", "department=a::b"))).toBeNull();
  });

  test("a duplicate key is invalid, also for names on the object prototype", () => {
    expect(parseMarker(ret(" round=1"))).toBeNull();
    const base = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z";
    expect(parseMarker(`${base} constructor=a -->`)!.fields).toHaveProperty("constructor", "a");
    expect(parseMarker(`${base} constructor=a constructor=b -->`)).toBeNull();
  });

  test("unknown keys and stages are kept", () => {
    const m = parseMarker("<!-- lawman: role=curator stage=audit at=2026-10-14T09:30:00Z flavor=mint k_2=x -->")!;
    expect(m.stage).toBe("audit");
    expect(m.fields.flavor).toBe("mint");
    expect(m.fields.k_2).toBe("x");
  });

  test("the length limit counts bytes of the whole line", () => {
    const head = "<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z note=";
    const fill = (n: number) => head + "a".repeat(n - head.length - " -->".length) + " -->";
    expect(MARKER_MAX_BYTES).toBe(1024);
    expect(fill(1024).length).toBe(1024);
    expect(parseMarker(fill(1024))).not.toBeNull();
    expect(parseMarker(fill(1025))).toBeNull();
  });

  test("a non-ASCII byte never passes, and the byte count is not the character count", () => {
    expect(parseMarker("<!-- lawman: role=judge stage=x at=2026-10-14T09:30:00Z note=é -->")).toBeNull();
  });

  test("an id value must be canonical", () => {
    expect(parseMarker(lead("", "src/my%20file.rs::Foo%3A%3Abar::dead-code"))).not.toBeNull();
    expect(parseMarker(lead("", "src/a.rs::Foo%3a%3abar::dead-code"))).toBeNull();
    expect(parseMarker(lead("", "src/%41.rs::f::dead-code"))).toBeNull();
    expect(parseMarker(lead("", "src/a.rs::f"))).toBeNull();
    expect(parseMarker(lead("", "src/a.rs::f::g::h"))).toBeNull();
    expect(parseMarker(lead("", "::f::g"))).toBeNull();
    expect(parseMarker(lead("", "src/a--b.rs::f::g"))).toBeNull();
    expect(parseMarker(lead("", "src/a-%2Db.rs::f::g"))).not.toBeNull();
  });
});

describe("id parts", () => {
  const canonical: [string, string][] = [
    ["src/a.rs", "src/a.rs"],
    ["src/my file.rs", "src/my%20file.rs"],
    ["Foo::bar", "Foo%3A%3Abar"],
    ["a-b", "a-b"],
    ["a--b", "a-%2Db"],
    ["a---b", "a-%2D%2Db"],
    ["a--b--c", "a-%2Db-%2Dc"],
    ["--", "-%2D"],
    ["é", "%C3%A9"],
    ["100%", "100%25"],
    ["a_b.c/d", "a_b.c/d"],
  ];

  test("encode and decode agree on canonical forms", () => {
    for (const [plain, encoded] of canonical) {
      expect(encodeIdPart(plain)).toBe(encoded);
      expect(decodeIdPart(encoded)).toBe(plain);
      expect(encodeIdPart(decodeIdPart(encoded)!)).toBe(encoded);
    }
  });

  test("decode returns null for every non-canonical form", () => {
    for (const bad of ["%3a", "%41", "a--b", "a%2D-b", "a-%2D-b", "%2", "%GG", "a b", "a:b", "", "a%2Db", "é"]) {
      expect(decodeIdPart(bad)).toBeNull();
    }
  });

  test("bytes outside UTF-8 are canonical but have no string form, and a BOM survives", () => {
    expect(canonicalId("%E9::b::c")).toBe(true);
    expect(decodeIdPart("%E9")).toBeNull();
    expect(decodeIdPart("%EF%BB%BFa")).toBe("\uFEFFa");
    expect(encodeIdPart("\uFEFFa")).toBe("%EF%BB%BFa");
  });

  test("canonicalId needs exactly three canonical parts", () => {
    expect(canonicalId("src/my%20file.rs::Foo%3A%3Abar::dead-code")).toBe(true);
    expect(canonicalId("a::b")).toBe(false);
    expect(canonicalId("a::b::c::d")).toBe(false);
    expect(canonicalId("a:::b::c")).toBe(false);
    expect(canonicalId("a::%3a::c")).toBe(false);
    expect(canonicalId("a::b::")).toBe(false);
  });
});

describe("extractMarkers", () => {
  test("ord sorts by carrier time, then rank, then line", () => {
    const at = (createdAt: string, rank: number, text: string) =>
      extractMarkers({ text, createdAt, rank, author: TRUSTED }, TRUSTED).map((m) => m.ord);
    const ords = [
      ...at("2026-10-14T10:00:00Z", 1, `${ret()}\n${ret()}`),
      ...at("2026-10-14T10:00:00Z", 2, ret()),
      ...at("2026-10-14T10:00:00Z", 10, ret()),
      ...at("2026-10-14T11:00:00Z", 0, ret()),
    ];
    expect(ords).toEqual([...ords].sort());
    expect(new Set(ords).size).toBe(ords.length);
  });

  test("lines are numbered from 1, CRLF is stripped once, blank lines count", () => {
    const found = carrier(`text\r\n\r\n${ret()}\r\n`);
    expect(found.map((f) => f.line)).toEqual([3]);
    expect(found[0].marker.raw).toBe(ret());
    expect(carrier(`${ret()}\r\r\n`)).toEqual([]);
  });

  test("an author is trusted ignoring ASCII case only", () => {
    expect(carrier(ret(), "OCTOCAT-Lawman")).toHaveLength(1);
    expect(carrier(ret(), "octocat-lawmaN")).toHaveLength(1);
    expect(carrier(ret(), "someone-else")).toHaveLength(0);
    expect(carrier(ret(), "")).toHaveLength(0);
    expect(extractMarkers({ text: ret(), createdAt: "x", rank: 0, author: "" }, "")).toEqual([]);
    expect(carrier(ret(), "octocat-lawman2")).toHaveLength(0);
  });

  test("a fence opens with 3+ backticks or tildes, indented up to 3 spaces", () => {
    for (const open of ["```", "~~~", "   ```", "   ~~~", "`````", "```js", "~~~ a`b"]) {
      expect(carrier(`${open}\n${ret()}\n`)).toEqual([]);
    }
    expect(carrier(`    \`\`\`\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\n${ret()}\n`)).toHaveLength(1);
  });

  test("a backtick fence with a backtick in its info string is no fence", () => {
    expect(carrier(`\`\`\` a\`b\n${ret()}\n`)).toHaveLength(1);
  });

  test("a fence closes with the same char, at least as long, up to 3 spaces, only whitespace after", () => {
    expect(carrier(`\`\`\`\n\`\`\`\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\`\n\`\`\`\`\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\`\n   \`\`\` \t\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(`\`\`\`\n~~~\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`~~~~\n~~~\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`\`\`\`\`\n\`\`\`\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`\`\`\`\n    \`\`\`\n${ret()}\n`)).toHaveLength(0);
    expect(carrier(`\`\`\`\n\`\`\` x\n${ret()}\n`)).toHaveLength(0);
  });

  test("an unclosed fence runs to the end and resets for the next carrier", () => {
    expect(carrier(`${ret()}\n\`\`\`\n${ret()}\n${ret()}\n`)).toHaveLength(1);
    expect(carrier(ret())).toHaveLength(1);
  });

  test("a marker line is not itself a fence opener and does not need a blank line", () => {
    expect(carrier(`${ret()}\n${ret()}\n`)).toHaveLength(2);
  });
});

describe("law examples", () => {
  const law = readFileSync(join(ROOT, "law", "markers.md"), "utf8");
  const examples = law.slice(law.indexOf("## Examples"));
  const blocks = [...examples.matchAll(/^(`{3,})\n([\s\S]*?)\n\1$/gm)].map((m) => m[2]);

  test("E1 and E2 are valid", () => {
    const [e1, e2] = blocks[0].split("\n");
    const m1 = parseMarker(e1)!;
    expect(m1.fields.id).toBe("src/my%20file.rs::Foo%3A%3Abar::dead-code");
    expect(decodeIdPart(m1.fields.id.split("::")[0])).toBe("src/my file.rs");
    expect(decodeIdPart(m1.fields.id.split("::")[1])).toBe("Foo::bar");
    expect(m1.fields.of).toBe("42");
    expect(parseMarker(e2)!.fields.round).toBe("2");
    expect(carrier(blocks[0]).map((f) => f.marker.stage)).toEqual(["lead", "return"]);
  });

  test("E3, E4 and E5 are invalid", () => {
    const lines = blocks[1].split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(parseMarker(line)).toBeNull();
    expect(carrier(blocks[1])).toEqual([]);
  });

  test("E6 is a valid marker that the fence hides", () => {
    expect(blocks[2].startsWith("```\n")).toBe(true);
    expect(parseMarker(blocks[2].split("\n")[1])).not.toBeNull();
    expect(carrier(blocks[2])).toEqual([]);
  });
});

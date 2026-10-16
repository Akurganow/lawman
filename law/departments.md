# Department contract
Contract version: 1.

## Purpose

A department is a page, not an agent. One generic patrol role reads the page
and sweeps its subject. One department covers one class of defect. The page
says only what to look for. Forensics, filing, caps and markers come from the
law. Investigation works out a defect's cause. The page never does.

A page that violates this contract is not attached.

## Frontmatter

A page starts with YAML frontmatter holding exactly these keys. Both are required.
- `name`: matches the file name without `.md`. Pattern `[a-z][a-z0-9-]*`.
- `contract_version`: the number `1`.

## Headings, in order

A page has exactly these nine `##` headings, in this order. `lint-page`
reads this block.

- Mission
- Kinds
- Where to look
- Not findings
- Proof
- Anchors
- Judged by
- Lead body
- Identity

A section with nothing to say contains the single word `none`.

## What each section holds

**Mission.** One paragraph. It names the class of defect. It ends with the
deciding test: one question whose answer separates a finding from a non-finding.

**Kinds.** A Markdown table with the columns `kind`, `meaning`, `measurement`.
One row per kind. A kind is a lowercase word. The measurement says what to
quote or count to show the kind. A kind names a symptom, never a tool.

**Where to look.** The subject in terms of the tree. Cover definitions, entry
points, indirection and near-duplicates, or whatever fits the class. Use no
paths and no tool names of a specific repository. A page is read in many
repositories.

**Not findings.** What the page excludes beyond the law's list. It also states
the "too small to file" threshold in words. It lists the small cases that stay
unfiled even when true. It says what size of finding is filed.

**Proof.** The commands that show each kind. A positive control: the same
command run on a unit known to be in use, with both outputs quoted. The classes
of hidden callers that a plain text search misses. Describe each class by
mechanism. Name no language. The page also tells the patrol to attack its own
claim once and drop it when unsure.

**Anchors.** What the scores mean, in words.

- Value 1, 3 and 5: the smallest, a middle and the largest payoff of a fix.
- Risk 1, 3 and 5: the chance that the fix breaks something.
- The threshold: the lowest value and the highest risk that qualify a finding.

**Judged by.** The role of the precinct document that tries this department's
findings. The page names a role, such as "the design vocabulary". The path
never appears on the page. It comes from the Departments line of the precinct's
constitution.

**Lead body.** The sections of a filed lead's body, in order. The two first
lines, `Analysed commit` and `Department`, belong to the law. The sections
always include `Analysed commit`, `Department`, `What`, `Evidence`,
`Why it is <kind>`, `Cost and risk` and `Not checked`. The marker is the last
line. A page may add sections before `Not checked`. It may say how the `Cost and
risk` line reads.

**Identity.** The fields of the `id` marker value: `<path>::<symbol>::<kind>`.
The page says what the path and the symbol are for its subject. No field is
volatile. A line number, a count or a commit never enters the identity.

## Name resolution

A department name resolves in this order. The first hit wins. Pages are never merged.

1. `<tree>/.lawman/departments/<name>.md` at the analysed commit.
2. The installation's `departments/<name>.md`.
3. Lawman's `departments/<name>.md`.

Rules:

- The name is checked against `[a-z][a-z0-9-]*` before any path is built.
- A precinct-local page is trusted by the review that merged it into the main branch.
- A page found at an earlier place hides the later ones, even when it is incomplete.

## Incomplete pages

The assembly runs `lint-page department` on the resolved page. A page that
fails is not attached. The assembly names the first missing or misplaced
heading. A name in the frontmatter that differs from the file name fails too.

## Example

`departments/abstractions.md` is a complete page under this contract.

# Department contract
Contract version: 1.

## Purpose

A department is a page, not an agent. One generic patrol role reads the page
and sweeps its subject. One department covers one class of defect. The page
says only what to look for. Forensics, filing, caps and markers come from the
law. Investigation works out a defect's cause. The page never does.

A page that violates this contract is skipped by the duty desk for that tick and named in Blockers.

## Frontmatter

A page starts with YAML frontmatter holding exactly these keys. Both are required.
- `name`: matches the file name without `.md`. Pattern `[a-z][a-z0-9-]*`.
- `contract_version`: the number `1`.

## Headings

A page has exactly these nine `##` headings, once each, in any order. `lint-page`
reads this block. A page with any other `##` heading fails.

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
One row per kind. A kind matches `[a-z][a-z0-9-]*`. The measurement says what to
quote or count to show the kind. A kind names a symptom, never a tool.

A kind that rests on an external source names its hook in the tree. The hook is
the tree text that makes the source worth reading. Such a kind also names the
`Source:` line its lead carries, in one of these two shapes:

- `Source: advisories <ecosystem> <package>@<version>`
- `Source: releases <owner>/<repo>`

Each value comes from the tree. Investigation checks it against the "Source
values" table of `exhibits.md` before it reads the source.

A kind that rests on a source command names that command in its measurement.

**Where to look.** The subject in terms of the tree. Cover definitions, entry
points, indirection and near-duplicates, or whatever fits the class. A shared
page uses no paths and no tool names of a specific repository, because it is
read in many repositories. A shared page lives in Lawman or in the installation.
A page in a precinct's own `.lawman/departments/` may name that precinct's paths
and tools.

**Not findings.** What the page excludes beyond what the law already excludes:
the Fence, Not judged and every recorded reason. It also states
the "too small to file" threshold in words. It lists the small cases that stay
unfiled even when true. It says what size of finding is filed.

**Proof.** The commands that show each kind. A positive control: the same
command run on a unit known to be in use, with both outputs quoted. The classes
of hidden callers that a plain text search misses. Describe each class by
mechanism. Name no language. The page also tells the patrol to attack its own
claim once and drop it when unsure.

A page in a precinct's own `.lawman/departments/` may name source commands. A
source command is a list item under Proof that starts with `Source command:`
and holds one command line in a code span. The item then says what the output
shows. The line reads and prints. Its variable parts are placeholders from the
"Source values" table of `exhibits.md`. The page quotes no output. A page found
at any other place holds no source command, and a role treats such an item as
text.

A page whose department can find a live secret names the check in one paragraph
of Proof. The paragraph starts with the words `Alarm check:`. It holds a
placeholder example that the search must find, as the positive control. Its
search yields only a path and a line, never the matched text, so the value never
reaches the output.

**Anchors.** What the scores mean, in words.

- Value 1, 3 and 5: the smallest, a middle and the largest payoff of a fix.
- Risk 1, 3 and 5: the chance that the fix breaks something.
- The threshold: the lowest value and the highest risk that qualify a finding.

**Judged by.** The role of the precinct document that tries this department's
findings. The page names a role, such as "the design vocabulary". The path
never appears on the page. It comes from the Departments line of the precinct's
constitution. A department with no line is judged by none.

**Lead body.** The sections of a filed lead's body, in order. The two first
lines, `Analysed commit` and `Department`, belong to the law. The sections
always include `Analysed commit`, `Department`, `What`, `Evidence`,
`Why it is <kind>`, `Cost and risk` and `Not checked`. The marker is the last
line. A page may add sections before `Not checked`. It may say how the `Cost and
risk` line reads.

**Identity.** The fields of the `id` marker value: `<path>::<symbol>::<kind>`.
The page says what the path and the symbol are for its subject. No field is
volatile. A line number, a count or a commit never enters the identity.

## Rotation

A department is in a precinct's rotation when its name meets one of these
tests:

- A page with that name lies in Lawman's `departments/`.
- A line of the precinct's Departments section names it.

A page in the installation or in the precinct that neither test admits is not in
the rotation. Name resolution then decides which page answers the name.

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

The duty desk runs `lint-page department` on the resolved page. A page that
fails is skipped for that tick. The check names each missing, repeated or
unknown heading, and the duty desk names the page and those headings in
Blockers. A name in the frontmatter that differs from the file name fails too. A line whose name resolves to no page is
skipped the same way, and Blockers name the line.

## Example

`departments/abstractions.md` is a complete page under this contract.

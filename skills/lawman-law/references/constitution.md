---
contract_version: 4
---

# Contract of the constitution

## Purpose

A constitution holds what is true of one repository and of no other.
Each repository Lawman patrols carries one, as `LAWMAN.md` at its root.
The assembly writes a draft once. The owner reviews it. Later amendments come from the owner and from court rulings.
A constitution points at files by path. It never restates them.

## File shape

The file starts with frontmatter that holds `contract_version: 4`. Next comes the title line `# Constitution of <owner>/<repo>`.
Then come the eight `##` headings listed below, once each, in any order. Any other `##` heading is a note in the margin.
A section with nothing to say holds the single word `none`.

## Headings

`lint-page constitution` reads this block. The journal test compares it with the checker's list. The order of the list is no rule.

- Read first
- Departments
- Fence
- Regression proof
- Not judged
- Execution
- Executor loads
- Labels

## The eight sections

### Read first

Files every role reads before work, in reading order. One per line:

- `- <path>`
- `- <path> "<heading>"`

The quoted heading narrows the read to one section.

### Departments

Every department page in Lawman's `departments/`, except `licenses`, is in this repository's rotation with no line.
A line names a department of this repository. It may also name the document that judges a department of Lawman. One per line:

- `- <name>: judged by <path>`
- `- <name>: judged by none`

The name matches `[a-z][a-z0-9-]*`. The path is the document that judges the department's findings.
`none` means no document judges it yet.

The name `licenses` joins a rotation by either test only under two conditions. It resolves to Lawman's page. The key `license_precincts` of the installation holds the whole token `<precinct>=yes`. A page of the precinct or of the installation needs no such token. A missing key or a missing pair reads as "no".

### Fence

What CI already rejects. Name each check with its workflow path.
This section may also state what the fence does not prove.

### Regression proof

Commands that prove no regression. Write them verbatim, one per line.

### Not judged

Pathspecs that no department judges, one per line: generated copies, data, fixtures.

### Execution

Where a role may execute the tree's code, and which toolchain the tree expects.
A role runs code only in a copy under the run directory, never in the clone.

### Executor loads

Skills and rules of this repository that an executor loads before it changes code. One path per line.

### Labels

The labels of the repository that mean something to a person or to a role, as the owner picks them. One per line:

- `` - `<label>`: <purpose> ``
- `` - `<label>` (owner attention): <purpose> ``

The mark `(owner attention)` stands right after the label's closing backtick. It names the label that tells a person an issue waits for them. The court applies that label to a requirement it refers to a decider. It removes the label before it convicts or acquits a requirement. When no line or more than one line carries the mark, it applies and removes no label. No role acts on a line without the mark. Those lines are reference for people. The check reads no label line and checks no mark. A section with no label holds `none`.

## Precedent files

A precedent is a file. It lives in `.lawman/precedents/<name>.md` in the repository. The file name without `.md` is the precedent's name.
Only direct files of that folder are precedents. A role reads no subfolder.

The name matches `[A-Za-z0-9][A-Za-z0-9._-]*` and holds no `/`.
The file opens with frontmatter between two `---` lines. The rule text follows it.

| Field | Value | Required |
| :-- | :-- | :-- |
| `kind` | `protects` or `condemns` | yes |
| `departments` | list of department names; an empty list means all departments | yes |
| `issue` | issue number | no |
| `date` | `YYYY-MM-DD` | yes |
| `ruling` | link to the ruling comment | no |

The owner writes an owner's precedent by hand. Its name is free of the court's `<date>-<gist>` form. It may carry no `issue` and no `ruling`.
A court ruling adds, refines or cancels a precedent through the clerk's pull request. The owner merges that pull request.
A field beyond the five stays in the file. A role ignores it.
`LAWMAN.md` has no precedent section. An old `## Precedents` section is an unknown section: a note in the margin.

## Notes in the margin

A `##` heading that the headings list does not name is an unknown section. It may stand anywhere: among the listed sections, before them or after them.

An unknown section holds the owner's notes in the margin. A role may read it as context. It is optional guidance. It never overrides the law or a listed section. A command, a path or an instruction counts only when a listed section holds it.

The check rejects a file in which a listed heading is missing or stands more than once. It checks the order of no heading. It does not read the body of an unknown section. It prints each unknown section as a note line. The roles ignore a note line, and the assembly shows it to the owner.

The section `## Licenses` is the one exception. It holds three lines, `reaches`, `use` and `sources`, and a role reads them as data. The contract version stays 4. The check does not read the section and prints it as a plain note. A role cites a line as `LAWMAN.md:<line>`.

## Path rules

- A path is relative to the repository root.
- A path holds no `..` segment and has no leading slash.
- A role reads a referenced file only as it stands at the analysed commit.

## What a constitution must not hold

- Restated contents of a file. Give the path and stop.
- The precinct's weight. It lives in the journal.
- A tool name in prose where a path would do.
- Anything about the owner's machine, keys or accounts.

## Example

This example is valid under the contract. The repository is fictional.
The `Not judged` section says `none`.

````markdown
---
contract_version: 4
---

# Constitution of example/widgets

## Read first

- README.md
- docs/architecture.md "Module boundaries"
- CONTRIBUTING.md "Review rules"

## Departments

- abstraction: judged by docs/review/abstractions.md
- dead-code: judged by docs/review/dead-code.md
- docs-drift: judged by none

## Fence

- Lint, type check and unit tests run on every pull request: ci/checks.yml
- The fence does not run the browser suite. A UI regression passes it.

## Regression proof

- make lint
- make typecheck
- make test

## Not judged

none

## Execution

- Run code only in a copy under the run directory. Never run it in the clone.
- The tree expects the runtime version named in .runtime-version.

## Executor loads

- skills/widget-api/SKILL.md
- rules/testing.md

## Labels

- `needs-human` (owner attention): Lawman cannot decide this issue alone. A person decides on it.
````

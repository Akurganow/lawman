---
contract_version: 1
---

# Contract of the constitution

## Purpose

A constitution holds what is true of one repository and of no other.
Each repository Lawman patrols carries one, as `LAWMAN.md` at its root.
The assembly writes a draft once. The owner reviews it. Later amendments come from the owner and from court rulings.
A constitution points at files by path. It never restates them.

## File shape

The file starts with frontmatter that holds `contract_version: 1`. Next comes the title line `# Constitution of <owner>/<repo>`.
Then come eight `##` headings, exactly as listed below, in that order.
A section with nothing to say holds the single word `none`.

## Headings, in order

`lint-page constitution` reads this block. The journal test compares it with the checker's list.

- Read first
- Departments
- Fence
- Regression proof
- Not judged
- Execution
- Executor loads
- Precedents

## The eight sections

### Read first

Files every role reads before work, in reading order. One per line:

- `- <path>`
- `- <path> "<heading>"`

The quoted heading narrows the read to one section.

### Departments

The departments attached to this repository. One per line:

- `- <name>: judged by <path>`
- `- <name>: judged by none`

The name matches `[a-z][a-z0-9-]*`. The path is the document that judges the department's findings.
`none` means no document judges it yet.

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

### Precedents

Settled questions. One per line: `- <YYYY-MM-DD> #<n>: <ruling>`.
A line from a court ruling ends with a link to the ruling comment, in parentheses: `- <YYYY-MM-DD> #<n>: <ruling> (<link to the ruling comment>)`. An owner's amendment line may have no link.
A court ruling carries a line in the form above, without its number and without its link. The clerk assigns the number, adds the link and opens a pull request. The number is one more than the highest in the section, and the first is 1. The owner merges the pull request. Numbers never repeat.

## Path rules

- A path is relative to the repository root.
- A path holds no `..` segment and has no leading slash.
- A role reads a referenced file only through `git show <sha>:<path>` at the analysed commit.
- Before it reads, the role checks the entry mode with `git ls-tree <sha> -- <path>`.
- A role refuses a symbolic link (mode `120000`).
- A path missing at that commit is a defect of the constitution.

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
contract_version: 1
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

## Precedents

- 2026-09-02 #1: The legacy adapter in src/compat stays. Two released versions still call it. (https://github.com/example/widgets/issues/7#issuecomment-1048576301)
- 2026-09-20 #2: Duplicate fixtures under test/data are accepted debt. Each test file owns its copy.
````

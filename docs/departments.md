# Departments

A department is one subject of judgement, defined by a page. It is a page and not an agent. One generic patrol role reads the page and sweeps its subject. One department covers one class of defect.

The page says only what to look for. The law supplies forensics, filing, caps and markers. Investigation works out the cause of a defect. The page never does.

The contract for a page is [departments.md](../skills/lawman-law/references/departments.md). A page that violates it is skipped by the duty desk for that tick and named in Blockers.

## What a page holds

A page starts with frontmatter. It holds `name`, which matches the file name without `.md`, and `contract_version`, which is `1`. Nine `##` headings follow, in this order. A section with nothing to say holds the single word `none`.

| Section | Holds |
| :-- | :-- |
| Mission | One paragraph that names the class of defect. It ends with the deciding test. |
| Kinds | A table of `kind`, `meaning` and `measurement`. A kind names a symptom, never a tool. |
| Where to look | The subject in terms of the tree. |
| Not findings | What the page excludes beyond the law, and the threshold below which a true finding stays unfiled. |
| Proof | The commands that show each kind, the positive control and the classes of hidden callers. |
| Anchors | What the value and risk scores mean, and the threshold. |
| Judged by | The role of the precinct document that tries the findings. The path comes from the constitution. |
| Lead body | The sections of a filed lead's body, in order. |
| Identity | The fields of the lead's `id`: `<path>::<symbol>::<kind>`. No line number, count or commit enters it. |

A page whose department can find a live secret names an `Alarm check:` paragraph under Proof. Patrol runs that paragraph even when the department is at cap 0. It prints positions and never values.

## Shared pages

Lawman ships ten shared pages in [departments/](../skills/lawman-law/references/departments). Every precinct has all ten in its rotation with no line in its constitution.

| Department | Subject |
| :-- | :-- |
| `abstractions` | Abstractions that cost a maintainer reading time and buy nothing |
| `agent-config` | Files that configure agents and no longer describe one machine |
| `claims` | Claims in published text that the tree does not bear out |
| `dependencies` | A dependency whose state in the tree disagrees with the reason it is held that way |
| `logic` | Code that passes its checks and still computes the wrong result, crashes or corrupts state |
| `privacy` | Code that takes user data further than the privacy promise allows, and promises the code no longer keeps |
| `proportion` | Code and decisions out of proportion to their job |
| `security` | What an outsider can exploit |
| `tests` | Tests that fail for a reason other than the product, or cost more than they protect |
| `text-residue` | Text that costs a reader time and tells them nothing true |

A shared page uses no paths and no tool names of a specific repository, because many repositories read it.

## Your own pages

A precinct or an installation may add pages of its own. A page in a precinct's own `.lawman/departments/` is a special department. It may name that precinct's paths and tools, and it may hold source commands. [Special departments](precinct-departments.md) covers that page, with a worked example.

The installation's `departments/` folder holds pages for several precincts. A page there names no path or tool of one repository.

## The three places

A department name resolves in this order. The first hit wins.

1. The precinct: `.lawman/departments/<name>.md` at the analysed commit.
2. The installation: `departments/<name>.md`.
3. Lawman: `skills/lawman-law/references/departments/<name>.md`.

Pages are never merged. A page found at an earlier place hides the later ones, even when it is incomplete. A precinct's own page is trusted because a reviewed merge put it on the main branch.

The name is checked against `[a-z][a-z0-9-]*` before any path is built. The duty desk runs `bin/journal lint-page department --name <name>` on the resolved page. A page that fails is skipped for that tick and named in Blockers. The check names the first missing or misplaced heading. A line whose name resolves to no page is skipped the same way, and Blockers name the line.

## The rotation

A department is in a precinct's rotation when its name meets one of two tests. A page with that name lies in Lawman's `departments/`, or a line of the precinct's Departments section names it. The duty desk never lists a page in the installation or in the precinct that neither test admits.

The duty desk picks the department for each patrol order.

- It picks the precinct by weight.
- It lists the departments of the precinct: the shared page names plus the names on the constitution's Departments lines.
- It sorts them with `bin/journal rotation`. A department never visited comes first. Then the oldest visit comes first.
- It walks the list from the top and resolves each page.
- It takes the first department whose page passes and whose cap is above zero.

A department at cap 0 is skipped, unless its page has an `Alarm check:` paragraph. A bad page goes into the blockers of the tick. When every department of a precinct is skipped, the duty desk takes the next precinct.

The cap depends on the open leads of the department on the precinct. Up to 2 open leads allow 3 filings per tick. With 3 or 4 the cap is 1. With 5 or more it is 0. The cap is a ceiling and not a target.

A weight is a share of duty desk slots and not of leads. The assembly sets the weight. See [constitution](constitution.md).

## Judged by

A department may have a document in the precinct that tries its findings. The page names only a role for it, such as "the design vocabulary". The path comes from the constitution's Departments line:

- `- <name>: judged by <path>` names the document.
- `- <name>: judged by none` says no document judges the department yet.

A department with no line is judged by none. A judging document is evidence. It can protect a shape. It never convicts.

## Add a department

The assembly adds one department to a precinct that is already in the journal. It works in a copy under the run directory and never in the live clone.

1. Merge the precinct's constitution pull request first.
2. Choose "Precincts" in the assembly menu.
3. Choose the job "add a department".
4. Choose the precinct.
5. Give the department name, matching `[a-z][a-z0-9-]*`.
6. Choose the place of the department.
7. Name the document that judges the department, or answer `none`.
8. Draft the page with the assembly, unless the department is a shared one.
9. Approve the diff that the assembly shows.

The three places differ in what the pull request holds:

- **A page in the precinct's `.lawman/departments/`.** The pull request adds the page and a Departments line.
- **A page in the installation's `departments/`.** The assembly copies the page into the installation with no pull request. The precinct gets a Departments line by pull request. Run the job again for each further precinct.
- **A shared department of Lawman.** The precinct gets only a Departments line with its judging document, by pull request.

The assembly writes the line with `bin/journal department-line`. It commits on the branch `lawman/department-<name>` and opens the pull request. It never merges. The department enters the rotation once you merge the pull request.

The assembly also proposes the judging documents of the shared departments when it adds a precinct. See [constitution](constitution.md).

## Source files

- [departments.md](../skills/lawman-law/references/departments.md): the contract.
- [departments/](../skills/lawman-law/references/departments): the shared pages.
- [duty desk](../skills/duty-desk/SKILL.md): steps 3 to 9 choose the department.
- [precinct.md](../skills/assembly/references/precinct.md): the assembly's "Add a department" job.
- [LAW.md](../skills/lawman-law/references/LAW.md): the cap table.

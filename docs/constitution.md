# The constitution

A constitution holds what is true of one repository and of no other. Each precinct carries one, as `LAWMAN.md` at the repository root. Everything specific to the repository lives there and never in the law.

The roles read the constitution from the main branch of the precinct. A reviewed merge put it there, so the roles trust its listed sections as instructions. A constitution points at files by path. It never restates them.

The contract is [constitution.md](../skills/lawman-law/references/constitution.md). It sets the version and the shape. This repository's own [LAWMAN.md](../LAWMAN.md) is a working example.

## What it must contain

The file starts with frontmatter that holds `contract_version: 2`. Next comes the title line `# Constitution of <owner>/<repo>`. Then come nine `##` headings, as listed below, once each, in any order. A section with nothing to say holds the single word `none`.

| Section | Holds | Read by |
| :-- | :-- | :-- |
| Read first | Files every role reads before work, one per line. A quoted heading narrows the read to one section. | Patrol, response unit, spec writer, executor |
| Departments | Lines for the departments of this precinct, each with the document that judges it or `none`. | Duty desk, patrol, court |
| Fence | What CI already rejects, each check with its workflow path. It may state what the fence does not prove. | Patrol, executor |
| Regression proof | Commands that prove no regression, written verbatim. | Investigation, prosecutor, defender, court, spec writer |
| Not judged | Pathspecs that no department judges, such as generated copies, data and fixtures. | Patrol |
| Execution | Where a role may run the tree's code, and which toolchain the tree expects. | Investigation, executor |
| Executor loads | Skills and rules of the repository that the executor loads before it changes code. | Executor |
| Labels | The labels that mean something to a person or to a role, one per line. The line marked `(owner attention)` names the label that tells a person an issue waits for them. | Response unit |
| Precedents | Settled questions, one per line: `- <YYYY-MM-DD> #<n>: <ruling>`. | Patrol, response unit, investigation, prosecutor, defender, court, spec writer |

A path is relative to the repository root. It holds no `..` segment and has no leading slash. A role reads a referenced file only at the analysed commit.

## Notes in the margin

You may add your own `##` section to `LAWMAN.md`: among the listed sections, before them or after them. The roles read it as your notes in the margin. It is optional guidance. It never overrides the law or a listed section. A command, a path or an instruction counts only when a listed section holds it.

The check rejects a file in which a listed heading is missing or stands twice. The order of the sections does not matter. The check does not read an unknown section. `bin/journal lint-page constitution` prints each one as a line that starts with `#`, and the assembly shows it to you.

## What it must not hold

- The restated contents of a file. Give the path and stop.
- The precinct's weight. It lives in the journal.
- A tool name in prose where a path would do.
- Anything about the owner's machine, keys or accounts.

Two per-precinct settings live outside the constitution for this reason: the weight, which [departments](departments.md#the-rotation) explains, and the Jev pair, which [configuration](configuration.md) explains.

## How the assembly writes it

The assembly writes a draft once, when you add a precinct without a `LAWMAN.md`. You review it. The assembly never merges.

- It clones the precinct and reads its agent files, rules, CI workflows and review documents.
- It drafts `LAWMAN.md` on the branch `lawman/constitution`, with the frontmatter, the title and the nine headings.
- It fills each section except Departments and Labels with paths and short facts.
- It asks which label tells a person that an issue waits for them, and which other labels matter. It writes a line only for a label you pick. It recommends `needs-human` and creates it after your approval when the repository has none. It explains that the label makes an issue that Lawman sent out of its funnel visible in the tracker.
- It writes `none` where nothing applies.
- It drops each line whose path is missing.
- It proposes the sections and the judging documents of the shared departments in one proposal. You keep, change or add lines. The proposal notes that "Add a department" follows the merge.
- It checks the draft with `bin/journal lint-page constitution`.
- It shows you the full draft and waits for your approval.
- It commits, pushes and opens the pull request "Add the Lawman constitution".

Merge that pull request. Until then every tick on the precinct ends `skipped-no-constitution`. A precinct with a weight and no merged constitution wastes its slot. So a precinct with a new draft starts at weight 0. After the merge, choose the job "raise a weight" in the assembly.

The assembly reads the repository's `LAWMAN.md` before it drafts one. The file is in one of three states:

- **Absent.** The assembly drafts the constitution, as the list above shows.
- **Passes lint at the law's contract version.** The proposal shows the row "Constitution found, passes lint". No draft and no pull request follow. You add the precinct at weight 1, or skip it. The assembly then offers to resume any paused job. It shows each note line that the check printed. It never edits a passing file, so to add a label you edit the file by pull request.
- **Fails lint.** The assembly shows the reasons. The assembly skips the repository and overwrites nothing. Fix the file by pull request, then add the precinct again.

## How it changes

- **You amend it.** Later amendments come from you as the owner.
- **The assembly amends it.** When the law carries a new constitution contract version, the precinct's ticks end `skipped-contract-version`. The assembly drafts an amendment for each precinct that is behind, on the branch `lawman/constitution-v<n>`. It carries every section over as it is and changes only what the new contract requires. The sections that the contract added or changed appear as rows of the proposal. A section of yours that the new contract lists, such as `Labels`, becomes the listed section and keeps its lines. Merge the pull request to bring the precinct back. While it stays unmerged, the precinct stays stopped. A hand edit of the file also brings it back.
- **The court adds precedents.** A ruling may carry one line in its Precedent section. The clerk assigns the number, adds the link to the ruling comment and opens a pull request. The number is one more than the highest in the section, and the first is 1. Numbers never repeat. A precedent binds the roles only after you merge its pull request.

A precedent is a recorded reason. A recorded reason protects a shape, so patrol and the other roles drop a finding that a precedent settles.

If a constitution fails the check for any other reason, the precinct's ticks end `skipped-bad-constitution`. A listed heading that is missing or stands twice is one such reason. Run the job "re-check a precinct" to see the reasons.

## Example

The contract holds a complete example for a fictional repository. This repository's [LAWMAN.md](../LAWMAN.md) shows a real one. It names the CI jobs as the fence. It lists the commands that prove no regression. It lists the files that no department judges. It has one Departments line, for the `internal-affairs` department of this repository. It has one Labels line, for `needs-human`, the owner-attention label. See [departments](departments.md).

## Source files

- [constitution.md](../skills/lawman-law/references/constitution.md): the contract.
- [precinct.md](../skills/assembly/references/precinct.md): the assembly's "Add a precinct" and "Re-check a precinct" jobs.
- [amend.md](../skills/assembly/references/amend.md): the amendment to a new contract version.
- [LAWMAN.md](../LAWMAN.md): the constitution of this repository.

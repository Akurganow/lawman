# The constitution

A constitution holds what is true of one repository and of no other. Each precinct carries one, as `LAWMAN.md` at the repository root. Everything specific to the repository lives there and never in the law.

The roles read the constitution from the main branch of the precinct. A reviewed merge put it there, so the roles trust it as instructions. A constitution points at files by path. It never restates them.

The contract is [constitution.md](../skills/lawman-law/references/constitution.md). It sets the version and the shape. This repository's own [LAWMAN.md](../LAWMAN.md) is a working example.

## What it must contain

The file starts with frontmatter that holds `contract_version: 1`. Next comes the title line `# Constitution of <owner>/<repo>`. Then come eight `##` headings, exactly as listed below and in this order. A section with nothing to say holds the single word `none`.

| Section | Holds | Read by |
| :-- | :-- | :-- |
| Read first | Files every role reads before work, one per line. A quoted heading narrows the read to one section. | Patrol, response unit, spec writer, executor |
| Departments | Lines for the departments of this precinct, each with the document that judges it or `none`. | Duty desk, patrol, court |
| Fence | What CI already rejects, each check with its workflow path. It may state what the fence does not prove. | Patrol, executor |
| Regression proof | Commands that prove no regression, written verbatim. | Investigation, prosecutor, defender, court, spec writer |
| Not judged | Pathspecs that no department judges, such as generated copies, data and fixtures. | Patrol |
| Execution | Where a role may run the tree's code, and which toolchain the tree expects. | Investigation, executor |
| Executor loads | Skills and rules of the repository that the executor loads before it changes code. | Executor |
| Precedents | Settled questions, one per line: `- <YYYY-MM-DD> #<n>: <ruling>`. | Patrol, response unit, investigation, prosecutor, defender, court, spec writer |

A path is relative to the repository root. It holds no `..` segment and has no leading slash. A role reads a referenced file only at the analysed commit.

## What it must not hold

- The restated contents of a file. Give the path and stop.
- The precinct's weight. It lives in the journal.
- A tool name in prose where a path would do.
- Anything about the owner's machine, keys or accounts.

Two per-precinct settings live outside the constitution for this reason.

- **Weight.** A weight is a share of duty desk slots. The precinct starts at weight 0 and the assembly raises it later. The journal stores it. See [the journal](journal.md).
- **The Jev pair.** When you allow TypeSafe Jev, the assembly asks per precinct whether the court may send its brief there. It stores the answer as `<precinct>=<yes|no>` in `typesafe_precincts` of `config.yaml`. See [configuration](configuration.md).

## How the assembly writes it

The assembly writes a draft once, when you add a precinct. You review it. The assembly never merges.

- It clones the precinct and reads its agent files, rules, CI workflows and review documents.
- It drafts `LAWMAN.md` on the branch `lawman/constitution`, with the frontmatter, the title and the eight headings.
- It fills each section except Departments with paths and short facts.
- It writes `none` where nothing applies.
- It drops each line whose path is missing.
- It walks the sections with you, one question each. You keep, change or add lines.
- It asks which documents judge the shared departments.
- It asks whether the precinct needs a department of its own.
- It checks the draft with `bin/journal lint-page constitution`.
- It shows you the full draft and waits for your approval.
- It commits, pushes and opens the pull request "Add the Lawman constitution".

Merge that pull request. Until then every tick on the precinct ends `skipped-no-constitution`. A precinct with a weight and no merged constitution wastes its slot. So the precinct starts at weight 0. After the merge, choose the job "raise a weight" in the assembly.

## How it changes

- **You amend it.** Later amendments come from you as the owner.
- **The assembly amends it.** When the law carries a new constitution contract version, the precinct's ticks end `skipped-contract-version`. The assembly drafts an amendment for each precinct that is behind, on the branch `lawman/constitution-v<n>`. It carries every section over as it is and changes only what the new contract requires. It asks the walk question for each section that the contract added or changed. Merge the pull request to bring the precinct back.
- **The court adds precedents.** A ruling may carry one line in its Precedent section. The clerk assigns the number, adds the link to the ruling comment and opens a pull request. The number is one more than the highest in the section, and the first is 1. Numbers never repeat. A precedent binds the roles only after you merge its pull request.

A precedent is a recorded reason. A recorded reason protects a shape, so patrol and the other roles drop a finding that a precedent settles.

If a constitution fails the check for any other reason, the precinct's ticks end `skipped-bad-constitution`. Run the job "re-check a precinct" to see the reasons.

## Example

The contract holds a complete example for a fictional repository. This repository's [LAWMAN.md](../LAWMAN.md) shows a real one. It names the CI jobs as the fence. It lists the commands that prove no regression. It lists the files that no department judges. It has one Departments line, for the `internal-affairs` department of this repository. See [departments](departments.md).

## Source files

- [constitution.md](../skills/lawman-law/references/constitution.md): the contract.
- [precinct.md](../skills/assembly/references/precinct.md): the assembly's "Add a precinct" and "Re-check a precinct" jobs.
- [amend.md](../skills/assembly/references/amend.md): the amendment to a new contract version.
- [LAWMAN.md](../LAWMAN.md): the constitution of this repository.

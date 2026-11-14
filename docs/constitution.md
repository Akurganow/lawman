# The constitution

A constitution holds what is true of one repository and of no other. Each precinct carries one, as `LAWMAN.md` at the repository root. Everything specific to the repository lives there and never in the law.

The roles read the constitution from the main branch of the precinct. It is evidence, as [Texts of the precinct](../skills/lawman-law/references/LAW.md#texts-of-the-precinct) says. A constitution points at files by path. It never restates them.

The contract is [constitution.md](../skills/lawman-law/references/constitution.md). It sets the version and the shape. This repository's own [LAWMAN.md](../LAWMAN.md) is a working example.

## What it must contain

The file starts with frontmatter that holds `contract_version: 4`. Next comes the title line `# Constitution of <owner>/<repo>`. Then come eight `##` headings, as listed below, once each, in any order. A section with nothing to say holds the single word `none`.

| Section | Holds | Read by |
| :-- | :-- | :-- |
| Read first | Files every role reads before work, one per line. A quoted heading narrows the read to one section. | Patrol, response unit, spec writer, executor |
| Departments | Lines for the departments of this precinct, each with the document that judges it or `none`. | Duty desk, patrol, court |
| Fence | What CI already rejects, each check with its workflow path. It may state what the fence does not prove. | Patrol, executor |
| Regression proof | Commands that prove no regression, written verbatim. | Investigation, prosecutor, defender, court, spec writer |
| Not judged | Pathspecs that no department judges, such as generated copies, data and fixtures. | Patrol |
| Execution | Where a role may run the tree's code, and which toolchain the tree expects. | Investigation, executor |
| Executor loads | Skills and rules of the repository that the executor loads before it changes code. | Executor |
| Labels | The labels that mean something to a person or to a role, one per line. The line marked `(owner attention)` names the label that tells a person an issue waits for them. | Court |

Precedents are not a section. Each precedent is a file in `.lawman/precedents/<name>.md`, with frontmatter fields `kind`, `departments`, `date`, and optionally `issue` and `ruling`. A dismissal also holds `finding`. The court names the departments of its precedent, or says all. The journal checks each name and writes the names it knows into `departments`. Without any, it writes the department of the case, or an empty list for all departments when the case has none. TypeSafe Jev may add departments when the precinct allows Jev, and never removes one. You may write a precedent by hand under a free name. An old `## Precedents` section stays valid as a note in the margin, and the assembly can move its numbered lines into files (see [How it changes](#how-it-changes)).

A path is relative to the repository root. It holds no `..` segment and has no leading slash. A role reads a referenced file only at the analysed commit.

## Notes in the margin

You may add your own `##` section to `LAWMAN.md`: among the listed sections, before them or after them. The roles read it as your notes in the margin. It is optional guidance. It never overrides the law or a listed section. A command, a path or an instruction counts only when a listed section holds it.

The check rejects a file in which a listed heading is missing or stands twice. The order of the sections does not matter. The check does not read an unknown section. `bin/journal lint-page constitution` prints each one as a line that starts with `#`, and the assembly shows it to you.

The section `## Licenses` is the one named exception. It holds three lines, `reaches`, `use` and `sources`. The roles read them as data and not as instructions. The `sources` line only narrows what a role sends. A `sources` value outside its form reads as `none`, and a `reaches` or `use` value outside its form reads as absent. The `reaches` and `use` lines are facts of the precinct and send nothing. The contract version stays 4. The Departments line carries nothing extra. The check does not read the section. The assembly does not show the note of that section.

## What it must not hold

- The restated contents of a file. Give the path and stop.
- The precinct's weight. It lives in the journal.
- A tool name in prose where a path would do.
- Anything about the owner's machine, keys or accounts.

Four per-precinct settings live outside the constitution for this reason. The weight is explained in [departments](departments.md#the-rotation). The Jev pair, the catalog pair and the license pair `license_precincts` are explained in [configuration](configuration.md). The catalog pair comes with the reading way of the precinct's dependencies, which lives in the host notes. The license pair comes with the entry under `## License reading` in the host notes. The `licenses` page is in the rotation of a precinct only when `license_precincts` holds the whole token `<precinct>=yes`.

## How the assembly writes it

The assembly writes a draft once, when you add a precinct without a `LAWMAN.md`. You review it. The assembly merges it only when you explicitly ask it to.

- It clones the precinct and reads its agent files, rules, CI workflows and review documents.
- It drafts `LAWMAN.md` on the branch `lawman/constitution`, with the frontmatter, the title and the eight headings.
- It fills each section except Departments and Labels with paths and short facts.
- It asks which label tells a person that an issue waits for them, unless the host already names one. It asks which other labels matter when the host has others. It writes a line only for a label you pick. It recommends `needs-human` and creates it after your approval when the repository has none. It explains that the court applies the label to a requirement that it refers to a person, and removes it when it rules.
- It writes `none` where nothing applies.
- It adds the section `## Licenses` to the same draft when you answer yes to the license question for the precinct.
- It drops each line whose path is missing.
- It proposes the sections and the judging documents of the shared departments in one proposal. You keep, change or add lines. The proposal notes that "Add a department" follows the merge.
- It checks the draft with `bin/journal lint-page constitution`.
- It shows you the draft as a table of its eight sections, each line with the file it came from. It waits for your approval: open the pull request, change or skip.
- It commits, pushes and opens the pull request "Add the Lawman constitution".

The commands of the precinct are no part of the constitution. The assembly proves them and writes them into the installation, as [configuration](configuration.md#the-commands) says.

Merge that pull request. Until then the duty desk writes no order on the precinct for a role that needs the constitution, and the alarm `no-constitution` names the precinct. A precinct with a weight and no merged constitution wastes its slot. So a precinct with a new draft starts at weight 0. After the merge, choose the job "raise a weight" in the assembly.

The assembly reads the repository's `LAWMAN.md` before it drafts one. The file is in one of three states:

- **Absent.** The assembly drafts the constitution, as the list above shows.
- **Passes lint at the law's contract version.** The proposal shows the row "Constitution found, passes lint". No draft and no constitution pull request follow. You add the precinct at weight 1, or skip it. The assembly then offers to resume any paused job. It shows each note line that the check printed. It edits a passing file only to move old precedent lines, by pull request and only when you say so. To add a label you edit the file by pull request.
- **Fails lint.** The assembly shows the reasons. The assembly skips the repository and overwrites nothing. Fix the file by pull request, then add the precinct again.

## How it changes

- **You amend it.** Later amendments come from you as the owner.
- **The assembly amends it.** When the law carries a new constitution contract version, the precinct's ticks end `skipped-contract-version`. The assembly drafts an amendment for each precinct that is behind, on the branch `lawman/constitution-v<n>`. It carries every section over as it is and changes only what the new contract requires. The sections that the contract added or changed appear as rows of the proposal. A section of yours that the new contract lists, such as `Labels`, becomes the listed section and keeps its lines. Merge the pull request to bring the precinct back. While it stays unmerged, the precinct stays stopped. A hand edit of the file also brings it back. The order for an existing installation is in the README section [Update](../README.md#update).

  Version 3 also touches the owner-attention label. When its line carries exactly the old purpose, the amendment replaces it with the new one. The proposal then shows a row that sets the new description of the label on the host. The write follows the pull request, after your approval. Any other purpose text stays your words.
- **The assembly moves the old precedents.** An old precedent is a numbered line `<date> #<n>: <rule> (<link>)` in a `## Precedents` section. The `#<n>` numbers the precedent in the section and names no issue. The assembly asks once for each precinct that holds such lines, on the first add and in the amend run. "Re-check a precinct" asks only when you ask to move them now. It first says that precedents are now files, that the old lines become a note that binds no role and what each answer does.
  - **Keep as notes.** The assembly writes nothing and touches no pull request. The lines stay as a note in the margin.
  - **Move.** The assembly reads the issue from the link of each line, through the host. It finds the kind from the court's rulings on that issue. A kind that all counted rulings share is used. Mixed rulings, no ruling, a line without a link or an issue missing from the issues list make the assembly ask about that line alone: protects, condemns or leave it as a note. The journal writes `.lawman/precedents/<date>-<gist>.md` and takes the line out of `LAWMAN.md` in one step. The rest of the page keeps its bytes, and a section with no line left reads `none`.
  - **The file.** It holds `kind`, `date`, `ruling` when the link passes the link check, and `departments: []`. The empty list means all departments, because the old lines name none, and TypeSafe Jev is not asked about such a file.
  - **The pull request.** The assembly commits to the branch `lawman/move-precedents` and opens the pull request "Move the precedents to files". When no line moved, it opens none. You merge it.
  - **Open pull requests of the old form.** A pull request of the trusted account that adds an old line, measured against its merge base, gets the files by an ordinary commit in its branch. The commits already there stay. If the assembly cannot write to the branch, it names the pull request to you, changes nothing and leaves its lines as notes.
  - **Several pull requests.** The move, an amendment and a pull request of the old form edit the same file. No lock or order stands between them, and a conflict shows in the pull request. Merge the move and an amendment in any order. A pull request of the old form keeps its own path. One that closes an issue executes a ruling: it keeps its precedent file, and you merge it after the executor's work. The precedent binds then. The assembly never merges a pull request that it did not open.
- **The assembly amends the license facts.** For an existing constitution, the assembly opens a pull request from the branch `lawman/licenses-sources`. It checks the file with `bin/journal lint-page constitution`. After the edit, the diff changes only the section `## Licenses`. A merge by you may narrow `sources` or change `use`, and the assembly asks no question about it.
- **The court adds precedents.** A ruling may carry lines in its Precedent section: a new precedent with the departments it binds, a refinement of one or the cancellation of one. The journal writes the files under `.lawman/precedents/`. The clerk opens a pull request with them. A taken name gets the next free one, so no precedent is lost. A precedent binds the roles only after you merge its pull request. A close of a lead with no fix leaves a dismissal, which you merge the same way.

A precedent is no recorded reason. It is a decision already made for your repository, so the same dispute is not argued again in every case. A protecting precedent says that a shape is not a violation, and a condemning one says that it is. A dismissal turns down one finding. Patrol does not file a finding that a dismissal names, unless it sees a difference. The same holds for a finding that a protecting precedent fits, unless a condemning precedent fits it too. The roles rely on it, and a role that needs a different outcome shows how the new case differs or asks to cancel the precedent. The facts of each new case are still proved by evidence.

If a constitution fails the check for any other reason, the precinct gets the same alarm and no orders for those roles. A listed heading that is missing or stands twice is one such reason. Run the job "re-check a precinct" to see the reasons.

## Example

The contract holds a complete example for a fictional repository. This repository's [LAWMAN.md](../LAWMAN.md) shows a real one. It names the CI jobs as the fence. It lists the commands that prove no regression. It lists the files that no department judges. It has one Departments line, for the `internal-affairs` department of this repository. It has one Labels line, for `needs-human`, the owner-attention label. See [departments](departments.md).

## Source files

- [constitution.md](../skills/lawman-law/references/constitution.md): the contract.
- [precinct.md](../skills/assembly/references/precinct.md): the assembly's "Add a precinct" and "Re-check a precinct" jobs, and the move of the old precedents.
- [old-precedents.ts](../journal/src/old-precedents.ts): the journal commands that list, check and move the numbered lines.
- [amend.md](../skills/assembly/references/amend.md): the amendment to a new contract version, and the question about old precedents that comes with it.
- [LAWMAN.md](../LAWMAN.md): the constitution of this repository.

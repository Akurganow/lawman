# Amend

Use this reference when the constitution contract in the law differs from `contract_version` in `config.yaml`, or when a precinct is behind it and has no open amendment. A plugin update moved the law, and a tick recorded it. Amend brings each precinct's constitution to the new contract. It does not move the law and does not touch the journal.

Amend follows the shape in `SKILL.md`. Step 1 finds the change. Step 2 proposes, decides and applies for each precinct. Step 3 records and summarizes.

## Step 1. Find the change

1. Note `contract_version` (it may be absent), `amended_law_commit`, `law_commit` and `journal_sha256` from `config.yaml`.
2. Compute the SHA-256 of `bin/journal`. Stop if it differs from `journal_sha256`, because the binary changed outside the sync.
3. Read the contract version in `lawman/skills/lawman-law/references/constitution.md`. Call it `<n>`.
4. Read the current `constitution.md` of the law folder. Read the older text at `amended_law_commit` from the history of the law folder. When the folder has no such history, read it from `release_repo`. Use the host action of the notes that reads a file at a revision. Compare the two texts, and keep the differences for the rows of Step 2. Show no whole text. When no older text can be had, or it equals the current text, there is no comparison. The lint of each precinct in Step 2 then says what the precinct lacks. That is a path, not a stop.
5. Read `host.md`. Five label actions need a record in it. They read a repository's labels with their descriptions and create a label with a description. They also apply a label to an issue, remove a label from an issue, and set a label's description. For each one that `host.md` does not record, find how this machine does it with the tool the notes name. Step 3 appends them. Ask no separate question for them. Three more host actions serve the move of the old precedents. They turn a line's link into an issue number, read a file at a pull request revision and write to its branch. Find a missing one the same way when a precinct holds old lines, and let Step 3 append it too.

## Step 2. Amend the precincts

1. Run `bin/journal precinct list`, then fetch the origin of each precinct, and stop if a fetch fails.
2. For each precinct, lint its `LAWMAN.md` at the origin's head with `bin/journal lint-page constitution`. A printed line that starts with `#` is a note and changes nothing.
2a. Run part one of the section "Move the old precedents" in `references/precinct.md` for each precinct in two cases. One: its `LAWMAN.md` at the tip of the default branch holds old precedent lines. Two: it has open pull requests of the old form. Run it before any decision about the amendment of that precinct, whether the precinct gets a draft or not. It asks one question for the precinct and writes nothing.
3. When the file's `contract_version` is lower than `<n>`, draft an amendment. Skip a precinct that already has an open pull request from `lawman/constitution-v<n>`, and name it as waiting for that merge.
4. Draft the amendment from the precinct's current `LAWMAN.md`. It never redrafts a section from the files alone. Follow these items in order.
   1. Create and switch to the branch `lawman/constitution-v<n>` from the origin's head in the precinct, and stop if that fails.
   2. Use the comparison of step 1 item 4, or the lint of item 2 when there is none, to see what the new contract version requires.
   3. Carry every section of `LAWMAN.md` over as it is, and change only what that comparison requires. Set `contract_version` to `<n>`. A section that the new contract names and that the file holds as an unknown section is a collision. That section becomes the listed one and keeps its lines. Write no second heading.
   4. Make one row of the proposal for each section that the new contract added or changed. The Labels section is one: its questions come from the section "Pick the labels" in `references/precinct.md`. A file with no Labels heading gets one. The place is no rule.
   5. List the files of the folder `lawman/skills/lawman-law/references/departments/` in the current folder and, from the history of the law folder, at `amended_law_commit`. List only the files whose name ends in `.md`, because a folder beside a page is no page. The names present only in the current folder are the shared departments added since, except `licenses`. Write no line for `licenses`. With no older list, no department is new.
   6. For those departments only, make one row each, with its pair from the section "Departments" in `references/precinct.md`.
   7. Write the department lines that those pairs describe.
   8. Run the section "Lint the draft" of the add path.
   9. Send the proposal of the section "The repository proposal" in `references/precinct.md`.
   10. Show only these rows: the changed sections, the new departments, the branch and title, and the lint result. When the user answered "Move" in item 2a, the rows include "Old precedents" of "The repository proposal".
   11. Leave out the weight, TypeSafe, Catalog, consent, reading-way and own-department rows, and the consent question. Installation facts never go into a precinct's repository.
   12. Ask in the question tool, in one call for the precinct. The call covers the amendment and, when the proposal holds the row "Old precedents", the move.
   13. Offer "Open the pull request" (recommended), "Change" and "Skip".
   14. On "Change", follow the change items of "The repository proposal".
   15. On "Open the pull request", run only the section "Commit and open the pull request" of the add path. Then run part two of "Move the old precedents" when the proposal holds its row. After the pull request opens, set the description of the label on the host when the proposal holds that row. Use the way that the host notes record, or that item 5 of Step 1 found. Read the labels back and find the new description. If the write or the read-back fails, tell the developer and go on.
   16. Use the branch lawman/constitution-v<n> in place of lawman/constitution.
   17. Use "Amend the Lawman constitution to version <n>" as the commit message and the pull request title.
   18. On "Skip", write nothing for the precinct, the move included.
4a. Send a short proposal to a precinct that gets no draft and whose answer in item 2a was "Move". It gets no draft when its version is current or when a pull request from `lawman/constitution-v<n>` is open. It holds only the "Old precedents" row of "The repository proposal". Ask in the question tool with one call for the precinct, and offer "Apply" (recommended) and "Skip". On "Apply", run part two of the section "Move the old precedents". On "Skip", write nothing for the precinct.
5. Tell the developer that the precinct's ticks end with `skipped-contract-version` until the amendment merges.
6. When lint fails for another reason, show the reasons. The precinct's ticks then end with `skipped-bad-constitution`. The amendment answers both, so the version reason and a missing heading that the new contract added do not count as another reason.

## Step 3. Record

When the developer skipped a precinct, skip item 1 and name the skipped precinct in item 2. Say that the next start enters amend again.

1. Set `contract_version` to `<n>` and `amended_law_commit` to `law_commit`. Keep the other keys. Write `config.yaml`, and read it back.
2. Tell the developer the new contract version, the pull requests that the amendment opened and the pull requests that moved old precedents. Say nothing else unless it occurred in this run. When this run opened an amendment and a move or a pull request of the old form also edits `LAWMAN.md`, say that no order stands between them and that a conflict shows in the pull request itself.
3. Append to `host.md` the label rows and the host actions of the move that Step 1 item 5 found, and name them to the developer. Keep every other line, write no credential value, and read the file back.

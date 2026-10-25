# Amend

Use this reference when the constitution contract in the law differs from `contract_version` in `config.yaml`. A plugin update moved the law, and a tick recorded it. Amend brings each precinct's constitution to the new contract. It does not move the law and does not touch the journal.

Amend follows the shape in `SKILL.md`. Step 1 finds the change and shows it. Step 2 proposes, decides and applies for each precinct. Step 3 records and summarizes.

## Step 1. Show the change

1. Note `contract_version` (it may be absent), `amended_law_commit`, `law_commit` and `journal_sha256` from `config.yaml`.
2. Compute the SHA-256 of `bin/journal`. Stop if it differs from `journal_sha256`, because the binary changed outside the sync.
3. Read the contract version in `lawman/skills/lawman-law/references/constitution.md`. Call it `<n>`. Read the `Contract version` line in `lawman/skills/lawman-law/references/departments.md`.
4. Read `constitution.md` of the law at `amended_law_commit` and at `law_commit`. Compare the two texts. Show the developer the differences. When the law folder no longer holds `amended_law_commit`, the read fails. Stop, and tell the developer that the comparison base is missing.
5. Ask in the question tool. Offer "Amend now" (recommended) and "Later".
6. Label "Later" so that it says the next start enters amend again.
7. Say in the same label that roles and the menu stay out of reach until an amendment runs.
8. Stop on "Later", an empty answer, a cancel or a timeout.
9. On "Amend now", read `host.md`. Three label actions need a record in it. They read a repository's labels with their descriptions, create a label with a description, and apply a label to an issue. For each one that `host.md` does not record, find how this machine does it with the tool the notes name. Show each as a row (found) of the first proposal of this run. Append the missing rows in the apply of the first approved precinct. Keep every other line, write no credential value, and read the file back. Ask no separate question for them.

## Step 2. Amend the precincts

1. Run `bin/journal precinct list`, then fetch the origin of each precinct, and stop if a fetch fails.
2. For each precinct, lint its `LAWMAN.md` at the origin's head with `bin/journal lint-page constitution`. A printed line that starts with `#` is a note and changes nothing.
3. When the file's `contract_version` is lower than `<n>`, draft an amendment. Skip a precinct that already has an open pull request from `lawman/constitution-v<n>`, and name it as waiting for that merge.
4. Draft the amendment from the precinct's current `LAWMAN.md`. It never redrafts a section from the files alone. Follow these items in order.
   1. Create and switch to the branch `lawman/constitution-v<n>` from the origin's head in the precinct, and stop if that fails.
   2. Use the comparison of step 1 item 4 to see what the new contract version requires.
   3. Carry every section of `LAWMAN.md` over as it is, and change only what that comparison requires. Set `contract_version` to `<n>`. A section that the new contract names and that the file holds as an unknown section is a collision. That section becomes the listed one and keeps its lines. Write no second heading.
   4. Make one row of the proposal for each section that the new contract added or changed. The Labels section is one: its questions come from the section "Pick the labels" in `references/precinct.md`. A file with no Labels heading gets one before Precedents. The place is no rule.
   5. List the files of the folder `lawman/skills/lawman-law/references/departments/` at `amended_law_commit` and at `law_commit`. The names present only at `law_commit` are the shared departments added since.
   6. For those departments only, make one row each, with its pair from the section "Departments" in `references/precinct.md`.
   7. Write the department lines that those pairs describe.
   8. Run the section "Lint the draft" of the add path.
   9. Send the proposal of the section "The repository proposal" in `references/precinct.md`.
   10. Show only these rows: the changed sections, the new departments, the branch and title, and the lint result.
   11. Leave out the weight, TypeSafe, consent and own-department rows, and the consent question.
   12. Ask in the question tool, in one call for the precinct.
   13. Offer "Open the pull request" (recommended), "Change" and "Skip".
   14. On "Change", follow the change items of "The repository proposal".
   15. On "Open the pull request", run only the section "Commit and open the pull request" of the add path.
   16. Use the branch lawman/constitution-v<n> in place of lawman/constitution.
   17. Use "Amend the Lawman constitution to version <n>" as the commit message and the pull request title.
   18. On "Skip", write nothing for the precinct.
5. Tell the developer that the precinct's ticks end with `skipped-contract-version` until the amendment merges.
6. When lint fails for another reason, show the reasons. The precinct's ticks then end with `skipped-bad-constitution`.

## Step 3. Record

When the developer skipped a precinct, skip item 1 and name the skipped precinct in item 2. Say that the next start enters amend again.

1. Set `contract_version` to `<n>` and `amended_law_commit` to `law_commit`. Keep the other keys. Write `config.yaml`, and read it back.
2. Tell the developer the new contract version and the pull requests that the amendment opened.
3. If a folder under `lawman/skills/` other than `assembly` and `lawman-law` has no scheduler job `[lawman] <role>`, tell the developer to run the assembly again. That enters the roles mode.

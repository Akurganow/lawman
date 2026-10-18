# Amend

Use this reference when the constitution contract in the law differs from `contract_version` in `config.yaml`. A plugin update moved the law, and a tick recorded it. Amend brings each precinct's constitution to the new contract. It does not move the law and does not touch the journal.

## Step 1. Show the change

1. Note `contract_version` (it may be absent), `amended_law_commit`, `law_commit` and `journal_sha256` from `config.yaml`.
2. Compute the SHA-256 of `bin/journal`, the way the harness page names under "Syncing the law". Stop if it differs from `journal_sha256`, because the binary changed outside the sync.
3. Read the contract version in `lawman/skills/lawman-law/references/constitution.md`. Call it `<n>`. Read the `Contract version` line in `lawman/skills/lawman-law/references/departments.md`.
4. Read `constitution.md` of the law at `amended_law_commit` and at `law_commit`, the way the harness page names under "Syncing the law". Compare the two texts. Show the developer the differences. When the law folder no longer holds `amended_law_commit`, the read fails. Stop, and tell the developer that the comparison base is missing.
5. Ask the developer to confirm the amendment, and stop unless they confirm it.

## Step 2. Amend the precincts

1. Run `bin/journal precinct list`, then `git -C precincts/<name> fetch origin` for each precinct, and stop if a fetch fails.
2. Run `git -C precincts/<name> show origin/HEAD:LAWMAN.md | bin/journal lint-page constitution` for each precinct.
3. When the file's `contract_version` is lower than `<n>`, draft an amendment.
4. Draft the amendment from the precinct's current `LAWMAN.md`. It never redrafts a section from the files alone. Follow these items in order.
   1. Run `git -C precincts/<name> switch -c lawman/constitution-v<n> origin/HEAD`, and stop if it fails.
   2. Use the comparison of step 1 item 4 to see what the new contract version requires.
   3. Carry every section of `LAWMAN.md` over as it is, and change only what that comparison requires. Set `contract_version` to `<n>`.
   4. For each section that the new contract added or changed, ask the walk question of the "Walk the sections" section in `references/precinct.md`.
   5. List the files of the folder `lawman/skills/lawman-law/references/departments/` at `amended_law_commit` and at `law_commit`, the way the harness page names under "Syncing the law". The names present only at `law_commit` are the shared departments added since.
   6. For those departments only, ask the judging-document question of the "Departments" section in `references/precinct.md`, and write the lines it describes.
   7. Run the sections "Lint and approval" and "Commit and open the pull request" of the add path, with the branch `lawman/constitution-v<n>` in place of `lawman/constitution`. Use `Amend the Lawman constitution to version <n>` as the commit message and the pull request title.
5. Tell the developer that the precinct's ticks end with `skipped-contract-version` until the amendment merges.
6. When lint fails for another reason, show the reasons. The precinct's ticks then end with `skipped-bad-constitution`.

## Step 3. Record

1. Set `contract_version` to `<n>` and `amended_law_commit` to `law_commit`. Keep the other keys. Write `config.yaml`, and read it back.
2. Tell the developer the new contract version and the pull requests that the amendment opened.
3. If a folder under `lawman/skills/` other than `assembly` and `lawman-law` has no scheduler job `[lawman] <role>`, tell the developer to run the assembly again. That enters the roles mode.
4. To change the schedule, models or gates, run the assembly and choose the menu job.

# Update

Use this reference when `config.yaml` no longer matches the law clone. Update moves the installation to one release tag.

## Step 1. Choose the target and show the change

1. Note the current `law_commit`, `release_tag` and `journal_sha256` from `config.yaml`.
2. Run `git -C lawman fetch --tags`, and stop if it fails.
3. Set the target to the latest tag from `git -C lawman tag --sort=-v:refname | head -n 1`, unless the developer names another tag.
4. Run `git -C lawman diff --stat <law_commit>..<target> -- law departments skills harnesses`.
5. Show the contract versions at both commits, reading `contract_version` in `law/constitution.md` and the `Contract version` line in `law/departments.md` with `git -C lawman show <commit>:<path>`.
6. Ask the developer to confirm the target, and stop unless they confirm it.

## Step 2. Check the installation

1. Run `git -C lawman status --porcelain`, and stop if it prints any line so the developer can commit or move the changes.
2. Run `shasum -a 256 bin/journal`, and stop if its first field differs from `journal_sha256`, because the binary changed outside this assembly.

## Step 3. Move to the target

1. Run `git -C lawman checkout <target>`, and stop if it fails.
2. Run the "Install the journal" step of `references/install.md` again, which reads the tag now checked out, and stop if any of its checks fails.
3. Read the schema versions that the new `lawman/skills/*/SKILL.md` files name, and set the highest as `N`.
4. Run `bin/journal probe --schema <N>`, and stop if it fails, because exit 6 means this binary does not support schema `N`.

## Step 4. Check the precincts

1. Run `bin/journal precinct list`, then `git -C precincts/<name> fetch origin` for each precinct, and stop if a fetch fails.
2. Run `git -C precincts/<name> show origin/HEAD:LAWMAN.md | bin/journal lint-page constitution` for each precinct.
3. When the file's `contract_version` is lower than the new contract version `<n>`, draft an amendment.
4. Draft the amendment from the precinct's current `LAWMAN.md`. It never redrafts a section from the files alone. Follow these items in order.
   1. Run `git -C precincts/<name> switch -c lawman/constitution-v<n> origin/HEAD`, and stop if it fails.
   2. Run `git -C lawman diff <old law_commit>..<target> -- law/constitution.md` to see what the new contract version requires.
   3. Carry every section of `LAWMAN.md` over as it is, and change only what that diff requires. Set `contract_version` to `<n>`.
   4. For each section that the new contract added or changed, ask the walk question of the "Walk the sections" section in `references/precinct.md`.
   5. Run `git -C lawman diff --name-status <old law_commit>..<target> -- departments` to find the shared departments added since the old law commit.
   6. For those departments only, ask the judging-document question of the "Departments" section in `references/precinct.md`, and write the lines it describes.
   7. Run the sections "Lint and approval" and "Commit and open the pull request" of the add path, with the branch `lawman/constitution-v<n>` in place of `lawman/constitution`. Use `Amend the Lawman constitution to version <n>` as the commit message and the pull request title.
5. Tell the developer that the precinct's ticks end with `skipped-contract-version` until the amendment merges.
6. When lint fails for another reason, show the reasons. The precinct's ticks then end with `skipped-bad-constitution`.

## Step 5. Measure and record

1. Set `law_commit` to `git -C lawman rev-parse HEAD`, `release_tag` to `<target>` and `journal_sha256` to the sum that the "Install the journal" step recorded, and keep the other keys.
2. Write `config.yaml`, and read it back.
3. Run the "Measure the scheduled session" step of `references/install.md` once, which records `trusted_login` and carries the TypeSafe items, so there is no second TypeSafe question.
4. Write the `trusted_login` and `typesafe` values that the measuring step recorded to `config.yaml`. Also write `typesafe_precincts: none` when the key is missing. Read it back.
5. When `typesafe` is `yes`, ask the TypeSafe question of the "Add the precinct" section in `references/precinct.md` for each precinct from `bin/journal precinct list` that has no pair in `typesafe_precincts`. Ask one precinct at a time, and write each answer as that section says.
6. When the court job exists and the skill listing shows `typesafe-ai`, show the add-skill command the page gives, with the job id and `typesafe-ai`. Run it after a yes.
7. Tell the developer the new tag and the changes from step 1.
8. If a folder under `lawman/skills/` other than `assembly` has no job `[lawman] <role>` in the scheduler's list, tell the developer to run the assembly again, which enters the roles mode.
9. To change the schedule, models or gates, run the assembly and choose the menu job.

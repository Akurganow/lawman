# Update

Use this reference when `config.yaml` no longer matches the law clone. Update moves the installation to one release tag. It pauses the ticks while it works. A failure after the backup restores the installation.

## Step 1. Choose the target and show the change

1. Note the current `law_commit`, `release_tag` and `journal_sha256` from `config.yaml`, because the rollback needs them.
2. Run `git -C lawman fetch --tags`, and stop if it fails.
3. Set the target to the latest tag from `git -C lawman tag --sort=-v:refname | head -n 1`, unless the developer names another tag.
4. Run `git -C lawman diff --stat <law_commit>..<target> -- law departments skills harnesses`.
5. Show the contract versions at both commits, reading `contract_version` in `law/constitution.md` and the `Contract version` line in `law/departments.md` with `git -C lawman show <commit>:<path>`.
6. Ask the developer to confirm the target, and stop unless they confirm it.

## Step 2. Check the installation

1. Run `git -C lawman status --porcelain`, and stop if it prints any line so the developer can commit or move the changes.
2. Run `shasum -a 256 bin/journal`, and stop if its first field differs from `journal_sha256`, because the binary changed outside this assembly.

## Step 3. Pause the ticks

1. Run `bin/journal pause set`, and stop if it reports an open pause, showing the message without clearing that pause.
2. Pause every scheduler job whose name equals a folder under `lawman/skills/`, with the pause command the harness page gives. Take the job names from the list command the page gives.
3. Run `bin/journal status`, and repeat it until no line contains `running since`, checking at most ten times, one minute apart.
4. Stop if a tick still runs, and tell the developer which role runs.

## Step 4. Back up

1. Set `<stamp>` to the current UTC time as `YYYYMMDDTHHMMSSZ`, and run `mkdir -p backups/<stamp>`.
2. Run `cp -p journal.sqlite* backups/<stamp>/`, and stop if it fails.
3. Run `cp -p bin/journal backups/<stamp>/journal`, and stop if it fails.

## Step 5. Move to the target

1. Run `git -C lawman checkout <target>`, and stop if it fails.
2. Run install step 5 again, which reads the tag now checked out, and stop if any of its checks fails.
3. Read the schema version that the new `lawman/skills/*/SKILL.md` files name, and set it as `N`.
4. Run `bin/journal probe --schema <N>`, and stop if it fails, because exit 6 means this binary does not support schema `N`.

## Step 6. Check the precincts

1. Run `bin/journal precinct list`, then `git -C precincts/<name> fetch origin` for each precinct, and stop if a fetch fails.
2. Run `git -C precincts/<name> show origin/HEAD:LAWMAN.md | bin/journal lint-page constitution` for each precinct.
3. When the file's `contract_version` is lower than the new contract version `<n>`, draft an amendment.
4. Draft the amendment with steps 6 to 25 of the add path in `references/precinct.md`, on the branch `lawman/constitution-v<n>`, and never merge its pull request.
5. Tell the developer that the precinct's ticks end with `skipped-contract-version` until the amendment merges.
6. When lint fails for another reason, show the reasons; the precinct's ticks end with `skipped-bad-constitution`, which is not a reason to roll back.

## Step 7. Measure and record

1. Run install step 6 again, which records `trusted_login`.
2. Set `law_commit` to `git -C lawman rev-parse HEAD`, `release_tag` to `<target>` and `journal_sha256` to the sum from install step 5, item 14, and keep the other keys.
3. Write `config.yaml`, and read it back.
4. Resume every scheduler job whose name equals a folder under `lawman/skills/`, with the resume command the harness page gives. Take the job names from the list command the page gives.
5. Run `bin/journal pause clear`.
6. Tell the developer the new tag and the changes from step 1.
7. If a folder under `lawman/skills/` other than `assembly` has no job in the scheduler's list, tell the developer to run the assembly again, which enters the roles mode.

## Failure

Before the backup, which is steps 1 to 3, resume every scheduler job whose name equals a folder under `lawman/skills/`, and run `bin/journal pause clear` only when step 3.1 set the pause. Then tell the developer what failed, and stop.

After the backup, which is steps 4 to 7: roll back.

1. Move any `journal.sqlite-wal` or `journal.sqlite-shm` that the backup lacks into `backups/<stamp>/`.
2. Run `cp -p backups/<stamp>/journal.sqlite* .`.
3. Run `cp -p backups/<stamp>/journal bin/journal`.
4. Run `git -C lawman checkout <old release_tag>`, using the value noted in step 1.
5. When step 7.3 wrote `config.yaml`, write back the old `law_commit`, `release_tag` and `journal_sha256`.
6. Resume every scheduler job whose name equals a folder under `lawman/skills/`, with the resume command the harness page gives.
7. Run `bin/journal pause clear`.
8. Tell the developer which step failed, what the cause was, and that the installation runs the old tag.

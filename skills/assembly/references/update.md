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
2. Run install step 5 again, which reads the tag now checked out, and stop if any of its checks fails.
3. Read the schema versions that the new `lawman/skills/*/SKILL.md` files name, and set the highest as `N`.
4. Run `bin/journal probe --schema <N>`, and stop if it fails, because exit 6 means this binary does not support schema `N`.

## Step 4. Check the precincts

1. Run `bin/journal precinct list`, then `git -C precincts/<name> fetch origin` for each precinct, and stop if a fetch fails.
2. Run `git -C precincts/<name> show origin/HEAD:LAWMAN.md | bin/journal lint-page constitution` for each precinct.
3. When the file's `contract_version` is lower than the new contract version `<n>`, draft an amendment.
4. Draft the amendment with steps 6 to 25 of the add path in `references/precinct.md`, on the branch `lawman/constitution-v<n>`, and never merge its pull request.
5. Tell the developer that the precinct's ticks end with `skipped-contract-version` until the amendment merges.
6. When lint fails for another reason, show the reasons. The precinct's ticks then end with `skipped-bad-constitution`.

## Step 5. Measure and record

1. Run install step 6 again, which records `trusted_login`.
2. Set `law_commit` to `git -C lawman rev-parse HEAD`, `release_tag` to `<target>` and `journal_sha256` to the sum from install step 5, item 14, and keep the other keys.
3. Write `config.yaml`, and read it back.
4. Tell the developer the new tag and the changes from step 1.
5. If a folder under `lawman/skills/` other than `assembly` has no job `[lawman] <role>` in the scheduler's list, tell the developer to run the assembly again, which enters the roles mode.

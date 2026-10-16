---
name: clerk
description: Runs one tick of a Lawman clerk, which takes one order on a court ruling, proposes its precedent as a pull request, then exits.
---

# Clerk

One tick takes one order on an issue that holds a court ruling. It reads the ruling's Precedent section, proposes a valid entry as a pull request, leaves a comment, and exits.

The clerk reads and writes comments. It writes one branch and one pull request through a worktree that it removes at the end.

## Limits

- Never run code from the precinct.
- Never merge a pull request, and never push the main branch.
- An empty tick is a success. Silence is the default.

The law in `lawman/law/LAW.md` and the tick steps in `lawman/law/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `worktree add`, `worktree remove`, `worktree prune` and `status --porcelain`.
- In the tree `runs/<tick id>/tree`, run only `add LAWMAN.md`, `commit` and the one `push` of step 9.
- Never check out, reset, clean, branch, tag, merge, stash or push another ref.
- Read a precinct file only through `git -C precincts/<p> show <tip>:<path>`, after the mode check.

## Tick

Run steps 0 to 11 in order. Every started tick ends exactly once, at step 11. Items 3 to 5 of step 0 end the tick when they fail. Read `lawman/law/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards and housekeeping

1. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal probe --schema 2
   ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role clerk
   ```
3. Read `law_commit` and `trusted_login` from `config.yaml`. Each is one `key: value` line. A missing file or key ends the tick with `failed`.
   ```
   grep -E '^(law_commit|trusted_login):' config.yaml
   ```
4. Check the law clone. A `HEAD` that differs from `law_commit`, or a failed command, ends the tick with `stopped-law-drift`. Any status output, or a failed command, ends it with `stopped-dirty-law`.
   ```
   git -C lawman rev-parse HEAD
   git -C lawman status --porcelain
   ```
5. Check the identity. A failed command ends the tick with `stopped-gh-auth`. A login that differs from `trusted_login`, ignoring ASCII case, ends it with `stopped-identity-changed`.
   ```
   gh api user --jq .login
   ```
6. Read `lawman/law/tick.md`. Then run its "Alarms before work" section.
7. Run the "Housekeeping" section.

### Step 1: take an order

Run the "Take an order" section with `--role clerk`.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the tip, and `<ref>` is the tip.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: read the stage

Run the "Read the stage" section.

The order is stale unless `need` is `clerk`. `state` may be `OPEN` or `CLOSED`, and both are valid. A stale order ends the tick with `silent` and the report `Order stale: <the line>`.

### Step 5: read the constitution

Run the "Check the constitution" section. No other file of the precinct is read in this tick.

### Step 6: read the ruling

```
gh issue view <n> -R <owner/repo> --json comments
```

A failed command gives `stopped-issue-read`.

The ruling is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=court` and stage `conviction` or `acquittal`. No such comment ends the tick with `failed`. Its comment id is the digits after `#issuecomment-` in its URL.

### Step 7: create the tree

```
git -C precincts/<p> worktree add --detach ../../runs/<tick id>/tree <tip>
```

The path is relative to the clone, so `../../` leads back to the installation. A failure ends the tick with `failed`.

### Step 8: read the precedent

The journal reads the Precedent section of the ruling. On an entry, it adds the numbered line to `LAWMAN.md` in the tree. The clerk never retypes the ruling text. Pipe the ruling comment straight into the journal. The `--source` URL is the ruling comment's URL.

```
bash -o pipefail -c 'gh api repos/<owner/repo>/issues/comments/<comment id> --jq .body | bin/journal precedent --page runs/<tick id>/tree/LAWMAN.md --source https://github.com/<owner/repo>/issues/<n>#issuecomment-<comment id>'
```

The output is one line. A non-zero exit ends the tick with `failed`. Otherwise:

- `entry<TAB><number>`: the line is in the tree. Keep the number. Go to step 9.
- `none`: go to step 10.
- `no-entry<TAB><reason>`: go to step 10. Blockers names the reason.

### Step 9: open the pull request

Run this step only for `entry`. The branch is `lawman/precedent-<n>-<number>`, built from the issue number and the entry number.

1. Stage and commit the page. A failed command ends the tick with `failed`.
   ```
   git -C runs/<tick id>/tree add LAWMAN.md
   git -C runs/<tick id>/tree commit -m "Add precedent <number>"
   ```
2. Push the branch. A refusal ends the tick with `failed`. Blockers holds the git error line.
   ```
   git -C runs/<tick id>/tree push origin HEAD:refs/heads/<branch>
   ```
3. Open the pull request. The output is its URL. Keep it. A 403 or 429 reply gives `stopped-rate-limit`. Any other failure gives `failed`. Neither retries. There is no read-back of the pull request. The `<ruling comment URL>` is the `--source` URL of step 8.
   ```
   gh pr create -R <owner/repo> --head <branch> --title "Add precedent <number>" --body "Appends precedent <number> from the court ruling <ruling comment URL>. Merge it to make the precedent binding."
   ```

### Step 10: write the comment

Write the comment on the issue, whether the issue is open or closed.

Compose the comment from the Comment format section. Write it as the "Write a comment" section says, with the heading `Clerk`.

Use the entry form after `entry`. Use the no-entry form after `none` or `no-entry`.

When the push or the pull request landed and the comment did not, the tick ends with the token of the failed step. `need` stays `clerk`. The next tick fails at the push, because the branch exists. Blockers names two remedies. One deletes the remote branch, which closes its pull request. The other writes a comment whose last line is the `entry` marker, by hand. The clerk runs no `ls-remote` and no other probe of the branch.

### Step 11: end the tick

The outcome is `recorded` after an opened pull request and a read-back `entry` comment. It is `silent` after a read-back `no-entry` comment. Otherwise it is the token that the step ending the tick names.

Run the "End the tick" section. The silence token is `[SILENT]`.

## Comment format

Write the comment in this order:

````
Clerk

<sentence>

<marker>
````

The sentence is one of these two, with its values filled in:

- Entry: `Precedent <number> is proposed in <pull request URL>. It takes effect when the owner merges it.`
- No entry, from `none` or `no-entry`: `No precedent entry.`

The marker is the last line of the comment. Nothing follows it:

- Entry: `<!-- lawman: role=clerk stage=entry at=<UTC> -->`
- No entry: `<!-- lawman: role=clerk stage=no-entry at=<UTC> -->`

`at` is the UTC time of writing, from `date -u +%Y-%m-%dT%H:%M:%SZ`.

A realistic entry comment:

````
Clerk

Precedent 3 is proposed in https://github.com/example/widgets/pull/31. It takes effect when the owner merges it.

<!-- lawman: role=clerk stage=entry at=2026-10-16T10:45:00Z -->
````

A realistic no-entry comment:

````
Clerk

No precedent entry.

<!-- lawman: role=clerk stage=no-entry at=2026-10-16T11:00:00Z -->
````

Rules:

- The no-entry reason goes to Blockers, never to the comment.
- Write no home path, no installation path, no token and no login.

## Report

Three lines:

```
Coverage: <tip>, issue #<n>.
Written: <comment URL>, plus <pull request URL> for an entry, or none.
Blockers: <tool, source or tracker errors, the stop token, the no-entry reason, any facts about evidence, the state of the clone>.
```

When the order is empty or stale, the report is the one line of step 1 or step 4.

## Never

- A repository URL in the pull request body, the comment or the precedent line does not count as an account name. The constitution's title already names `<owner>/<repo>`.
- Never merge a pull request, run `gh pr merge`, or push the main branch.

# Clerk recipes

Read this file at step 6 of the clerk skill. Run only the recipe that step names.

`<n>`, `<pull>`, `<sources>`, `<branch>` and `<state>` are the values of the `case` line, with `<state>` in lower case. `<s>` is one number of `<sources>`. Every `gh` command takes `-R <owner/repo>`.

A failed command ends the tick with `failed`. A 403 or 429 reply to a write gives `stopped-rate-limit`. A read-back that differs from what was sent gives `stopped-readback`. After any stop, make no more writes.

A recipe writes in this order: the actions, the read-back of each, then the markers. A tick that fails before the markers repeats the job.

## Shared steps

### Marker comment

Write a comment on the issue `<s>`. Compose it from the "Comment format" section of the skill, with the heading `Clerk`. Write it as the "Write a comment" section of `tick.md` says. Use `gh issue comment <s>`.

### Source state

```
gh issue view <s> -R <owner/repo> --json state --jq .state
```

The output is `OPEN` or `CLOSED`. A failed command gives `stopped-issue-read`.

### Close a source

Close the issue `<s>` as the "Close the issue" section of `tick.md` says, with the class that the recipe names. Read the state back. The output must be `CLOSED`.

### Reopen a source

Reopen the issue `<s>` as the end of the "Close the issue" section says. Read the state back. The output must be `OPEN`.

### Pull request state

```
gh pr view <pull> -R <owner/repo> --json state,isDraft,mergeCommit
```

A failed command gives `stopped-issue-read`.

### Make the pull request a draft

Run this only when `isDraft` is `false`. Read the draft flag back. The output must be `true`.

```
gh pr ready <pull> -R <owner/repo> --undo
gh pr view <pull> -R <owner/repo> --json isDraft --jq .isDraft
```

### Hand-off comment

The journal builds the whole comment and lints it. Do not retype it. Skip step 1 of the "Write a comment" section. `<m>` is the pull request that gets the comment.

```
bash -o pipefail -c 'bin/journal handoff --sources <sources> [--merged <pull>] < /dev/null | gh pr comment <m> -R <owner/repo> --body-file -'
```

The output is the comment URL. Read it back as step 3 of the "Write a comment" section says. The author must equal `<login>`. The last line must start with `<!-- lawman: role=clerk stage=handoff at=`.

### Read the ruling

```
gh issue view <n> -R <owner/repo> --json comments
```

A failed command gives `stopped-issue-read`. The ruling is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=court` and stage `conviction` or `acquittal`. Its comment id is the digits after `#issuecomment-` in its URL. Its URL is `https://github.com/<owner/repo>/issues/<n>#issuecomment-<comment id>`.

### Create the tree

```
git -C precincts/<p> worktree add --detach ../../runs/<tick id>/tree <tip>
```

The path is relative to the clone, so `../../` leads back to the installation. A failure ends the tick with `failed`.

### Add the precedent line

The journal reads the Precedent section of the ruling. On an entry, it adds the numbered line to `LAWMAN.md` in the tree. The clerk never retypes the ruling text. Pipe the ruling comment straight into the journal. The `--source` URL is the ruling URL.

```
bash -o pipefail -c 'gh api repos/<owner/repo>/issues/comments/<comment id> --jq .body | bin/journal precedent --page runs/<tick id>/tree/LAWMAN.md --source <ruling URL>'
```

The output is one line. A non-zero exit ends the tick with `failed`. Otherwise:

- `entry<TAB><number>`: the line is in the tree. Keep the number.
- `none`: no line was added.
- `no-entry<TAB><reason>`: no line was added. Blockers names the reason.

## kept

Run it when the decider check said `no`, or when `action` is `kept`.

1. Write the marker `kept` with `pull=<pull>` and `issue=<state>` on the issue `<n>`.

## close-pull

1. Read the pull request state. When `state` is not `OPEN`, end the tick with `silent` and the report `Order stale: pull request #<pull> is <state>`.
2. Close the pull request.
   ```
   gh pr close <pull> -R <owner/repo>
   ```
3. Read the state back. The output must be `CLOSED`.
   ```
   gh pr view <pull> -R <owner/repo> --json state --jq .state
   ```
4. Write the marker `shut` with `pull=<pull>` and `issue=closed` on every `<s>`. Use the sentence for close-pull.

## settle

1. Read the pull request state.
2. `OPEN`: the cache is stale. End the tick with `silent` and the report `Order stale: pull request #<pull> is open`.
3. `MERGED`:
   1. Take the merge commit, `mergeCommit.oid`. It must match `^[0-9a-f]{40}$`.
   2. For every `<s>`, read its state. When it is `OPEN`, close it with the class `gone at <merge commit>`, as completed.
   3. Write the marker `settled` with `pull=<pull>` and `issue=closed` on every `<s>`.
   4. The outcome is `settled`.
4. `CLOSED`:
   1. For every `<s>`, read its state. When it is `OPEN`, close it with the class `declined by the owner`, as not planned.
   2. Write the marker `shut` with `pull=<pull>` and `issue=closed` on every `<s>`. Use the sentence for settle.
   3. The outcome is `shut`.

## reopen

1. Read the pull request state.
2. `MERGED`: run the **open** recipe with the `branch` of the line. Nothing else here runs.
3. `CLOSED`: reopen the pull request. Read the state back. The output must be `OPEN`. Then make it a draft, when `isDraft` is `false`.
   ```
   gh pr reopen <pull> -R <owner/repo>
   gh pr view <pull> -R <owner/repo> --json state --jq .state
   ```
4. `OPEN`: change nothing on the pull request.

A reopen that fails because the head branch is gone ends the tick with `failed`. Blockers names two remedies: restore the branch, or close the issue as not planned.

5. For every `<s>`, read its state. When it is `CLOSED`, reopen it.
6. Write the marker `handed` with `pull=<pull>` and `issue=open` on every `<s>`.

## reopen-issue

1. For every `<s>`, read its state. When it is `CLOSED`, reopen it.
2. Write the marker `handed` with `pull=<pull>` and `issue=open` on every `<s>`.

## open

The fixed body is:

````
Closes #<n>

Draft opened by the clerk to carry out the court ruling.
Ruling: <ruling URL>
````

Leave out the last line when there is no ruling. The title is `Execute #<n>`.

1. The `branch` must match `^lawman/execute-<n>-[1-9][0-9]*$`. `<k>` is the digits after the last hyphen.
2. Read the ruling. A ruling whose stage is not `conviction` counts as none.
   The first skeleton carries the precedent line. It is the skeleton with `<k>` equal to 1, when a conviction exists. For it, run the "Check the constitution" section.
3. Create the tree.
4. First skeleton only: add the precedent line. On `entry`, stage and commit the page. Then go to step 6.
   ```
   git -C runs/<tick id>/tree add LAWMAN.md
   git -C runs/<tick id>/tree commit -m "Add precedent <number>"
   ```
5. Otherwise commit with no change.
   ```
   git -C runs/<tick id>/tree commit --allow-empty -m "Open execution of #<n>"
   ```
6. Push the branch. A refusal ends the tick with `failed`. Blockers holds the git error line.
   ```
   git -C runs/<tick id>/tree push origin HEAD:refs/heads/<branch>
   ```
7. Open the draft pull request with the fixed body on stdin. The output is its URL. Check it against the class check. Keep the pull request number `<m>`. There is no read-back of the pull request.
   ```
   gh pr create -R <owner/repo> --draft --head <branch> --title "Execute #<n>" --body-file - <<'<delimiter>'
   <fixed body>
   <delimiter>
   ```
8. Write the hand-off comment on `<m>` with `--sources <n>`. When `pull` of the line is not `-`, that pull request was merged. Add `--merged <pull>`.
9. Write the marker `handed` with `pull=<m>` and `issue=open` on the issue `<n>`.

A push that fails because the branch exists means an earlier tick pushed it and stopped before the pull request. Blockers names the remedy: delete the remote branch.

## adopt

The fixed body is one `Closes #<s>` line for every `<s>`, a blank line, and this sentence:

````
Taken up by the clerk as a draft that counts as not started.
````

1. Read the draft flag.
   ```
   gh pr view <pull> -R <owner/repo> --json isDraft --jq .isDraft
   ```
2. Write the hand-off comment on `<pull>` from the old body, with `--sources <sources> --adopted`.
   ```
   bash -o pipefail -c 'gh pr view <pull> -R <owner/repo> --json body --jq .body | bin/journal handoff --sources <sources> --adopted | gh pr comment <pull> -R <owner/repo> --body-file -'
   ```
3. Replace the body with the fixed body on stdin.
   ```
   gh pr edit <pull> -R <owner/repo> --body-file - <<'<delimiter>'
   <fixed body>
   <delimiter>
   ```
4. Read the body back. It must equal the fixed body, ignoring line endings and trailing blank lines.
   ```
   gh pr view <pull> -R <owner/repo> --json body --jq .body
   ```
5. Make the pull request a draft.
6. For every `<s>`, read its state. Write the marker `handed` with `pull=<pull>` and `issue=<that state>` on it.

## precedent

1. Run the "Check the constitution" section. No other file of the precinct is read in this tick.
2. Read the ruling. It must be an acquittal. Otherwise the tick ends with `failed`.
3. Create the tree. Add the precedent line.
4. On `entry`, the branch is `lawman/precedent-<n>-<number>`. Stage and commit the page. Otherwise go to step 7.
   ```
   git -C runs/<tick id>/tree add LAWMAN.md
   git -C runs/<tick id>/tree commit -m "Add precedent <number>"
   ```
5. Push the branch. A refusal ends the tick with `failed`. Blockers holds the git error line.
   ```
   git -C runs/<tick id>/tree push origin HEAD:refs/heads/<branch>
   ```
6. Open the pull request. The output is its URL. Keep it. There is no read-back of the pull request.
   ```
   gh pr create -R <owner/repo> --head <branch> --title "Add precedent <number>" --body "Appends precedent <number> from the court ruling <ruling URL>. Merge it to make the precedent binding."
   ```
7. Write the comment on the issue `<n>`, whether it is open or closed. Use the entry form after `entry` and the no-entry form after `none` or `no-entry`.

When the push or the pull request landed and the comment did not, the tick ends with the token of the failed step. `need` stays `clerk`. The next tick fails at the push, because the branch exists. Blockers names two remedies. One deletes the remote branch, which closes its pull request. The other writes a comment whose last line is the `entry` marker, by hand.

# Clerk recipes

Read this file at step 6 of the clerk skill. Run only the recipe that step names.

`<n>`, `<pull>`, `<sources>`, `<branch>` and `<state>` are the values of the `case` line, with `<state>` in lower case. `<s>` is one number of `<sources>`. Every host action acts on `<owner/repo>`.

A failed command ends the tick with `failed`. A 403 or 429 reply to a write gives `stopped-rate-limit`. A read-back that differs from what was sent gives `stopped-readback`. After any stop, make no more writes.

A recipe writes in this order: the actions, the read-back of each, then the markers. A tick that fails before the markers repeats the job.

## Shared steps

### Marker comment

Write a comment on the issue `<s>`. Compose it from the "Comment format" section of the skill, with the heading `Clerk`. Write it as the "Write a comment" section of `tick.md` says.

### Source state

Read the state of the issue `<s>` from the host. The result is `OPEN` or `CLOSED`. A failed read gives `stopped-issue-read`.

### Close a source

Close the issue `<s>` as the "Close the issue" section of `tick.md` says, with the class that the recipe names. Read the state back. The output must be `CLOSED`.

### Reopen a source

Reopen the issue `<s>` as the end of the "Close the issue" section says. Read the state back. The output must be `OPEN`.

### Pull request state

Read the state of the pull request `<pull>` from the host, with its draft state and its merge commit. The state is open, merged or closed. A failed read gives `stopped-issue-read`.

### Make the pull request a draft

Run this only when the pull request is not a draft. Return it to draft. Read its draft state back. It must read as a draft.

### Hand-off comment

The journal builds the whole comment and lints it. Skip step 1 of the "Write a comment" section. `<m>` is the pull request that gets the comment.

```
bin/journal handoff --sources <sources> [--merged <pull>]
```

The output is the comment. Write it unchanged as a conversation comment on pull request `<m>`. Read it back as step 3 of the "Write a comment" section says. The author must equal `<login>`. The last line must start with `<!-- lawman: role=clerk stage=handoff at=`.

### Read the ruling

Read the comments of the issue `<n>` from the host. A failed read gives `stopped-issue-read`. The ruling is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=court` and stage `conviction` or `acquittal`. Keep its id and its URL as the host returned them.

### Create the tree

Add the tree `runs/<tick id>/tree` to the clone `precincts/<p>`, at `<tip>` and on no branch. A failure ends the tick with `failed`.

### Add the precedent line

The journal reads the Precedent section of the ruling. On an entry, it adds the numbered line to `LAWMAN.md` in the tree. Read the body of the ruling comment from the host by its id. Send it to the journal on standard input, through the quoted heredoc of Working rules, exactly as the host returned it. The `--source` URL is the ruling URL.

```
bin/journal precedent --page runs/<tick id>/tree/LAWMAN.md --source <ruling URL> <<'<delimiter>'
<ruling body>
<delimiter>
```

The output is one line. A non-zero exit ends the tick with `failed`. Otherwise:

- `entry<TAB><number>`: the line is in the tree. Keep the number.
- `none`: no line was added.
- `no-entry<TAB><reason>`: no line was added. Blockers names the reason.

## kept

Run it when the decider check said `no`, or when `action` is `kept`.

1. Write the marker `kept` with `pull=<pull>` and `issue=<state>` on the issue `<n>`.

## close-pull

1. Read the pull request state. When the state is not open, end the tick with `silent` and the report `Order stale: pull request #<pull> is <state>`.
2. Close the pull request on the host.
3. Read the state back. It must read `CLOSED`.
4. Write the marker `shut` with `pull=<pull>` and `issue=closed` on every `<s>`. Use the sentence for close-pull.

## settle

1. Read the pull request state.
2. `OPEN`: the cache is stale. End the tick with `silent` and the report `Order stale: pull request #<pull> is open`.
3. `MERGED`:
   1. Take the merge commit of the pull request. It must match `^[0-9a-f]{40}$`.
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
3. `CLOSED`: reopen the pull request on the host. Read the state back. It must read `OPEN`. Then make it a draft, when it is not one.
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
4. First skeleton only: add the precedent line. On `entry`, record `LAWMAN.md` in the tree as one commit with the message `Add precedent <number>`. Then go to step 6.
5. Otherwise record one commit with no change and the message `Open execution of #<n>`.
6. Publish the commit from the tree to the repository on the host, as the new branch `<branch>`. A refusal ends the tick with `failed`. Blockers holds the host's error line.
7. Open a draft pull request from `<branch>` on the host, with the title `Execute #<n>` and the fixed body. Send the body as Working rules says for multi-line text. The host's reply gives the link and the number of the pull request. Check both against the class check. Keep the number `<m>`. There is no read-back of the pull request.
8. Write the hand-off comment on `<m>` with `--sources <n>`. When `pull` of the line is not `-`, that pull request was merged. Add `--merged <pull>`.
9. Write the marker `handed` with `pull=<m>` and `issue=open` on the issue `<n>`.

A publish that fails because the branch exists means an earlier tick published it and stopped before the pull request. Blockers names the remedy: delete the remote branch.

## adopt

The fixed body is one `Closes #<s>` line for every `<s>`, a blank line, and this sentence:

````
Taken up by the clerk as a draft that counts as not started.
````

1. Read whether the pull request is a draft.
2. Write the hand-off comment on `<pull>` from the old body, with `--sources <sources> --adopted`. Read the old body from the host. Send it to the journal on standard input, through the quoted heredoc of Working rules, exactly as the host returned it. Write the journal's output unchanged as a conversation comment on `<pull>`.
   ```
   bin/journal handoff --sources <sources> --adopted <<'<delimiter>'
   <old body>
   <delimiter>
   ```
3. Replace the body with the fixed body on the host. Send it as Working rules says for multi-line text.
4. Read the body back. It must equal the fixed body, ignoring line endings and trailing blank lines.
5. Make the pull request a draft.
6. For every `<s>`, read its state. Write the marker `handed` with `pull=<pull>` and `issue=<that state>` on it.

## precedent

1. Run the "Check the constitution" section. No other file of the precinct is read in this tick.
2. Read the ruling. It must be an acquittal. Otherwise the tick ends with `failed`.
3. Create the tree. Add the precedent line.
4. On `entry`, the branch is `lawman/precedent-<n>-<number>`. Record `LAWMAN.md` in the tree as one commit with the message `Add precedent <number>`. Otherwise go to step 7.
5. Publish the commit from the tree to the repository on the host, as the new branch `<branch>`. A refusal ends the tick with `failed`. Blockers holds the host's error line.
6. Open a pull request that is not a draft from `<branch>` on the host. The title is `Add precedent <number>`. The body is `Appends precedent <number> from the court ruling <ruling URL>. Merge it to make the precedent binding.` The host's reply gives its link. Check it against the class check and keep it. There is no read-back of the pull request.
7. Write the comment on the issue `<n>`, whether it is open or closed. Use the entry form after `entry` and the no-entry form after `none` or `no-entry`.

When the publish or the pull request landed and the comment did not, the tick ends with the token of the failed step. `need` stays `clerk`. The next tick fails at the publish, because the branch exists. Blockers names two remedies. One deletes the remote branch, which closes its pull request. The other writes a comment whose last line is the `entry` marker, by hand.

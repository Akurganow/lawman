# Clerk recipes

Read this file at step 6 of the clerk skill. Run only the recipe that step names.

`<n>`, `<pull>`, `<sources>`, `<branch>` and `<state>` are the values of the `case` line, with `<state>` in lower case. `<s>` is one number of `<sources>`. Every host action acts on `<owner/repo>`.

A failed command ends the tick with `failed`. A 403 or 429 reply to a write gives `stopped-rate-limit`. A read-back that differs from what was sent gives `stopped-readback`. After any stop, make no more writes.

A recipe writes in this order: the actions, the read-back of each, then the markers. A tick that fails before the markers repeats the job.

## Shared steps

### Marker comment

Write a comment on the issue `<s>`. Compose it from the "Comment format" section of the skill, with the heading `Clerk`. Write it as the `tick.md#write-a-comment` section says.

### Source state

Read the state of the issue `<s>` from the host. The result is `OPEN` or `CLOSED`. A failed read gives `stopped-issue-read`.

### Close a source

Close the issue `<s>` as the `tick.md#close-the-issue` section says, with the class that the recipe names. Read the state back. The output must be `CLOSED`.

### Reopen a source

Reopen the issue `<s>` as the end of the `tick.md#close-the-issue` section says. Read the state back. The output must be `OPEN`.

### Pull request state

Read the state of the pull request `<pull>` from the host, with its draft state, its merge commit and its link. The state is open, merged or closed. A failed read gives `stopped-issue-read`.

### Make the pull request a draft

Run this only when the pull request is not a draft. Return it to draft. Read its draft state back. It must read as a draft.

### Hand-off comment

The journal builds the whole comment. Skip step 1 of the `tick.md#write-a-comment` section. `<m>` is the pull request that gets the comment.

```
bin/journal handoff --sources <sources> [--merged <pull>]
```

The output is the comment. Write it unchanged as a conversation comment on pull request `<m>`. Read it back as step 3 of the `tick.md#write-a-comment` section says. The author must equal `<login>`. The last line must start with `<!-- lawman: role=clerk stage=handoff at=`.

### Read the ruling

The tick group prints the comments of the issue `<n>`, cleaned, each with its id. The ruling is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=court` and stage `conviction` or `acquittal`. Its URL is not in the group. Read the comments of the issue from the host and send the reply through `bin/journal clean --json`. Take the URL field of that id from the cleaned output. A failed read gives `stopped-issue-read`. Keep the URL with the id.

### Create the tree

Add the tree `runs/<tick id>/tree` to the clone `precincts/<p>`, at `<tip>` and on no branch. A failure ends the tick with `failed`.

### Write the precedent files

The journal reads the ruling from its own cache and writes the precedent files into the tree. `<ruling URL>` is the URL that the "Read the ruling" section gave.

```
bin/journal precedent <p> --issue <n> --source <ruling URL> --tree runs/<tick id>/tree
```

A non-zero exit ends the tick with `failed`. The output has one line per change:

- `entry<TAB><name>[<TAB><reason>]`: the file `<name>` is written. A reason is `name-taken`, `refine-missing` or `bad-line`.
- `cancel<TAB><name or ->[<TAB>missing]`: the file is deleted. `missing` means there was none.
- `none`: the ruling adds no precedent, and the folder does not change.
- `no-entry<TAB><reason>`: the folder does not change. The reason is `no-section`, `empty-section` or `no-change`.
- `drop<TAB><name><TAB><department or ->`: the court named a department that the precedent cannot serve, so the name counts for nothing. The file `<name>` holds it only as the department of the case. `-` stands for a name outside the department class. It is no change of its own.
- `ask<TAB><name>`: send one Jev request for the file `<name>`, as the steps below say. It is no change of its own.

A `none` or `no-entry` line means no folder change to record. Blockers names every reason of the output, every `cancel` line with `missing` and every `drop` line. A reason never goes to the owner.

Then ask Jev once for each `ask` line, in order. `<name>` is the name that the line printed. Pass it unchanged.

1. Find where the developer keeps the TypeSafe API key. The line `typesafe_key:` of `config.yaml` says it. A task text that names the place itself overrides the line. When no place is known, or the line says `none`, record `jev none reason=no-key` in Blockers and go on with the next `ask` line.
2. Let the shell read the key from that place and hand it to the request. The key value never appears in your output, your reasoning, any command text or any file. Hand it over on standard input or through a process substitution that feeds a header. Read the section "The TypeSafe key" of the harness page for the form. When the shell cannot read the key, record `jev none reason=no-key` in Blockers and go on with the next `ask` line.
3. Run one pipeline. The journal builds the request body:
   ```
   bin/journal precedent <p> --issue <n> --tree runs/<tick id>/tree --request <name>
   ```
   Send a body that is not empty as JSON by POST to `https://api.typesafe.ai/v1/systemone`. Use the key as a bearer token. Make the HTTP status code appear on its own last line after the response body. Give the response body and the status line to the journal on standard input. When the journal printed no body, send nothing and give it empty input.
   ```
   bin/journal precedent <p> --issue <n> --tree runs/<tick id>/tree --answer <name>
   ```
4. The answer prints one line that starts with `jev`:
   - `jev model=<model> departments=<a,b|all>`: the journal added departments and wrote this list into the file.
   - `jev unchanged`: the file keeps its departments.
   - `jev none reason=<reason>`: the file keeps its departments. The reason is, for example, `no-key`, `brief`, `no-reply`, `status-<code>`, `bad-answer` or `failed`. Other reasons may appear. Record the line in Blockers.

Rules for Jev:

- Never print, echo or trace the key.
- Never run a command that prints the key to you.
- Never put the key on a command line or into a file.
- Never send the request body to any place other than the endpoint above.
- Write no file for the request body or the reply. Pipe them from the request command through the service to the answer command.
- Send a request only with a body that is not empty.
- Send each request once. Do not retry it. Set no timeout.
- A non-zero exit, or a harness timeout, is not a failed step. When the pipeline printed no line that starts with `jev`, record `jev none reason=failed` in Blockers.
- A `jev none` line and a `drop` line go to Blockers, never to a comment and never to a pull request.
- The `typesafe-ai` skill is knowledge only. The clerk works without it.
- Make no other request to the service in a tick. Only these steps use the key.

### Record the precedent files

Run it only when the output of the `precedent` call above holds no `none` and no `no-entry` line. The `jev` lines of the answers are no part of that output. They never stop the commit, and a `jev none` line is no `none` line. A `drop` line is no `none` and no `no-entry` line either. Stage the folder `.lawman/precedents` of the tree, deletions included. Record one commit with the message `Record precedents of #<n>`.

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

The journal prints the body. Leave out `--source` when there is no ruling.

```
bin/journal pull-body <p> --issue <n> [--source <ruling URL>]
```

The title is `Execute #<n>`. With a ruling, `: ` and the first words of its Disposition follow, from the ruling only, never from the issue. Cut them at a word to one short line, never inside a code span.

1. The `branch` must match `^lawman/execute-<n>-[1-9][0-9]*$`.
2. Read the ruling. A ruling whose stage is not `conviction` counts as none. Send the title to the body check with `--no-marker`. When the check refuses it, the title is `Execute #<n>` alone.
3. Create the tree.
4. Record one commit with no change and the message `Open execution of #<n>`.
5. Publish the commit from the tree to the repository on the host, as the new branch `<branch>`. A refusal ends the tick with `failed`. Blockers holds the host's error line.
6. Open a draft pull request from `<branch>` on the host, with the title of step 2 and the body. The title and the body reach the host only as data, as Working rules says. The host's reply gives the link and the number of the pull request. Check both against the class check. Keep the number `<m>`. There is no read-back of the pull request.
7. Write the hand-off comment on `<m>` with `--sources <n>`. When `pull` of the line is not `-`, that pull request was merged. Add `--merged <pull>`.
8. Write the marker `handed` with `pull=<m>` and `issue=open` on the issue `<n>`.

A publish that fails because the branch exists means an earlier tick published it and stopped before the pull request. Blockers names the remedy: delete the remote branch.

## adopt

The fixed body is one `Closes #<s>` line for every `<s>`, a blank line, and this sentence:

````
Taken up by the clerk as a draft that counts as not started.
````

1. Read whether the pull request is a draft.
2. Write the hand-off comment on `<pull>` from the old body, with `--sources <sources> --adopted`. Read the old body from the host. Send it to the journal on standard input, unread, exactly as the host returned it. Write the journal's output unchanged as a top-level comment on `<pull>`.
   ```
   bin/journal handoff --sources <sources> --adopted
   ```
3. Replace the body with the fixed body on the host. Send it as Working rules says for multi-line text.
4. Read the body back. It must equal the fixed body, ignoring line endings and trailing blank lines.
5. Make the pull request a draft.
6. For every `<s>`, read its state. Write the marker `handed` with `pull=<pull>` and `issue=<that state>` on it.

## precedent

The title is `Precedents of #<n>: ` and the names of the files the `precedent` output wrote or cancelled, separated by commas. Take them from each `entry` line and from each `cancel` line that holds a name and no `missing`. The journal holds each of these names to a fixed class, so the title needs no body check. The body is the file `runs/<tick id>/pull-body.md`, left by the write call. It holds no closing word and no fingerprint line.

1. Read the ruling. It must be a conviction or an acquittal. Otherwise the tick ends with `failed`.
2. Create the tree.
3. Write the precedent files. With a `none` or `no-entry` line in the output, go to step 7.
4. Record the precedent files.
5. Publish the commit from the tree to the repository on the host, as the new branch `<branch>`. A refusal ends the tick with `failed`. Blockers holds the host's error line.
6. Open a pull request that is not a draft from `<branch>` on the host, with that title and that body. The host's reply gives the link and the number of the pull request. Check both against the class check. Keep the number `<m>`. There is no read-back of the pull request.
7. Write the comment on the issue `<n>`, whether it is open or closed. Use the entry form with `pull=<m>` after step 6 and the no-entry form after a `none` or `no-entry` line.

When the publish or the pull request landed and the comment did not, the tick ends with the token of the failed step. `need` stays `clerk`. The next tick fails at the publish. Blockers names two remedies. One deletes the remote branch, which closes its pull request. The other writes a comment whose last line is the `entry` marker, by hand.

## decision

1. Read the pull request state. `<pull>` is the precedent pull request.
2. `OPEN`: the cache is stale. End the tick with `silent` and the report `Order stale: pull request #<pull> is open`.
3. `MERGED`: write the comment on the issue `<n>` in the final form for a merge. The outcome is `settled`.
4. `CLOSED`: run the `tick.md#check-the-decider` section for the pull request `<pull>`.
   1. `decider=yes`: write the comment in the final form for a close. The outcome is `shut`.
   2. `decider=no`: write the comment in the kept form. The outcome is `kept`.

The comment carries the pull request link that step 1 read. It is the last write of the job. The job closes no pull request and no issue.

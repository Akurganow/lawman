---
name: clerk
description: Runs one tick of a Lawman clerk, which takes one order, does the one job the journal names on that issue and its pull request (precedent, decision, open, adopt, settle, reopen, reopen-issue, close-pull or kept), then exits.
---

# Clerk

One tick takes one order on an issue and does the one job that `bin/journal case` names for it. The clerk is the only role that opens a pull request and the only role that writes the link from an issue to its pull request.

The clerk reads and writes comments, pull requests and issue states. It writes one branch through a worktree that it removes at the end.

## Limits

- Never run code from the precinct.
- Never merge a pull request, never push the main branch, and never review a pull request.
- Never add or remove a reaction, and never edit a `Spec` comment.
- One job per tick. An empty tick is a success. Silence is the default.

The law in `lawman/skills/lawman-law/references/LAW.md` and the tick steps in `lawman/skills/lawman-law/references/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- In a clone, only bring it up to date, update its record of the host's default branch, read commits and file contents, add the tree of the tick, remove it and read whether the clone holds a change.
- In the tree `runs/<tick id>/tree`, only let the journal write the folder `.lawman/precedents`, record one commit, empty or holding that folder, and publish the one branch of the open or precedent recipe.
- Never change what a clone has checked out, discard a change, create or move a branch or tag other than that one branch, merge, set changes aside or publish another ref.
- Read a precinct file only as its content at `<tip>`, taken from the clone `precincts/<p>`.
- Take only these host actions. Each acts on `<owner/repo>`. Each number comes from the order or from `case`.
  - Ask the host which account the tool in the host notes acts as.
  - Read the issues, the pull requests, the writers and the last actor as the "Sync the tracker", "Sync the pull requests" and "Check the decider" sections of `tick.md` say.
  - Read the comments of an issue, and the state of an issue.
  - Read one comment by its id, for the read-back.
  - Read the state, the merge commit, the draft state, the link and the body of a pull request, or fewer of these.
  - Open a draft pull request with the fixed title and the fixed body.
  - Open a pull request that is not a draft, with the fixed precedent title and body, for the precedent job only.
  - Replace the body of a pull request with the fixed body only.
  - Return a pull request to draft, comment on a pull request, close a pull request and reopen one.
  - Comment on an issue, close an issue with the reason of its class and reopen an issue.
- Never do these:
  - Write to the host in any way the list above does not name.
  - Add, remove or change a reaction.
  - Review a pull request, merge one, or add or remove a label.
  - Edit or delete a comment already written, the last one included.
- A write comes first, then its read-back, then the marker. The marker is the last write of a job.

### Class checks

A value that reaches a command or a comment passes its check first. A failed check gives `failed`, except where the table says otherwise.

| Value | Check |
| :-- | :-- |
| `<owner/repo>` | The order's value. The journal checked it with `check("repo")` when the precinct was added. |
| `<login>` | `trusted_login`. The journal runs `check("login")` in `sync` and `decider`. |
| Issue, pull request and source numbers | Digits as `case` prints them. In a marker they match `^[1-9][0-9]*$`. A marker with any other number counts for nothing. |
| Pull request link from the host's reply to an open, or from a read | `^https://` and ends with the pull request number. |
| Pull request number from that reply | `^[1-9][0-9]*$`. |
| Comment id | The id the host's reply gives, matching `^[1-9][0-9]*$`. |
| Merge commit | `^[0-9a-f]{40}$`. It enters comment text only. |
| Branch | The `branch` of `case`, which is built from integers. Never read the branch name from the host's pull request. |
| Reaction | The clerk reads none. The journal compares reactions with two constants. |
| Old pull request body | The host reply goes to the journal unread. Never an argument. |
| Ruling URL | The URL of the ruling comment, as the host returned it. It passes the journal's link check. |
| Comments | Stdin or a quoted heredoc only. Never an argument. |

## Tick

Run items 1 and 2 of step 0 once per session. Then run one tick for each order of the group, in turn. A tick runs from item 3 of step 0 to step 8, every step between included. The group lists at most as many orders as the role has jobs. Read it once, apart from the second read that item 2 names. Every started tick ends exactly once, at step 8. A step that fails after the start ends the tick as the "End the tick" section of `tick.md` says. Its items 1 and 2 end each tick. After a tick, go on with the next order of the group. A tick that ends `stopped-*` ends the session. Its item 3, the answer, comes once, after the last tick of the session. It puts the `ALARM` lines of every tick first. An answer with no alarm and no failure is the silence form alone.

### Step 0: the input and the order

1. Take the input. Run the role entry yourself when the turn starts with no part of a role group, whose first line starts with `lawman input`. Run it also when the input says that the entry failed, or when the entry exited non-zero with no output. When your own run exits non-zero with no output, answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal wake --role clerk
   ```
   Empty output with exit 0 means no work. Answer only the silence form that the harness page names, and stop. Input output that is not empty and whose first line does not start with `lawman input` means that the journal is older than the law. Run the section "Sync the law with an older journal" of `tick.md`, then take the input again.

   Read the role group to its last part, because the orders stand at the end. A part whose last line is not `end part <k> of <n>` was cut. Ask for the same part again. A line `self law <path> <section>` or `self harness <path> <section>` stands in place of a block. Read that file or section yourself.
   ```
   bin/journal tick input --role clerk --part <k>
   ```
   A group without an `order` line means no work. Answer only the silence form of its `Silence` section, and stop.
2. Sync the law, then check the journal schema.
   1. Sync the law as the section "Sync the law" of `lawman/skills/lawman-law/references/tick.md` says. A stop there is answered, not recorded, because no tick exists yet. After the line `synced <tag>`, the role group you hold is stale. Read every part of it again with `bin/journal tick input --role clerk --part <k>`.
   2. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
      ```
      bin/journal probe --schema 10
      ```
3. Start the tick with the oldest order that this session has not tried. The `order` lines read `order <id> <precinct> <repo> <department|-> <issue|->`, oldest first. `<p>`, `<owner/repo>` and `<n>` are the precinct, the repository and the issue of the order.
   ```
   bin/journal tick start --role clerk --order <id>
   ```
   - `order <id> untakeable` alone means that no tick started. Start with the next order the same way. With no order left, the session is over: give the answer.
   - A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   - Otherwise the tick has started, and the first part of the tick group printed. Its first line is `lawman input <form> role=clerk tick=<tick id> part 1 of <n>`. Keep the tick id. The sections of `tick.md` in the role group govern the whole tick.
   - The lines `ended <outcome>` and `report <report>` mean that the journal ended the tick. Keep its `ALARM` lines for the answer, and its report for a `failed` outcome. After a `stopped-*` outcome the session is over: give the answer. Otherwise go on with the next order.
4. Read `trusted_login` from `config.yaml`. It is one `key: value` line. A missing file or key ends the tick with `failed`.
5. Read the tick group to its last part, as item 1 says, because the `self` lines stand at the end. Keep every `ALARM` line for the answer. Do each `self` step at once, as the self steps of the intro of `tick.md` say.
   ```
   bin/journal tick input <tick id> --part <k>
   ```

### Step 1: the tip

The `revision=` line gives the fetched commit. It is the tip, and `<ref>` is the tip.

### Step 2: the issue

The tick group prints issue `<n>` with its comments. With a line `self issue <n>`, read it from the host instead, as the host notes record, with its comments, every page. A failed read gives `stopped-issue-read`.

### Step 3: the pull request

When the stage names a pull request in `pull`, the tick group prints it with its comments. With a line `self pull <m>`, read it from the host instead, as the host notes record, with its comments, every page. A failed read gives `stopped-issue-read`.

### Step 4: the stage

The `case` line is the stage, as the "Read the stage" section says. Keep `job`, `action`, `pull`, `sources`, `branch` and `state` of the line.

### Step 5: a stale order

The journal ends a stale order itself. After a self step `fetch`, `issues`, `pulls` or `stage`, the order is stale unless `need` is `clerk`. `state` may be `OPEN` or `CLOSED`, and both are valid. End a stale order with `silent` and the report `Order stale: <the line>`.

### Step 6: choose the recipe

Read `lawman/skills/clerk/references/jobs.md`. It holds every recipe named here.

1. `job=state`: run the "Check the decider" section for the issue `<n>`. With `decider=no`, run **kept**. With `decider=yes`, run the recipe that `action` names.
2. `job=reopen-issue`: run **reopen-issue**. No decider check runs: only a decider or the pull request's author, the trusted login, can reopen a pull request.
3. `job=adopt`, `settle`, `open`, `precedent` or `decision`: run the recipe of that name.

| `action` | Recipe |
| :-- | :-- |
| `close-pull` | **close-pull** |
| `reopen` | **reopen** |
| `open` | **open** |
| `kept` | **kept** |

### Step 7: do the job

Run the recipe. It ends with the marker. A recipe that ends the tick early names the token.

### Step 8: end the tick

The outcome is the token below. After a failed step it is the token that the step names.

| Recipe | Outcome |
| :-- | :-- |
| **precedent** | `recorded` after an opened pull request and a read-back `entry` comment. `silent` after a read-back `no-entry` comment. |
| **decision** | `settled` after a merge. `shut` after a close by a decider. `kept` after a close by anyone else. `silent` for an open pull request. |
| **open**, **adopt**, **reopen**, **reopen-issue** | `handed` |
| **close-pull** | `shut`. `silent` when the pull request is not open. |
| **settle** | `settled` for a merged pull request. `shut` for a closed one. `silent` for an open one. |
| **kept** | `kept` |

Run the "End the tick" section.

## Comment format

Every comment of the clerk has this order:

````
Clerk

<sentence>

<marker>
````

The marker is the last line of the comment. Nothing follows it. `at` is the UTC time of writing, as `YYYY-MM-DDTHH:MM:SSZ`.

The precedent comment is written on the issue. Its sentence and marker:

| Form | Sentence | Marker |
| :-- | :-- | :-- |
| Entry | `The precedents are proposed in <pull request URL>. They take effect when the owner merges it.` | `<!-- lawman: role=clerk stage=entry pull=<m> at=<UTC> -->` |
| No entry | `No precedent entry.` | `<!-- lawman: role=clerk stage=no-entry at=<UTC> -->` |
| Final, merged | `The owner merged <pull request URL>. The precedents are binding.` | `<!-- lawman: role=clerk stage=final pull=<m> at=<UTC> -->` |
| Final, closed | `The owner closed <pull request URL>. The precedents did not take effect.` | `<!-- lawman: role=clerk stage=final pull=<m> at=<UTC> -->` |
| Kept | `<pull request URL> was closed by someone who decides nothing here. Nothing changes.` | `<!-- lawman: role=clerk stage=kept pull=<m> at=<UTC> -->` |

The pair comment is written on a source issue. The `kept` of the pair carries `issue`, the `kept` of a precedent pull request does not. Its marker is `<!-- lawman: role=clerk stage=<stage> pull=<m> issue=<open|closed> at=<UTC> -->`. `issue` is the state in which the clerk leaves the issue.

| Stage | Sentence |
| :-- | :-- |
| `handed` | `Pull request #<m> carries this issue.` |
| `shut`, after close-pull | `Pull request #<m> is closed because its issues are closed.` |
| `shut`, after settle | `Pull request #<m> was closed, so this issue is closed as declined by the owner.` |
| `settled` | `Pull request #<m> was merged at <merge commit>, so this issue is closed as gone at <merge commit>.` |
| `kept` | `The clerk recorded this issue as <open|closed> and changed nothing.` |

A realistic entry comment:

````
Clerk

The precedents are proposed in https://git.example.com/example/widgets/pull/31. They take effect when the owner merges it.

<!-- lawman: role=clerk stage=entry pull=31 at=2026-10-16T10:45:00Z -->
````

A realistic pair comment:

````
Clerk

Pull request #31 carries this issue.

<!-- lawman: role=clerk stage=handed pull=31 issue=open at=2026-10-17T09:15:00Z -->
````

Rules:

- The reasons of the precedent output, `missing` included, go to Blockers, never to the comment.
- Write no home path, no installation path, no token and no login.

## Report

Three lines:

```
Coverage: <tip>, issue #<n>.
Written: <comment, pull request and issue URLs, or the closures and reopenings with their reasons, or none>.
Blockers: <tool, source or tracker errors, the stop token, the reasons of the precedent output, any facts about evidence, the state of the clone>.
```

When the order is stale, the report is the one line of step 5.

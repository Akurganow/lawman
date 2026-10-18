---
name: clerk
description: Runs one tick of a Lawman clerk, which takes one order, does the one job the journal names on that issue and its pull request (precedent, open, adopt, settle, reopen, reopen-issue, close-pull or kept), then exits.
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

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `worktree add`, `worktree remove` and `status --porcelain`.
- In the tree `runs/<tick id>/tree`, run only `add LAWMAN.md`, `commit`, `commit --allow-empty` and the one `push` of the open or precedent recipe.
- Never check out, reset, clean, branch, tag, merge, stash or push another ref.
- Read a precinct file only through `git -C precincts/<p> show <tip>:<path>`.
- Run only these `gh` forms. Each `-R` takes `<owner/repo>`. Each number comes from the order or from `case`.
  - `api user --jq .login`.
  - The three fixed queries of `tick.md`: the issue sync, the pull request sync and the decider check.
  - `issue view <n> --json comments`, and `issue view <n> --json state --jq .state`.
  - `api repos/<owner/repo>/issues/comments/<id> --jq <filter>`, for the ruling body and the read-back.
  - `pr view <m> --json state,mergeCommit,isDraft,body`, with `--jq` on a single field, or with fewer fields.
  - `pr create --draft`, with the fixed title and the fixed body on stdin.
  - `pr create` with the fixed precedent title and body, for the precedent job only.
  - `pr edit <m> --body-file -`, with the fixed body only.
  - `pr ready <m> --undo`, `pr comment <m> --body-file -`, `pr close <m>` and `pr reopen <m>`.
  - `issue comment <n> --body-file -`, `issue close <n> --reason <class reason>` and `issue reopen <n>`.
- Never run these:
  - `gh api` with `-X`, `--method` or `--input`.
  - `gh api` with any `-f` or `-F` other than the ones the fixed queries carry.
  - Any GraphQL text other than the fixed queries, and any mutation.
  - Any `reactions` endpoint.
  - `pr review`, `pr merge` and any `label` command.
  - `--edit-last` and `--delete-last`.
- A write comes first, then its read-back, then the marker. The marker is the last write of a job.

### Class checks

A value that reaches a command or a comment passes its check first. A failed check gives `failed`, except where the table says otherwise.

| Value | Check |
| :-- | :-- |
| `<owner/repo>` | The order's value. The journal checked it with `check("repo")` when the precinct was added. |
| `<login>` | `trusted_login`. The journal runs `check("login")` in `sync` and `decider`. |
| Issue, pull request and source numbers | Digits as `case` prints them. In a marker they match `^[1-9][0-9]*$`. A marker with any other number counts for nothing. |
| Pull request URL from `pr create` | `^https://github.com/<owner/repo>/pull/[1-9][0-9]*$`. The pull request number is its last part. |
| Comment id | The digits after `#issuecomment-`. |
| Merge commit | `^[0-9a-f]{40}$`. It enters comment text only. |
| Branch | The `branch` of `case`, which is built from integers. Never read a `headRefName`. |
| Reaction `content` | The clerk reads none. The journal compares it with two constants. |
| Ruling, old pull request body, comments | Stdin or a quoted heredoc only. Never an argument. |

## Tick

Run steps 0 to 8 in order. Every started tick ends exactly once, at step 8. Items 3 to 6 of step 0 end the tick when they fail. Read `lawman/skills/lawman-law/references/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards

1. Sync the law, then check the journal schema.
   1. Sync the law as the section "Sync the law" of `lawman/skills/lawman-law/references/tick.md` says. A stop there is answered, not recorded, because no tick exists yet.
   2. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
      ```
      bin/journal probe --schema 4
      ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role clerk
   ```
3. Read `law_commit` and `trusted_login` from `config.yaml`. Each is one `key: value` line. A missing file or key ends the tick with `failed`.
   ```
   grep -E '^(law_commit|trusted_login):' config.yaml
   ```
4. Check the law folder, reading it the way the harness page names under "Syncing the law". A commit that differs from `law_commit`, or a commit that cannot be read, ends the tick with `stopped-law-drift`. A local change in the folder, or a status that cannot be read, ends it with `stopped-dirty-law`.
5. Check the identity. A failed command ends the tick with `stopped-gh-auth`. A login that differs from `trusted_login`, ignoring ASCII case, ends it with `stopped-identity-changed`.
   ```
   gh api user --jq .login
   ```
6. Compute the alarms before any work. Never pass `--repeat`. Keep every `ALARM` line for the answer.
   ```
   bin/journal alarm
   ```

### Step 1: take an order

Take the oldest open order. The output is `id<TAB>precinct<TAB>repo<TAB>department<TAB>issue`.

```
bin/journal dispatch take --role clerk
```

Empty output with exit 0 ends the tick with `silent`. Read no file. Send the report `No order.` to `tick end`. A failed `dispatch take`: read `lawman/skills/lawman-law/references/tick.md`, then end the tick with `failed`.

```
bin/journal tick end <tick id> --outcome silent <<'LAWMAN_<tick id>_0000000'
No order.
LAWMAN_<tick id>_0000000
```

`tick end` prints nothing, and exit 0 confirms the record. A failed `tick end`: answer `journal unavailable: <stderr>` and stop. Otherwise answer as item 3 of the "End the tick" section of `lawman/skills/lawman-law/references/tick.md` says.

With an order, read `lawman/skills/lawman-law/references/tick.md` and obey it for the whole tick. An order without an issue number ends the tick with `failed`. A failed command in this step ends the tick with `failed`, as the "End the tick" section of `tick.md` says.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the tip, and `<ref>` is the tip.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: sync the pull requests

Run the "Sync the pull requests" section.

### Step 5: read the stage

Run the "Read the stage" section.

The order is stale unless `need` is `clerk`. `state` may be `OPEN` or `CLOSED`, and both are valid. A stale order ends the tick with `silent` and the report `Order stale: <the line>`.

Keep `job`, `action`, `pull`, `sources`, `branch` and `state` of the line.

### Step 6: choose the recipe

Read `lawman/skills/clerk/references/jobs.md`. It holds every recipe named here.

1. `job=state`: run the "Check the decider" section with the issue number `<n>`. With `decider=no`, run **kept**. With `decider=yes`, run the recipe that `action` names.
2. `job=reopen-issue`: run **reopen-issue**. No decider check runs: only a decider or the pull request's author, the trusted login, can reopen a pull request.
3. `job=adopt`, `settle`, `open` or `precedent`: run the recipe of that name.

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
| **open**, **adopt**, **reopen**, **reopen-issue** | `handed` |
| **close-pull** | `shut`. `silent` when the pull request is not open. |
| **settle** | `settled` for a merged pull request. `shut` for a closed one. `silent` for an open one. |
| **kept** | `kept` |

Run the "End the tick" section. The harness page names the silence form.

## Comment format

Every comment of the clerk has this order:

````
Clerk

<sentence>

<marker>
````

The marker is the last line of the comment. Nothing follows it. `at` is the UTC time of writing, from `date -u +%Y-%m-%dT%H:%M:%SZ`.

The precedent comment is written on the issue. Its sentence and marker:

| Form | Sentence | Marker |
| :-- | :-- | :-- |
| Entry | `Precedent <number> is proposed in <pull request URL>. It takes effect when the owner merges it.` | `<!-- lawman: role=clerk stage=entry at=<UTC> -->` |
| No entry | `No precedent entry.` | `<!-- lawman: role=clerk stage=no-entry at=<UTC> -->` |

The pair comment is written on a source issue. Its marker is `<!-- lawman: role=clerk stage=<stage> pull=<m> issue=<open|closed> at=<UTC> -->`. `issue` is the state in which the clerk leaves the issue.

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

Precedent 3 is proposed in https://github.com/example/widgets/pull/31. It takes effect when the owner merges it.

<!-- lawman: role=clerk stage=entry at=2026-10-16T10:45:00Z -->
````

A realistic pair comment:

````
Clerk

Pull request #31 carries this issue.

<!-- lawman: role=clerk stage=handed pull=31 issue=open at=2026-10-17T09:15:00Z -->
````

Rules:

- The no-entry reason goes to Blockers, never to the comment.
- Write no home path, no installation path, no token and no login.

## Report

Three lines:

```
Coverage: <tip>, issue #<n>.
Written: <comment, pull request and issue URLs, or the closures and reopenings with their reasons, or none>.
Blockers: <tool, source or tracker errors, the stop token, the no-entry reason, any facts about evidence, the state of the clone>.
```

When the order is empty or stale, the report is the one line of step 1 or step 5.

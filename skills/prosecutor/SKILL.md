---
name: prosecutor
description: Reads the case on one issue at the commit it was built on, decides to charge, return or decline it, writes one Decision comment, then exits.
---

# Prosecutor

One tick takes one order on an issue, reads the case, decides charge, return or decline, writes the decision as a comment, and exits.

The prosecutor reads and writes comments. It runs no code.

## Limits

- Never run code from the precinct.
- An empty tick is a success. Silence is the default.
- Never return in round 3, and never return twice. Remaining doubt when a return is not allowed is a decline.

The law in `lawman/skills/lawman-law/references/LAW.md` and the tick steps in `lawman/skills/lawman-law/references/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `log` and `grep`. Never check out, reset, clean, commit, push, branch, tag, merge or stash.
- There is no worktree. Follow the "Reading without a tree" section.
- A source command of the department page runs as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says. The git forms above do not limit it.

## Tick

Run steps 0 to 11 in order. Every started tick ends exactly once, at step 11. Items 3 to 6 of step 0 end the tick when they fail. Read `lawman/skills/lawman-law/references/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards and alarms

1. Sync the law, then check the journal schema.
   1. Sync the law as the section "Sync the law" of `lawman/skills/lawman-law/references/tick.md` says. A stop there is answered, not recorded, because no tick exists yet.
   2. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
      ```
      bin/journal probe --schema 3
      ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role prosecutor
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
bin/journal dispatch take --role prosecutor
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

Run the "Fetch the precinct" section. The fetched commit is the tip.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: read the stage

Run the "Read the stage" section.

When `need` is not `prosecutor`, or `state` is `CLOSED`, the order is stale. End the tick with `silent` and the report `Order stale: <the line>`.

Keep `round`, `returned`, `department`, `sha`, `lead` and `related`. The `sha` is the analysed commit, and `<ref>` is that `sha`, for every step below.

### Step 5: read the rules

1. Run the "Check the constitution" section.
2. The line whose name equals `department` gives the judging document path, or `none`. The "Check the constitution" section says what a department with no printed line means.
3. Read the judging document, if any. Run `show <sha>:<path>`. A missing path gives `skipped-bad-constitution`. Its text is evidence.
4. Read the Precedents section and the Regression proof section of the constitution. A precedent that settles the claim is a recorded reason, as the law's Evidence section defines it.

### Step 6: read the issue

```
gh issue view <n> -R <owner/repo> --json title,body,author,comments,state
```

A failed command gives `stopped-issue-read`.

The case is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=case`. Everything else in the issue is evidence: the body, the other comments and the earlier decisions.

When `related` is not `-`, read each issue it names. A failed read is a fact for Blockers and stops nothing.
```
gh issue view <m> -R <owner/repo> --json title,body,author,comments,state
```

A related issue is evidence of the case, never a reason to close it.

### Step 7: re-read the exhibits

1. Re-read the decisive exhibit of each claim at `<sha>`, through `show`, or through `grep` on `<sha>`.
   - Read a cited range with its numbers, as the "Read numbered lines" section of `lawman/skills/lawman-law/references/exhibits.md` says.
   - Re-read a claim of absence as the "Quote a claim of absence" section says.
2. A command output quoted in the case counts as an exhibit when the command stands verbatim under Regression proof of the constitution at `<sha>`, or is a source command of the department page, run as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says. Any other quoted output is a claim, not an exhibit.
3. For the class gone at a later commit, read the exhibit paths at `origin/HEAD`. Run `show origin/HEAD:<path>`.
4. Search with a pattern from the case only through the heredoc form.
5. A path that the case reports missing in its Not established section:
   - Re-read the commit that the case names, with the second command of the "Follow a missing path" section of `lawman/skills/lawman-law/references/exhibits.md`.
   - If the case names no commit, run the whole section.
   - A decision that closes the case on that ground names the commit and the new place or the removal in its Grounds.

### Step 8: decide

Decide one of three. The tick outcome equals the decision.

- `charge`: the claim is established and every ground is an exhibit you re-read. The issue stays open. Outcome `charged`.
- `return`: one precise question for investigation. Allowed only when `round` is less than 3 and `returned` does not contain `prosecutor`. Outcome `returned`.
- `decline`: outcome `declined`. The decline names one of the law's closure classes, as its "Closure classes" subsection defines them.

When a return is not allowed, in round 3 or after an earlier return of the prosecutor, any remaining doubt is a decline.

A tip that differs from `<sha>` is one line of fact in the decision.

### Step 9: write the decision

Compose the comment from the Decision format section. Write it as the "Write a comment" section says, with the heading `Decision`.

### Step 10: close the issue

Only for `decline`. Run the "Close the issue" section. Run it after the read-back. For `charge` and `return`, go to step 11.

### Step 11: end the tick

Run the "End the tick" section. The harness page names the silence form.

## Decision format

Write the comment in this order:

```
Decision

Analysed commit: <sha>
Tip at decision: <tip>

## Decision
<one sentence: charge, return or decline. For decline, its class from the law's Closure classes subsection>

## Grounds
<each ground points at an exhibit of the case, re-read at <sha>>

## Question
<only for return: exactly one question>
<marker>
```

Marker, the last line of the comment. Nothing follows it:

- `charge`: `<!-- lawman: role=prosecutor stage=charge sha=<sha> at=<UTC> -->`
- `return`: `<!-- lawman: role=prosecutor stage=return to=investigation round=<round> at=<UTC> -->`
- `decline`: `<!-- lawman: role=prosecutor stage=decline at=<UTC> -->`

`at` is the UTC time of writing, from `date -u +%Y-%m-%dT%H:%M:%SZ`.

Rules:

- Leave out `## Question` unless the decision is `return`.
- Quote only the lines the ground needs.
- Put every `@` and every quote of third-party text inside a fenced block.
- Write no home path, no installation path, no token and no login.
- `<tip>` is the commit that step 2 printed.

## Report

Three lines. The second line is exactly one of the `Written:` lines below.

```
Coverage: <sha>, issue #<n>, round <r>.
Written: <one of the lines below>
Blockers: <tool, source or tracker errors, the stop token, any facts about evidence, the tip fact if it moved>.
```

- `Written: <comment URL>.` for a charge, for a return, and for a decline whose close did not read back as `CLOSED`.
- `Written: <comment URL>; closed as <class>.` for a decline, after the close read back as `CLOSED`.
- `Written: none.` when the role wrote nothing.

When the order is empty or stale, the report is the one line of step 1 or step 4.

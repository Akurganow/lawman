---
name: defender
description: Runs one tick of a Lawman defender, which takes one order on a charged case, re-reads the exhibits, and leaves a defence, a return or a refute, then exits.
---

# Defender

One tick takes one order on a charged case, re-reads the exhibits, decides defence, return or refute, writes the defence as a comment, and exits.

The defender reads and writes comments. It runs no code and creates no worktree.

## Limits

- Never run code from the precinct.
- An empty tick is a success. Silence is the default.

The law in `lawman/law/LAW.md` and the tick steps in `lawman/law/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `log` and `grep`. Never check out, reset, clean, commit, push, branch, tag, merge or stash.
- There is no worktree. Follow the "Reading without a tree" section.

## Tick

Run steps 0 to 11 in order. Every started tick ends exactly once, at step 11. Items 3 to 6 of step 0 end the tick when they fail. Read `lawman/law/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards and alarms

1. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal probe --schema 3
   ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role defender
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
6. Compute the alarms before any work. Never pass `--repeat`. Keep every `ALARM` line for the answer.
   ```
   bin/journal alarm
   ```

### Step 1: take an order

Take the oldest open order. The output is `id<TAB>precinct<TAB>repo<TAB>department<TAB>issue`.

```
bin/journal dispatch take --role defender
```

Empty output with exit 0 ends the tick with `silent`. Read no file. Send the report `No order.` to `tick end`. A failed `dispatch take`: read `lawman/law/tick.md`, then end the tick with `failed`.

```
bin/journal tick end <tick id> --outcome silent <<'LAWMAN_<tick id>_0000000'
No order.
LAWMAN_<tick id>_0000000
```

`tick end` prints nothing, and exit 0 confirms the record. A failed `tick end`: answer `journal unavailable: <stderr>` and stop. Otherwise answer every `ALARM` line verbatim, or `[SILENT]` when there is none.

With an order, read `lawman/law/tick.md` and obey it for the whole tick. An order without an issue number ends the tick with `failed`. A failed command in this step ends the tick with `failed`, as the "End the tick" section of `tick.md` says.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the tip.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: read the stage

Run the "Read the stage" section.

`returned` lists the roles that already returned the case to investigation. `-` means none.

The order is stale unless `need` is `defender` and `state` is `OPEN`. A stale order ends the tick with `silent` and the report `Order stale: <the line>`.

Keep `round`, `returned`, `department`, `sha`, `lead` and `related`. The `sha` is the analysed commit, and `<ref>` is that `sha`, for every step below.

### Step 5: read the rules

1. Run the "Check the constitution" section.
2. The line whose name equals `department` gives the judging document path, or `none`. When `department` is `-`, the case has no judging document. The "Check the constitution" section says what a department with no printed line means.
3. Read the judging document, if any. Run `show <sha>:<path>`. A missing path gives `skipped-bad-constitution`. Its text is evidence.
4. Read the Precedents section and the Regression proof section of the constitution. A precedent that settles the claim is a recorded reason, as the law defines it.
5. Read the department page. `<d>` is `department` from the `case` line. Skip this item when `department` is `-`. Run the "Resolve the department page" section. Use only the Not findings section of the page. Quote none of the rest.

### Step 6: read the issue

```
gh issue view <n> -R <owner/repo> --json title,body,author,comments,state
```

A failed command gives `stopped-issue-read`.

The case is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=case`. The charge is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=prosecutor stage=charge`. A missing case or charge ends the tick with `failed`.

The lead carrier is the issue body when `lead` is `body`. When `lead` is `comment`, it is the earliest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=lead`. Keep the line under the `## Cost and risk` heading of the lead carrier when there is one. Everything else in the issue is evidence: the body, the other comments and the earlier decisions.

When `related` is not `-`, read each issue it names. A failed read is a fact for Blockers and stops nothing.
```
gh issue view <m> -R <owner/repo> --json title,body,author,comments,state
```

A related issue is evidence of the case, never a reason to close it.

### Step 7: re-read the exhibits

1. Re-read the exhibit of each ground in the charge and each claim in the case, at `<sha>`. Run `show`. Or search with `grep` on `<sha>`.
   ```
   git -C precincts/<p> show <sha>:<path>
   ```
   - Read a cited range with its numbers, as the "Read numbered lines" section of `lawman/law/exhibits.md` says.
   - Quote in Holes in the charge and The code as it is the numbers your own read printed.
   - A cited number that the range does not support makes that exhibit a claim, not an exhibit.
   - The exhibit of a claim of absence is its search and its control. Run both again on `<sha>`, as the "Quote a claim of absence" section says.
2. Read the history of each exhibit path.
   ```
   git -C precincts/<p> log --format='%h %s' <sha> -- <path>
   ```
3. Search for the callers and tests of each symbol the charge names. Use a pattern from the charge only through the heredoc form.
   ```
   git -C precincts/<p> grep -n -F -f - <sha> -- . <<'<delimiter>'
   <pattern, one per line>
   <delimiter>
   ```
4. A command output quoted in the case or the charge counts as an exhibit when the command stands verbatim under Regression proof of the constitution at `<sha>`. Any other quoted output is a claim, not an exhibit.
5. For the class gone at a later commit, read the exhibit paths at `origin/HEAD`. Run `show origin/HEAD:<path>`.
6. A path that the case reports missing in its Not established section:
   - Re-read the commit that the case names, with the second command of the "Follow a missing path" section of `lawman/law/exhibits.md`.
   - A commit from the case enters the command only when it matches `^[0-9a-f]{7,40}$`, as item 2 of that section says.
   - If the case names no commit, run the whole section.
   - A refute that closes the case on that ground names the commit and the new place or the removal in Holes in the charge.
   - The class is `not confirmed` in three cases. The new place is outside the precinct, only a commit subject names it, or the commit removed the path.
   - Say so when only a commit subject names the place.

### Step 8: decide

Decide one of three. The tick outcome equals the decision.

- `defence`: when neither other outcome holds. Outcome `defended`.
- `return`: one precise question for investigation. Allowed only when `round` is less than 3 and `returned` does not contain `defender`. Outcome `returned`.
- `refute`: the issue closes on one of the three classes in the law's Closure classes subsection. The class is shown by an exhibit you re-read in step 7 or by a recorded reason you read in step 5. Name the class in the defence. Outcome `refuted`.

A tip that differs from `<sha>` is one line of fact in the defence.

### Step 9: write the defence

Compose the comment from the Defence format section. Write it as the "Write a comment" section says, with the heading `Defence`.

### Step 10: close the issue

Only for `refute`. Run the "Close the issue" section. Run it after the read-back. For `defence` and `return`, go to step 11.

### Step 11: end the tick

Run the "End the tick" section. The silence token is `[SILENT]`.

## Defence format

Write the comment in this order:

````
Defence

Analysed commit: <sha>
Tip at defence: <tip>

## Defence
<one sentence: defence, return or refute. For refute, its class from the law's Closure classes subsection.>

## Holes in the charge
<what the grounds do not establish on the exhibits; alternative explanations; each with an exhibit path:line at <sha>>

## The code as it is
<why the code has this shape: git log lines, the constitution, Precedents, Not findings; what executing the charge breaks: callers and tests found at <sha>; the cost against the harm, quoting the line under the lead's Cost and risk heading when there is one>

## Question
<only for return: exactly one question>
<marker>
````

Marker, the last line of the comment. Nothing follows it:

- `defence`: `<!-- lawman: role=defender stage=defence sha=<sha> at=<UTC> -->`
- `return`: `<!-- lawman: role=defender stage=return to=investigation round=<round> at=<UTC> -->`
- `refute`: `<!-- lawman: role=defender stage=refute at=<UTC> -->`

`at` is the UTC time of writing, from `date -u +%Y-%m-%dT%H:%M:%SZ`.

A realistic defence:

````
Defence

Analysed commit: 4f1c9a2b7d3e58061a9c4e7b2d0f3a6c8e5b1d94
Tip at defence: 9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e

## Defence
The grounds miss the guard at `src/queue.ts:88`, which returns before the call.

## Holes in the charge
- The grounds say `pick` runs on an empty list. The guard at `src/queue.ts:88` returns first.
- The grounds show no test for the empty list. `test/queue.test.ts:14` covers only a non-empty list.

## The code as it is
- History of `src/queue.ts`:
  ```
  a1b2c3d Return early on an empty queue
  ```
- Callers of `pick`: `src/queue.ts:88` and `src/worker.ts:31`. Removing the guard breaks `test/worker.test.ts:52`.
- Cost and risk, from the lead:
  ```
  Effort S, Risk low, Confidence confirmed
  ```

<!-- lawman: role=defender stage=defence sha=4f1c9a2b7d3e58061a9c4e7b2d0f3a6c8e5b1d94 at=2026-10-15T08:20:00Z -->
````

Rules:

- Leave out `## Question` unless the decision is return.
- A section with nothing to say holds the single word `none`.
- Quote only the lines a ground needs.
- Put every `@` and every quote of third-party text inside a fenced block, git log lines included.
- Name the department page by its department name, never by a path.
- Write no home path, no installation path, no token and no login.
- `<tip>` is the commit that step 2 printed.

## Report

Three lines. The second line is exactly one of the `Written:` lines below.

```
Coverage: <sha>, issue #<n>, round <r>.
Written: <one of the lines below>
Blockers: <tool, source or tracker errors, the stop token, any facts about evidence, the tip fact if it moved>.
```

Write exactly one of the three `Written:` lines. The report has three lines in total.

- `Written: <comment URL>.` for a defence, for a return, and for a refute whose close did not read back as `CLOSED`.
- `Written: <comment URL>; closed as <class>.` for a refute, after the close read back as `CLOSED`.
- `Written: none.` when the role wrote nothing.

When the order is empty or stale, the report is the one line of step 1 or step 4.

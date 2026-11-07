---
name: defender
description: Runs one tick of a Lawman defender, which takes one order on a charged case, re-reads the exhibits, and leaves a defence, a return or a refute, then exits.
---

# Defender

One tick takes one order on a charged case, re-reads the exhibits, decides defence, return or refute, writes the defence as a comment, and exits.

The defender reads and writes comments. It runs no code of the precinct and creates no worktree. It may ask an expert, as the "Ask an expert" section of `lawman/skills/lawman-law/references/exhibits.md` says.

## Limits

- Never run code from the precinct.
- An empty tick is a success. Silence is the default.

The law in `lawman/skills/lawman-law/references/LAW.md` and the tick steps in `lawman/skills/lawman-law/references/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- A clone changes only by bringing it up to date, as the `tick.md#fetch-the-precinct` section says. Never change its working files, branches, tags or history, and never publish from it.
- There is no worktree. Follow the `tick.md#reading-without-a-tree` section.
- A source command of the department page that passes its check runs as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says. The read-only rule above does not limit it.

## Tick

Run items 1 and 2 of step 0 once per session. Then run one tick for each order of the group, in turn. A tick runs from item 3 of step 0 to step 7, every step between included. The group lists at most as many orders as the role has jobs. Read it once, apart from the second read that item 2 names. Every started tick ends exactly once, at step 7. A step that fails after the start ends the tick as the `tick.md#end-the-tick` section of `tick.md` says. Its items 1 and 2 end each tick. After a tick, go on with the next order of the group. A tick that ends `stopped-*` ends the session. Its item 3, the answer, comes once, after the last tick of the session. It puts the `ALARM` lines of every tick first. An answer with no alarm and no failure is the silence form alone.

### Step 0: the input and the order

1. Take the input. Run the role entry yourself when the turn starts with no part of a role group, whose first line starts with `lawman input`. Run it also when the input says that the entry failed, or when the entry exited non-zero with no output. When your own run exits non-zero with no output, answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal wake --role defender
   ```
   Empty output with exit 0 means no work. Answer only the silence form that the harness page names, and stop. Input output that is not empty and whose first line does not start with `lawman input` means that the journal is older than the law. Run the section `tick.md#sync-the-law-with-an-older-journal` of `tick.md`, then take the input again.

   Read the role group to its last part, because the orders stand at the end. A part whose last line is not `end part <k> of <n>` was cut. Ask for the same part again. A line `self law <path> <section>` or `self harness <path> <section>` stands in place of a block. Read that file or section yourself.
   ```
   bin/journal tick input --role defender --part <k>
   ```
   A group without an `order` line means no work. Answer only the silence form of its `Silence` section, and stop.
2. Sync the law, then check the journal schema.
   1. Sync the law as the section `tick.md#sync-the-law` of `lawman/skills/lawman-law/references/tick.md` says. A stop there is answered, not recorded, because no tick exists yet. After the line `synced <tag>`, the role group you hold is stale. Read every part of it again with `bin/journal tick input --role defender --part <k>`.
   2. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
      ```
      bin/journal probe --schema 10
      ```
3. Start the tick with the oldest order that this session has not tried. The `order` lines read `order <id> <precinct> <repo> <department|-> <issue|->`, oldest first. `<p>`, `<owner/repo>` and `<n>` are the precinct, the repository and the issue of the order.
   ```
   bin/journal tick start --role defender --order <id>
   ```
   - `order <id> untakeable` alone means that no tick started. Start with the next order the same way. With no order left, the session is over: give the answer.
   - A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   - Otherwise the tick has started, and the first part of the tick group printed. Its first line is `lawman input <form> role=defender tick=<tick id> part 1 of <n>`. Keep the tick id. The sections of `tick.md` in the role group govern the whole tick.
   - The lines `ended <outcome>` and `report <report>` mean that the journal ended the tick. Keep its `ALARM` lines for the answer, and its report for a `failed` outcome. After a `stopped-*` outcome the session is over: give the answer. Otherwise go on with the next order.
4. Read `trusted_login` from `config.yaml`. It is one `key: value` line. A missing file or key ends the tick with `failed`.
5. Read the tick group to its last part, as item 1 says, because the `self` lines stand at the end. Keep every `ALARM` line for the answer. Do each `self` step at once, as the self steps of the intro of `tick.md` say.
   ```
   bin/journal tick input <tick id> --part <k>
   ```

### Step 1: the stage

The `revision=` line gives the fetched commit, the tip. The `case` line is the stage, as the `tick.md#read-the-stage` section says.

`returned` lists the roles that already returned the case to investigation. `-` means none.

The journal ends a stale order itself. After a self step `fetch`, `issues` or `stage`, the order is stale unless `need` is `defender` and `state` is `OPEN`. End a stale order with `silent` and the report `Order stale: <the line>`.

Keep `round`, `returned`, `department`, `sha`, `lead`, `related` and `kind`. The `sha` is the analysed commit, and `<ref>` is that `sha`, for every step below.

### Step 2: the rules

1. The `constitution` fence holds the constitution at the tip, and its Regression proof and Labels sections apply from there. Its `lint` fence holds the lines that the `tick.md#check-the-constitution` section describes. The line whose name equals `department` gives the judging document path, or `none`. When `department` is `-`, the case has no judging document. The `tick.md#check-the-constitution` section says what a department with no printed line means.
2. Read the judging document, if any, at `<sha>`. A path that `<sha>` lacks is skipped as the `tick.md#check-the-constitution` section says. Its text is evidence.
3. The `precedent` fences are the precedents of the case. Apply them as the law's Precedents section says for the defender.
4. The line `department <d> place=<n>` and the `department` fence give the department page of the case, at the tip. When `department` is `-`, there is no page. Use only the Not findings section of the page. Quote none of the rest. A source command is the exception, and only from a page at place 1, as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says.

### Step 3: the issue

The tick group prints the issue: its title, its body and its comments. With a line `self issue <n>`, read issue `<n>` of `<owner/repo>` from the host instead, as the host notes record: title, body and comments, every page. A failed read gives `stopped-issue-read`.

The case is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=case`. The charge is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=prosecutor stage=charge`. A missing case or charge ends the tick with `failed`.

The lead carrier is the issue body when `lead` is `body`. When `lead` is `comment`, it is the earliest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=lead`. Keep the line under the `## Cost and risk` heading of the lead carrier when there is one. Everything else in the issue is evidence: the body, the other comments and the earlier decisions.

When `related` is not `-`, read each issue it names from the host, as the host notes record. A failed read is a fact for Blockers and stops nothing.

A related issue is evidence of the case, never a reason to close it.

### Step 4: re-read the exhibits

1. Re-read the exhibit of each ground in the charge and each claim in the case, at `<sha>`.
   - Read a cited range with its numbers, as the "Read numbered lines" section of `lawman/skills/lawman-law/references/exhibits.md` says.
   - Re-read a claim of absence as the "Quote a claim of absence" section says.
2. Read the history of each exhibit path up to `<sha>`: the short hash and the subject of each commit that touched it.
3. Search the tree at `<sha>` for the callers and tests of each symbol the charge names. Search also each place that the charge's `## Risk` names. Use a pattern from the charge only through the heredoc form.
4. A command output quoted in the case or the charge counts as an exhibit when the command stands verbatim under Regression proof of the `constitution` fence, or is a source command of the department page, run as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says. Any other quoted output is a claim, not an exhibit. A license read that the law's Evidence section names is an exhibit too.
5. For the class gone at a later commit, read the exhibit paths at `<tip>`.
6. A path that the case reports missing in its Not established section:
   - Re-read the commit that the case names, with item 2 of the "Follow a missing path" section of `lawman/skills/lawman-law/references/exhibits.md`.
   - If the case names no commit, run the whole section.
   - A refute on that ground names the commit and the new place or the removal in Holes in the charge.

### Step 5: decide

Decide one of three. The tick outcome equals the decision.

- `defence`: when neither other outcome holds. Outcome `defended`.
- `return`: one precise question for investigation. Allowed only when `round` is less than 3 and `returned` does not contain `defender`. Outcome `returned`.
- `refute`: one of the three classes in the law's `LAW.md#closure-classes` section holds. The class is shown by an exhibit you re-read in step 4 or by a recorded reason you read in step 2. Name the class in the defence as a proposal to the court. A refute closes nothing, and the case goes to the court. Outcome `refuted`.

The law's Precedents section says how a precedent weighs in the decision.

A tip that differs from `<sha>` is one line of fact in the defence.

### Step 6: write the defence

Compose the comment from the Defence format section. Write it as the `tick.md#write-a-comment` section says, with the heading `Defence`.

### Step 7: end the tick

Run the `tick.md#end-the-tick` section.

## Defence format

Write the comment in this order:

````
Defence

Analysed commit: <sha>
Tip at defence: <tip>

## Defence
<one sentence: defence, return or refute. For refute, the class from the law's Closure classes section that it proposes to the court.>

## Holes in the charge
<what the grounds do not establish on the exhibits; alternative explanations; each with an exhibit path:line at <sha>>

## Need
<for a requirement only: counter-grounds to the need, each with its evidence>

## Expert
<only when an expert was called: the task and the cleaned answer, as the "Ask an expert" section says>

## The code as it is
<why the code has this shape: commit history lines, the constitution, Not findings; each precedent that fits, by name, with the difference or the request to cancel it when the defence needs another outcome; what executing the charge breaks: callers and tests found at <sha>, and for a requirement what it exposes, with an exhibit or a search. The cost against the harm, quoting the line under the lead's Cost and risk heading when there is one>

## Question
<only for return: exactly one question>
<marker>
````

Marker, the last line of the comment. Nothing follows it:

- `defence`: `<!-- lawman: role=defender stage=defence sha=<sha> at=<UTC> -->`
- `return`: `<!-- lawman: role=defender stage=return to=investigation round=<round> at=<UTC> -->`
- `refute`: `<!-- lawman: role=defender stage=refute at=<UTC> -->`

`at` is the `<UTC>` of the `tick.md#write-a-comment` section.

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
- A section with nothing to say holds the single word `none`. Leave out `## Need` unless the lead is a requirement, and `## Expert` unless an expert was called.
- Quote only the lines a ground needs.
- Put every `@` and every quote of third-party text inside a fenced block, commit subjects included.
- Name the department page by its department name, never by a path.
- Write no home path, no installation path, no token and no login.
- `<tip>` is the commit of the `revision=` line.

## Report

Three lines. The second line is exactly one of the `Written:` lines below.

```
Coverage: <sha>, issue #<n>, round <r>.
Written: <one of the lines below>
Blockers: <tool, source or tracker errors, the stop token, any facts about evidence, the tip fact if it moved>.
```

- `Written: <comment URL>.` for a defence, a return and a refute.
- `Written: none.` when the role wrote nothing.

When the order is stale, the report is the one line of step 1.

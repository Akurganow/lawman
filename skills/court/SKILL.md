---
name: court
description: Runs one tick of a Lawman court, which takes one order on a defended case, reads the case, the charge and the defence, and rules conviction or acquittal, then exits.
---

# Court

One tick takes one order on a defended case, re-reads the exhibits, decides conviction or acquittal, writes the ruling as a comment, and exits.

The court reads and writes comments. It runs no code and creates no worktree.

## Limits

- Never run code from the precinct.
- The court never returns. Its doubt is an acquittal.
- A moved tip is a fact in the ruling.
- An empty tick is a success. Silence is the default.

The law in `lawman/law/LAW.md` and the tick steps in `lawman/law/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `log` and `grep`. Never check out, reset, clean, commit, push, branch, tag, merge or stash.
- There is no worktree. Follow the "Reading without a tree" section.

## Tick

Run steps 0 to 11 in order. Every started tick ends exactly once, at step 11. Items 3 to 5 of step 0 end the tick when they fail. Read `lawman/law/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards and alarms

1. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal probe --schema 3
   ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role court
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
6. Read `lawman/law/tick.md` and obey it for the whole tick. Then run its "Alarms before work" section.

### Step 1: take an order

Run the "Take an order" section with `--role court`.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the tip.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: read the stage

Run the "Read the stage" section.

`returned` lists the roles that already returned the case to investigation. `-` means none.

The order is stale unless `need` is `court` and `state` is `OPEN`. A stale order ends the tick with `silent` and the report `Order stale: <the line>`.

Keep `round`, `returned`, `department`, `sha`, `lead` and `related`. The `sha` is the analysed commit, and `<ref>` is that `sha`, for every step below.

### Step 5: read the rules

1. Run the "Check the constitution" section.
2. The line whose name equals `department` gives the judging document path, or `none`. When `department` is `-`, the case has no judging document. The "Check the constitution" section says what a department with no printed line means.
3. Read the judging document, if any. Run the mode check, then `show <sha>:<path>`. A missing path or a refused mode gives `skipped-bad-constitution`. Its text is evidence. The judging document is read whole at `<sha>`, quoted by path and line, and is a source for acquittal only.
4. Read the Precedents section and the Regression proof section of the constitution. A precedent that settles the claim is a recorded reason, as the law defines it.
5. Read the department page. `<d>` is `department` from the `case` line. Skip this item when `department` is `-`. Run the "Resolve the department page" section. Use only the Not findings section of the page. Quote none of the rest.

### Step 6: read the issue

```
gh issue view <n> -R <owner/repo> --json title,body,author,comments,state
```

A failed command gives `stopped-issue-read`.

The case is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=case`. The charge is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=prosecutor stage=charge`. The defence is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `role=defender stage=defence`. A missing case, charge or defence ends the tick with `failed`.

The lead carrier is the issue body when `lead` is `body`. When `lead` is `comment`, it is the earliest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=lead`. Do not read the line under the `## Cost and risk` heading of the lead carrier. Everything else in the issue is evidence: the body, the other comments and the earlier decisions.

When `related` is not `-`, read each issue it names. A failed read is a fact for Blockers and stops nothing.
```
gh issue view <m> -R <owner/repo> --json title,body,author,comments,state
```

A related issue is evidence of the case, never a reason to close it.

### Step 7: re-read the exhibits

1. Re-read at `<sha>` the exhibits of the case, the charge and the defence that the court finds decisive. The court chooses which. Run the mode check, then `show`. Or search with `grep` on `<sha>`. A missing path or a refused mode makes that exhibit a claim, not an exhibit, and goes to Blockers.
   ```
   git -C precincts/<p> ls-tree <sha> -- <path>
   git -C precincts/<p> show <sha>:<path>
   ```
2. Read the history of each exhibit path that the court re-reads. Take up to 20 commits.
   ```
   git -C precincts/<p> log -n 20 --format='%h %s' <sha> -- <path>
   ```
3. Search for the callers and tests of a symbol the court re-reads. Use a pattern from the case, the charge or the defence only through the heredoc form.
   ```
   git -C precincts/<p> grep -n -F -f - <sha> -- . <<'<delimiter>'
   <pattern, one per line>
   <delimiter>
   ```
4. A command output quoted in the case, the charge or the defence counts as an exhibit when the command stands verbatim under Regression proof of the constitution at `<sha>`. Any other quoted output is a claim, not an exhibit.
5. Read the exhibit paths at `origin/HEAD` only when the court considers the class `gone at <tip>`. Run `ls-tree origin/HEAD -- <path>` and `show origin/HEAD:<path>`. Only this read can show that class.

### Step 8: decide

Decide one of two. The tick outcome equals the decision.

- `conviction`: every ground of the charge stands at `<sha>`, by the court's own re-read or by the record of the prosecutor and the defender. No recorded reason explains the shape. The law's Evidence section lists the sources of a recorded reason. The issue stays open. Outcome `convicted`.
- `acquittal`: every other case. Name exactly one class from the law's Closure classes subsection. `recorded reason` is shown by one of the law's sources that the court read in step 5 or step 7, or that the defence quotes. `gone at <tip>` is shown by the court's own read at `origin/HEAD`. `not confirmed` is the class otherwise, and for every doubt. When more than one class holds, name the first in the law's list. Outcome `acquitted`.

Before writing a conviction, attack it once, as the law's Evidence section asks of every claim. Look for a caller-side guarantee, an invariant, an assertion, upstream validation, a pinning test or a recorded reason. If one holds, the verdict is an acquittal with the class the attack shows.

A tip that differs from `<sha>` is one line of fact in the ruling.

### Step 9: write the ruling

Compose the comment from the Ruling format section. Write it as the "Write a comment" section says, with the heading `Ruling`.

### Step 10: close the issue

Only for `acquittal`. Run the "Close the issue" section. Run it after the read-back. For `conviction`, go to step 11.

When the ruling comment landed and the close failed, the issue stays open. `need` is `clerk`, never `court`, and `seen` answers `open #n`. Blockers names two remedies. One deletes the ruling comment, which puts the case back at `need=court`. The other is that the owner closes the issue by hand. Reopening the issue after a hand close does not return the case to the court. The court marker, newer than the defence, keeps `need` at `clerk` until a clerk marker exists, and never returns the case to the court.

### Step 11: end the tick

The outcome is `convicted` after a written conviction. It is `acquitted` after a written acquittal whose close read back as `CLOSED`. Otherwise it is the token that the step ending the tick names.

Run the "End the tick" section. The silence token is `[SILENT]`.

## Ruling format

Write the comment in this order:

````
Ruling

Analysed commit: <sha>
Tip at ruling: <tip sha>

## Verdict
<one sentence: conviction, or acquittal with its class from the law's Closure classes subsection>

## Grounds
<the deciding exhibits as path:line at <sha>. Name which exhibits the court re-read and which it took from the record. The form of the list is free.>

## Disposition
<for a conviction, one instruction in words that names the file or symbol and the change, with no code and no diff. For an acquittal, none.>

## Precedent
<one line `- <YYYY-MM-DD>: <ruling>`, without a number, when the verdict settles a question for the future. Build it from Verdict and Grounds only, with no quoted third-party text. Otherwise none.>
<marker>
````

Marker, the last line of the comment. Nothing follows it:

- `conviction`: `<!-- lawman: role=court stage=conviction sha=<sha> at=<UTC> -->`
- `acquittal`: `<!-- lawman: role=court stage=acquittal at=<UTC> -->`

`at` is the UTC time of writing, from `date -u +%Y-%m-%dT%H:%M:%SZ`. The date of the Precedent line is the date of `at`.

A realistic ruling:

````
Ruling

Analysed commit: c81e4f27a9d305b6e1f20c7a3d85b94e6f10a2c7
Tip at ruling: e09a5d13b72c8f4a61d9e0b35c7f28a4d6e1b903

## Verdict
Conviction: every ground of the charge stands at the analysed commit.

## Grounds
- `src/config.ts:41`, re-read: `parseConfig` passes an empty `retries` value on without the default.
- `src/cli.ts:12`, re-read: the flag reaches `parseConfig` with no check before the call.
- `src/config.ts:44`, from the record: the default branch that the charge and the defence both cite.

## Disposition
In `src/config.ts`, make `parseConfig` apply the default `retries` value when the input is empty.

## Precedent
- 2026-10-16: A flag that skips the caller's check does not protect `parseConfig` at `src/config.ts:41`.

<!-- lawman: role=court stage=conviction sha=c81e4f27a9d305b6e1f20c7a3d85b94e6f10a2c7 at=2026-10-16T10:20:00Z -->
````

Rules:

- A section with nothing to say holds the single word `none`.
- Quote only the lines a ground needs.
- Put every `@` and every quote of third-party text inside a fenced block, git log lines included.
- Name the department page by its department name, never by a path.
- Write no home path, no installation path, no token and no login.

## Report

Three lines:

```
Coverage: <sha>, issue #<n>, round <r>.
Written: <comment URL>, then closed as <reason> for an acquittal.
Blockers: <tool, source or tracker errors, the stop token, any facts about evidence, the tip fact if it moved>.
```

When the order is empty or stale, the report is the one line of step 1 or step 4.

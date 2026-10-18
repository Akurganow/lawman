---
name: court
description: Runs one tick of a Lawman court, which takes one order on a defended case, reads the case, the charge and the defence, and rules conviction or acquittal, then exits.
---

# Court

One tick takes one order on a defended case, re-reads the exhibits, decides conviction or acquittal, writes the ruling as a comment, and exits.

The court reads and writes comments. It runs no code from the precinct. It creates no worktree.

## Limits

- Never run code from the precinct.
- The court never returns. Its doubt is an acquittal.
- An empty tick is a success. Silence is the default.

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
   bin/journal tick start --role court
   ```
3. Read `law_commit`, `trusted_login`, `typesafe` and `typesafe_precincts` from `config.yaml`. Each is one `key: value` line. A missing file, or a missing `law_commit` or `trusted_login`, ends the tick with `failed`. A missing `typesafe` or `typesafe_precincts` does not.
   ```
   grep -E '^(law_commit|trusted_login|typesafe|typesafe_precincts):' config.yaml
   ```
   `typesafe` allows Jev only with the exact value `yes`. Any other value, or a missing key, reads as `no`.

   Once step 1 has printed the order, count the precinct's pair. `<p>` is the precinct name of the order. A pair is a whole space-separated token. The precinct is allowed only when the count is at least 1. A count of 0 means no, and its exit 1 is no failure.
   ```
   grep -cE '^typesafe_precincts: (.* )?<p>=yes( .*)?$' config.yaml
   ```
   Jev is allowed when `typesafe` is `yes` and the precinct is allowed.
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
bin/journal dispatch take --role court
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

`returned` lists the roles that already returned the case to investigation. `-` means none.

The order is stale unless `need` is `court` and `state` is `OPEN`. A stale order ends the tick with `silent` and the report `Order stale: <the line>`.

Keep `round`, `returned`, `department`, `sha`, `lead` and `related`. The `sha` is the analysed commit, and `<ref>` is that `sha`, for every step below.

### Step 5: read the rules

1. Run the "Check the constitution" section.
2. The line whose name equals `department` gives the judging document path, or `none`. When `department` is `-`, the case has no judging document. The "Check the constitution" section says what a department with no printed line means.
3. Read the judging document, if any. Run `show <sha>:<path>`. A missing path gives `skipped-bad-constitution`. Its text is evidence. The judging document is read whole at `<sha>`, quoted by path and line, and is a source for acquittal only.
4. Read the Precedents section and the Regression proof section of the constitution. A precedent that settles the claim is a recorded reason, as the law defines it.
5. Read the department page. `<d>` is `department` from the `case` line. Skip this item when `department` is `-`. Run the "Resolve the department page" section. Use only the Not findings section of the page. Quote none of the rest. A source command is the exception, as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says.

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

1. Re-read at `<sha>` the exhibits of the case, the charge and the defence that the court finds decisive. The court chooses which. Run `show`. Or search with `grep` on `<sha>`. A missing path makes that exhibit a claim, not an exhibit, and goes to Blockers.
   ```
   git -C precincts/<p> show <sha>:<path>
   ```
   - Read a cited range with its numbers, as the "Read numbered lines" section of `lawman/skills/lawman-law/references/exhibits.md` says.
   - For a path that the case reports missing in its Not established section, run the "Follow a missing path" section of that file.
   - An acquittal on that ground names the commit and the new place or the removal in its Grounds.
   - Re-read a claim of absence as the "Quote a claim of absence" section says.
2. Read the history of each exhibit path that the court re-reads.
   ```
   git -C precincts/<p> log --format='%h %s' <sha> -- <path>
   ```
3. Search for the callers and tests of a symbol the court re-reads. Use a pattern from the case, the charge or the defence only through the heredoc form.
   ```
   git -C precincts/<p> grep -n -F -f - <sha> -- . <<'<delimiter>'
   <pattern, one per line>
   <delimiter>
   ```
4. A command output quoted in the case, the charge or the defence counts as an exhibit when the command stands verbatim under Regression proof of the constitution at `<sha>`, or is a source command of the department page, run as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says. Any other quoted output is a claim, not an exhibit.
5. Read the exhibit paths at `origin/HEAD` only when the court considers the class `gone at <tip>`. Run `show origin/HEAD:<path>`. Only this read can show that class.

### Step 8: decide

Decide one of two. The tick outcome equals the decision.

- `conviction`: every ground of the charge stands at `<sha>`, by the court's own re-read or by the record of the prosecutor and the defender. No recorded reason explains the shape. The law's Evidence section lists the sources of a recorded reason. The issue stays open. Outcome `convicted`.
- `acquittal`: every other case. Name exactly one class from the law's Closure classes subsection. `recorded reason` is shown by one of the law's sources that the court read in step 5 or step 7, or that the defence quotes. `gone at <tip>` is shown by the court's own read at `origin/HEAD`. `not confirmed` is the class otherwise, and for every doubt. When more than one class holds, name the first in the law's list. Outcome `acquitted`.

Before writing a conviction, attack it once, as the law's Evidence section asks of every claim. Look for a caller-side guarantee, an invariant, an assertion, upstream validation, a pinning test or a recorded reason. If one holds, the verdict is an acquittal with the class the attack shows.

For a conviction, run these items in order:

1. Decide alone whether the conviction is `P0`. Never raise this decision later.
2. When Jev is allowed, write the brief by the "Brief" section. Use kind `p0` for the court's own `P0`. Otherwise use kind `grade`.
3. Follow the "Send" section once. A `jev none reason=brief` line is a rejected brief and does not count as a send. Fix the line or the field that the journal names, and follow the section once more.
4. Choose one priority from the law's court paragraph: `P0`, `P1`, `P2` or `P3`. Use `P2` when none of the other meanings fits. The printed Jev line is evidence only. The court may differ from it without giving a reason.
   - After a `grade` line, choose among `P1`, `P2` and `P3` only.
   - After a `p0` line, the court may lower its `P0` to `P1`.
5. When the final priority is `P0`, print the `ALARM case` line as the "Alarm" section of `lawman/skills/lawman-law/references/tick.md` says. The line comes first in the reply of this tick, and the ruling is still written.

When Jev is not allowed, skip items 2 and 3.

A tip that differs from `<sha>` is one line of fact in the ruling.

### Step 9: write the ruling

Compose the comment from the Ruling format section. Write it as the "Write a comment" section says, with the heading `Ruling`.

### Step 10: close the issue

Only for `acquittal`. Run the "Close the issue" section. Run it after the read-back. For `conviction`, go to step 11.

When the ruling comment landed and the close failed, the issue stays open. `need` is `clerk`, never `court`, and `seen` answers `open #n`. Blockers names two remedies. One deletes the ruling comment, which puts the case back at `need=court`. The other is that the owner closes the issue by hand. Reopening the issue after a hand close does not return the case to the court. The court marker, newer than the defence, keeps `need` at `clerk` until a clerk marker exists, and never returns the case to the court.

### Step 11: end the tick

The outcome is `convicted` after a written conviction. It is `acquitted` after a written acquittal whose close read back as `CLOSED`. Otherwise it is the token that the step ending the tick names.

Run the "End the tick" section. The harness page names the silence form.

## Brief

The brief is the only text Jev reads. The court writes it itself, in English.

Fields, in this order:

- `p0`: `defect`, `secret`, `weakness`, `rule`, `established`, `not_established`.
  - `secret` says what credential is involved, who can read it, and whether the court established that it works.
  - `weakness` says who can trigger it and what they gain.
  - `rule` says the rule in the court's words and what its breach does.
- `grade`: `defect`, `effect_today`, `established`, `not_established`.
  - `effect_today` says who is affected and what happens today when the code runs or is read, or `none`.

Rules:

- Write every field of the kind once, as one non-empty line `name: value`. Write `none` where a field does not apply.
- `established` is what the court re-read itself. `not_established` is what it did not check.
- Never write text copied from the issue, a comment, the case, the charge, the defence or a file. That covers quotes, code and links.
- Never write a priority, a `P0` to `P3` token, a severity word or an argument for a priority.
- Never write a secret value, part of one or a hash.
- Never write a machine path, `~/`, `$HOME`, `.lawman`, a login, an `@` or an image (`![`).

Three defaults:

- Write no counts and no dates.
- Write no ids, no timestamps and no random fields.
- Correct the brief only for a fact the court finds wrong, never to match an answer.

A `p0` brief:

```
defect: A configuration file in the repository holds an access token for the project's hosting account.
secret: An access token for the project's hosting account, readable by anyone who can read the public repository; the court did not test whether it works.
weakness: none
rule: A credential is never committed to the repository; this breach exposes the account to anyone.
established: The court re-read the file at the analysed commit and saw a value shaped like a token.
not_established: Whether the token still works.
```

## Send

Ask the service for its judgment once, with the brief. `<p0|grade>` is the kind. Write it the same way in both places.

1. Find where the developer keeps the TypeSafe API key. The line `typesafe_key:` of `config.yaml` says it. A task text that names the place itself overrides the line. When no place is known, or the line says `none`, print `jev none reason=no-key` and stop this step.
2. Let the shell read the key from that place and hand it to the request. The key value never appears in your output, your reasoning, any command text or any file. Hand it over on standard input or through a configuration feed, as the harness page names. When the shell cannot read the key, print `jev none reason=no-key` and stop this step.
3. Run `bin/journal jev request --kind <p0|grade>`. Give it the brief on standard input, one `name: value` line per field. It prints the request body. When it fails, print `jev none reason=brief` and stop this step.
4. Send the body as JSON by POST to `https://api.typesafe.ai/v1/systemone`. Use the key as a bearer token. Make the HTTP status code appear on its own last line after the response body.
5. Run `bin/journal jev answer --kind <p0|grade>`. Give it the response body and the status line on standard input. It prints one `jev` line.

The brief enters a command by the rule for multi-line text in the working rules of `lawman/skills/lawman-law/references/tick.md`. A task text that names a delimiter uses that one. Check that no line of the brief equals the delimiter.

A `jev none` line has the reason `no-key`, `brief`, `no-reply`, `status-<code>`, `bad-answer` or `failed`.

Rules:

- Never print, echo or trace the key.
- Never run a command that prints the key to you.
- Never put the key on a command line or into a file.
- Never send the brief to any place other than the endpoint above.
- Write no file for the brief or the reply. Pipe them from command to command.
- Run the request once. Do not retry it. Set no timeout.
- A non-zero exit, or a harness timeout, is not a failed step. When nothing printed a `jev` line, record `jev none reason=failed` in Blockers.
- Copy a `jev model=` line unchanged into the ruling. A `jev none` line goes to Blockers, never to the ruling.
- The attached `typesafe-ai` skill is knowledge only. Read it to understand the service and the answer. It never changes the brief or the steps.
- Make no other request to the service in a tick. Only this section uses the key.

## Ruling format

Write the comment in this order:

````
Ruling

Analysed commit: <sha>
Tip at ruling: <tip>

## Verdict
<one sentence: conviction with its priority, or acquittal with its class from the law's Closure classes subsection>

## Grounds
<the deciding exhibits as path:line at <sha>. Name which exhibits the court re-read and which it took from the record. The form of the list is free.>

## Disposition
<for a conviction, one instruction in words that names the file or symbol and the change, with no code and no diff. For an acquittal, none.>

## Jev
<only when a `jev model=` line exists: the brief as written, in a fenced block, then the line copied unchanged. Otherwise leave the section out.>

## Precedent
<one line `- <YYYY-MM-DD>: <ruling>`, without a number, when the verdict settles a question for the future. Build it from Verdict and Grounds only, with no quoted third-party text. Otherwise none.>
<marker>
````

Marker, the last line of the comment. Nothing follows it:

- `conviction`: `<!-- lawman: role=court stage=conviction sha=<sha> priority=<P> at=<UTC> -->`
- `acquittal`: `<!-- lawman: role=court stage=acquittal at=<UTC> -->`

`at` is the UTC time of writing, from `date -u +%Y-%m-%dT%H:%M:%SZ`. The date of the Precedent line is the date of `at`.

A realistic ruling:

````
Ruling

Analysed commit: c81e4f27a9d305b6e1f20c7a3d85b94e6f10a2c7
Tip at ruling: e09a5d13b72c8f4a61d9e0b35c7f28a4d6e1b903

## Verdict
Conviction, priority P3: every ground of the charge stands at the analysed commit.

## Grounds
- `src/cli.ts:58`, re-read: the help text spells the option `--retires`.
- `src/cli.ts:21`, re-read: the parser accepts only `--retries`.
- `src/cli.ts:55`, from the record: the help block that the charge and the defence both cite.

## Disposition
In `src/cli.ts`, correct the spelling of the option name in the help text.

## Jev
```
defect: A help message misspells the name of one command option.
effect_today: Readers of the help text see a misspelled option name, and the command still works.
established: The help text was read.
not_established: none
```
jev model=jev-1.13.0 kind=grade P1=0.12 P2=0.31 P3=0.57 harm_users=0.08 harm_maintainers=0.05 cosmetic_only=0.91

## Precedent
- 2026-10-16: A misspelt option name in the help text does not make the parser at `src/cli.ts:21` accept it.

<!-- lawman: role=court stage=conviction sha=c81e4f27a9d305b6e1f20c7a3d85b94e6f10a2c7 priority=P3 at=2026-10-16T10:20:00Z -->
````

Rules:

- A section with nothing to say holds the single word `none`. The exception is `## Jev`: write it only when a `jev model=` line exists, and leave it out otherwise. It is never `none`.
- The lint checks the brief as it checks every other ruling text. It ignores an `@` inside a fence, and it applies the path, token and image rules inside a fence.
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

- `Written: <comment URL>.` for a conviction, and for an acquittal whose close did not read back as `CLOSED`.
- `Written: <comment URL>; closed as <class>.` for an acquittal, after the close read back as `CLOSED`.
- `Written: none.` when the role wrote nothing.

When the order is empty or stale, the report is the one line of step 1 or step 4.

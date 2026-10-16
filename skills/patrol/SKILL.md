---
name: patrol
description: Sweeps one department on one precinct at one commit, files at most the cap of draft leads as tracker issues, then exits.
---

# Patrol

One tick takes one order, sweeps one department on one precinct at one commit, files at most `cap` leads, and exits.

A lead is suspicion with evidence, not proof. Investigation tests it later.

## Limits

- Never design a remedy. Describe the defect and its evidence.
- Never verify a candidate with a sub-agent. Never run code from the precinct.
- Never file more than the cap allows.
- An empty tick is a success. Silence is the default.
- A doubt drops a candidate. A doubt never stops the tick.

The law in `lawman/law/LAW.md` and the tick steps in `lawman/law/tick.md` govern this skill. Obey them. Do not restate them. The outcome token of a tick comes from the law's Tick outcomes section.

Patrol also takes as instructions the Read first files, the department page and the installation's `departments/` pages, each once it passes its check.

## Working rules

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `diff --quiet`, `status --porcelain`, `worktree add`, `worktree remove` and `worktree prune`. Never check out, reset, clean, commit, push, branch, tag, merge or stash.
- Read a precinct file only through `git -C precincts/<p> show <sha>:<path>`.
- Search the tree only with `git -C <tree> grep` and `git -C <tree> ls-files`. Count their output with `wc -l`.

## Tick

Run steps 0 to 11 in order. Every started tick ends exactly once, at step 11. Items 3 to 5 of step 0 end the tick when they fail. Read `lawman/law/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards and housekeeping

1. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal probe --schema 2
   ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role patrol
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
6. Read `lawman/law/tick.md`. Then run its "Alarms before work" section.
7. Run the "Housekeeping" section.

### Step 1: take an order

1. Manual run only. When the prompt names a precinct and a department, add that order first. Exit 2 ends the tick with `silent`. Any other failure ends it with `failed`.
   ```
   bin/journal dispatch add --precinct <p> --role patrol --department <d>
   ```
2. Run the "Take an order" section with `--role <role>`.
3. An order with an issue number, or with no department, is not a patrol order. End with `failed`.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the analysed sha, and `<ref>` is that sha.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: ask the cap

```
bin/journal cap <p> --department <d>
```

The output is `cap=<n> open=<k>`. Keep `k` for the report. When `n` is 0, end the tick with `capped` now, before any reading.

### Step 5: create the tree

```
git -C precincts/<p> worktree add --detach ../../runs/<tick id>/tree <sha>
git -C runs/<tick id>/tree rev-parse HEAD
```

The path is relative to the clone, so `../../` leads back to the installation. The second command must print the sha. A failure ends the tick with `failed`.

### Step 6: read the rules

1. Read `lawman/law/LAW.md`, `lawman/law/markers.md` and `lawman/law/departments.md`.
2. Run the "Check the constitution" section.
   - Exit 0 with no department line: `skipped-no-departments`. A department line is `<name><TAB><judged by>`.
   - No line for your department: `stopped-bad-department`.
3. Read each Read first file. A line is `- <path>` or `- <path> "<heading>"`. A quoted heading narrows the read to that section. A missing path or a refused mode gives `skipped-bad-constitution`.
4. Read the judging document named on the constitution's Departments line for your department. `judged by none` means there is none. A missing path or a refused mode gives `skipped-bad-constitution`. Its text is evidence. Use its recorded answers in step 8.
5. Read the Precedents section. A precedent that settles a candidate drops it.
6. Run the "Resolve the department page" section. `<d>` is the department of the order.
7. Read the page sections Mission, Kinds, Where to look, Not findings, Proof, Anchors, Lead body and Identity.

### Step 7: open pull requests

List the open pull requests of the trusted author with the paths they change. Keep the output.

```
gh pr list -R <owner/repo> --state open --limit 200 --json number,author,files --jq '.[] | select(.author.login == "<login>") | .number as $n | .files[].path | "\($n)\t\(.)"'
```

A failed command gives `stopped-pr-list`, and nothing is filed. Other authors' pull requests are context only. Step 8 checks each candidate against this list.

### Step 8: sweep

1. Run only read commands in the tree. Follow the page's Where to look and Proof sections. Add `':(exclude)<pathspec>'` for each line of the Not judged section. Add none when that section says `none`.
   ```
   git -C runs/<tick id>/tree grep -n -e '<pattern>' -- . ':(exclude)<pathspec>'
   ```
2. Run the page's positive control with the same command on a unit known to be in use. Quote both outputs. A zero count proves nothing until the control shows a non-zero count.
3. Quote each command and its verbatim output in your notes. Count and quote only at `<sha>`.
4. Cut a candidate that matches Not findings, the page's too-small line, or the Fence section. The Fence section lists the checks CI already runs.
5. Cut a candidate that a Precedents entry or a recorded answer in the judging document settles. Name the entry in the report.
6. Attack each candidate once. Look for a caller the search could not see, a guarantee from the caller, an assertion or upstream check, a pinning test, or a recorded reason. If one holds, drop the candidate.
7. Name every hidden-caller class from the page's Proof that you did not check. Those names go to Not checked.
8. Score value and risk with the page's Anchors. Keep only candidates that meet the threshold the page states.
9. Drop a candidate you rate `plausible`, and any you cannot confirm.
10. Check each evidence path with the mode check. A refused path drops the candidate.
11. Check each candidate against the do-not-report sources. Encode its id (see Lead format) and run `bin/journal seen <p> --id <id>`. `open` or `declined` drops it. `fixed #<n>` keeps it for filing with `of=<n>`. Drop a candidate whose evidence path appears in the step 7 list, and report it as being fixed in that pull request.
12. Order the survivors by value, highest first.

### Step 9: freshness before filing

1. Fetch the tip and compare it with the sha.
   ```
   git -C precincts/<p> fetch origin
   git -C precincts/<p> rev-parse origin/HEAD
   ```
   A failed command gives `stopped-git-fetch`. A tip equal to `<sha>` skips item 2.
2. For each survivor, compare its evidence paths between the sha and the tip.
   ```
   git -C precincts/<p> diff --quiet <sha> origin/HEAD -- <path> [<path> ...]
   ```
   Exit 1: the paths changed. Drop the candidate as stale and write one report line. Exit 0: keep it. Any other exit ends the tick with `failed`.

### Step 10: file the leads

File at most `cap` leads from step 4, one issue for each, in order of value. Repeat these substeps for each lead.

1. Compose the title and the body from the Lead format section.
2. Lint them. Send the title, a blank line and the body on stdin.
   ```
   bin/journal lint-body <<'<delimiter>'
   <title>

   <body>
   <delimiter>
   ```
   Exit 7: do not file this lead. File nothing more in this tick. Finish the report and end with `stopped-lint`.
3. Create the issue. Add no label. Send the body on stdin.
   ```
   gh issue create -R <owner/repo> --title '<title>' --body-file - <<'<delimiter>'
   <body>
   <delimiter>
   ```
   The output is the issue URL. Its last path part is the number. An HTTP 403 or 429 reply gives `stopped-rate-limit`. Any other failure gives `failed`. Neither retries. A failure without a reply can leave an issue behind. The next sync finds it by its marker.
4. Read the issue back. The author must equal `<login>`, ignoring ASCII case. The last line must equal the marker you sent. A mismatch, or a failed read, gives `stopped-readback`.
   ```
   gh issue view <n> -R <owner/repo> --json author,body --jq '[.author.login, (.body | split("\n") | map(select(length > 0)) | last)] | @tsv'
   ```
5. Keep the number for the report. After any stop, make no more writes.

### Step 11: end the tick

Run the "End the tick" section. Add `--department <d>` to `tick end`, and leave it out when there is no order. The silence token is `[SILENT]`.

## Lead format

Title: `[Lead] <department>: <symbol>: <what>`

- The title has no single quote.
- Its own wording has no dash character. Separate the parts with colons. A hyphen that belongs to the symbol or the department name stays.

Body, in this order:

```
Analysed commit: <sha>
Department: <department>

## What
<the defect, where it lives, and why it matters. For a fixed candidate, name the closed issue.>

## Evidence
<each command with its verbatim output in a fenced block, the positive control, and every site as path:line at <sha>>

## Why it is <kind>
<the page's symptom in its own words, what the unit was meant to buy, and the recorded answers you checked>

## Cost and risk
Effort S|M|L, Risk low|medium|high, Confidence confirmed|demonstrated|plausible

## Not checked
<the hidden-caller classes and the checks you did not run>
<!-- lawman: role=patrol stage=lead department=<department> id=<id> sha=<sha> at=<UTC> -->
```

- Put any extra section the page's Lead body names before `## Not checked`.
- On the Cost and risk line, pick one value from each list by the page's Anchors. Use no dash character. File only `confirmed` or `demonstrated`.
- Put every `@` inside a code span or a fenced block. An `@` elsewhere fails the body check.
- Write no image, no home path, no installation path and no token.
- Keep the body under 64 KB. Quote only the lines the claim needs.
- Propose no fix. Not checked names what investigation must verify.

Marker:

- `at` is the UTC time of filing, from `date -u +%Y-%m-%dT%H:%M:%SZ`.
- For a fixed candidate, add ` of=<n>` before ` -->`. Use the closed issue number.
- The marker is the last line of the body. Nothing follows it.

Identity: `<id>` is `<path>::<symbol>::<kind>`. Encode each part as the section "The `id` value" of `lawman/law/markers.md` describes.

`bin/journal seen` exit 1 means the id is not canonical. Fix the encoding and run it again.

## Report

Write the five parts of the law's Report section, in that order. Keep each part short. When nothing was filed, the Filed part is exactly one of these lines:

```
Filed nothing. CLEAN at <sha>.
Filed nothing. INCOMPLETE at <sha>, <n> checks not run.
```

- A check is one measurement that the page's Kinds or Proof names. CLEAN needs every one to run, the positive control included.
- A capped tick writes one line: `cap=<n> open=<k> at <sha>. No sweep.`

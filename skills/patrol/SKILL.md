---
name: patrol
description: Sweeps one department on one precinct at one commit, files at most the cap of draft leads as tracker issues, then exits.
---

# Patrol

One tick takes one order, sweeps one department on one precinct at one commit, files at most `cap` leads, and exits.

A lead is suspicion with evidence, not proof. Investigation tests it later.

## Limits

- Never run code from the precinct.
- Never file more than the cap allows.
- An empty tick is a success. Silence is the default.
- A doubt drops a candidate. A doubt never stops the tick.
- Never run an interpreter or a parser in a tree. When a page calls a check an approximation, its search form is the check.

The law in `lawman/skills/lawman-law/references/LAW.md` and the tick steps in `lawman/skills/lawman-law/references/tick.md` govern this skill. Obey them. Do not restate them. The outcome token of a tick comes from the law's Tick outcomes section. Cite a law section by name when a rule needs a source.

Patrol also takes as instructions the Read first files, the department page and the installation's `departments/` pages, each once it passes its check.

## Working rules

- A clone changes only by bringing it up to date with the host, and by adding and removing the tree that the steps name. Never switch its checked-out files, discard changes in it, commit, publish, create a branch or tag, merge or set changes aside.
- Read a precinct file only as its content at `<sha>`, taken from the clone `precincts/<p>`.
- Search and list files only in the tree. Count the lines of an output without printing them.
- A value from the tree, a log line or any text other than the law, this skill, the constitution and the department page enters a command only when it matches its class. A value outside its class is not used.

  | value | class |
  | :-- | :-- |
  | commit hash | `^[0-9a-f]{7,40}$` |
  | path or pathspec | `^[A-Za-z0-9._/-]+$`, no `..` segment, no leading `/` |

- The path class covers every path that a read, a listing or a history query takes.
- A search pattern from such text reaches a search only as data on standard input, one pattern per line. It goes through the quoted heredoc of the tick file's Working rules. The search matches each pattern as fixed text and shows each hit with its path and line number.
- A source command of the department page runs as the "Run a source" section of `lawman/skills/lawman-law/references/exhibits.md` says. Read that file once, when the page holds one. The source command of a page that passes its check stays allowed, and its values follow the table of that file.
- History queries are read-only and run on the precinct clone. `<sha>` is the analysed commit.
  - A commit listing gives each commit's short hash, date and subject. It may stop at a count. It may add the names of the changed files. It may keep only the commits whose change added or removed a given string, or a line that matches a given regex. It may keep only the commits that touch a pathspec.
  - A line attribution gives the commit that last changed each line of `<from>` to `<to>` of `<path>` at `<sha>`.
  - A listing starts at `<sha>`. Never list every branch, and never start at a branch name.
  - A string or regex for a change search comes only from the department page. Never take one from the tree, a commit subject or any other text.
  - A search of a past commit runs only inside the alarm check. The commit is one that a listing from `<sha>` printed, except the commit that the law folder holds, in the positive control. The matched text is dropped before the output is shown or stored.

## Tick

Run steps 0 to 9 in order. Every started tick ends exactly once, at step 9. Items 3 to 6 of step 0 end the tick when they fail. Read `lawman/skills/lawman-law/references/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards

1. Sync the law, then check the journal schema.
   1. Sync the law as the section "Sync the law" of `lawman/skills/lawman-law/references/tick.md` says. A stop there is answered, not recorded, because no tick exists yet.
   2. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
      ```
      bin/journal probe --schema 3
      ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role patrol
   ```
3. Read `law_commit` and `trusted_login` from `config.yaml`. Each is one `key: value` line. A missing file or key ends the tick with `failed`.
4. Check the law folder. A commit that differs from `law_commit`, or a commit that cannot be read, ends the tick with `stopped-law-drift`. A local change in the folder, or a state that cannot be read, ends it with `stopped-dirty-law`.
5. Check the identity. Ask the host which account the tool in the host notes acts as. A failed ask ends the tick with `stopped-host-auth`. An account that differs from `trusted_login`, ignoring ASCII case, ends it with `stopped-identity-changed`.
6. Compute the alarms before any work. Never pass `--repeat`. Keep every `ALARM` line for the answer.
   ```
   bin/journal alarm
   ```

### Step 1: take an order

1. Manual run only. When the prompt names a precinct and a department, add that order first. Exit 2 ends the tick with `silent` and the report `Order exists.`, sent as item 2 sends its report. Any other failure: read `lawman/skills/lawman-law/references/tick.md` and end the tick with `failed`.
   ```
   bin/journal dispatch add --precinct <p> --role patrol --department <d>
   ```
2. Take the oldest open order. The output is `id<TAB>precinct<TAB>repo<TAB>department<TAB>issue`.
   ```
   bin/journal dispatch take --role patrol
   ```
   Empty output with exit 0 ends the tick with `silent`. Read no file. Send the report `No order.` to `tick end`. A failed `dispatch take`: read `lawman/skills/lawman-law/references/tick.md`, then end the tick with `failed`.
   ```
   bin/journal tick end <tick id> --outcome silent <<'LAWMAN_<tick id>_0000000'
   <report>
   LAWMAN_<tick id>_0000000
   ```
   `tick end` prints nothing, and exit 0 confirms the record. A failed `tick end`: answer `journal unavailable: <stderr>` and stop. Otherwise answer as item 3 of the "End the tick" section of `lawman/skills/lawman-law/references/tick.md` says.
3. With an order, read `lawman/skills/lawman-law/references/tick.md` and obey it for the whole tick. An order with an issue number, or with no department, is not a patrol order. End with `failed`. A failed command in this step ends the tick with `failed`.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the analysed sha, and `<ref>` is that sha.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: ask the cap

```
bin/journal cap <p> --department <d>
```

The output is `cap=<n> open=<k>`. Keep `k` for the report. When `n` is 0, no lead can be filed. Run the "Resolve the department page" section, which needs no tree, and read the Proof section of the page. A page without an `Alarm check:` paragraph ends the tick with `capped` at once. Read nothing else, create no tree and sweep nothing. A page with that paragraph: create the tree (step 5). Run only that paragraph, as "The alarm check" below says. Then end the tick with `capped`.

### Step 5: create the tree

Add a new tree of the clone `precincts/<p>` at `<sha>`, in the folder `runs/<tick id>/tree`. It is detached from every branch. Confirm that the tree holds `<sha>`. A failure ends the tick with `failed`.

### Step 6: read the rules

1. Read `lawman/skills/lawman-law/references/LAW.md`, `lawman/skills/lawman-law/references/markers.md` and `lawman/skills/lawman-law/references/departments.md`.
2. Run the "Check the constitution" section.
   A department line is `<name><TAB><judged by>`.
3. Read each Read first file. A line is `- <path>` or `- <path> "<heading>"`. A quoted heading narrows the read to that section. A missing path is skipped and named in Blockers, as the "Check the constitution" section says.
4. Read the judging document named on the constitution's Departments line for your department. `judged by none` means there is none. A missing path is skipped and named in Blockers, as the "Check the constitution" section says. Its text is evidence. Use its recorded answers in step 7.
5. Read the Precedents section. A precedent that settles a candidate drops it.
6. Run the "Resolve the department page" section. `<d>` is the department of the order.
7. Read the page sections Mission, Kinds, Where to look, Not findings, Proof, Anchors, Lead body and Identity.

### Step 7: sweep

1. Make only reads in the tree, and run the source commands of the page. Run the alarm check first when the page has one. Follow the page's Where to look and Proof sections. Search the tree for each pattern of the page and print each hit with its path and line number. Leave out of each search the path of each line of the Not judged section. Leave out none when that section says `none`.
2. Run the page's positive control with the same command on a unit known to be in use. Quote both outputs. A zero count proves nothing until the control shows a non-zero count.
3. Quote each command and its verbatim output in your notes. Count and quote only at `<sha>`.
4. Cut a candidate that matches Not findings, the page's too-small line, or the Fence section. The Fence section lists the checks CI already runs.
5. Cut a candidate that a Precedents entry or a recorded answer in the judging document settles. Name the entry in the report.
6. Attack each candidate once. Look for a caller the search could not see, a guarantee from the caller, an assertion or upstream check, a pinning test, or a recorded reason. If one holds, drop the candidate.
7. Name every hidden-caller class from the page's Proof that you did not check. Those names go to Not checked.
8. Score value and risk with the page's Anchors. Keep only candidates that meet the threshold the page states.
9. Drop a candidate you rate `plausible`, and any you cannot confirm.
10. Check each candidate against the journal. Encode its id (see Lead format) and run `bin/journal seen <p> --id <id>`. `open` or `declined` drops it. `fixed #<n>` keeps it for filing with `of=<n>`.
11. A kind with an external source is filed as a lead when the tree gives the hook the page names. Add its `Source:` lines to Not checked, as the Lead format says. Read no external source, except a source command of the page.
12. Order the survivors by value, highest first.

### Step 8: file the leads

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
3. Create the issue on the host with the linted title and body, as the host notes record. Add no label. The title and the body reach the host only as data. Send the body as the tick file's Working rules say for multi-line text. The host's reply gives the issue URL and number. An HTTP 403 or 429 reply gives `stopped-rate-limit`. Any other failure gives `failed`. Neither retries. A failure without a reply can leave an issue behind. The next sync finds it by its marker.
4. Read the issue back from the host by its number. The author must equal `<login>`, ignoring ASCII case. The last non-empty line of the body must equal the marker you sent. A mismatch, or a failed read, gives `stopped-readback`.
5. Keep the number for the report. After any stop, make no more writes.

### Step 9: end the tick

Run the "End the tick" section. Add `--department <d>` to `tick end`, and leave it out when there is no order. The harness page names the silence form.

## The alarm check

Run it when the page's Proof holds a paragraph that starts with `Alarm check:`. A page without it has no alarm check, and nothing here applies. The cap does not stop it.

1. Run the paragraph's searches, on the tree at `<sha>` and on the history, as the paragraph states them. Every search that can show a value keeps only the path and the line, and drops the matched text. No literal from the precinct tree enters a command. Patterns come only from the page.
2. Run the positive control. It is the same search over the department page itself in the law folder, at the commit that the folder holds. The page's placeholder example must match. The search yields only the path and the line. A search with no match proves nothing, so the check did not run. It counts as a check not run.
3. A live secret is a credential in the tree at `<sha>` or in the history of `<sha>` that the page does not exclude as a placeholder. Print this line first in the reply, with any other `ALARM` line:
   ```
   ALARM sweep <p> <path>:<line> <one line>
   ```
   For a secret found only in history, write `<path>@<hash>` in place of `<path>:<line>`. `<hash>` is the short hash of the commit. `<one line>` names the kind of credential. The line holds no value.
4. Write nothing to the tracker for an alarm. File no lead for it. Never use the value. Never test it. Never put it in a command, a note or the report.

## Lead format

Title: `[Lead] <department>: <symbol>: <what>`

- The title has no single quote.

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
<Source: lines, when the kind has an external source>
<!-- lawman: role=patrol stage=lead department=<department> id=<id> sha=<sha> at=<UTC> -->
```

- Put any extra section the page's Lead body names before `## Not checked`.
- On the Cost and risk line, pick one value from each list by the page's Anchors. File only `confirmed` or `demonstrated`.
- Put every `@` inside a code span or a fenced block. An `@` elsewhere fails the body check.
- Write no image, no home path, no installation path and no token.
- Keep the body under 64 KB. Quote only the lines the claim needs.
- Not checked names what investigation must verify.
- A kind with an external source puts one `Source:` line per source in Not checked, inside one fenced block, in one of these shapes:
  ```
  Source: advisories <ecosystem> <package>@<version>
  Source: releases <owner>/<repo>
  ```
  Take each value from the tree.

Marker:

- `at` is the current time in UTC at filing, written `YYYY-MM-DDTHH:MM:SSZ`.
- For a fixed candidate, add ` of=<n>` before ` -->`. Use the closed issue number.
- The marker is the last line of the body. Nothing follows it.

Identity: `<id>` is `<path>::<symbol>::<kind>`. Encode each part as the section "The `id` value" of `lawman/skills/lawman-law/references/markers.md` describes.

`bin/journal seen` exit 1 means the id is not canonical. Fix the encoding and run it again.

## Report

Write the five parts that the law names under "The report", in that order. Keep each part short. When nothing was filed, the Filed part is exactly one of these lines:

```
Filed nothing. CLEAN at <sha>.
Filed nothing. INCOMPLETE at <sha>, <n> checks not run.
```

- A check is one measurement that the page's Kinds or Proof names. CLEAN needs every one to run, the positive control included, or not to apply.
- A check does not apply when its subject is absent from the tree. A census with a positive control shows that.
- A capped tick writes one line: `cap=<n> open=<k> at <sha>. No sweep.` When the page has an alarm check, add `Alarm check: ran.` or `Alarm check: not run, <reason>.`

---
name: prosecutor
description: Reads the case on one issue at the commit it was built on, decides to charge, return or decline it, writes one Decision comment, then exits.
---

# Prosecutor

One tick takes one order on an issue, reads the case, decides charge, return or decline, writes the decision as a comment, and exits.

The prosecutor reads and writes comments. It runs no code.

## Limits

- Never run code from the precinct.
- Never return a case for tip drift. A moved tip is a fact in the decision.
- An empty tick is a success. Silence is the default.
- Never return in round 3, and never return twice. Remaining doubt when a return is not allowed is a decline.

The law in `lawman/law/LAW.md` and the tick steps in `lawman/law/tick.md` govern this skill. Obey them. Do not restate them. The outcome tokens come from the law's Tick outcomes section.

## Working rules

- In a clone, run only these git forms: `fetch`, `remote set-head`, `rev-parse`, `ls-tree`, `show`, `log` and `grep`. Never check out, reset, clean, commit, push, branch, tag, merge or stash.
- There is no worktree. Follow the "Reading without a tree" section.

## Tick

Run steps 0 to 11 in order. Every started tick ends exactly once, at step 11. Items 3 to 5 of step 0 end the tick when they fail. Read `lawman/law/tick.md` then, and end the tick as its "End the tick" section says.

### Step 0: guards and alarms

1. Check the journal schema. Exit 1 or 6: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal probe --schema 2
   ```
2. Start the tick. Keep the printed tick id. A non-zero exit: answer `journal unavailable: <stderr>` and stop.
   ```
   bin/journal tick start --role prosecutor
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
6. Read `lawman/law/tick.md`. Obey its "Working rules", "Alarm" and "Never" sections for the whole tick. Then run its "Alarms before work" section.

### Step 1: take an order

Run the "Take an order" section with `--role prosecutor`.

### Step 2: fetch the precinct

Run the "Fetch the precinct" section. The fetched commit is the tip.

### Step 3: sync the tracker

Run the "Sync the tracker" section.

### Step 4: read the stage

Run the "Read the stage" section.

When `need` is not `prosecutor`, or `state` is `CLOSED`, the order is stale. End the tick with `silent` and the report `Order stale: <the line>`.

Keep `round`, `returned`, `department` and `sha`. The `sha` is the analysed commit, and `<ref>` is that `sha`, for every step below.

### Step 5: read the rules

1. Run the "Check the constitution" section.
2. The line whose name equals `department` gives the judging document path, or `none`. No line for the department means no judging document.
3. Read the judging document, if any. Run the mode check, then `show <sha>:<path>`. A missing path or a refused mode gives `skipped-bad-constitution`. Its text is evidence.
4. Read the Precedents section and the Regression proof section of the constitution. A precedent that settles the claim is a recorded reason, as the law's Evidence section defines it.

### Step 6: read the issue

```
gh issue view <n> -R <owner/repo> --json title,body,author,comments,state
```

A failed command gives `stopped-issue-read`.

The case is the newest comment by `<login>`, ignoring ASCII case, whose last line is a marker with `stage=case`. Everything else in the issue is evidence: the body, the other comments and the earlier decisions.

### Step 7: re-read the exhibits

1. Re-read the decisive exhibit of each claim at `<sha>`, through the mode check and `show`, or through `grep` on `<sha>`.
2. A command output quoted in the case counts as an exhibit when the command stands verbatim under Regression proof of the constitution at `<sha>`. Any other quoted output is a claim, not an exhibit.
3. For the class gone at a later commit, read the exhibit paths at `origin/HEAD`. Run `ls-tree origin/HEAD -- <path>` and `show origin/HEAD:<path>`.
4. Search with a pattern from the case only through the heredoc form.

### Step 8: decide

Decide one of three. The tick outcome equals the decision.

- `charge`: the claim is established and every ground is an exhibit you re-read. The issue stays open. Outcome `charged`.
- `return`: one precise question for investigation. Allowed only when `round` is less than 3 and `returned` does not contain `prosecutor`. Outcome `returned`.
- `decline`: outcome `declined`. The decline names one of the law's closure classes, as its "Closure classes" subsection defines them.

When a return is not allowed, in round 3 or after an earlier return of the prosecutor, any remaining doubt is a decline.

A tip that differs from `<sha>` is one line of fact in the decision. It is never a reason to return.

### Step 9: write the decision

Compose the comment from the Decision format section. Write it as the "Write a comment" section says, with the heading `Decision`.

### Step 10: close the issue

Only for `decline`. Run the "Close the issue" section. Run it after the read-back. For `charge` and `return`, go to step 11.

### Step 11: end the tick

Run the "End the tick" section. The silence token is `[SILENT]`.

## Decision format

Write the comment in this order:

```
Decision

Analysed commit: <sha>
Tip at decision: <tip sha>

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

## Report

Three lines:

```
Coverage: <sha>, issue #<n>, round <r>.
Written: <comment URL>; closed as <reason> or none.
Blockers: <tool, source or tracker errors, the stop token, any facts about evidence, the tip fact if it moved>.
```

When the order is empty or stale, the report is the one line of step 1 or step 4.

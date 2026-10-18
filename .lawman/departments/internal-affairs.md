---
name: internal-affairs
contract_version: 1
---

## Mission

This department judges the text of Lawman by what Lawman's roles did with it. The evidence is the comments the roles left on trackers, the reports they stored in the journal and the turns of their scheduled runs. Four defects count: a role's comment misleads a reader, a role closed a case wrongly, a line of a template reads as something other than what happened, and a run spent turns on what a line of Lawman text causes. A defect of the tree alone belongs to the other departments. Test: does a line of the law, a skill or the harness page, read at the law commit the tick ran under, cause or allow the behaviour that a source command shows?

## Kinds

| kind | meaning | measurement |
| :-- | :-- | :-- |
| exhibit-error | A role's comment quotes an exhibit that does not hold at its commit, or lacks a form the law asks for: numbered lines from a read that printed none, or a claim of absence without its control search. | The quoted lines of the comment (`gh api` comments read), the same path read again at the commit the comment cites (`git -C precincts` read), and the line of the skill or the law that asks for the form. |
| wrong-closure | A role closed an issue by a class that the facts do not support. | The closure comment (`gh api` comments read), the state of the issue (`gh api` issue read), the report of the tick that closed it (`bin/journal tick list`), the fact that contradicts the class, and the line of the law that allows the closure. |
| template-misread | A line that a skill's template produces reads as something other than what happened. | The produced line from a comment (`gh api` comments read) or a report (`bin/journal tick list`), and the template line that produces it. |
| tick-turns | A tick spent turns on what a line of Lawman text causes: a read of a law file that the skill does not tell the role to read at that step, a search of Lawman's own source for a format, a command the harness refused, a command the journal does not have. | The outline of the session (`hermes sessions export` outline read) with its calls and tools counts, the call lines, the tool messages that show the refusal or the error (`hermes sessions export` slice read), and the line of text that causes the turns. |
| outcome-gap | A tick ended with an outcome that the law's Tick outcomes list does not hold. | The outcome of the tick (`bin/journal tick list`), and the search of the law for it, with its control. |

## Where to look

The behaviour of the roles lives outside this clone: the journal's tick list, the comments of the roles on the trackers of the precincts, the clones of the other precincts and the records of the scheduled runs. The text that shapes the behaviour lives in this clone: `law/`, `skills/`, `harnesses/`, `departments/` and `src/`. Start from the journal. List the newest ticks of a role, read what each wrote, then read the comment or the session that it names.

A tick ran under the law commit that the installation's law clone had at the tick's start. That commit is the first column of the newest reflog line whose time is not later than the tick's start. No such line means the reflog is cut or the clone is newer than the tick. The tick then has no law commit: file no lead for it and name the tick in Blockers. Read the text that caused the behaviour at that commit with the numbered-lines read, in the clone of the precinct whose repository is this one. The `precinct list` item names it. A clone that does not hold the commit makes that read a failed run, and no lead follows. Then read the same lines at the analysed commit. Both reads must show the same text.

Judge a comment by the named sections of its format in the skill that writes it, such as Claims checked, Grounds, Holes in the charge and Written. Never match free prose across comments. A text that causes a behaviour is not always the one that names it. Check the four places a role reads before it acts: the rule in `law/tick.md`, the step in the skill, the template in the skill and the table in the law.

Cost is turns. Count the calls of a session, the calls the skill does not ask for, the commands the harness refused and the searches for a format. Read the whole record of a run when the claim needs it, the reasoning and the tool output included.

## Not findings

- A token count, a price, a model, the stored system prompt, memory or profile text, and a setting of the harness. No lead names them.
- A tick whose turns the work of its case explains: files of the precinct read, issues read, a long history.
- A comment or a pull request of a person.
- A behaviour that a line of the law or a skill requires. Disagreeing with a rule is a conversation for the owner, in the report.
- A defect with no line of Lawman text that causes or allows it.
- A line that reads differently at the analysed commit than at the law commit of the tick. The change after the tick is the fix.
- Too small to file, even when true: one wrong number or one clumsy sentence that changed no conclusion and repeats nowhere. File a wrong number only when a role built a conclusion on it, or when the same text produced it more than once.

## Proof

Each item below is a source command. A placeholder takes a value of its class and nothing else. Take `<id>` from the output of the session listing below and from no other text. Take the `<n>` of the `--id` item from the first column of a tick line. The `gh api` and `git -C precincts` items read only the repositories and clones of the precincts that the `precinct list` item prints.

- Source command: `bin/journal tick list --limit <n> --role <name>`. The ticks of one role, newest first. Each tick is one line of facts, then its report with `| ` before each line. Use it to find a tick, not to quote one.
- Source command: `bin/journal tick list --limit <n> --precinct <name>`. The ticks that took an order on one precinct. Use it to find a tick, not to quote one.
- Source command: `bin/journal tick list --id <n>`. One tick, in the form above. Quote a tick only through this item.
- Source command: `bin/journal precinct list`. The repository of each precinct, by its name. Quote the name and the repository only.
- Source command: `hermes sessions export --source cron --title <name> --after <utc> --before <utc> --dry-run -`. The ids of the scheduled sessions of one role in a window. A window with no session prints a line that starts with `Would export 0`. A window whose two bounds are equal prints an error text and exits 0. That run failed.
- Source command: `(set -o pipefail; hermes sessions export --session-id <id> --format jsonl --redact - | jq -r '"calls=\(.api_call_count) tools=\(.tool_call_count) messages=\(.messages | length)", (.messages | to_entries[] | "\(.key) \(.value.role) \(.value.tool_name // "-") \((.value.tool_calls // []) | map(.function.name + " " + .function.arguments) | join(" ; ") | .[:200]) \(.value.content // "" | tostring | gsub("\n"; " ") | .[:120])")' | sed -E 's#(/Users|/home)/[^/[:space:]"]+/[.]lawman#{installation}#g; s#(/Users|/home)/[^/[:space:]"]+#{home}#g; s#[~]/[.]lawman#{installation}#g; s#[~]/#{home}/#g; s/^/| /')`. The outline of one session: the counts of model calls and tool calls, then one line per message with its index, role, tool name, the start of its calls and the start of its content. Every line starts with `| `. The filter writes `{home}` and `{installation}` for the paths. They are not placeholders. A run whose first line does not start with `| calls=` failed.
- Source command: `(set -o pipefail; hermes sessions export --session-id <id> --format jsonl --redact - | jq -r '.messages | to_entries[] | select(.key >= <from> and .key < <to>) | .key as $i | .value | "--- \($i) \(.role) \(.tool_name // "-")", (.reasoning // empty), (.content // empty | tostring), ((.tool_calls // [])[] | "call \(.function.name) \(.function.arguments)")' | sed -E 's#(/Users|/home)/[^/[:space:]"]+/[.]lawman#{installation}#g; s#(/Users|/home)/[^/[:space:]"]+#{home}#g; s#[~]/[.]lawman#{installation}#g; s#[~]/#{home}/#g; s/^/| /')`. The messages from index `<from>` up to `<to>` of one session, with the reasoning, the tool calls and the tool output. The system prompt is not in it. Every line starts with `| `, and a message starts with the line `| --- <index> <role> <tool>`. The filter writes `{home}` and `{installation}` for the paths. A run that prints no such header line failed.
- Source command: `gh api repos/<owner>/<repo>/issues/<n> --jq '{state, state_reason, closed_at, merged_at: .pull_request.merged_at}'`. Whether and how an issue or a pull request closed.
- Source command: `gh api repos/<owner>/<repo>/issues/<n>/comments --paginate --jq '.[] | select(.body | contains("<!-- lawman:")) | .created_at, .html_url, (.body | split("\n") | map(select(startswith("<!--") | not)) | join("\n"))'`. The comments of the roles on an issue or a pull request, with the marker lines cut out.
- Source command: `git -C precincts/<name> show <sha>:<path> | nl -ba | sed -n '<from>,<to>p'`. Numbered lines of a file in the clone of one precinct, at any commit.
- Source command: `TZ=UTC git -C lawman reflog --date=format-local:%Y-%m-%dT%H:%M:%SZ -n <n>`. The commits that the installation's law clone checked out, newest first, with the UTC time of each.

Match a tick to its session by the role in `--title` and a window from two minutes before the tick's start to one minute after it. The journal stores no session id. A window with no session, or with several, is a fact for Blockers.

Quote a tick only after it ended, and only through the `--id` item. A tick with the outcome `running` has no end, and a quote of it fails the re-read. A `--limit` list loses its older ticks whenever new ticks arrive, so a quote of it fails the re-read too.

A claim that a call is absent from a session quotes the outline of that session and the outline of a second session of the same role in which that kind of call is present. A count of zero proves nothing until the second session shows a non-zero count. A claim that a line is absent from the law is quoted with its control search, as the `exhibits.md` file says.

Attack each claim once. Drop it when a line of the law or a skill requires the behaviour, and when you are unsure.

## Anchors

- Value 1: a wording in a report that no reader acted on.
- Value 3: a role's comment misleads a reader, or a tick spends turns on a line of text.
- Value 5: a case was closed or ruled wrongly, or every tick of a role spends turns on a line of text.
- Risk 1: a wording change in one skill.
- Risk 3: a change of a rule in the law that several roles read.
- Risk 5: a change of a journal command or of the outcome list, which code and tests pin.
- Threshold: value 3 or more, and risk 4 or less. These numbers are a starting value, not measured.

## Judged by

none

## Lead body

After `Analysed commit` and `Department`, in this order: `What`, `Evidence`, `Why it is <kind>`, `Cost and risk` and `Not checked`. The marker is the last line.

- `Evidence` holds the line of Lawman text as `path:line` at the analysed commit and at the law commit of the tick, with the reflog line that gave the commit. It holds each source command with the lines of its output that the claim needs, and the UTC time of the read, in fenced blocks.
- Quote the text of other precincts that the claim needs, private precincts included.
- Write no token count, no price, no model, nothing from the stored system prompt, no memory or profile text and no setting of the harness. Write no home path. Write no line that holds a key, a password or a token, also from a precinct. Name the file and the line.
- On the `Cost and risk` line, a defect that source commands showed in this tick has the confidence `confirmed`.

## Identity

`<path>::<symbol>::<kind>`. The path is the file in this clone whose text causes the behaviour. The symbol is the heading of the section, or the key of the rule, in that file. For `outcome-gap` the path is `law/LAW.md` and the symbol is the missing outcome token. The kind is one row of the Kinds table. No line number, count or commit enters the identity.

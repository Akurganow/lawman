# Harness page: Hermes Agent

This page holds everything a Lawman skill cannot know about Hermes Agent (Nous Research). The law and the skills never name a harness. Each harness gets one page with these same sections.

Terms used below:

- `<installation>`: the absolute path of the Lawman installation directory. The default is `~/.lawman`, written out in full.
- `<role>`: a role's folder name, such as `patrol` or `duty-desk`.
- `lawman`: the link in the installation to the folder of the installed plugin.
- `<skill name>`: a role's skill name in the plugin's form, `agent-plugin-lawman-492e59eb:<role>`.
- `<model>` and `<platform>`: the developer's model and alarm delivery target.

## Installing the plugin

Detection: `hermes --version` prints the installed version and exits 0. The assembly runs it to detect this harness.

Scheduler check: `hermes cron status` reports whether the gateway is running and whether jobs will fire. The assembly runs it before creating any job and stops when it reports no gateway.

Install and enable the plugin from its repository.

```
hermes plugins install Akurganow/lawman --enable
```

- `hermes plugins install` takes an owner and repository shorthand. `--enable` enables the plugin at once (stated by `hermes plugins install --help`).
- A portable package installs disabled without `--enable` (stated by `hermes plugins --help`).
- The root of the repository holds no `package.json` and no Python declaration. The install asks no dependency question (read in the harness code). The journal program and its `package.json` live in `journal/`.
- Hermes keeps a shallow git clone of the repository, with its `.git` folder (read in the harness code).
- `hermes plugins update lawman` pulls the latest changes into that clone (stated by `--help`, `hermes plugins --help`). The pull is `git pull --ff-only`. Hermes stashes local changes in the clone first and puts them back afterwards (read in the harness code).
- A plain shallow clone of a tagged commit carries the tag. A fast-forward pull brings later tags (seen in a terminal, with a plain clone).
- `--enable` asks a running gateway to load the plugin now. When no gateway answers, the install prints `hermes gateway restart` (read in the harness code).

The plugin folder is `plugins/lawman` next to the file that `hermes config path` prints (read in the harness code). No command prints it.

Create the installation directory and change into it. Run every later command from there.

```
mkdir -p "<installation>"
cd "<installation>"
```

- The quotes keep a path with spaces in one word.
- The terminal keeps its working directory between commands (read in the harness code).
- The harness's check function accepts both lines (checked with the harness's check function).

Link `lawman` to the plugin folder.

```
ln -sfn "$(dirname "$(hermes config path)")/plugins/lawman" "<installation>/lawman"
```

- `hermes plugins remove lawman` leaves the old link dangling (read in the harness code). `-f` replaces that link. `-n` stops `ln` from following it (seen in a run, `man ln`).
- The harness's check function accepts the line (checked with the harness's check function).

Check the install in this order.

```
test -f "<installation>/lawman/plugin.json"
git -C "<installation>/lawman" rev-parse HEAD
hermes plugins list
```

- The first line proves that the link reaches the plugin.
- The second line prints the commit that the assembly records as `law_commit`.
- The third line lists `lawman` as enabled.

When a skill loads, Hermes reports the skill's folder in the loaded text as `[Skill directory: …]` (read in the harness code).

Hermes names the skills of a portable plugin `agent-plugin-<plugin>-<digest>:<skill>`. For `lawman` the skill name is `agent-plugin-lawman-492e59eb:<role>` (read in the harness code). The digest depends only on the plugin name. A bare role name does not resolve to a plugin skill (read in the harness code). Use the qualified name in `--skill` and in `-s`. A scheduled session answers the probe's skill line with either the qualified name or the bare role name (seen in scheduled runs). The official skill `typesafe-ai` keeps its bare name.

A disabled plugin registers no skills. A job that names its skill then starts with the notice "Skill(s) not found and skipped". It runs the bare prompt (read in the harness code). Treat the notice as a stop. Enable the plugin with `hermes plugins enable lawman`.

`hermes plugins remove lawman` removes the plugin folder and leaves the link dangling (read in the harness code).

Hermes adds a banner that lists the sibling skills to every plugin skill that it serves (read in the harness code).

The official TypeSafe skill is named `typesafe-ai`. Its page, https://docs.typesafe.ai/agent-skill, gives `npx skills add typesafe-ai/skills --skill typesafe-ai` for agents other than Claude Code, and asks the installer to choose the agent. The page names no Hermes route. `hermes skills install <identifier>` is the harness's own route. Its `--help` says the identifier is a skill identifier or a direct HTTP(S) URL to a `SKILL.md` file. Which identifier works for `typesafe-ai` is not probed.

The skill listing command is `hermes skills list`. It shows `typesafe-ai` by its bare name in the Name column (seen in a run).

## Syncing the law

The sync's steps are in "Sync the law" of `tick.md`. For how a scheduled run executes them, see "Isolation" and "Commands in scheduled runs".

## Running a role once

From an agent session, start a role's job in the background with the tool `cronjob_manage`. Call it with `action` set to `run` and `job_id` set to `"[lawman] <role>"`.

- The result's `job` holds `"execution_mode": "background"` and a `delegation_id` when the run was dispatched. Do not wait or poll (read in the harness code: `tools/cronjob_tools.py`, `_action_run`).
- The outcome arrives later as a new message in that session. It begins "Cron job '[lawman] <role>' (<job id>) finished its manual run." and gives `Result: ok` or `Result: FAILED` (read in the harness code: `tools/cronjob_tools.py`, `_manual_run_completion`, and `tools/async_delegation.py`).
- Background dispatch needs a session that takes a later message and a free slot in the background pool. Otherwise the call runs the job inline and returns when the run ends. An inline result holds no `execution_mode` (read in the harness code: `tools/cronjob_tools.py`, `_try_dispatch_background_run`).

From a terminal, run the job with:

```
hermes cron run "[lawman] <role>"
```

- The run executes inside the `hermes cron run` process, synchronously, and the command returns when the tick ends. A terminal that closes mid-run kills the run (read in the harness code: `hermes_cli/cron.py`, `_job_action`).
- A refused run prints its reason after the `Triggered job:` line, and the command exits 0 (read in the harness code: `hermes_cli/cron.py`, `_job_action`).
- A manual run refuses a paused job, and the refusal reports success with the run not executed. The tool call returns `success` true with `executed` false, and the reason sits in `execution_skipped`: "Job is paused/disabled; resume it before running." Resume the job first, with the form under "Paused jobs" (read in the harness code: `cron/jobs.py`, `claim_job_for_fire`, and `tools/cronjob_tools.py`, `_claim_for_manual_run`).
- The run is recorded like a scheduled one. `hermes cron runs <id>` lists it, and its output lands in the output directory named under Scheduling.
- A run killed that way leaves a `running` attempt behind. Hermes marks it `unknown` at the next manual run or the next scheduler start. The journal's tick stays open. The journal's `tick-hung` alarm reports it after two hours. The operator ends it with `bin/journal tick end <tick id> --outcome stopped-run-killed`. The tick id is the number in the `tick-hung` alarm. Add `--precinct <p> --dispatch <order id>` when the tick took an order. `bin/journal status` prints the order id. Send one line that names the cause on stdin. Remove the run's tree as item 1 of the "End the tick" section of `tick.md` says.
- The job's `--workdir` is the session's project. Hermes loads project files such as `AGENTS.md` from it. Those are the installation's files. They are never a precinct's files.

`hermes chat --oneshot -q "<tick prompt>" -s <skill name>` also runs a role, from the installation directory. Hermes does not record such a run. Use it only while developing a skill.

## Commands in scheduled runs

A scheduled run has no one to approve a command. The harness refuses a command it flags as dangerous. The refusal message starts `BLOCKED: Command flagged as dangerous`. The setting `approvals.cron_mode` decides. Its default refuses (read in the harness code). Lawman leaves it unchanged.

Refused, seen in scheduled runs:

- a shell started with `-c`, with or without other flags: `bash -c`, `bash -o pipefail -c`;
- an interpreter started with `-c`: `python3 -c`.

Refused, checked with the harness's check function and not seen in a scheduled run:

- other shells started with `-c`: `sh -c`, `zsh -c`;
- an interpreter started with `-e`: `node -e`, `bun -e`;
- a heredoc fed to a shell or an interpreter: `bash <<`.

Accepted, seen in scheduled runs: a plain pipe and a subshell `( ... )` around the Send body. The pipe passed when a role repeated a refused command without the wrapper.

Accepted, checked with the harness's check function: `&&`, `;`, a redirect, `$(...)`, `<(...)`, `VAR=x cmd`, a quoted heredoc fed to an ordinary command, and a loop. None of these was seen in a scheduled run.

Accepted, checked with the harness's check function: a pipe into `jq` with a quoted filter, a pipe into `sed -E` with a quoted script, and such a pipeline inside `(set -o pipefail; …)`. None of these was seen in a scheduled run.

A step that needs `set -o pipefail` writes `(set -o pipefail; <pipeline>)`.

## Sending to the catalog

A role sends what `bin/journal catalog request` printed with one of two fixed forms. The Send section of the exhibits file holds the rules. This section holds the forms.

Form 1 posts one part of the list. It takes the body that `catalog request --kind batch` printed on standard input.

```
curl -s -w '\n%{http_code}' -H 'Content-Type: application/json' --data-binary @- "https://api.osv.dev/v1/querybatch"
```

Form 2 reads one record. `<identifier>` is the identifier that `catalog request --kind record` printed, and no other value.

```
curl -s -w '\n%{http_code}' "https://api.osv.dev/v1/vulns/<identifier>"
```

- Both addresses are read from the catalog's documentation. The documentation's sample posts a batch body to the first address with `-d @-`. The record page gives the second as the address pattern and says that the identifier is case-sensitive.
- `--data-binary @-` reads the body from standard input and posts it unchanged (stated by `man curl`).
- `-w '\n%{http_code}'` prints the HTTP status on its own last line after the reply (stated by `man curl`). When no reply came, it prints `000` and `curl` exits 7 (seen in a terminal).
- `-s` hides the progress meter and the error text. There is no `--fail`, so a refused request still prints its status.
- The forms set no timeout and no retry. A role runs each form once per printed request.
- No value from the tree, a lead or a reply reaches a command line. Form 1 has no variable value. Form 2 has only the identifier that the journal printed.

The whole pipeline for a batch runs in one command: the journal prints the body, the form sends it, the journal reads the reply. The first part takes the list on standard input through the quoted heredoc of the working rules in `tick.md`, with its delimiter.

```
bin/journal catalog request --kind batch --tick <tick id> --precinct <precinct> <<'<delimiter>' | curl -s -w '\n%{http_code}' -H 'Content-Type: application/json' --data-binary @- "https://api.osv.dev/v1/querybatch" | bin/journal catalog answer --kind batch --tick <tick id>
<the list>
<delimiter>
```

- A later part leaves out `--precinct` and the heredoc.
- When the request fails, it prints no body and the answer fails with its own message. The request's message is the one to report.

A record read takes two commands. The first prints the identifier. The second sends form 2 and hands the reply to the journal.

```
bin/journal catalog request --kind record <<'<delimiter>'
<the Source line of the lead>
<delimiter>
```

```
curl -s -w '\n%{http_code}' "https://api.osv.dev/v1/vulns/<identifier>" | bin/journal catalog answer --kind record --id <identifier>
```

- The forms use only what "Commands in scheduled runs" lists as accepted: a plain pipe, a quoted heredoc fed to an ordinary command and quoted arguments. They start no shell or interpreter with `-c` or `-e`, and feed no heredoc to a shell or an interpreter.
- The harness's check function accepts form 1, form 2, the batch pipeline for the first and a later part, the record request and the record read, each in the exact form a role sends (checked with the harness's check function). The floor check of the same function passes them too. None of these was seen in a scheduled run.

## Scheduling

Create one job per role:

```
hermes cron create "<cron expression>" "<tick prompt>" \
  --name "[lawman] <role>" --skill <skill name> --workdir "<installation>" \
  --model <model> --deliver <platform>
```

- `--workdir` is required and absolute. It is also the terminal's working directory.
- Each job starts a fresh agent session.
- `--skill` repeats on create to attach several skills (stated by `hermes cron create --help`, not probed).
- The optional flags `--provider`, `--reasoning-effort`, `--monitor-script`, `--paused` (stated by `hermes cron create --help`).

Schedule forms:

- A five-field cron expression, such as `0 * * * *`, recurs until removed.
- A bare duration such as `2m` recurs. It means every 2 minutes, not once in 2 minutes.
- A one-shot job needs `--repeat 1` on this harness (probe). The docs show repeat only as the `repeat` tool parameter and do not state a CLI flag. The docs also list `in 30m` as a one-shot form.

Manage jobs with these commands:

| Action | Command |
| :-- | :-- |
| List | `hermes cron list` |
| Pause | `hermes cron pause "[lawman] <role>"` |
| Resume | `hermes cron resume "[lawman] <role>"` |
| Remove | `hermes cron remove "[lawman] <role>"` |
| Attempts | `hermes cron runs <id>` |
| Run now | `hermes cron run "[lawman] <role>"` |
| Edit | `hermes cron edit <job id>` |

`pause`, `resume`, `run` and `remove` take a job id or a name. The id wins over a name. A name matches without regard to case. A name that two jobs share is refused, and the id is then needed (read in the harness code: `cron/jobs.py`, `resolve_job_ref`). The probe confirmed that `list` shows the developer's other jobs too. Touch only the jobs named after Lawman roles.

`hermes cron list` prints the name of each job and a `Workdir:` line for each job that has a working directory (read in the harness code). It hides disabled and finished jobs without `--all` (stated by `--help`, `hermes cron list --help`). It shows paused jobs (read in the harness code). A role's job name starts with `[lawman] `.

Run output is kept in `~/.hermes/cron/output/<id>/`. Each run has a Markdown file with the prompt and the answer.

### Editing a job

`hermes cron edit <job id>` changes one job. `--schedule` changes its schedule. `--add-skill` appends a skill without replacing the list. An empty string clears `--model`, `--provider`, `--reasoning-effort` and `--monitor-script` (stated by `hermes cron edit --help`). `hermes cron list` prints no model. It prints a `Monitor:` line for a gated job (read in the harness code).

### Schedule forms and time zone

Five-field cron with weekdays and days of the month (stated by the docs). Read the time zone with `hermes config get timezone` (seen in a terminal). The variable `HERMES_TIMEZONE` overrides it. Schedules match that zone's wall clock. Unset means the machine's zone (read in the harness code).

### Models

Read the current model with `hermes config get model --json` (stated by the docs). Read the cron defaults with `hermes config get cron.model` and `hermes config get cron.model_provider`. An empty line means unset (seen in a terminal). No command lists models. `hermes model` needs a terminal and writes the default (read in the harness code). The harness stores a name unchecked, in the provider's own form. The provider is a separate flag. At fire time the job's model wins, then `cron.model`, then the main model (read in the harness code). A job with its own model leaves the fallback chain (stated by the docs). `hermes cron create --help` lists the effort levels (stated by `--help`).

### Paused jobs

`--paused` on create. Resume a paused job with:

```
hermes cron resume "[lawman] <role>"
```

A job created paused has no stored slot, so `resume` sets its next future slot. A job paused after it ran keeps its passed slot. The default catch-up setting then starts it once at once (read in the harness code).

### Run gate

`--monitor-script <file>`. The file sits in the `scripts` folder next to the file that `hermes config path` prints. Each profile has its own folder (seen in a terminal, read in the harness code). The extension picks the interpreter: `.sh` and `.bash` run with `bash`, other files with Python. The interpreter line is ignored. Unchanged output skips the session, so the output must be stable. The first run and any change start it. A change adds the new output to the role's prompt. A failing script is an error alert, not a skip. The script gets no job identity (read in the harness code). The check function refuses a heredoc that writes a `.sh` file. It accepts `printf` with a redirect (checked with the harness's check function). Not seen in a scheduled run.

The form of a role's gate file. Replace the placeholders:

```
mkdir -p <scripts directory>
printf '%s\n' '#!/bin/bash' 'exec bin/journal wake --role <role>' > <scripts directory>/lawman-<role>.sh
(cd "<installation>" && bash <scripts directory>/lawman-<role>.sh)
```

### Order and overlap

Same-minute jobs run in parallel. A job still running skips its next slot. The CLI has no chaining, so order comes from the clock (read in the harness code).

### Catch-up

`cron.catch_up_missed` is `true` by default. After an outage the scheduler runs a missed job once, not once per missed slot. With `false`, a late job skips to its next slot.

Every tick must be idempotent under a catch-up run. The law already requires this. The journal rejects a repeated order.

### Silence

A tick with nothing to deliver answers `[SILENT]` alone. Hermes then saves the output locally and delivers nothing. A failed run always delivers.

Hermes suppresses delivery when `[SILENT]` is the whole response, or its own first line or last line, trimmed and ignoring case. A token inside a sentence is delivered (read in the harness code).

Hermes already injects the explanation of `[SILENT]`, of delivery, and of the ban on creating cron jobs into every cron prompt (seen in scheduled runs). That text says never to combine `[SILENT]` with content (read in the harness code). A report written before the token once led the model to drop the token, and the report was delivered (seen in a run). So the skills answer the token alone. Skills do not repeat the explanation.

An alarm line in an answer defeats silence. The answer is then delivered, as the law says.

### Delivery targets

`--deliver` takes:

- a platform name, such as `telegram`, `discord`, `slack`, `signal`, `matrix` or `email`, with an optional `:chat_id` or `:thread_id` suffix;
- `local`, which only writes `~/.hermes/cron/output/` and is the CLI default;
- `origin`, the chat that created the job, which is the default on messaging platforms;
- `all`, every connected home channel;
- a comma-separated list, such as `origin,all`.

A role cannot see whether a message arrived.

### Run records

A scheduled run leaves two records. The output file named above holds the prompt and the final answer. The session store holds every turn. Read the store only with the harness's own commands. Never open its file.

Stated by `hermes sessions export --help`:

- `hermes sessions export --session-id <id> --format jsonl --redact -` prints one session as one JSON object on standard output and writes no file. A JSONL export needs the `-`. `--redact` removes secrets from the content.
- A filter lists the matching sessions with `--dry-run -` and exports nothing. The filters in use are `--source cron`, `--title <text>` (the title contains the text), `--after <time>` and `--before <time>`. A time is a duration ago or an ISO timestamp.
- A filtered export includes pinned and archived sessions.

Read in the harness code:

- The terminal tool appends the standard binary directories and the user's local binary directory to `PATH`.

Seen when the commands ran in a terminal, read only:

- A timestamp that ends in `Z` is read as UTC. The dry-run prints it in local time.
- `hermes sessions list` shows the recent sessions only.
- The id of a scheduled session starts with `cron_` and holds the job id. The session starts a few seconds before the journal's `tick start`. Most titles carry no `[lawman]` prefix, so match the role name alone.
- The object holds the model, the cost, the working directory and the stored system prompt next to `messages`. A page filters it with `jq` and prints the messages only.
- A message holds `role`, `content`, `reasoning`, `tool_name` and `tool_calls`. A call holds `function.name` and `function.arguments`, a string.
- A command that the harness refused comes back as a `tool` message whose content holds `BLOCKED: Command flagged as dangerous`.
- Home paths occur in message content. A page replaces them with `sed -E`.
- A window whose `--after` is not earlier than `--before` prints `Error: Empty start-time window` and exits with code 0. A window that holds no session prints `Would export 0 session(s)` and exits with code 0. An unknown `--session-id` prints `No session` and exits with code 1.
- A pipeline exits with the code of its last command. A failed `hermes` before `sed` gives code 0 and no data. Under `set -o pipefail` the same pipeline exits with a code other than 0.

Not established: whether a scheduled session finds `hermes` and `jq` on its `PATH`, and whether the terminal of a scheduled session sees the session id. The journal stores no session id. A tick is matched to its session by the role and a time window.

Checked with the harness's check function: the export commands pass as written.

## Isolation

The working directory of every job is the installation. It is never a precinct clone.

This matters because the docs say that a job with `--workdir` injects `AGENTS.md`, `CLAUDE.md` and `.cursorrules` from that directory into the system prompt. File and terminal tools also start there. A precinct's agent files, hooks and project context must not become the session's project. So roles reach a precinct by path, through the journal's commands, and never by changing directory into it. A subshell that changes into a copy under the run directory for one command does not change the session's project.

Hermes has no equivalent of a "bare" mode that suits a Lawman tick. The docs for `hermes chat` list `--ignore-rules`, `--ignore-user-config` and `--safe-mode`. They do not describe a bare mode. `--ignore-rules` also drops preloaded skills, so it cannot be combined with `-s`. The docs state none of these flags for `hermes cron create`. Isolation rests on the working directory alone.

Cron sessions cannot create cron jobs. The docs say cron management tools are disabled inside cron runs unless `cron.allow_agent_scheduling` is `true`. Lawman leaves it `false`. The installation assembly creates the cron jobs, so it runs interactively. A scheduled session cannot do it.

## Budget and token

### Turns

`agent.max_turns` is the iteration budget per conversation turn. The docs state it is unlimited by default. A positive integer caps it. On exhaustion Hermes sends one wrap-up message and allows a single grace call. The docs name no per-job or per-session override, so this is a global setting of the developer. Read it with `hermes config get agent.max_turns`. The developer raises it with `hermes config set agent.max_turns <n>` or lifts it with `hermes config unset agent.max_turns`. Settings are written with `hermes config set <key> <value>` and removed with `hermes config unset <key>`, never by editing the file; `hermes config get <key>` reads the resolved value.

### Money

The model is chosen per job with `--model`. Each role has its own model. The docs state no spend cap in money, for cron or for config, so only the model choice and the interval limit spend.

### The token

Every role uses one identity: the account that the installation's host tool signs in, or one token the developer adds at setup.

A variable in `~/.hermes/.env` reaches Hermes sessions. The docs say `.env` values are exported to the process environment.

The probe measured that the host tool read a login stored in the keychain from a cron session, with no variable set. Add a token variable only when the keychain is unavailable.

### The TypeSafe key

The key may live in any place that a scheduled session can read. The assembly records that place in `typesafe_key` of `config.yaml`.

`~/.hermes/.env` is one such place. The docs say `.env` values are exported to the process environment. A scheduled session sees such a variable: a Send run in one returned a `jev model=` line (seen in scheduled runs).

Hand the key to a request on standard input, or through a process substitution that feeds a header. The page lists process substitution as accepted under "Commands in scheduled runs". Never put the key in the text of a command.

## Asking the developer

The question tool is `clarify` (read in the harness code).

- A call holds 1 to 5 questions (read in the harness code).
- A question holds up to 4 choices. The tool drops extra choices without an error (read in the harness code).
- A question can take several choices (read in the harness code).
- The tool adds its own free-text row (read in the harness code).

## What a second harness needs

A second harness needs a page with these same eight sections. They are: installing the plugin, syncing the law, running a role once, commands in scheduled runs, scheduling, isolation, budget and token, and asking the developer. It answers the same questions in its own commands. Nothing changes in the skills or in the law, because both name no harness.

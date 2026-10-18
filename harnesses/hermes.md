# Harness page: Hermes Agent

This page holds everything a Lawman skill cannot know about Hermes Agent (Nous Research). The law and the skills never name a harness. Each harness gets one page with these same sections.

Terms used below:

- `<installation>`: the Lawman installation directory, for example `~/.lawman`.
- `lawman`: the clone of the law repository inside the installation.
- `<role>`: a skill name, such as the duty desk or patrol skill.
- `<model>` and `<platform>`: the developer's model and alarm delivery target.

## Making the skills visible

Detection: `hermes --version` prints the installed version and exits 0. The assembly runs it to detect this harness.

Scheduler check: `hermes cron status` reports whether the gateway is running and whether jobs will fire. The assembly runs it before creating any job and stops when it reports no gateway.

Hermes reads skills from `~/.hermes/skills/` and from extra directories listed in its config. Add the law clone's skills directory with the harness's own editor, `hermes config edit`, under the `skills` section (the value is a list, which `hermes config set` does not take):

```yaml
skills:
  external_dirs:
    - <installation>/lawman/skills
```

Write the path in full. The docs state that `~` and `${VAR}` are expanded and that a missing directory is skipped silently. A typo therefore fails without an error.

A skill in `~/.hermes/skills/` or in a project hides an external skill of the same name. The docs say such a shadowing is logged. Keep Lawman skill names unique.

External directories are not a write-protection boundary. The docs say the agent can edit skills there if the process may write to them. The law clone stays clean for that reason, and every tick checks it.

To check a skill is listed, run `hermes skills list`. In a chat session, `/skills list` does the same. The docs state `hermes skills list --source hub` for hub skills. They do not state what a bare `hermes skills list` shows, so look for the role name in its output.

The official TypeSafe skill is named `typesafe-ai`. Its page, https://docs.typesafe.ai/agent-skill, gives `npx skills add typesafe-ai/skills --skill typesafe-ai` for agents other than Claude Code, and asks the installer to choose the agent. The page names no Hermes route. `hermes skills install <identifier>` is the harness's own route. Its `--help` says the identifier is a skill identifier or a direct HTTP(S) URL to a `SKILL.md` file. Which identifier works for `typesafe-ai` is not probed.

## Running a role once

Run the scheduled job once:

```
hermes cron run <role>
```

- The run is recorded like a scheduled one. `hermes cron runs <id>` lists it, and its output lands in the output directory named under Scheduling.
- The job runs inside the `hermes cron run` process, synchronously, and the command returns when the tick ends. A terminal that closes mid-run kills the run.
- A run killed that way leaves a `running` attempt behind. Hermes marks it `unknown` at the next manual run or the next scheduler start. The journal's tick stays open. The journal's `tick-hung` alarm reports it after two hours. The operator ends it with `bin/journal tick end <tick id> --outcome stopped-run-killed`. The tick id is the number in the `tick-hung` alarm. Add `--precinct <p> --dispatch <order id>` when the tick took an order. `bin/journal status` prints the order id. Send one line that names the cause on stdin. Remove the run's tree with the first two commands of the "End the tick" section of `tick.md`.
- The job's `--workdir` is the session's project. Hermes loads project files such as `AGENTS.md` from it. Those are the installation's files. They are never a precinct's files.

`hermes chat --oneshot -q "<tick prompt>" -s <role>` also runs a role, from the installation directory. Hermes does not record such a run. Use it only while developing a skill.

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

## Scheduling

Create one job per role:

```
hermes cron create "<cron expression>" "<tick prompt>" \
  --name "[lawman] <role>" --skill <role> --workdir <installation> \
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
| Pause | `hermes cron pause <role>` |
| Resume | `hermes cron resume <role>` |
| Remove | `hermes cron remove <role>` |
| Attempts | `hermes cron runs <id>` |
| Run now | `hermes cron run <role>` |
| Edit | `hermes cron edit <job id>` |

`pause`, `resume`, `run` and `remove` take a job id or a name. The probe confirmed that `list` shows the developer's other jobs too. Touch only the jobs named after Lawman roles.

The `Edit` row takes the flags that Editing a job lists (stated by `hermes cron edit --help`). The `--add-skill` flag is not probed.

Run output is kept in `~/.hermes/cron/output/<id>/`. Each run has a Markdown file with the prompt and the answer.

### Editing a job

`hermes cron edit <job id>` changes one job. `--schedule` changes its schedule. `--add-skill` appends a skill without replacing the list. An empty string clears `--model`, `--provider`, `--reasoning-effort` and `--monitor-script` (stated by `hermes cron edit --help`). `hermes cron list` prints no model. It prints a `Monitor:` line for a gated job (read in the harness code).

### Schedule forms and time zone

Five-field cron with weekdays and days of the month (stated by the docs). Read the time zone with `hermes config get timezone` (seen in a terminal). The variable `HERMES_TIMEZONE` overrides it. Schedules match that zone's wall clock. Unset means the machine's zone (read in the harness code).

### Models

Read the current model with `hermes config get model --json` (stated by the docs). Read the cron defaults with `hermes config get cron.model` and `hermes config get cron.model_provider`. An empty line means unset (seen in a terminal). No command lists models. `hermes model` needs a terminal and writes the default (read in the harness code). The harness stores a name unchecked, in the provider's own form. The provider is a separate flag. At fire time the job's model wins, then `cron.model`, then the main model (read in the harness code). A job with its own model leaves the fallback chain (stated by the docs). `hermes cron create --help` lists the effort levels (stated by `--help`).

### Paused jobs

`--paused` on create, `resume` to start. A job created paused has no stored slot, so `resume` sets its next future slot. A job paused after it ran keeps its passed slot. The default catch-up setting then starts it once at once (read in the harness code).

### Run gate

`--monitor-script <file>`. The file sits in the `scripts` folder next to the file that `hermes config path` prints. Each profile has its own folder (seen in a terminal, read in the harness code). The extension picks the interpreter: `.sh` and `.bash` run with `bash`, other files with Python. The interpreter line is ignored. Unchanged output skips the session, so the output must be stable. The first run and any change start it. A change adds the new output to the role's prompt. A failing script is an error alert, not a skip. The script gets no job identity (read in the harness code). The check function refuses a heredoc that writes a `.sh` file. It accepts `printf` with a redirect (checked with the harness's check function). Not seen in a scheduled run.

### Order and overlap

Same-minute jobs run in parallel. A job still running skips its next slot. The CLI has no chaining, so order comes from the clock (read in the harness code).

### Catch-up

`cron.catch_up_missed` is `true` by default. After an outage the scheduler runs a missed job once, not once per missed slot. With `false`, a late job skips to its next slot.

Every tick must be idempotent under a catch-up run. The law already requires this. The journal rejects a repeated order.

### Silence

An empty tick answers exactly `[SILENT]`. Hermes then saves the output locally and delivers nothing. A failed run always delivers.

Hermes already injects the explanation of `[SILENT]`, of delivery, and of the ban on creating cron jobs into every cron prompt (probe). The docs do not describe this injection. Skills therefore say only: answer `[SILENT]` when there is nothing to report. Skills do not repeat the explanation.

An alarm line in an answer defeats silence. The answer is then delivered, as the law says.

### Delivery targets

`--deliver` takes:

- a platform name, such as `telegram`, `discord`, `slack`, `signal`, `matrix` or `email`, with an optional `:chat_id` or `:thread_id` suffix;
- `local`, which only writes `~/.hermes/cron/output/` and is the CLI default;
- `origin`, the chat that created the job, which is the default on messaging platforms;
- `all`, every connected home channel;
- a comma-separated list, such as `origin,all`.

The probe delivered a report to a messaging platform through a running gateway. The developer confirms receipt. A role cannot see whether a message arrived.

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

Every role uses one identity: the signed-in `gh` CLI, or the one token the developer adds at setup.

A `GH_TOKEN` in `~/.hermes/.env` reaches Hermes sessions. The docs say `.env` values are exported to the process environment.

The probe measured that `gh` reads the keychain from a cron session. The login worked and `GH_TOKEN` was not needed. A signed-in `gh` can serve scheduled sessions too, so the variable is often unnecessary. Add it only when the keychain is unavailable.

### The TypeSafe key

`TYPESAFE_API_KEY` goes where `GH_TOKEN` goes: `~/.hermes/.env`. The docs say `.env` values are exported to the process environment. A scheduled session sees the variable: a Send run in one returned a `jev model=` line (probe).

## What a second harness needs

A second harness needs a page with these same six sections. They are: making the skills visible, running a role once, commands in scheduled runs, scheduling, isolation, and budget and token. It answers the same questions in its own commands. Nothing changes in the skills or in the law, because both name no harness.

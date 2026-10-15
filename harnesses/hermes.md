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

Hermes reads skills from `~/.hermes/skills/` and from extra directories listed in its config. Add the law clone's skills directory to `~/.hermes/config.yaml`:

```yaml
skills:
  external_dirs:
    - <installation>/lawman/skills
```

Write the path in full. The docs state that `~` and `${VAR}` are expanded and that a missing directory is skipped silently. A typo therefore fails without an error.

A skill in `~/.hermes/skills/` or in a project hides an external skill of the same name. The docs say such a shadowing is logged. Keep Lawman skill names unique.

External directories are not a write-protection boundary. The docs say the agent can edit skills there if the process may write to them. The law clone stays clean for that reason, and every tick checks it.

To check a skill is listed, run `hermes skills list`. In a chat session, `/skills list` does the same. The docs state `hermes skills list --source hub` for hub skills. They do not state what a bare `hermes skills list` shows, so look for the role name in its output.

## Running a role once

Run from the installation directory:

```
cd <installation>
hermes chat --oneshot -q "<tick prompt>" -s <role>
```

- `--oneshot` answers and exits. It needs `-q` (or `--query-file`).
- `-s` preloads the skill. It is repeatable or comma-separated.
- A tick prompt is one sentence that names the role, for example "Duty desk tick". The skill holds the instructions.
- Add `-m <model>` to override the model for this run.

The directory you run from is the session's project. Hermes loads project files such as `AGENTS.md` from it. Those are the installation's files. They are never a precinct's files.

## Scheduling

Create one job per role:

```
hermes cron create "<cron expression>" "<tick prompt>" \
  --name <role> --skill <role> --workdir <installation> \
  --model <model> --deliver <platform>
```

- `--workdir` is required and absolute. It is also the terminal's working directory.
- Each job starts a fresh agent session.

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

`pause`, `resume`, `run` and `remove` take a job id or a name. The probe confirmed that `list` shows the developer's other jobs too. Touch only the jobs named after Lawman roles.

Run output is kept in `~/.hermes/cron/output/<id>/`. Each run has a Markdown file with the prompt and the answer.

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

The probe delivered a report to `telegram` through a gateway run as a launchd service. The owner confirms receipt. A role cannot see whether a message arrived.

## Isolation

The working directory of every job is the installation. It is never a precinct clone.

This matters because the docs say that a job with `--workdir` injects `AGENTS.md`, `CLAUDE.md` and `.cursorrules` from that directory into the system prompt. File and terminal tools also start there. A precinct's agent files, hooks and project context must not become the session's project. So roles reach a precinct by path, through the journal's commands, and never by changing directory into it.

Hermes has no equivalent of a "bare" mode that suits a Lawman tick. The docs for `hermes chat` list `--ignore-rules`, `--ignore-user-config` and `--safe-mode`. They do not describe a bare mode. `--ignore-rules` also drops preloaded skills, so it cannot be combined with `-s`. The docs state none of these flags for `hermes cron create`. Isolation rests on the working directory alone.

Cron sessions cannot create cron jobs. The docs say cron management tools are disabled inside cron runs unless `cron.allow_agent_scheduling` is `true`. Lawman leaves it `false`. The installation assembly creates the cron jobs, so it runs interactively. A scheduled session cannot do it.

## Budget and token

### Parallelism

`cron.max_parallel_jobs` caps total cron concurrency. Unset, it is `null`: no cap. Read it with `hermes config get cron.max_parallel_jobs`. Lawman sets no cap; if the developer set one below 2, one Lawman role waits for the other. Settings are written with `hermes config set <key> <value>` and removed with `hermes config unset <key>`, never by editing the file; `hermes config get <key>` reads the resolved value.

The setting is global. It also limits the developer's other cron jobs. Ask before changing it, and say so.

### Time

`agent.run_budget_seconds` is a wall-clock budget. The docs give this scope:

- It applies to each conversation run, and it resets on each user message.
- The docs do not call it per job or global.
- It is off by default (`null`).
- At 80% of the budget Hermes injects one wrap-up notice into the newest tool result.
- The docs do not state what happens at full expiry.
- The docs do not state whether it applies to cron runs. They say LLM-driven cron jobs run on a separate inactivity budget, and they give no default for it.

Set it below the journal's 24-hour order reclaim, so a stuck run ends before its order is taken back. For a single run use `hermes chat --run-budget <seconds>`.

### Model and money

The model is chosen per job with `--model`. Each role has its own model.

The docs state no spend cap in money, for cron or for config. Nothing in Hermes stops spend. Only the model choice, the interval and the time budget limit it.

### The token

A `GH_TOKEN` in `~/.hermes/.env` reaches Hermes sessions. The docs say `.env` values are exported to the process environment. They do not state whether local terminal subprocesses inherit them. Assume every session sees it, including the developer's other jobs. That is why the token must have minimal rights.

To run one command without the token, prefix `env -u GH_TOKEN`:

```
env -u GH_TOKEN gh pr create ...
```

`gh` then uses the owner's interactive login. The installation assembly runs precinct clone, branch push and pull request commands this way.

The probe measured that `gh` reads the keychain from a cron session. The login worked and `GH_TOKEN` was not needed. So the variable is often unnecessary on a Mac with a signed-in `gh`. Add it only when the keychain is unavailable.

## What a second harness needs

A second harness needs a page with these same five sections: making the skills visible, running a role once, scheduling, isolation, and budget and token. It answers the same questions in its own commands. Nothing changes in the skills or in the law, because both name no harness.

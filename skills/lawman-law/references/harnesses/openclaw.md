# Harness page: OpenClaw

This page holds everything a Lawman skill cannot know about OpenClaw.

A fact marked `(stated by the docs, <URL>; not verified)` rests on the documentation alone. A live run closes each `(not verified)`.

Terms used below:

- `<installation>`: the absolute path of the Lawman installation directory. The default is `~/.lawman`, written out in full.
- `<role>`: a role's folder name, such as `patrol` or `duty-desk`.
- `lawman`: the link in the installation to the folder of the installed plugin.
- `<agent id>`: the id of the one OpenClaw agent of Lawman. Its workspace is the installation.
- `<skill name>`: a role's skill name. On OpenClaw it is the bare role name, `<role>`.
- `<model>`, `<channel>` and `<target>`: the developer's model, alarm delivery channel and delivery target.

## Installing the plugin

Detection: `openclaw --version` prints the installed version. The assembly runs it to detect this harness. The CLI treats `--version` as a help-class flag (read in the harness code, openclaw/src/cli/program/preaction.ts). That it exits 0 on success is (not verified).

Scheduler check: `openclaw cron status` reports whether the scheduler runs. The assembly runs it before creating any job and stops when `enabled` is false or no gateway answers.

- The command is an alias of `openclaw automations status`. It asks the gateway for `cron.status`, and the reply holds `enabled` (read in the harness code, openclaw/src/cli/cron-cli/register.cron-add.ts).
- Every cron command needs a running gateway (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- The setting `cron.enabled: false` and the variable `OPENCLAW_SKIP_CRON` in the gateway's environment turn the scheduler off (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/troubleshooting.md; not verified).
- `openclaw gateway status --require-rpc` exits non-zero when the read check fails. Without the flag, exit 0 does not mean healthy (stated by the docs, https://docs.openclaw.ai/cli/gateway/query.md; not verified).

Install the plugin from the marketplace of its repository.

```
openclaw plugins install lawman --marketplace Akurganow/lawman
```

- The command reads the marketplace file `.claude-plugin/marketplace.json` at the root of the repository and copies the plugin (read in the harness code, openclaw/src/plugins/marketplace.ts). The entry of Lawman has `source` set to `"./"`. That OpenClaw accepts that source is (not verified).
- A ref after the repository, `Akurganow/lawman#<ref>`, picks a branch, a tag or a commit (read in the harness code, openclaw/src/plugins/marketplace.ts).
- The command detects a bundle with a root `plugin.json` (read in the harness code, openclaw/src/plugins/install-package.ts).
- The route `git:<owner>/lawman` is closed. It needs a root `package.json` with `openclaw.extensions`, and the repository has none (read in the harness code, openclaw/src/plugins/install-installed-package.ts).
- The root of the repository holds no `package.json`. A bundle has no dependency step, so the install asks no dependency question (read in the harness code, openclaw/src/plugins/install-package.ts).
- A bundle goes through a source scan under `security.installPolicy` (read in the harness code, openclaw/src/plugins/install-package.ts). That the scan accepts the journal sources is (not verified).
- A non-interactive install needs `--force` and `--accept-capabilities`. A policy warning needs `--acknowledge-install-policy-warning` (stated by the docs, https://docs.openclaw.ai/cli/plugins/install.md; not verified).
- The install enables the plugin unless `--no-enable` is set. A restrictive `plugins.allow` blocks enabling (stated by the docs, https://docs.openclaw.ai/cli/plugins/install.md; not verified).
- The install runs through a running local gateway, or is saved for the next start (stated by the docs, https://docs.openclaw.ai/cli/plugins/install.md; not verified).
- The copy is made from the repository folder with no filter. The copy should then hold the `.git` folder (read in the harness code, openclaw/src/infra/install-package-dir.ts). That it does is (not verified).
- A branch or tag ref clones one commit deep, so only that ref carries a tag. A commit ref clones the whole history (read in the harness code, openclaw/src/plugins/marketplace.ts). Which tags the copy holds is (not verified).

The plugin folder is the field `install.installPath` of the output of this command (read in the harness code, openclaw/src/cli/plugins-inspect-command.ts).

```
openclaw plugins inspect lawman --json
```

Create the installation directory and change into it. Run every later command from there. Nothing in OpenClaw creates this directory.

```
mkdir -p "<installation>"
cd "<installation>"
```

- The quotes keep a path with spaces in one word.

Link `lawman` to the plugin folder. `<install path>` is the field `install.installPath`.

```
ln -sfn "<install path>" "<installation>/lawman"
```

- `-f` replaces an old link. `-n` stops `ln` from following it (`man ln`).
- `openclaw plugins uninstall lawman` removes the plugin folder and leaves the link dangling (stated by the docs, https://docs.openclaw.ai/cli/plugins/uninstall-and-update.md; not verified).
- The folder name is the plugin id, so the link should survive an update. That it does is (not verified).

Check the install in this order.

```
test -f "<installation>/lawman/plugin.json"
git -C "<installation>/lawman" rev-parse HEAD
openclaw plugins list
```

- The first line proves that the link reaches the plugin.
- The second line prints the commit that the assembly records as `law_commit`. It fails when the copy has no `.git` folder. The version of the law then comes from the `law-version` step of the journal (not verified).
- The third line should list `lawman` as enabled. What it prints is (not verified).

The Lawman agent. One agent serves every role of the installation, and its workspace is the installation. A job cannot set its own working folder (read in the harness code, openclaw/src/cron/isolated-agent/run-workspace.ts). The assembly shows the lines and waits.

```
openclaw agents add <agent id> --workspace "<installation>" --non-interactive
openclaw agents list --json
```

- The first line creates the agent. It needs a name and a workspace (stated by the docs, https://docs.openclaw.ai/cli/agents.md; not verified).
- The second line lists the agents with their workspaces (read in the harness code, openclaw/src/commands/agents.commands.list.ts). The fields of the output are (not verified).
- The agent gets no list of skills. A list would replace the default set (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified).
- The harness puts the files of its start context into the workspace (stated by the docs, https://docs.openclaw.ai/gateway/config-agents/workspace-and-bootstrap.md; not verified). The files are `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md` and `BOOTSTRAP.md`. It does so when it makes the workspace and when it evaluates a script (read in the harness code, openclaw/src/cron/trigger-script.ts). The create line of "Scheduling" carries the light-context form, so these files do not enter a role's run.

Skill names are bare. A plugin skill of `lawman` is `patrol`, `court` and so on, with no plugin prefix (stated by the docs, https://docs.openclaw.ai/plugins/bundles.md; not verified). A same-named bundled, managed, agent or workspace skill overrides a plugin skill (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified). The installation holds no `skills/` folder.

Each run gets an `<available_skills>` block with the name, description and location of every eligible skill (read in the harness code, openclaw/src/skills/runtime/cron-snapshot.ts). The model reads a `SKILL.md` with the tool `read`. No flag binds a skill to a job (read in the harness code, openclaw/src/cli/cron-cli/register.cron-options.ts). A `$<skill name>` reference is not expanded in a cron run (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified). In a chat, the docs name `$<skill name>` and `/<skill name>` as the forms that run a skill (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified).

A disabled plugin loads no skills (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified). What a job then sees is (not verified). Treat a missing skill as a stop and enable the plugin.

The official TypeSafe skill is named `typesafe-ai`. Skills install from ClawHub with `openclaw skills` (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified). The route for `typesafe-ai` is (not verified).

The skill listing commands are `openclaw skills list` and `openclaw skills check` (stated by the docs, https://docs.openclaw.ai/tools/skills.md; not verified). Their output is (not verified).

## Syncing the law

The sync's steps are in `tick.md#sync-the-law` of `tick.md`. For how a scheduled run executes them, see "Isolation" and "Commands in scheduled runs".

- Update the plugin with `openclaw plugins update lawman`, after the gateway is stopped by its service owner, a person (stated by the docs, https://docs.openclaw.ai/cli/plugins/uninstall-and-update.md; not verified). The stop commands are `openclaw gateway stop` and `openclaw gateway start` (stated by the docs, https://docs.openclaw.ai/cli/gateway/service.md; not verified).
- No tick runs while the gateway is stopped. After the restart, overdue agent jobs are rescheduled and not replayed at once (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified).
- The update installs again from the recorded source. A branch ref moves. A tag or commit ref stays (read in the harness code, openclaw/src/plugins/update-attempt.ts).
- The update runs no `git pull`. A local edit in the installed folder is overwritten.
- A job holds a copy of its script. An update changes no stored script. A new script reaches a job only through `openclaw cron edit <job id> --trigger-script <script file>`.

## Running a role once

Jobs are addressed by id only (read in the harness code, openclaw/src/cron/service/jobs-scheduling.ts). Find the id with the list form under "Scheduling". Then force the run in a terminal.

```
openclaw cron run <job id> --wait
```

- `run` forces the payload and skips the entry script (read in the harness code, openclaw/src/cron/service/run-queue-execution.ts). The role runs `wake` itself as its first call, as "Role entry" says.
- Without `--wait` the command returns after the gateway queues the run, with `ok`, `enqueued` and a `runId`. The job may still wait for a slot (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `--wait` blocks until the run ends. It exits 0 only when the run succeeded. `--wait-timeout` and `--poll-interval` tune the wait (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `Ctrl-C` stops the wait and the run goes on in the gateway. Closing the terminal does not kill a queued run (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- A disabled job runs by hand and stays disabled (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- Read the result with `openclaw cron runs <job id> --run-id <run id>` (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- From an agent session, the tool `automations` starts a run with `action` set to `run` and `runMode` set to `force`. The default `runMode` is `due`, which honors the entry script (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). A run aimed at the requesting conversation starts after that turn ends (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified).
- The run is recorded like a scheduled one. `openclaw cron runs <job id>` lists it, and its output lands in the run history.
- A killed run leaves a tick open. The journal's `tick-hung` alarm reports it when a later tick of the role starts. The operator ends it with `bin/journal tick end <tick id> --outcome stopped-run-killed`. The tick id is the number in the alarm. Send one line that names the cause on stdin. Remove the run's tree as item 1 of the `tick.md#end-the-tick` section of `tick.md` says.

`openclaw agent exec` runs one embedded turn in the foreground and records no job (stated by the docs, https://docs.openclaw.ai/cli/agent.md; not verified). Use it only while developing a skill.

## Commands in scheduled runs

A scheduled run has no one to approve a command. The default mode of a gateway host is `full`: security `full` and ask `off`, so no prompt appears (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified).

- In `full` a scheduled `exec` runs with no check by command form. The search for dangerous forms in the exec sources found only checks of environment names (read in the harness code, openclaw/src/agents/bash-tools.exec-request-preparation.ts). `bash -c`, `python3 -c`, `rm -rf`, a redirect to a system path and a heredoc fed to a shell have no check. None of them was seen in a scheduled run (not verified).
- The modes `deny`, `allowlist`, `ask` and `auto` exist (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified). Under `allowlist`, `ask` and `auto` a heredoc and a command with an unresolved executable are rejected. A shell `-c` wrapper, `env` with assignments and a login-shell wrapper go to a human (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified).
- The setting `tools.exec.strictInlineEval` is off by default. On, it sends `python -c` and `node -e` to review even in `full` (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified).
- An approval card of a cron run reaches only connected approval clients, never a chat channel. With none connected, the request is denied at once and the run's error names the policy fix (stated by the docs, https://docs.openclaw.ai/tools/exec-approvals.md; not verified).
- A failed command comes back as a value with `status` set to `failed` and an `exitCode`. A denied command comes back as an error with the code `SYSTEM_RUN_DENIED` or `INVALID_REQUEST` (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). The exact text a model sees is (not verified).
- The shell is `bash` or `zsh`. `(set -o pipefail; …)` and a subshell are ordinary shell (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified).
- A command yields a handle after 10 seconds by default. It runs to the end in one call when the call sets `awaitResults` to true, or when the run has no `process` tool. A job with `--tools exec,read` has no `process` tool (read in the harness code, openclaw/src/agents/bash-tools.exec-run.ts).

In `full`, the default mode, no form is refused. Under `allowlist`, `ask` and `auto` such forms are refused or reviewed, as the list above says. The forms that a role sends start no shell or interpreter with `-c` or `-e`. They feed no heredoc to a shell or an interpreter and use no recursive delete.

## Sending to the catalog

none: this page gives no send form for the catalog check. The patrol then sends nothing and reports that the check did not run.

- No OpenClaw restriction on `curl` from `exec` was found in `full` mode (not verified).
- A form needs the body on standard input, through a heredoc or a pipe. That `exec` passes standard input to the command is (not verified).
- The reply of `curl` shows through the cap of a result. The cap cuts a longer reply in the middle (read in the harness code, openclaw/src/agents/embedded-agent-runner/tool-result-truncation.ts). The status line at the end survives only when the tail rule keeps the tail.
- Network filters apply only with the secret egress proxy or a sandbox. Sandboxing is off by default (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified).

## Sending to license sources

none: this page gives no send form. The assembly sends nothing to a source. The patrol finds the way to read one. Two things bound that way.

- The time limit of a command. On OpenClaw the default is 1800 seconds. A call may set its own `timeoutSeconds` (read in the harness code, openclaw/src/agents/exec-tool-timeout.ts). The scheduler bounds the whole turn at 60 minutes unless the job sets `--timeout-seconds` (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified).
- The forms of a command. In `full` mode no form is refused, as "Commands in scheduled runs" says. The command that reads a source starts no shell or interpreter with `-c` or `-e`. It feeds no heredoc to a shell or an interpreter and uses no recursive delete.

## Calling an expert

none: this page gives no form that calls an expert. The role goes on without the expert.

- The docs describe a nested call, `openclaw agent exec --message-file - --isolated --json`. It runs one embedded turn without a gateway, and `--message-file -` reads standard input (stated by the docs, https://docs.openclaw.ai/cli/agent.md; not verified). How it handles standard input, stored credentials under `--isolated` and the cap on its output is (not verified).
- The Gateway-backed `openclaw agent` cannot run from an agent's `exec` child. `OPENCLAW_SHELL=exec` blocks reporting back to another session (stated by the docs, https://docs.openclaw.ai/cli/agent.md; not verified).
- No flag matches `--ignore-rules`. `agent exec` injects `AGENTS.md` by default, and `--isolated` ignores the ambient config (stated by the docs, https://docs.openclaw.ai/cli/agent.md; not verified).

## Scheduling

Create one job per role. Every job starts paused, so the line carries `--disabled`:

```
openclaw cron add --name "[lawman] <role>" --cron "<cron expression>" --tz <time zone> \
  --agent <agent id> --session isolated --tools exec,read --model <model> \
  --trigger-script <script file> --light-context --disabled \
  --message "<tick prompt> Read the skill <role> with the read tool, then follow it." \
  --announce --channel <channel> --to <target>
```

- The flags `--name`, `--cron`, `--tz`, `--agent`, `--session`, `--tools`, `--model`, `--trigger-script`, `--message`, `--announce`, `--channel` and `--to` exist (read in the harness code, openclaw/src/cli/cron-cli/register.cron-options.ts). `--disabled` creates the job disabled (read in the harness code, openclaw/src/cli/cron-cli/register.cron-add.ts).
- `add` is also `create`. The command is `openclaw cron`, alias `openclaw automations` (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `--agent` picks the Lawman agent. Its workspace is the working folder of the run, as "Isolation" says.
- `--session isolated` starts a fresh session for each run (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `--tools exec,read` stores the list as the job's tool allow-list (read in the harness code, openclaw/src/cli/cron-cli/register.cron-add.ts). A run keeps the tools that the list names. It also keeps a tool the host forces, such as `message` for delivery (read in the harness code, openclaw/src/agents/embedded-agent-runner/run/attempt-tool-construction-plan.ts). A job created with no `--tools` stores `*` (read in the harness code, openclaw/src/cron/tools-allow.ts). That a role needs only `exec` and `read` is (not verified).
- `--trigger-script` names the role's entry. "Role entry" says what the file holds and how the assembly passes it.
- `--light-context` keeps the start context files out of the run. "Isolation" names them.
- `--message` carries the tick prompt. The words after it name the role's skill and tell the role to read it with the tool `read`.
- A message has no length limit in the schema. The operating system limits one command-line argument. That a tick prompt fits is (not verified).
- Mutations need the `operator.admin` right (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). That the assembly's own session holds it is (not verified).

Schedule forms:

- A five-field cron expression with `--cron`, such as `0 * * * *`, recurs until removed. A six-field one adds seconds.
- `--every <duration>` recurs at that interval.
- `--at <when>` fires once. A job with `--at` cannot carry an entry script (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/troubleshooting.md; not verified).
- A job with an entry script runs on `--cron` and `--every` schedules (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified).

Manage jobs with these commands:

| Action | Command |
| :-- | :-- |
| List | `openclaw cron list --all --json [--query <text>]` |
| Pause | `openclaw cron disable <id>` |
| Resume | `openclaw cron enable <id>` |
| Remove | `openclaw cron rm <id>` |
| Attempts | `openclaw cron runs <id> [--run-id <run id>]` |
| Run now | `openclaw cron run <id> [--wait]` |
| Edit | `openclaw cron edit <id> ...` |
| Status | `openclaw cron status` |

The commands exist (read in the harness code, openclaw/src/cli/cron-cli/register.cron-simple.ts and openclaw/src/cli/cron-cli/register.cron-add.ts). Jobs are addressed by id. The list also shows the developer's other jobs. Touch only the jobs named after Lawman roles.

The list hides disabled jobs without `--all` (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). Every job of Lawman is created disabled, so every list form carries `--all`. A role's job name starts with `[lawman] `. `--json` prints the list for a program to read. Its fields are (not verified).

To find the installation, take the agent of the first job named `[lawman] <role>`. Then read that agent's workspace from `openclaw agents list --json` (read in the harness code, openclaw/src/cli/cron-cli/shared.ts and openclaw/src/commands/agents.commands.list.ts). The workspace is the installation. No agent, or an agent with no workspace, means there is no installation.

There is no output folder. The result of each run lies in the run history, which `openclaw cron runs` reads (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified).

### Editing a job

`openclaw cron edit <job id>` changes one job with the flags of `add`. `--trigger-script <script file>` replaces the script. `--clear-trigger`, `--clear-model`, `--clear-fallbacks`, `--clear-thinking`, `--clear-tools` and `--clear-agent` clear one field. A set flag and its clear flag together are refused (read in the harness code, openclaw/src/cli/cron-cli/register.cron-edit.ts). `--enable` and `--disable` exist.

`openclaw cron show <job id> --json` prints one job, with the field `trigger.script` holding the stored script (read in the harness code, openclaw/src/cli/cron-cli/register.cron-simple.ts, openclaw/src/cron/job-read-view.ts, openclaw/src/cron/public-job.ts and openclaw/packages/gateway-protocol/src/schema/cron.ts). A job with a `trigger.script` has an entry. A job without one has none. The live output is (not verified).

none: OpenClaw has one kind of entry. No job holds a monitor, so there is nothing to translate. The assembly skips that step.

### Schedule forms and time zone

A cron expression uses the gateway host's time zone unless `--tz <time zone>` is given (read in the harness code, openclaw/src/cli/cron-cli/register.cron-options.ts). The assembly always passes `--tz`. A time with no offset after `--at` is UTC unless `--tz` is given (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). No command that reads the host's time zone was found (not verified).

A schedule names a concrete hour. The scheduler spreads top-of-hour expressions by up to 5 minutes, and `--exact` turns that off (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified). The assembly passes no `--exact`. The spread does not touch a schedule with a concrete hour (read in the harness code, openclaw/src/cron/stagger.ts).

Day of month and day of week combine with OR. A schedule that names both fires on either (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified).

### Models

A job takes `--model <provider/model>` or an alias. A model that is not allowed or cannot be resolved fails the run with a validation error. OpenClaw substitutes no other model (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). Check names with `openclaw models list [--agent <id>] [--provider <id>] [--json]` (stated by the docs, https://docs.openclaw.ai/cli/models.md; not verified). That `cron add` rejects an unknown name at creation is (not verified).

- At run time the job's `--model` wins over the agent's model and the default (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `--fallbacks ""` makes the run strict. A job with `--model` and no fallback list gets an empty fallback list (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `--thinking <level>` sets the reasoning level. `--help` lists the levels (read in the harness code, openclaw/src/cli/cron-cli/register.cron-options.ts).
- The list shows the agent and the model of each job (read in the harness code, openclaw/src/cli/cron-cli/shared.ts). That the `--json` list holds a model field is (not verified).
- A model needs a context window of at least 200 000 tokens. The assembly says so when it offers models, and it rejects no model. "Role entry" gives the cause.

### Paused jobs

`--disabled` on create. Resume a paused job with:

```
openclaw cron enable <job id>
```

- A manual run of a disabled job works and does not enable it (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- A job that failures disabled needs `enable` too. Enabling resets its failure counters (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/managing-jobs.md; not verified).
- The first run after `enable` of a job created paused is (not verified). It may run at once or wait for the next slot.

### Role entry

This section describes the role entry. The assembly reads it by the name `Role entry`.

The role entry is the trigger script of the job. It is JavaScript that runs `bin/journal wake --role <role>` before the model turn. Every role has one, the duty desk included. The duty desk always has work, so its output is never empty.

The assembly replaces `<role>` and passes the text to the job. The script below is the whole entry.

```javascript
const response = await exec({
  command: "bin/journal wake --role <role>",
  awaitResults: true,
});
if (response.status !== "completed" || response.exitCode !== 0) {
  throw new Error(
    "lawman <role>: wake did not finish, status " +
      response.status +
      ", exit code " +
      response.exitCode,
  );
}
if (typeof response.aggregated !== "string") {
  throw new Error("lawman <role>: wake returned no output");
}
if (response.aggregated.trim() === "") return { fire: false };
return { fire: true, message: response.aggregated };
```

How the entry works:

- The script returns `{ fire, message }`. `fire: false` runs no model turn and writes no run record. `fire: true` runs the turn, and `message` joins the job's message (read in the harness code, openclaw/src/cron/trigger-script-result.ts and openclaw/src/cron/service/timer-execution.ts).
- The answer holds `status`, `exitCode` and `aggregated` (read in the harness code, openclaw/src/agents/bash-tools.exec-result.types.ts).
- The working folder of the script is the workspace of the Lawman agent, which is the installation (read in the harness code, openclaw/src/cron/trigger-script.ts). So `bin/journal` resolves. That `exec` from a script behaves so is (not verified). So is what it returns for a command that runs past the 10-second yield.
- The assembly writes the script into a file in `runs/` of the installation. It passes the file to `--trigger-script` and removes the file. `--trigger-script -` reads the script from standard input, but the assembly uses a file. The CLI reads at most 65 536 bytes of UTF-8. It stores the text in the job (read in the harness code, openclaw/src/cli/cron-cli/trigger-options.ts, openclaw/src/cli/cron-cli/register.cron-add.ts and openclaw/src/cli/cron-cli/register.cron-edit.ts).
- The job keeps a copy of the text in `trigger.script`. Editing the file later changes nothing (read in the harness code, openclaw/src/cli/cron-cli/register.cron-add.ts and openclaw/src/cli/cron-cli/register.cron-edit.ts). Run `openclaw cron edit <job id> --trigger-script <script file>` again.
- Without work the journal prints nothing, and the script returns `fire: false`. The turn and the delivery are skipped.
- With work the journal prints the first part of the role's input. The output is appended to the job's message after a blank line, as raw text. No fence is added and no secret masking or injection scan runs on it (read in the harness code, openclaw/src/cron/stream-schedule.ts and openclaw/src/cron/run-prompt.ts). Every line of the law in the input starts with `| `. That prefix is the only guard against the model taking those lines as instructions.
- The script bounds are 30 seconds of wall time, 5 tool calls and 3 evaluations at once. A fourth evaluation is deferred, not failed (read in the harness code, openclaw/src/cron/trigger-script.ts).
- A schedule with a script has a minimum interval of 30 seconds (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified).
- A script runs with the job's tool policy, `exec` included. The setting `cron.triggers.enabled: false` removes triggers (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified).
- A forced run skips the script (read in the harness code, openclaw/src/cron/service/run-queue-execution.ts). The role then runs `bin/journal wake --role <role>` itself as its first call. That is the fallback.
- Creating a job and a forced run do not evaluate the script, so its first run is the first scheduled slot. A failure shows in the run history with the status `error`. (read in the harness code, openclaw/src/cron/service/run-queue-execution.ts for the forced run; stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified).
- A run with `--due` checks the script only for a job that is due (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). The script's environment is checked by such a run and by the live run.

**The failure of the entry.** The script throws when the command does not finish with status `completed` and code 0. The throw is an error, not a quiet skip.

- The role does not start. The run is recorded with the status `error` and the text "cron trigger evaluation failed" (read in the harness code, openclaw/src/cron/service/timer-execution.ts).
- Each error adds to a count of consecutive errors. The retry backoff is 30 seconds, 1 minute, 5 minutes, 15 minutes and 60 minutes (read in the harness code, openclaw/src/cron/service/jobs-scheduling.ts).
- An alert goes out after 2 consecutive failures, with a cooldown of one hour. It goes only when the job has a failure route or an announce route (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/delivery.md; not verified). Tell the user to set a failure route.
- A recurring job is disabled after 10 consecutive failures. Re-enable it with `openclaw cron enable <job id>` (read in the harness code, openclaw/src/cron/service/auto-disable.ts). The conditions of the alert and the disable are (not verified).
- A script that outlives 30 seconds fails the same way, so a slow journal ends in an error.
- No fallback exists for a failure by schedule. The failure is loud. The fallback is a manual run, or a job with no entry script.
- Output whose first line is not `lawman input` still starts the turn. The script reads no line. The role then does the section `tick.md#sync-the-law-with-an-older-journal` of `tick.md`.

**The size of a part.** The model sees at most one cap of characters per tool result. Weighted characters count: each CJK character weighs 4, and the list of heavy characters is open (read in the harness code, openclaw/src/agents/tool-result-limits.ts and openclaw/packages/normalization-core/src/cjk-chars.ts). Cyrillic and Latin weigh 1.

The cap is the smaller of two numbers: 4 times 30 % of the window in tokens, and a ceiling. The ceiling is 16 000 below a window of 100 000 tokens. It is 32 000 from 100 000 and 64 000 from 200 000 (read in the harness code, openclaw/src/agents/tool-result-limits.ts). A part of 15 000 characters with two lines of frame, about 130 characters, fits the 64 000 cap even at weight 4. So the safe size of a part is 15 000, with a model window of at least 200 000 tokens:

```
input_chars: 15000
```

- Below a window of 200 000 tokens a part of plain text still fits down to a window of 13 334 tokens. A part of CJK text is cut. A window of 8 000 tokens cuts even plain text (read in the harness code, openclaw/src/agents/tool-result-limits.ts).
- The cap does not apply to `message`, which is part of the prompt. The window bounds it (read in the harness code, openclaw/src/cron/run-prompt.ts).
- A result over the cap keeps its head. The tail stays only when the last characters match words such as error, summary or done, or end in `}`. The middle goes. The notice reads `[... N more characters truncated; rerun with narrower args if needed]` (read in the harness code, openclaw/src/agents/embedded-agent-runner/tool-result-truncation.ts and openclaw/src/agents/embedded-agent-runner/context-truncation-notice.ts). The cut text is gone from the model's view. The cap on the chosen model and the notice after a cut of a real part are (not verified).
- All results of one prompt add up to at most a limit. The limit is the larger of 4 caps and the window in tokens × 4 × 0.5 characters. That is 400 000 characters at 200 000 tokens. OpenClaw replaces older results with `[tool result elided: aggregate tool-result budget exceeded; rerun the command if the output is needed]` (read in the harness code, openclaw/src/agents/embedded-agent-runner/tool-result-truncation.ts). A role that lost a part asks the journal for it again. So take one part per call. Whether the elision hits earlier parts of one tick, and the marker the model then sees, is (not verified).
- The setting `agents.defaults.contextPruning.mode: "cache-ttl"` trims old results after a time. It is off by default for providers other than Anthropic (stated by the docs, https://docs.openclaw.ai/concepts/session-pruning.md; not verified). Whether it acts inside one tick is (not verified).
- Exec keeps at most 200 000 characters of a command's output (read in the harness code, openclaw/src/agents/bash-tools.exec-runtime.ts). The size of 15 000 stays far below that.
- With the code mode engaged, the model reaches `exec` through a cell whose output is capped at 64 KiB. A part of 15 000 characters passes both ways (read in the harness code, openclaw/src/agents/code-mode-runtime.ts).
- A role's input comes in 4 to 6 parts at this size, and the duty desk's in 2.

**Reading `SKILL.md`.** No binding loads a skill into the run. The role reads its skill with `read`, a page at a time. The `read` tool takes an offset and a limit. It cuts a page by bytes and by the cap of a result. It adds a note such as `Use offset=N to continue` or `Use offset=N, cursor=K to continue` (read in the harness code, openclaw/src/agents/agent-tools.read.ts and openclaw/src/agents/sessions/tools/read-page.ts). The skills of `court` and `patrol` are each over 16 000 characters, so the role reads each of them in several pages. Whether `skills.read` of the code mode pages the same way is (not verified). The docs describe the call (stated by the docs, https://docs.openclaw.ai/tools/code-mode/guest-api.md; not verified).

No rule withholds the job's identity or tokens from the script. It holds the job's tools, and with `exec` it has the same environment as any `exec` (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified).

### Order and overlap

Same-minute jobs run in parallel. They share the lanes `cron` and `cron-nested` (stated by the docs, https://docs.openclaw.ai/concepts/queue.md; not verified). The lane widths are (not verified). At most 3 entry scripts run at once (read in the harness code, openclaw/src/cron/trigger-script.ts). A role beyond that waits for its slot. The visible effect with many roles due in one minute is (not verified).

A running job is tracked so the scheduler avoids a duplicate run (read in the harness code, openclaw/src/cron/active-jobs.ts). Whether a slot that arrives during a run is skipped or deferred is (not verified). The CLI has no chaining, so order comes from the clock.

### Catch-up

After a restart of the gateway, overdue agent jobs are rescheduled and not replayed at once (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified). The setting `cron.skipMissedJobs: true` skips missed slots of recurring jobs. Its default is `false` (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/managing-jobs.md; not verified).

A quiet evaluation counts as a completed occurrence for the catch-up (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/schedules.md; not verified). Whether several missed slots run once or several times is (not verified).

### Silence

A tick with nothing to deliver answers `NO_REPLY` in capitals, alone on its own line, as the whole reply. OpenClaw then delivers nothing (read in the harness code, openclaw/src/agents/agent-run-terminal-reply.ts).

A token mixed with text never silences the text. OpenClaw strips a leading or trailing token line and delivers the rest (read in the harness code, openclaw/src/auto-reply/reply/mixed-silent-reply-tokens.ts). So the skills answer the token alone.

OpenClaw already injects the explanation of `NO_REPLY` into every cron prompt (read in the harness code, openclaw/src/cron/run-prompt.ts). Skills do not repeat the explanation.

### Delivery targets

`--announce` delivers the final reply of the job to a chat. It is the default for an isolated job. These flags set the target:

- `--channel <channel>` names the channel. Its default is `last`. With several channels on the host `--channel` is required, unless a `--to` with a provider prefix selects the channel.
- `--to <target>` names the chat or the person. `--thread-id` and `--account` refine it.
- `--delivery-target owner` delivers to the owner of the host. It cannot combine with `--to`, `--thread-id` or `--webhook`.
- `--webhook <url>` posts the result to an address.
- `--no-deliver` ends the automatic delivery and keeps the result in the run history. A `message` tool stays available when a chat route exists.

The flags exist (read in the harness code, openclaw/src/cli/cron-cli/register.cron-options.ts). The delivery modes are `announce`, `webhook` and `none` (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/delivery.md; not verified).

- A delivery target that only writes files does not exist. `--no-deliver` is the nearest form.
- The values `all` and a comma list do not exist.
- A job without a route takes a default destination: `cron.creators.<profile>.delivery`, then `cron.agents.<agent>.delivery`, then `cron.delivery` (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/delivery.md; not verified).
- A failure route comes from `cron.failureAlert` or the `failureAlert` of the job (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/delivery.md; not verified).

A role cannot see whether a message arrived. The destination channel confirms a delivery, and the scheduler records it. The operator reads `deliveryStatus` in the run record (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).

The sources disagree on the token. One page says capitals only and says a token after a report is visible text. Another says case does not matter and a trailing token is removed (stated by the docs, https://docs.openclaw.ai/cli/cron.md and https://docs.openclaw.ai/concepts/messages.md; not verified). The code ignores case (read in the harness code, openclaw/src/auto-reply/tokens.ts). Capitals alone are safe under both. The sources also disagree on an empty final reply as silence (stated by the docs, https://docs.openclaw.ai/concepts/messages.md and https://docs.openclaw.ai/automation/cron-jobs/managing-jobs.md; not verified). Whether `NO_REPLY` alone gives silence on the chosen channel is (not verified).

### One-off run

A one-off run is a job that is created, run once, read and removed. It serves two uses: the proof of a command in the environment of a tick, and the check of the delivery. Both follow the same order.

1. Create the job under the Lawman agent. The agent exists first. The create line is below. The job id is in its output, in a form that is (not verified).
2. Run it with `openclaw cron run <job id> --wait`. It exits 0 only when the run succeeded.
3. Read the result. "Proof of a command" and "Check of the delivery" say where.
4. Remove the job with `openclaw cron rm <job id>`. A one-shot job that succeeded deletes itself. A failed one stays, disabled (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified). So remove it on every outcome.

Rules for every one-off job:

- The name never starts with `[lawman] `. The assembly finds the installation by the first job with that prefix.
- `--at <duration>` makes a job that fires once. It is meant to run by the `run` call before that.
- The job runs a model, so each run is paid. `--model` picks the model.
- No scan runs on the message of an ordinary job (read in the harness code, openclaw/src/cron/run-prompt.ts).
- The proof waits until the Lawman agent exists. With no agent the assembly waits for the user and creates no job. It creates every proof job before any job of a role.

#### Proof of a command

The environment of a tick is the `exec` tool of an isolated agent turn. A one-off agent-turn job reaches it the same way a scheduled job does (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/payloads.md; not verified). A command payload does not. `--command` runs through `sh -lc` in the gateway process and not through the agent's `exec`.

What runs in it is one command, or a few, that the prompt gives word for word. Each command runs the journal on the throwaway database and writes no output file of its own. The assembly reads the record of the run.

```
openclaw cron add --at 24h --name "lawman-proof-<n>" --agent <agent id> \
  --session isolated --tools exec --light-context --no-deliver \
  --message "<proof prompt>"
```

`<n>` is the number of the proof job in the pass, in three digits from `001`, so no name of the pass contains another.

The proof prompt gives the command and the answer. Replace the placeholders. `<base>` is the folder of the throwaway database. One line stands for each command.

```
Run this command once with the exec tool, exactly as written, and answer NO_REPLY alone: LAWMAN_DB='<base>/journal.sqlite' bin/journal <journal command>
```

Read the result after the run:

```
openclaw sessions export-trajectory --session-key <session key> --json
```

- The command writes a bundle under `.openclaw/trajectory-exports/` in the agent's workspace (stated by the docs, https://docs.openclaw.ai/tools/trajectory.md; not verified). The bundle holds the prompt, the tool calls and the tool results. The bundle is redacted. The command is an owner command.
- The session key of a cron run has the form `<agent key prefix>cron:<job id>:run:<session id>` (read in the harness code, openclaw/src/cron/isolated-agent/run-prepare.ts). `openclaw cron runs <job id> --run-id <run id> --json` is expected to carry the session id and key. That it does is (not verified).
- `openclaw sessions tail` hides the bodies of tool results, so it does not serve (stated by the docs, https://docs.openclaw.ai/cli/sessions.md; not verified).
- Take the tool result of the `exec` call that holds the command. `aggregated` is what the journal printed, and `exitCode` is its exit code. "Prove a command" in `references/commands.md` of the assembly judges that output.
- A run with no `exec` call that holds the command is no proof. Under an approval mode a refused command carries a denial code (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- `--no-deliver` keeps the output in the run history and sends nothing to a chat.
- `LAWMAN_DB` points the journal at the throwaway database. The agent's workspace is the installation, so `bin/journal` resolves as in a tick.
- The answer `NO_REPLY` alone is the harness's silence form (see "Silence").
- The export writes into the installation. Remove the bundle with the job.

#### Check of the delivery

The check uses two jobs with no entry script and no skill. Both go to the route the user chose. `<channel>` and `<target>` are that route (see "Delivery targets").

The alarm branch sends a line in the shape of an alarm. It states that it is a check and not an alarm:

```
openclaw cron add --at 24h --name "lawman-delivery-alarm" --session isolated --tools "" \
  --message "Answer with exactly this line and nothing else: ALARM delivery-check This is a delivery check, not an alarm." \
  --announce --channel <channel> --to <target>
```

The quiet branch answers the silence form, so nothing arrives:

```
openclaw cron add --at 24h --name "lawman-delivery-quiet" --session isolated --tools "" \
  --message "Answer with exactly NO_REPLY and nothing else." \
  --announce --channel <channel> --to <target>
```

- Run each job with `openclaw cron run <job id> --wait`.
- Read each result with `openclaw cron runs <job id> --run-id <run id> --json`. A delivered alarm shows a delivery status. The quiet job reads `ok (suppressed)` with the reason `silent`. A failed delivery reads `ok (not delivered)`, and `--delivery-status not-delivered` filters the list (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- The scheduler records only the confirmation of the channel. Arrival is not visible to a role or to the assembly. The user confirms it (see "Delivery targets").

### Run records

A scheduled run leaves two records. The run history holds each attempt. The session store holds every turn. Read the store only with the harness's own commands. Never open its file.

- `openclaw cron runs <job id>` lists the attempts of a job. It takes `--limit`, `--offset`, `--sort asc`, `--status error`, `--delivery-status`, `--query`, `--json` and `--run-id`. `openclaw cron runs --all` spans all jobs (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- The run history keeps a summary and diagnostics, not the bodies of tool results (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified).
- The transcript lives in the agent's store. Read it through `openclaw sessions list`, `openclaw sessions tail` and `openclaw sessions export-trajectory` (stated by the docs, https://docs.openclaw.ai/cli/sessions.md; not verified).
- A cron session is labelled `Automation: <job name>`. Its key has the form `cron:<job id>:run:<session id>` after the agent's prefix (read in the harness code, openclaw/src/cron/isolated-agent/run-prepare.ts).
- `sessions tail` prints tool arguments with no secret masking (stated by the docs, https://docs.openclaw.ai/cli/sessions.md; not verified). Never put a key in the text of a command.
- Filtering sessions by a time window is (not verified).
- A cap applies before storage, so a stored tool result is already cut (read in the harness code, openclaw/src/agents/session-tool-result-guard-wrapper.ts).

Not established: whether a scheduled session finds `openclaw`, `jq` and `gh` on its `PATH`. Also not established: whether its `exec` sees the session id. The journal stores no session id. A tick is matched to its session by the run record.

## Isolation

The working folder of every job is the installation. It is never a precinct clone. The folder comes from the agent's workspace, and the prompt cannot set it (read in the harness code, openclaw/src/cron/isolated-agent/run-workspace.ts). A call of `exec` may pass `workdir`. A relative `workdir` starts at the workspace, and `~` is not expanded (stated by the docs, https://docs.openclaw.ai/tools/exec.md; not verified).

The harness injects the files of the workspace into the system prompt, where they exist (stated by the docs, https://docs.openclaw.ai/gateway/config-agents/workspace-and-bootstrap.md; not verified). The files are `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md` and `BOOTSTRAP.md`. They are the installation's files, never a precinct's. Roles reach a precinct by path, through the journal's commands, and never by changing directory into it.

- `--light-context` keeps the start context empty for the run. It applies to isolated agent-turn jobs only (stated by the docs, https://docs.openclaw.ai/cli/cron.md; not verified). The code drops these files from the run (read in the harness code, openclaw/src/cron/isolated-agent/run-prompt-executor.ts and openclaw/src/agents/bootstrap-files.ts).
- `agents.defaults.contextInjection: "never"` stops the injection for the whole agent (stated by the docs, https://docs.openclaw.ai/gateway/config-agents/workspace-and-bootstrap.md; not verified).
- Creating a workspace in a brand-new empty folder runs `git init` when git is installed (read in the harness code, openclaw/src/agents/workspace-git.ts). The installation is not new when the agent is created.

none: OpenClaw has no bare mode for a stored job. `--light-context` and `contextInjection` are the closest. Isolation rests on the working folder and the light context.

A run's tool set is the job's `--tools`. `--tools exec,read` shrinks the surface to `exec` and `read` (see "Scheduling"). That a role needs only these two is (not verified).

The run prompt tells the agent that it may remove its own job. A run with that grant lists, reads the history of and removes only its own job (read in the harness code, openclaw/src/cron/run-prompt.ts). Whether a scheduled turn can create a job is (not verified).

## Budget and token

### Turns

No cap on the model turns of a run was found. Tool-loop detection exists and is off by default (stated by the docs, https://docs.openclaw.ai/gateway/config-tools/built-in-tools.md; not verified). The runtime budget of a run is `--timeout-seconds` when the job sets it, or else the scheduler's 60-minute watchdog for isolated agent turns. The budget of one model attempt is `agents.defaults.timeoutSeconds`, 48 hours by default (stated by the docs, https://docs.openclaw.ai/automation/cron-jobs/how-it-works.md; not verified). `--timeout-seconds 0` turns the scheduler timeout off (read in the harness code, openclaw/src/cli/cron-cli/register.cron-options.ts).

### Money

The model is chosen per job with `--model`. Each role has its own model. The cron docs state no spend cap in money. Only the model choice, the failure backoff and the minimum interval of 30 seconds limit spend.

### The token

The `gh` of an `exec` call takes its identity from `GH_TOKEN` or `GITHUB_TOKEN` in the gateway's environment. Next it tries the keyring or config of the gateway's user (stated by the docs, https://docs.openclaw.ai/gateway/config-tools/github-identity.md; not verified). `exec` gets the two variables back through the native-identity exception (read in the harness code, openclaw/src/agents/bash-tools.exec-request-preparation.ts). Setting `tools.github` replaces this with a managed identity (read in the harness code, openclaw/src/agents/github-tool-identity.ts).

All roles share the gateway process, so one identity serves all. Whether a gateway started as a system service reaches the keychain login is (not verified).

### The TypeSafe key

The key may live in any place that a scheduled session can read. The assembly records that place in `typesafe_key` of `config.yaml`.

Any variable name that is not on a blocked list passes from the gateway's environment into `exec`. The global `~/.openclaw/.env` file is read at start, without overriding existing values. A secret-store `env` entry also reaches `exec` on the next run (stated by the docs, https://docs.openclaw.ai/help/environment.md and https://docs.openclaw.ai/tools/exec.md; not verified). A workspace `.env` cannot supply provider credentials. The key's name must not clash with the gateway's credential names (read in the harness code, openclaw/src/infra/host-env-security.ts).

Hand the key to a request on standard input, or through a process substitution that feeds a header. Never put the key in the text of a command. The transcript keeps tool arguments, and `sessions tail` prints them unmasked.

## Asking the developer

The question tool is `ask_user` (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md; not verified).

- A call holds 1 to 3 questions (read in the harness code, openclaw/src/agents/tools/ask-user-tool-normalization.ts).
- A question holds 2 to 4 options. A label is at most 64 characters, and a header is cut to 12 characters (read in the harness code, openclaw/src/agents/tools/ask-user-tool-normalization.ts).
- A question can take several choices. Every answer is an array (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md; not verified).
- The tool adds its own free-text row, "Other". The assembly adds none (read in the harness code, openclaw/src/agents/tools/ask-user-tool-normalization.ts).
- The wait is 900 seconds by default (read in the harness code, openclaw/src/agents/tools/ask-user-tool-normalization.ts).
- The tool exists in a primary session on a surface with question input. On a surface without it, such as iMessage or WhatsApp, the assembly asks in plain text (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md; not verified).
- Secrets never go through `ask_user`. The `secrets` tool takes them (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md; not verified).

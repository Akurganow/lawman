# Roles

This reference sets up the scheduled job of each role. It teaches first and asks after. Install runs it for all roles. The roles mode runs it for the roles without a job. The menu job of `SKILL.md` runs it for the roles the developer picks.

## Terms

- `<scope>`: the roles this run sets up. Install: every folder `lawman/skills/*/` other than `assembly` and `lawman-law`. Roles mode: the roles without a job `[lawman] <role>` in the scheduler's list. Menu job: the roles the developer picked.
- `<role skill name>`: the role's folder name, written in the form that the harness page gives under "Installing the plugin".
- New job: a role in `<scope>` without a job. The run creates it.
- Edit: a role in `<scope>` with a job. Only the menu job has these. The run edits the job.
- `<S>`: the start time of the duty desk, in the harness's time zone.
- `<scripts directory>`: the directory for gate files. Derive it with the command that the harness page names under "Run gate".

## Rules

- Each question states what it decides, why it matters and who uses the answer, in the form "Decides: X. Why: Y. Used by: Z."
- Steps 2, 3 and 7 teach and ask nothing.
- Take every harness command, flag and fact from the harness page. Never guess one. Name no harness and no vendor.
- Read the page by subsection name under its scheduling section. The names are "Editing a job", "Schedule forms and time zone", "Models", "Paused jobs", "Run gate" and "Order and overlap".
- Skip the effort level when the page names none.
- When the page names no run gate, drop steps 12 and 14, every gate flag, and the gate sentences of steps 1 and 7.
- Run each command as this reference writes it. Never start a shell or an interpreter with `-c`. Never feed a heredoc to a shell. Scheduled runs refuse those forms.
- Create and edit jobs in this interactive session only, because scheduled sessions cannot do it.
- The tiers, the plans, the clock order and the gate recommendation are advice. The developer may override each one.
- Tell the quoted texts in the developer's language when it is not English. Keep every fact.

Before step 1, stop if "Schedule forms and time zone" names no schedule form, and tell the developer the page lacks one.

## Step 1. Preview

1. Say: "This setup has four parts: roles and models, the schedule, the run gate and the jobs. I explain each part before I ask about it."
2. In the menu job, run steps 2, 3 and 7 only when the developer asked for them at the menu. Skip them otherwise.

## Step 2. Explain the roles

1. Say: "The tiers are advice. No comparison between models is measured yet."
2. Show the guide:

| Role | What it solves | Tier | Why |
| :-- | :-- | :-- | :-- |
| Duty desk | Syncs the trackers and writes at most one order per role | light | A fixed chain of journal commands. It analyses nothing. |
| Response unit | Turns one issue a person wrote into a lead, a question or an out | medium | Classifies one issue and writes to people. |
| Patrol | Sweeps one department of one repository and files at most the cap | medium | Cheap and broad by design. Raise the tier when false leads are many. |
| Investigation | Tests one lead against the code, facts only | medium | Long reading with a structured result that the prosecutor attacks. |
| Prosecutor | Charges, returns or declines the case | strong | Adversarial judgement. |
| Defender | Defends, returns or refutes the charge | strong | Argues the other side. |
| Court | Convicts with a priority or acquits | strong | Rules once. Doubt means acquittal. |
| Clerk | Does the one job the journal names | light | Bookkeeping with git and GitHub. |
| Spec writer | Writes one spec on a pull request for your vote | medium | Reasoned design text that a person reads. |
| Executor | Writes the code of an approved spec and passes CI | strong | Writes code and waits for CI in its run. |

## Step 3. Explain models

1. Run the read command that "Models" gives for the current model, and show its result.
2. Run the read commands that "Models" gives for the default model and provider of scheduled jobs. Show each one that prints a value. An empty output means the value is unset.
3. State these facts of "Models", as the page gives them:
    - Whether a command lists models.
    - How a name is written, and that the harness stores it unchecked.
    - That the provider is a separate flag.
    - How a job resolves its model at run time.
4. State that a job with its own model leaves the fallback chain when "Models" says so. State that `default` keeps the chain.
5. Run the command that "Models" names for the effort levels, and show them.
6. In the menu job, state that the job list shows no model when "Editing a job" says so. The current model of a job is then unknown.
7. When "Models" names no read command, say so, and ask names only in steps 4 and 5: no provider and no effort.
8. Never run an internal function of the harness to list models.

## Step 4. Tier models

For each tier that has a role in `<scope>`, in the order light, medium, strong:

1. Say the sentence of the tier:

| Tier | Say |
| :-- | :-- |
| light | "The duty desk and the clerk run fixed commands that the journal names. They judge nothing." |
| medium | "The response unit, investigation, spec writer and patrol read and write long structured texts. A later stage checks them, or a person votes on them. If patrol files many false leads, raise its tier." |
| strong | "The prosecutor, defender, court and executor decide what is charged, ruled or built." |

2. Ask for the model of the roles that the Tier column of the guide gives for that tier, in `<scope>`. Decides: the model of those jobs. Why: the model sets the quality and the cost of every run. Used by: the scheduled session of each of those roles.
3. Ask for one answer for the whole tier: `default`, or a model name with an optional provider and an optional effort level. In the menu job, also accept `keep`.
4. State what the answer does. On a new job, `default` omits the model, provider and effort flags, so the job follows the harness defaults. On an edit, `keep` omits the flags and leaves the job as it is. On an edit, `default` passes the page's clear form for each flag and removes the pin.
5. Record the answer for each role of the tier.

## Step 5. Change any role?

1. Decides: whether one role gets its own model. Why: each role is its own job. Used by: that role's scheduled session.
2. Ask "Change any role?" The answer names one role with its model, provider and effort, or `default`, or `keep` in the menu job. Or the answer is `no`.
3. Apply the answer to that one role.
4. Ask again until the answer is `no`.

## Step 6. Model check

1. List the distinct pairs of model and provider in the answers. Ignore `default` and `keep`.
2. Skip the rest of this step when there is no pair.
3. State the count `N` and that `N` short paid runs follow, one per pair.
4. Decides: whether the names are tested now. Why: a wrong name fails a scheduled run later. Used by: the jobs that carry those names.
5. Ask once: "Check these N models with one short run each? The reply stays local." On no, go to step 7.
6. For each pair, create one one-shot job in the form the page gives. Give it no skill, `--workdir` set to `<installation>`, the local delivery target the page names, the pair's model and provider, and the prompt `Reply with one line: Lawman model check.`
7. Wait for the run to finish, and read its attempt with the attempts command the page gives. Show the result.
8. Remove the job with the remove command the page gives.
9. When a check fails, go back to the question that named the model. That is the tier's question, or the role's answer in step 5 for an override. The developer may keep the failed name.
10. Remove any model-check job before this setup ends or stops.

## Step 7. Explain the schedule

1. Run the time zone read command from "Schedule forms and time zone", and show the zone.
2. Tell the developer:

> Lawman works in waves. A wave starts with the duty desk. It reads every repository that has a weight above zero and finds what each role should do next. It writes at most one order per role. Then each role starts on its own clock. It takes its order, does the work, leaves the result on GitHub and exits. Roles never wait for each other.
>
> A role sees only orders the duty desk already wrote. So a case moves one stage per duty desk run. Patrol files a lead. The next run orders the investigation. The run after that orders the prosecutor. A case that nobody returns passes eight stages: patrol, investigation, prosecutor, defender, court, clerk, spec writer and executor. That takes eight duty desk runs. Two steps wait for you: the vote on the spec and the review of the pull request.
>
> The duty desk runs first. A role that starts before it finishes takes its order at its next run. After the duty desk, the clock order of the roles does not make a case faster. It decides who spends your model budget first if the budget runs out. The late stages run first, because they finish cases already started. Patrol runs last, because it starts new ones.
>
> How often a role runs is how many cases it takes: one per run. A role that runs weekly takes one case a week. An order may wait for its role. If you close the issue meanwhile, most roles end that run as stale. A run with no order still costs a short session. The run gate removes that cost.
>
> Lawman warns you when an order waits too long, and when a role stops running. Those limits follow the schedule you choose.

3. Add the facts of the harness page. Give the time zone from item 1 and the schedule forms of "Schedule forms and time zone". Give the overlap of same-minute jobs from "Order and overlap". Give the catch-up rule of the page's catch-up section.

## Step 8. Plan

1. Decides: how often each role runs. Why: a role runs once per run for one case, so the frequency sets the speed and the cost. Used by: the jobs and the alarm limits.
2. Show the three plans: every day, economy and custom. The table gives the first two.

| Role | Every day | Economy |
| :-- | :-- | :-- |
| Duty desk | daily | daily |
| Response unit | daily | daily |
| Patrol | daily | daily |
| Investigation | daily | Monday and Thursday |
| Prosecutor | daily | Monday |
| Defender | daily | Tuesday |
| Court | daily | Wednesday |
| Clerk | daily | daily |
| Spec writer | daily | Friday |
| Executor | daily | Monday |

3. Tell the developer about the economy plan:

> The weekly roles run on successive weekdays in stage order, and Thursday stays free for the clerk. A case charged on Monday is ruled on Wednesday. The clerk opens its pull request on Thursday, and the spec follows on Friday. The executor runs on Monday, after your vote. Each weekly role takes one case a week, so a queue grows when the stage before it delivers more.

4. Tell the developer that Custom asks for a form per role in step 10.
5. Ask which plan: every day, economy or custom. In the menu job, also accept `keep`, which leaves every schedule as it is.

## Step 9. Start time

1. Show the clock order. The duty desk starts at `<S>`. Each other role starts the minutes after `<S>` that the table gives:

| Role | Minutes after `<S>` |
| :-- | :-- |
| Duty desk | 0 |
| Executor | 15 |
| Spec writer | 30 |
| Clerk | 45 |
| Court | 60 |
| Defender | 75 |
| Prosecutor | 90 |
| Investigation | 105 |
| Response unit | 120 |
| Patrol | 135 |

2. In the roles mode and the menu job, read `<S>` from the schedule of the job `[lawman] duty-desk` in the list command's output. Skip items 3 and 4 when it reads.
3. Decides: the time the duty desk starts, and so every role's time. Why: the duty desk must finish before the others take their orders. Used by: every job's schedule.
4. Ask for `<S>` in the harness's time zone. The default is 09:00 and the latest is 21:44, so that no role runs past midnight.

## Step 10. Custom schedule

Skip this step unless the plan is custom.

For each role in `<scope>`, in the order of the guide in step 2:

1. Say what the role solves, from the guide. Say what a lower frequency changes, from the table below.
2. Decides: the days this role runs. Why: a role takes one case per run. Used by: this role's job and its alarm limits.
3. Ask for a form: every day, chosen weekdays with the days named, or one day of the month from 1 to 28. In the menu job, also accept `keep`.
4. Ask for the form and the days only. The time of the role stays `<S>` plus its minutes from step 9.
5. Accept no form that runs more often than daily.

| Role | What a lower frequency changes |
| :-- | :-- |
| Duty desk | Every role waits for its order, so every case moves one stage per run of the desk. |
| Response unit | Issues that people write wait longer for a lead, a question or an out. |
| Patrol | Fewer new leads arrive, so less work enters the chain. |
| Investigation | Each run tests one lead, so leads wait longer for a case. |
| Prosecutor | Each run decides one case, so cases wait longer for a charge. |
| Defender | Each run answers one charge, so charged cases wait longer. |
| Court | Each run rules on one case, so defended cases wait longer for a verdict. |
| Clerk | Verdicts wait longer for a pull request. The clerk is cheap, so limit it only if you want to. |
| Spec writer | Each run writes one spec, so pull requests wait longer for their spec. |
| Executor | Each run builds one approved spec, so approved specs wait longer. |

## Step 11. Timetable

1. Decides: whether the schedule is written. Why: the timetable shows the runs, the intervals and the alarm limits that follow. Used by: the jobs and the journal's alarms.
2. For each role in `<scope>` whose schedule is not `keep`, show its runs, its time and its interval in minutes.
3. Set the interval by the form. Every day: 1440. Chosen weekdays: the longest gap between two chosen days, counted cyclically, in days times 1440. One day of the month: 44640. One weekday gives 10080, and Monday and Thursday give 5760.
4. Show each role's `order-untaken` limit in hours. An order raises it when it waits longer than the larger of 48 hours and the interval plus 24 hours. A taken order adds the 24-hour claim limit. One weekday gives 192 hours, and Monday and Thursday give 120.
5. Show that a role with no tick start and no gate check for three intervals raises `role-silent`. A role that never ended a tick never raises it.
6. Name the queue that builds behind each role that runs less often than the stage before it. Say in words which stage delivers more cases than the next stage takes.
7. For the investigation queue, run `bin/journal status`, add the `n` of its `leads <department> <n>` lines, and say how many leads wait today.
8. Ask "Accept?"
9. When the developer asks for a change, apply it to the plan, `<S>` or one role's form. Show the timetable again, and ask again.

## Step 12. Run gate

1. Decides: which roles skip their session when they have no order. Why: an empty run costs a short session. Used by: the harness, before each run of the role.
2. Tell the developer:

> A run gate is a small file the harness runs before a role's job. It asks the journal whether the role has an order it can take now. When the answer is the same as last time, the harness skips the session, and the run costs nothing. The first scheduled run of a gated role always starts a session once. After each stretch of work, one empty run follows, because the answer changes back to idle. The files live in the harness's scripts directory, outside the installation. They stay there after you remove Lawman.

3. Tell the developer:

> The gate file is `lawman-<role>.sh` in the harness's scripts directory. The extension makes the harness run it with `bash`. The harness ignores the interpreter line, which stays for readers. The file holds two lines. The first is `#!/bin/bash`. The second is `exec bin/journal wake --role <role>`. It has no pipe, no `grep` and no `|| true`. The journal's exit status is the file's status.

4. Tell the developer:

> Roles that only take work a person or an earlier stage made gain the most: response unit, prosecutor, defender, court, clerk, spec writer, executor. The duty desk takes no order and never gets a gate.

5. Derive `<scripts directory>` with the page's command, and show the result.
6. In the menu job, read each job's gate from the `Monitor:` line of the list command's output.
7. Ask which roles get a gate. The answer is `none`, `all but the duty desk`, or a list of roles. In the menu job, also accept `keep`.
8. Refuse the duty desk, and ask again.
9. In the menu job, mark a role for clearing when it has a gate and the answer leaves it out. Clear it with the page's clear form.

## Step 13. Approval

1. Build every create or edit command with the forms below.
2. For each gated role in `<scope>`, read `<scripts directory>/lawman-<role>.sh` when it exists. Mark the file new when it is missing, identical when it holds the two lines of step 12, and different otherwise.
3. For each different file, show its content.
4. List `<scripts directory>`, then each file with its mark, then each create or edit command in full. An identical file is not written again.
5. Decides: whether Lawman writes the files and jobs now. Why: the gate files sit outside the installation. Used by: the harness. Then ask once: "Write these files and create or edit these jobs?"
6. When the developer asks for a change, apply it, go back to the step it belongs to, and come back here.

Command forms:

1. A create command is this line, with the page's create form:

```
<create command from the page> "<cron expression>" "<Role name> tick." --name "[lawman] <role>" --skill <role skill name> --workdir "<installation>" --deliver <deliver from config.yaml>
```

2. `<Role name>` is the role folder name with hyphens as spaces and a capital first letter. Every job name carries the prefix `[lawman] `.
3. Build `<cron expression>` from the forms in "Schedule forms and time zone". The minute and the hour are `<S>` plus the role's minutes. Every day keeps the day fields open. Chosen weekdays fill the weekday field. A day of the month fills the day field.
4. Add the model, provider and effort flags that the page names for each answer other than `default`.
5. The create line gains `--monitor-script lawman-<role>.sh` for a gated role and `--paused` while no precinct has a weight. An edit adds `--monitor-script lawman-<role>.sh`, or `--monitor-script ''` to clear a gate.
6. Count the precincts with a weight above zero: run `bin/journal precinct list`, and read the third field of each line.
7. When `typesafe` is `yes` in `config.yaml`, run the skill listing command the page gives. When it shows `typesafe-ai`, add `--skill typesafe-ai` to the court's create line.
8. An edit command is the page's edit form for one job id, from the list command. Pass `--schedule "<cron expression>"` for a changed schedule. Omit the flag of every `keep` answer. For `default`, pass the page's clear form of the flag.
9. Skip the edit of a role with nothing to change.

## Step 14. Write and prove

Skip this step when no file is new or different.

1. Run `bin/journal probe --schema 6`. Stop if it exits non-zero, and tell the developer to run one role once, then run the assembly again.
2. For each new or different file, create the directory, write the file and run it once from the installation. Replace the placeholders.

```
mkdir -p <scripts directory>
printf '%s\n' '#!/bin/bash' 'exec bin/journal wake --role <role>' > <scripts directory>/lawman-<role>.sh
(cd "<installation>" && bash <scripts directory>/lawman-<role>.sh)
```

3. Show the output of each run.
4. Stop at the first non-zero exit, name the file, and show its output.

## Step 15. Create or edit

1. Run each create or edit command of step 13 for the roles in `<scope>`, in the clock order of step 9.
2. Stop at the first failure, show its message, and tell the developer to run the assembly again.
3. After a command succeeds, run `bin/journal role set <role> --every <minutes>`. Skip it for a role with a `keep` schedule.
4. When `role set` fails, stop, name the command, and tell the developer to run it by hand.
5. When the court's create fails with `--skill typesafe-ai`, create the court job without it. Then show the add-skill command that "Editing a job" gives, with the court's job id and `typesafe-ai`.
6. List the jobs again with the list command the page gives, and stop if a job is missing.

## Step 16. Finish

1. Name the paused jobs and the job that resumes them: "Raise a weight". Say that a job created paused first runs at its next slot. The page's "Paused jobs" gives the resume form.
2. Name every file written outside the installation, with its path. Say that this assembly never deletes them.
3. List the jobs that changed and what changed.

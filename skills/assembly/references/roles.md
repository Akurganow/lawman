# Roles

This reference sets up the scheduled job of each role. It follows the shape of every mode in `SKILL.md`: find, propose, decide, apply and summary. Install runs it for all roles. The roles mode runs it for the roles without a job, and its proposal holds their defaults. The menu job runs it for all roles.

## Terms

- `<scope>`: the roles this run sets up. Install and the menu job: every role folder of the plugin, which means every folder under skills except assembly and lawman-law. Roles mode: the roles without a job in the scheduler's list.
- `<role skill name>`: the role's folder name, written in the form that the harness page gives under "Installing the plugin".
- New job: a role in `<scope>` without a job. The run creates it.
- Edit: a role in `<scope>` with a job. Only the menu job has these. The run edits the job.
- `<S>`: the start time of the duty desk, in the harness's time zone.
- `<scripts directory>`: the directory for gate files. Derive it with the command that the harness page names under "Run gate".

## Rules

- Take every harness command, flag and fact from the harness page. Never guess one. Name no harness and no vendor.
- Read the page by subsection name under its scheduling section. The names are "Editing a job", "Schedule forms and time zone", "Models", "Paused jobs", "Run gate" and "Order and overlap".
- Skip the effort level when the page names none.
- When the page names no run gate, drop the part Gates, "Write and prove", every gate flag and the Gate column.
- Run each command as this reference writes it. Never start a shell or an interpreter with `-c`. Never feed a heredoc to a shell. Scheduled runs refuse those forms.
- Create and edit jobs in this interactive session only, because scheduled sessions cannot do it.
- The tiers, the plans, the clock order and the gate recommendation are advice. The developer may override each one.
- The sections "Command forms" and "Create or edit" use two words for answers. A keep answer is the choice "Keep as is". A default answer is the choice "Use the harness default".
- Ask in the developer's language when it is not English. Keep every fact.

Before the first part, stop if "Schedule forms and time zone" names no schedule form, and tell the developer the page lacks one.

## The defaults table

One table holds the defaults of every role, in clock order. The roles form that table, never a list of choices. Each part below shows its columns of it as the proposal.

| Role | Tier | Model | Days | Economy | Start | Gate |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Duty desk | light | harness default | daily | daily | +0 | no |
| Executor | strong | harness default | daily | Monday | +15 | yes |
| Spec writer | medium | harness default | daily | Friday | +30 | yes |
| Clerk | light | harness default | daily | daily | +45 | yes |
| Court | strong | harness default | daily | Wednesday | +60 | yes |
| Defender | strong | harness default | daily | Tuesday | +75 | yes |
| Prosecutor | strong | harness default | daily | Monday | +90 | yes |
| Investigation | medium | harness default | daily | Monday and Thursday | +105 | no |
| Response unit | medium | harness default | daily | daily | +120 | yes |
| Patrol | medium | harness default | daily | daily | +135 | no |

- Start is the number of minutes after `<S>`. The create commands run in the order of this table.
- Mark each value shown with its source: found, current, default, recommended or yours.
- One role changes by an edit of its row.
- The duty desk never gets a gate.

## Part Models

**Finds.**

- The default model and provider of scheduled jobs, as "Models" gives them. An unset value shows as unset.
- The providers that hold a credential, by name only.
- The effort levels, when "Models" names them.
- On a rerun, the model that each job uses. When "Editing a job" says the job list shows no model, the models in use stay unknown.

When "Models" names no way to read the default, say so. Then ask for model names only, with no provider and no effort.

**Proposes.** Send the Role, Tier and Model columns of the defaults table. Put every role on the harness default. State that one model serves all roles. Name the default model and the providers found. On a rerun, show the model of each job as "as set".

**Decides.** Ask in the question tool. Give the meaning of the tiers in the question, in one line: light runs fixed commands, medium reads and writes text, strong decides.

1. Offer the choice "Use the harness default", as the recommendation.
2. Offer the choice "Name models per tier".
3. On a rerun and in the menu, put the choice "Keep as is" first, and move the recommendation to it.
4. After "Name models per tier", ask for the model of each tier that has a role in `<scope>`.
5. Batch the tiers in one call.
6. Offer the models that the harness lists as choices.
7. Take any other model name as free text, with an optional provider and an optional effort level.
8. Write a name in the form that "Models" gives.
9. Ask for a provider only when a named model needs one and more than one provider holds a credential.
10. Record the answer for each role of the tier.

Why: the model sets the quality and the cost of every run.

**Never.**

- Check a model by running it.
- Offer a model list that the harness cannot give.
- Offer this chat's model.
- Show a credential label, id or secret.
- Run an internal function of the harness to list models.

## Part Schedule

**Finds.**

- The time zone, as "Schedule forms and time zone" gives it.
- The schedule of each existing job, and the plan it matches.
- The start time of the existing duty desk job, when one exists.

**Proposes.** Send the Role, Days and time columns of the defaults table. Propose a start of 09:00 in the found time zone. When the duty desk job exists, propose its start time as current. Show each role's time as `<S>` plus its Start minutes. The duty desk starts first because it must finish before the others take their orders. Refuse a start later than 21:44, so that every role runs on the same day.

**Decides.** Ask in the question tool.

1. Offer the choice "Every day", as the recommendation.
2. Offer the choice "Economy", which uses the Economy column.
3. Offer the choice "Custom", with the days named in free text, in the forms of "Day forms".
4. On a rerun and in the menu, put the choice "Keep as is" first, and move the recommendation to it.
5. Take a new start time or one role's days as a typed edit of the proposal.

Why: a role takes one case per run, so its days set the speed and the cost.

**Never.**

- Ask about intervals, hour thresholds or queue counts.
- Ask "Accept?" on a timetable.

Compute the interval of each role by "Interval by form". Record it by "Create or edit". Ask nothing about it.

## Part Gates

**Finds.**

- The scripts directory, shown as a path.
- Each gate file, marked by "Gate file marks".
- The roles that gain most from a gate: the roles that only take work a person or an earlier stage made.
- In the menu, the gate of each job, by "Gate read and clear".

**Proposes.** Send the Role and Gate columns of the defaults table, with the mark of each gate file. Propose the recommended set. The duty desk never gets a gate.

**Decides.** Ask in the question tool.

1. In install, take an edit of the Gate column.
2. In the roles mode, offer the choices "Recommended", "All but the duty desk" and "None".
3. In the menu, offer the same three choices, and put the choice "Keep as is" first as the recommendation.
4. Refuse the duty desk, and ask again.

Why: an empty run costs a short session.

**Shows.** The content of each different file, before Apply.

**Never.**

- Overwrite a different file that the developer has not seen.
- Gate the duty desk.

## Apply

The gate files sit outside the installation, so the approval names them.

1. Build every create or edit command with "Command forms".
2. List `<scripts directory>`, each file with its mark, and each job to create or edit.
3. Show the content of each different file.
4. Ask for one approval. Ask in the question tool, and offer apply and change.
5. After approval, run "Write and prove".
6. Then run "Create or edit".

Write no file that carries the mark identical.

## Day forms

1. Ask for a form: every day, chosen weekdays with the days named, or one day of the month from 1 to 28. In the menu job, also accept `keep`.
2. Accept no form that runs more often than daily.

## Interval by form

1. Set the interval by the form. Every day: 1440. Chosen weekdays: the longest gap between two chosen days, counted cyclically, in days times 1440. One day of the month: 44640. One weekday gives 10080, and Monday and Thursday give 5760.

## Gate read and clear

1. In the menu job, read each job's gate from the `Monitor:` line of the list command's output.
2. In the menu job, mark a role for clearing when it has a gate and the answer leaves it out. Clear it with the page's clear form.

## Gate file marks

1. For each gated role in `<scope>`, read `<scripts directory>/lawman-<role>.sh` when it exists. Mark the file new when it is missing, identical when it holds the two lines of the gate file in "Write and prove", and different otherwise.

## Command forms

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

## Write and prove

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

## Create or edit

1. Run each create or edit command of "Command forms" for the roles in `<scope>`, in the clock order of the defaults table.
2. Stop at the first failure, show its message, and tell the developer to run the assembly again.
3. After a command succeeds, run `bin/journal role set <role> --every <minutes>`. Skip it for a role with a `keep` schedule.
4. When `role set` fails, stop, name the command, and tell the developer to run it by hand.
5. When the court's create fails with `--skill typesafe-ai`, create the court job without it. Then show the add-skill command that "Editing a job" gives, with the court's job id and `typesafe-ai`.
6. List the jobs again with the list command the page gives, and stop if a job is missing.

## Finish

1. Name the paused jobs and the job that resumes them: "Raise a weight". Say that a job created paused first runs at its next slot. The page's "Paused jobs" gives the resume form.
2. Name every file written outside the installation, with its path. Say that this assembly never deletes them.
3. List the jobs that changed and what changed.

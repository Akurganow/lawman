# Install

Run the steps in this order. Each step names its command and its stop condition. A stop ends the install. Fix the cause, then run the assembly again from step 1. Every step is safe to repeat.

Before step 1, run `git -C lawman rev-parse HEAD`. Stop if it fails, because the law clone is missing. Tell the developer to clone the law repository into `lawman/` and check out its latest tag.

## Step 1. Detect the harness

1. List `lawman/harnesses/*.md` in name order.
2. Read the first section of each page, and run the detection command that section names.
3. Record a page as a match when its command exits 0.
4. Stop if a page names no detection command, and tell the developer the page needs one.
5. Stop if no page matches, and tell the developer to install a harness first.
6. When two pages match, ask the developer which one to use.
7. Record `harness` as the page's file name without `.md`.

## Step 2. Check the tools

1. Run `git --version`, and stop if it fails so the developer can install git.
2. Run `gh --version`, and stop if it fails so the developer can install the GitHub CLI.
3. Do not run `gh auth status`, because step 6 measures access.

## Step 3. Check the scheduler and the skills

1. Run the gateway or scheduler check that the harness page names, and stop if it fails, showing the start instruction the page gives.
2. Stop if the page names no such check, and tell the developer the page lacks one.
3. Run the skill listing command the page names, and stop if a folder `lawman/skills/*/` holding a `SKILL.md` is missing from the listing, showing the visibility steps the page gives.

## Step 4. Choose the delivery platform

1. Ask the developer which platform receives alarms and reports, and wait for the answer.
2. Create one one-shot job in the form the page gives, with `--workdir` set to `<installation>`, the platform as delivery, and the prompt `Reply with one line: Lawman delivery test.`
3. Ask the developer whether the line arrived, and stop if it did not so they can fix the platform.
4. Remove the test job with the remove command the page gives.
5. Record `deliver` as the platform.

## Step 5. Install the journal

1. Run `git -C lawman fetch --tags`, and stop if it fails.
2. Run `git -C lawman remote get-url origin` to read the law clone's origin.
3. Parse the owner and repo, accepting only the forms `https://github.com/<owner>/<repo>` and `git@github.com:<owner>/<repo>` with an optional `.git`, and stop on any other form.
4. Show `release_repo` to the developer, and stop unless they confirm it.
5. Run `git -C lawman describe --tags --exact-match`, and stop if it fails because the clone is off a tag, showing the latest tag from `git -C lawman tag --sort=-v:refname | head -n 1`.
6. Record the output of item 5 as `release_tag`.
7. Run `uname -s` and `uname -m`, lowercase the OS name, map `x86_64` to `x64` and `aarch64` to `arm64`, and stop on any other OS or CPU.
8. Set `<asset>` to `journal-bun-<os>-<arch>`.
9. Run `mkdir -p bin`, then `gh release download <release_tag> -R <release_repo> -p <asset> -p SHA256SUMS -D bin/`, and stop if it fails.
10. Run `(cd bin && shasum -a 256 -c SHA256SUMS --ignore-missing)`, and stop unless the line for `<asset>` reads `OK`.
11. Run `gh attestation verify bin/<asset> --repo <release_repo> --signer-workflow <release_repo>/.github/workflows/release.yml`, show the signer workflow it checked, and stop if it fails.
12. Run `mv bin/<asset> bin/journal && chmod +x bin/journal`.
13. Run `bin/journal probe --schema 5`, and stop if it exits non-zero.
14. Run `shasum -a 256 bin/journal`, and record its first field as `journal_sha256`.

## Step 6. Measure the scheduled session

Every role runs in a scheduled session. This step measures that session.

1. Create one one-shot job in the form the page gives, with `--skill patrol`, `--workdir` set to `<installation>`, the delivery platform, and the probe prompt below.
2. Wait for the run to finish, and read its output with the attempts command the page gives, stopping if it did not finish.
3. Check that the output holds the probe line, the login, the git version and `skill=patrol`, and stop if the probe line is missing.
4. When the login is missing, go to the token steps below.
5. Record `trusted_login` as the login line.
6. Create one more one-shot job in the same form, without `--skill`, with the prompt `Reply with only the silence token that the harness page names. Nothing else.`
7. Ask the developer to confirm that the probe report arrived once and that nothing arrived from the silence job, and stop if either fails.
8. Remove both probe jobs with the remove command the page gives.
9. When `config.yaml` already holds `typesafe`, keep it and skip items 10 to 14.
10. Ask: "Use TypeSafe Jev as one more piece of evidence for the court's priority? You will be asked per precinct whether the court may send its brief there. The brief states facts about a conviction in the court's own words and holds no issue text. It goes to api.typesafe.ai and is paid per input token." Record `yes` or `no`.
11. On `yes`, run the skill listing command the harness page gives, and look for `typesafe-ai`. When it is missing, show https://docs.typesafe.ai/agent-skill, and recommend installing the official skill by the method on that page. The developer installs it or declines. Run the listing again after an install.
12. On `yes`, name `TYPESAFE_API_KEY` and the place the harness page gives for it. Tell the developer to write the value there and never to paste it into this session.
13. On `yes`, create one more one-shot job as in item 1. Use the probe prompt below with the Jev probe lines added before its line "Do not run anything else." Run it as in items 2 and 3.
14. Read the probe's `jev` line, and remove the job with the remove command the page gives after the last repeat.
    - `jev model=` passes.
    - `jev none reason=no-key` means the session does not see the variable. Tell the developer to write it where the page says, then repeat items 13 and 14 once.
    - `status-401` means the key is wrong.
    - For any other line, show it.
    - The developer may answer `no` at any point. A final `no` writes `typesafe: no`.

Probe prompt:

```
Lawman probe. Run only these commands from this directory, and show each output under its command.
bin/journal probe --schema 5
gh api user --jq .login
git --version
Do not run anything else. Do not write to any repository. Do not take an order.
End with one line: skill=<name of the skill you loaded>
```

Jev probe lines. Add them before the line "Do not run anything else.", only when the developer answered `yes` in item 10:

```
Then read the section "Send" of lawman/skills/court/SKILL.md and run its command once, with kind grade, the delimiter LAWMAN_PROBE and this brief:
defect: A help message misspells the name of one command option.
effect_today: Readers of the help text see a misspelled option name, and the command still works.
established: The help text was read.
not_established: none
Show the one line it prints.
```

Token steps, used when the login is missing in the scheduled session. The scheduled session may be unable to read the keychain.

1. Name the variable that the harness page gives for the token, and say where the page says to write it.
2. Tell the developer to write the value where the page says, and never to paste it into this session.
3. Repeat this step after the developer confirms.

## Step 7. Write the config

1. Run `git -C lawman rev-parse HEAD`, and record the output as `law_commit`.
2. Write `<installation>/config.yaml` with the nine keys listed in `SKILL.md`. Take `typesafe` from step 6 and write `typesafe_precincts: none`.
3. Read the file back, and stop if a key is missing or a value is empty.

## Step 8. Set the role intervals

Finish this step before the developer adds a precinct.

1. List the role folders: every folder `lawman/skills/*/` other than `assembly`. In the roles mode, keep only the roles without a job.
2. Propose the default: every role once a day, 1440 minutes, at these local times: duty-desk 09:00, response-unit 09:05, patrol 09:15, investigation 09:30, prosecutor 09:45, defender 10:00, court 10:15, clerk 10:30, spec-writer 10:45, executor 11:00. Ask the developer to accept it or name other times and intervals, and wait for the answer.
3. For each role folder, run `bin/journal role set <role> --every <minutes>`, and stop if it fails.
4. Outside the roles mode, tell the developer to add the first precinct next, because step 9 runs after it.

## Step 9. Create the scheduled jobs

Run this step after the first precinct is in the journal. The precinct reference calls it. Create the jobs in this interactive session only, because scheduled sessions cannot create jobs.

1. List the scheduled jobs with the list command the page gives.
2. Skip a role whose job `[lawman] <role>` is already listed, and tell the developer which ones you skipped.
3. Ask the developer for the model of each role without a job, one role at a time, and wait for each answer. A developer who names none gets the harness's default model, and the `--model` flag is then omitted.
4. Build each cron expression from its interval with the table below. The default is `0 9 * * *` for duty-desk, `5 9 * * *` for response-unit, `15 9 * * *` for patrol, `30 9 * * *` for investigation, `45 9 * * *` for prosecutor, `0 10 * * *` for defender and `15 10 * * *` for court, `30 10 * * *` for clerk, `45 10 * * *` for spec-writer and `0 11 * * *` for executor, in the machine's local time.
5. When `typesafe` is `yes` in `config.yaml`, run the skill listing command the page gives. When it shows `typesafe-ai`, add `--skill typesafe-ai` to the court's create line.
6. Show every create command to the developer, and wait for a yes.
7. Create one job per role folder without a job, with the create form the page gives:

```
<create command from the page> "<cron expression>" "<Role name> tick." --name "[lawman] <role>" --skill <role> --workdir <installation> --model <model> --deliver <deliver>
```

Every job name carries the prefix `[lawman] ` so the developer can filter Lawman jobs from others. `<Role name>` is the role folder name with hyphens as spaces and a capital first letter. The prompt for `investigation` is `Investigation tick.`

8. When the court's create fails with `--skill typesafe-ai`, create the court job without it, then show the developer the add-skill command the page gives, with the court's job id and `typesafe-ai`.
9. List the jobs again, and stop if a job is missing.
10. Tell the developer that the install is complete.

| Interval | Cron expression |
| :-- | :-- |
| Divides 60 and is below 60 | `*/<m> * * * *` |
| 60 | `0 * * * *` |
| Any other | The duration form the page gives |

# Install

Run the steps in this order. Each step names its command and its stop condition. A stop ends the install. Fix the cause, then run the assembly again from step 1. Every step is safe to repeat.

Before step 1, stop if `lawman/skills/lawman-law/references/harnesses/` is missing. Tell the developer to install the plugin and to link it into the installation, as the README says.

## Step 1. Detect the harness

1. List `lawman/skills/lawman-law/references/harnesses/*.md` in name order.
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

## Step 3. Check the scheduler and the plugin

1. Run the gateway or scheduler check that the harness page names, and stop if it fails, showing the start instruction the page gives.
2. Stop if the page names no such check, and tell the developer the page lacks one.
3. Run the checks that the harness page names under "Installing the plugin", in the page's order. Stop at the first one that fails, and show the page's note for it.

## Step 4. Choose the delivery platform

1. Tell the developer: "Alarms, failures and stops arrive on the delivery platform. Successful ticks never do."
2. Ask the developer which platform receives alarms and reports, and wait for the answer.
3. Create one one-shot job in the form the page gives, with `--workdir` set to `<installation>`, the platform as delivery, and the prompt `Reply with one line: Lawman delivery test.`
4. Ask the developer whether the line arrived, and stop if it did not so they can fix the platform.
5. Remove the test job with the remove command the page gives.
6. Record `deliver` as the platform.

## Step 5. Install the journal

1. Run `git -C lawman remote get-url origin` to read the law clone's origin.
2. Parse the owner and repo, accepting only the forms `https://github.com/<owner>/<repo>` and `git@github.com:<owner>/<repo>` with an optional `.git`, and stop on any other form.
3. Show `release_repo` to the developer, and stop unless they confirm it.
4. Confirm that the law folder's commit carries a release tag, reading it the way the harness page names under "Syncing the law". Stop if it has none, because the law is not on a release. Tell the developer that `main` holds only releases and that the install must wait for one.
5. Record the tag that item 4 read as `release_tag`.
6. Run `uname -s` and `uname -m`, lowercase the OS name, map `x86_64` to `x64` and `aarch64` to `arm64`, and stop on any other OS or CPU.
7. Set `<asset>` to `journal-bun-<os>-<arch>`.
8. Run `mkdir -p bin`, then `gh release download <release_tag> -R <release_repo> -p <asset> -p SHA256SUMS -D bin/`, and stop if it fails.
9. Run `(cd bin && shasum -a 256 -c SHA256SUMS --ignore-missing)`, and stop unless the line for `<asset>` reads `OK`.
10. Run `gh attestation verify bin/<asset> --repo <release_repo> --signer-workflow <release_repo>/.github/workflows/release.yml`, show the signer workflow it checked, and stop if it fails.
11. Run `mv bin/<asset> bin/journal && chmod +x bin/journal`.
12. Run `bin/journal probe --schema 6`, and stop if it exits non-zero.
13. Run `shasum -a 256 bin/journal`, and record its first field as `journal_sha256`.

## Step 6. Measure the scheduled session

Every role runs in a scheduled session. This step measures that session.

1. Create one one-shot job in the form the page gives. Set `--skill` to the skill name of patrol that the harness page gives under "Installing the plugin". Set `--workdir` to `<installation>`, and add the delivery platform and the probe prompt below.
2. Wait for the run to finish, and read its output with the attempts command the page gives, stopping if it did not finish.
3. Check that the output holds the probe line, the login, the git version and the exact line `skill=` followed by that skill name. Stop if the probe line is missing.
4. When the login is missing, go to the token steps below.
5. Record `trusted_login` as the login line.
6. Create one more one-shot job in the same form, without `--skill`, with the prompt `Reply with two short report lines. Then end with the silence token that the harness page names, alone on the last line.`
7. Ask the developer to confirm that the probe report arrived once and that nothing arrived from the silence job, and stop if either fails.
8. Remove both probe jobs with the remove command the page gives.
9. When `config.yaml` already holds `typesafe`, keep it and skip items 10 to 14.
10. Ask: "Use TypeSafe Jev as one more piece of evidence for the court's priority? You will be asked per precinct whether the court may send its brief there. The brief states facts about a conviction in the court's own words and holds no issue text. It goes to api.typesafe.ai and is paid per input token." Record `yes` or `no`.
11. On `yes`, run the skill listing command the harness page gives, and look for `typesafe-ai`. When it is missing, show https://docs.typesafe.ai/agent-skill, and recommend installing the official skill by the method on that page. The developer installs it or declines. Run the listing again after an install.
12. On `yes`, tell the developer which key the court needs and what it is for: "The court needs a TypeSafe API key. It sends its brief to api.typesafe.ai and uses the key as a bearer token. The service bills by input token." Then ask: "Decides: which key the court uses and where its scheduled session reads it. Why: the session cannot ask you. Used by: the court. Which key do you use for this, if you have several? Where do you keep it? It may be an environment variable, the harness's secret store, the system keychain or another place. Name the key and the place, and the variable name if it is a variable. Do not paste the key." Record the answer in the developer's words as `typesafe_key`. Never record or print a value. Write nothing into the place. The developer creates the key and stores it there. Keep the answer for item 13, because `config.yaml` does not exist yet.
13. On `yes`, create one more one-shot job as in item 1. Use the probe prompt below with the Jev probe lines added before its line "Do not run anything else." Replace `<the place that the developer named>` in the Jev probe lines with the recorded answer. Run it as in items 2 and 3.
14. Read the probe's `jev` line, and remove the job with the remove command the page gives after the last repeat.
    - `jev model=` passes.
    - `jev none reason=no-key` means the session cannot read the key from the recorded place. Ask the developer how a scheduled session reaches it, and update the recorded answer if the place changed. Then repeat items 13 and 14 once.
    - `status-401` means the key is wrong.
    - For any other line, show it.
    - The developer may answer `no` at any point. A final `no` writes `typesafe: no`.

Probe prompt:

```
Lawman probe. Run only these commands from this directory, and show each output under its command.
bin/journal probe --schema 6
gh api user --jq .login
git --version
Do not run anything else. Do not write to any repository. Do not take an order.
End with one line: skill=<name of the skill you loaded>
```

Jev probe lines. Add them before the line "Do not run anything else.", only when the developer answered `yes` in item 10:

```
Then follow the section "Send" of lawman/skills/court/SKILL.md once, with kind grade, the delimiter LAWMAN_PROBE and this brief.
The key lives here: <the place that the developer named>.
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

1. Read the commit that the law folder holds, the way the harness page names under "Syncing the law", and record it as `law_commit`.
2. Read `contract_version` in `lawman/skills/lawman-law/references/constitution.md`, and record it.
3. Write `<installation>/config.yaml` with the twelve keys listed in `SKILL.md`. Take `typesafe` and `typesafe_key` from step 6. Write `typesafe_precincts: none`, and write `amended_law_commit` equal to `law_commit`. When `typesafe` is `no`, write `typesafe_key: none`.
4. Read the file back, and stop if a key is missing or a value is empty.

## Step 8. Set up the roles

Run `references/roles.md` for all roles. It creates the jobs paused until a precinct has a weight.

## Step 9. Add the first precinct

Run the add path of `references/precinct.md`, the section "Add a precinct". Then tell the developer that the install is complete.

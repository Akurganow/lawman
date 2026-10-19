# Install

Install follows the shape of every mode in `SKILL.md`: find, propose, decide, apply and summary. Read "Asking" in `SKILL.md` before the first question. Ask in the question tool at every ask site below.

A stop ends the install. Each stop says what failed, the cause and the fix. Fix the cause, then run the assembly again. It restarts at "Choose the installation" in `SKILL.md`. Every write of Apply is safe to repeat.

## Order

Round one covers Installation, Delivery, Models, Schedule, Gates, TypeSafe and the choice of repositories.

1. Find the facts of every part.
2. For each part, send one proposal, then ask its decisions, batching the independent ones.
3. Ask for one approval to apply, offering apply and change.

Before the approval, write only the installation folder, the plugin link and the repository clones. After it, Apply writes in this order.

1. Install the journal.
2. Write `config.yaml`.
3. Write the gate files.
4. Create the jobs.

Round two runs "Add a precinct" for each chosen repository. It comes after the writes of round one, because it needs the journal. The summary comes last.

## Installation

Finds:

- The harness, from "Choose the installation" in `SKILL.md`.
- An existing installation.
- Whether the version-control tool and the GitHub tool are present.
- Whether the scheduler runs, by the check that the harness page names.
- Whether the plugin is enabled, by the checks that the harness page names under "Installing the plugin", in the page's order.
- The release repository and the release tag, from the plugin's own clone, by the items of "Find the release" below.
- The GitHub account signed in to this session.

Proposes, as rows with their source:

| Row | Value | Source |
| :-- | :-- | :-- |
| Folder | `<installation>` | current, default or yours |
| Harness | the harness page | found |
| Release | tag and repository | found, not editable |
| GitHub account | the login, which becomes `trusted_login` | found, not editable |

The why line for the login: every role writes as this account, and only its markers count.

Decides: nothing when an installation exists. "Choose the installation" in `SKILL.md` asks the folder question when none exists.

Stops:

- The version-control tool is missing. Tell the developer to install it.
- The GitHub tool is missing. Tell the developer to install it.
- The scheduler check fails. Show the start instruction that the harness page gives.
- The harness page names no scheduler check. Tell the developer the page lacks one.
- A check under "Installing the plugin" fails. Stop at the first one, and show the page's note for it.
- No GitHub account is signed in to this session. Tell the developer that Lawman needs one signed-in account for every role. Tell them to sign in, then start the assembly again.
- The plugin clone's origin is not a GitHub form, or the law commit has no release tag. The items of "Find the release" give both stops.

Never:

- Ask the developer to confirm the release repository.
- Test the harness.
- Start a scheduled session to read the login.

### Find the release

1. Run `git -C lawman remote get-url origin` to read the law clone's origin.
2. Parse the owner and repo, accepting only the forms `https://github.com/<owner>/<repo>` and `git@github.com:<owner>/<repo>` with an optional `.git`, and stop on any other form.
3. Confirm that the law folder's commit carries a release tag, reading it the way the harness page names under "Syncing the law". Stop if it has none, because the law is not on a release. Tell the developer that `main` holds only releases and that the install must wait for one.
4. Record the tag that item 3 read as `release_tag`.

Name the `<owner>/<repo>` of item 2 `release_repo`.

## Delivery

Alarms, failures and stops arrive on the delivery routes. Successful ticks never do.

Finds: every route the harness can deliver to, the file-only route included. For each route it finds three facts.

- What the route does.
- Whether the route can deliver now.
- Whether using the route starts a model run.

Proposes: one row for each route, with its source.

- Recommend the first connected messenger, in the order the harness lists the routes.
- Recommend the file-only route when no messenger is connected.
- Label a route that has no destination to deliver to.
- Label a route whose use starts a model run with that cost.
- Label a route whose state the harness cannot report as not checked.
- Label the file-only route: alarms and failures stay in files.

Decides: which routes receive the alarms, the failures and the stops. Ask in the question tool.

- Offer several choices where the harness allows several routes, and one choice where it allows one.
- Keep the file-only route among the visible choices, even when the list is long.
- Offer a delivery route as the unit, never a chat. A specific chat goes in the free-text answer.
- An empty answer asks again. Delivery has no default.

Result: `deliver` names the chosen routes in the form the create command takes.

Never:

- Pick a route because it is the only one set up.
- Test delivery.
- Ask whether a message arrived.
- Recommend a route that cannot deliver now.

## Models, Schedule and Gates

Run "Part Models", "Part Schedule" and "Part Gates" of `references/roles.md` for all roles in round one. They write nothing before the approval of this install.

## TypeSafe

TypeSafe Jev is off by default. This part decides whether the court uses it.

Finds, before the question: whether the official TypeSafe skill is present. Look for no secret yet.

Proposes: "No" by default, with one line of price. The service charges for each input token, and briefs go to the TypeSafe service.

Decides: yes or no. Ask in the question tool.

After a yes:

1. Say that the court needs a TypeSafe API key.
2. Find whether the key is in the place that scheduled sessions read, which the harness page names under "The TypeSafe key".
3. Learn found or not found and nothing else.
4. Show a key row that reads found or not found in that place and names the variable.
5. When the key is found, record that place.

When the key is found, ask nothing more. When it is not found, ask in the question tool with one question and three choices. The why line reads: "Maybe the key already lies somewhere you know."

- The key lies elsewhere. The developer names the place in free text.
- The developer will put the key in the page's place.
- Turn TypeSafe off.

Result: typesafe is yes or no. `typesafe_key` names the place in words, or reads none when TypeSafe is off. The consent to send a brief stays per repository, and round two asks it.

Never:

- Ask for, print, read or store the value of the key.
- Run a command whose output can hold the value.
- Run a paid probe.
- Ask which key and where, when the key is found.

## Apply

Apply starts after the approval of round one.

### Install the journal

1. Run `uname -s` and `uname -m`, lowercase the OS name, map `x86_64` to `x64` and `aarch64` to `arm64`, and stop on any other OS or CPU.
2. Set `<asset>` to `journal-bun-<os>-<arch>`.
3. Run `mkdir -p bin`, then `gh release download <release_tag> -R <release_repo> -p <asset> -p SHA256SUMS -D bin/`, and stop if it fails.
4. Run `(cd bin && shasum -a 256 -c SHA256SUMS --ignore-missing)`, and stop unless the line for `<asset>` reads `OK`.
5. Run `gh attestation verify bin/<asset> --repo <release_repo> --signer-workflow <release_repo>/.github/workflows/release.yml`, show the signer workflow it checked, and stop if it fails.
6. Run `mv bin/<asset> bin/journal && chmod +x bin/journal`.
7. Run `bin/journal probe --schema 6`, and stop if it exits non-zero.
8. Run `shasum -a 256 bin/journal`, and record its first field as `journal_sha256`.

### Write the config

1. Read the commit that the law folder holds, the way the harness page names under "Syncing the law".
2. Record that commit as `law_commit`.
3. Read `contract_version` in `lawman/skills/lawman-law/references/constitution.md`, and record it.
4. Write `<installation>/config.yaml` with the twelve keys listed in `SKILL.md`.
5. Take `trusted_login` from Installation, `deliver` from Delivery, and `typesafe` and `typesafe_key` from TypeSafe.
6. Write `typesafe_precincts` as none.
7. Write `amended_law_commit` equal to `law_commit`.
8. Read the file back, and stop if a key is missing or a value is empty.

### Write the gate files and create the jobs

1. Write the gate files by "Write and prove" in `references/roles.md`, and write only new or different files.
2. Create the jobs paused, in clock order, by "Create or edit" in `references/roles.md`, which records each interval.

## Repositories

Round one asks which repositories to add, as `references/precinct.md` describes. An empty answer means none.

Round two runs the section "Add a precinct" of `references/precinct.md` once for each chosen repository. Each repository has its own proposal and its own approval. With TypeSafe on, the same call asks the consent for that repository.

## Summary

Follow "Finish" in `SKILL.md`. Name these items.

- The paused jobs, and the step that resumes them: "Raise a weight".
- Every file written outside the installation, with its path. Say that the assembly never deletes them.
- For a file-only install, three facts. Name the output folder that the harness page gives under "Delivery targets". Say how to see recent runs, as "Run records" says. Say that alarms and failures stay in files.
- What a login stop looks like and where it arrives. A run whose signed-in account differs from `trusted_login` ends with a stopped outcome. Its report arrives on the delivery routes.
- "Add a department" as the step after a constitution merges.
- For roles and precincts: the menu of the assembly changes them later.

When TypeSafe is on and the official skill was missing at install, add these items.

- Show https://docs.typesafe.ai/agent-skill, and recommend installing the official skill by the method on that page.
- Give the step that attaches the skill to the court job: the add-skill form that the harness page gives under "Editing a job".

Then tell the developer that the install is complete.

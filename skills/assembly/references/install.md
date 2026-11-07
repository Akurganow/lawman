# Install

Install follows the shape of every mode in `SKILL.md`: find, propose, decide, apply and summary. Read "Asking" in `SKILL.md` before the first question. Ask in the question tool at every ask site below.

A stop ends the install. Each stop says what failed, the cause and the fix. Fix the cause, then run the assembly again. It restarts at "Choose the installation" in `SKILL.md`. Every write of Apply is safe to repeat. "Where Apply stops" says what a stop leaves.

## Order

The install finds what is available before it checks any file or role. It finds the repository host and the tools that reach it. For each tool, it finds the account the host reports. It finds where the repositories keep their issues, and how the install verifies Lawman's own release. Phase 2 finds each repository's access before that repository's proposal. When no tool reaches the host, offer choices that fit this machine. When the host reports no account, ask the user to sign in. When the user declines, say plainly that the roles cannot work without it, and end the install. Every role writes as that account.

The install has two phases.

**Phase 1. Installation.** One round and one approval for the phase. The screens come in this order.

1. Installation: the folder, the harness and the release.
2. Host: the tool, the account, the host notes, and the verifier or the refusal.
3. The commands of the installation: `release`, `verify` and `law-version` on one screen.
4. Delivery.
5. Models and Schedule.
6. Role entry: the entry files and the mode of the jobs.
7. Limits: the numbers of jobs and N. The size of a part is shown as a fact.
8. TypeSafe and Catalog.
9. The choice of repositories.

Phase 1 runs as follows.

1. Find the facts of every screen.
2. For each screen, send one proposal, then ask its decisions, batching the independent ones.
3. Ask for one approval to apply, offering apply and change. The approval names `host.md`, each file of `shared/` to write or to remove, the entry files and each job with its model when known. It names each job whose mode changes, with its change.

Ask the consent to paid proof runs among the questions that come before the approval. "Consent to paid runs" in `references/commands.md` holds the rule.

Before the approval, write only the installation folder, the plugin link and the repository clones. The commands of the installation are proven inside Apply, after the approval. Their proposal rows read "will be proven at Apply". After the approval, Apply writes in the order of the section "Apply".

**Phase 2. Precincts.** The section "Add a precinct" of `references/precinct.md` runs once for each chosen repository, from "Clone and read" on. It comes after the writes of phase 1, because it needs the journal. Each repository has its own proposal and its own approval, and the commands of its precinct are proven before that decision. The summary comes last.

## Installation

Finds:

- The harness, from "Choose the installation" in `SKILL.md`.
- An existing installation.
- Whether the scheduler runs, by the check that the harness page names.
- Whether the plugin is enabled, by the checks that the harness page names under "Installing the plugin", in the page's order.
- The law commit, the release tag and the release repository, by "Find the facts of the law" below.

Proposes, as rows with their source:

| Row | Value | Source |
| :-- | :-- | :-- |
| Folder | `<installation>` | current, default or yours |
| Harness | the harness page | found |
| Release | tag and repository | found, or yours |

A release repository that is read from the origin is found, and the developer does not edit it. A release repository that the developer named is yours, and the developer may change it.

Decides: nothing when an installation exists. "Choose the installation" in `SKILL.md` asks the folder question when none exists. The facts of the law ask the developer only as "Find the facts of the law" says.

Stops:

- The scheduler check fails. Show the start instruction that the harness page gives.
- The harness page names no scheduler check. Tell the developer the page lacks one.
- A check under "Installing the plugin" fails. Stop at the first one, and show the page's note for it.
- The facts of the law cannot be had, or a value is outside its class. The items of "Find the facts of the law" give each stop.

Never:

- Ask the developer to confirm a release repository that you read from the origin.
- Test the harness. The exceptions are the delivery check and the proof runs that the developer chose.

### Find the facts of the law

The folder of the law may carry no history. A harness may place the plugin as a plain copy. Take the commit, the release tag and the release repository from these sources in this order. The list is open for sources that a later release reads.

1. The history of the law folder, when it has one: the commit it holds, the origin of the history and the release tag of that commit.
2. The developer's word. Ask in free text, and name where the value can be seen, such as the plugin's page or the release. The word serves the install. Write no `law-version` command from it: the command would print one value for ever, and the check of the law at the start of a tick would not see an update of the plugin. The role reads the facts itself.
3. No history and no word: stop, and say which source to name.

When the history is readable and the commit carries no release tag, stop: the law is not on a release. Tell the developer that `main` holds only releases and that the install must wait for one. The developer's word does not replace a missing tag while the history is readable. It replaces the history only when there is none.

Name the `<owner>/<repo>` of the release `release_repo`. Read it from the origin of the history, in any form: https, ssh or a host alias. Use the way that the host's tool or the host notes name. The form of the origin is not limited. A value from the developer's word is shown as yours.

Check each value against its class before its first use, the download of the first install included. A value outside its class stops the work with the reason. The journal checks them again in `law-update`.

- A commit and a revision: the string that `law-update` accepts, which is 40 lowercase hexadecimal digits.
- A tag: letters, digits and `.` `_` `-`, with no leading `-`.
- `release_repo`: two segments of letters, digits and `.` `_` `-`.

The class holds the value. The chosen method of verification holds the signer.

Record the tag as `release_tag`.

## Host

In Apply, write what part Host found into `host.md` in the installation, never into a repository. The notes name the host, the tool in use and the account the host reports for it. For each host action the role skills name, they record how this machine does it with that tool. That covers handing host data to the journal in its forms. They name how the host keeps issues and their templates, and anything particular to this host. They name the verifier of Lawman's release or the user's refusal. They say where a credential lives, never its value. Never write a token, a password, a key or a credential's content into them. Roles follow the notes and never write them. Never shorten the notes: the roles read each record for the steps they do themselves. Part Host keeps every line of the section `## Dependency reading` of an existing `host.md`. The section holds one `- <precinct name>: <words>` line per precinct. The precinct path writes it.

Part Host keeps every line of the section `## License reading` of an existing `host.md` too. An item of that section has nested lines for its blocks. The license questions write it.

Part Host does not change the account. A run of part Host again serves a change of tool.

Find a tool on this machine that verifies a Sigstore signature. Examples are [gh](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline), [cosign](https://docs.sigstore.dev/), [sigstore-python](https://pypi.org/project/sigstore/), [@sigstore/cli](https://npmjs.com/package/@sigstore/cli) and [sigstore-go](https://pkg.go.dev/github.com/sigstore/sigstore-go). Another tool is fine. The choice of the method, the facts of a refusal and what a refusal records follow "Choose the method of verification" in `references/commands.md`.

Say in plain text that a written command must not send the host a request beyond the host's limits. "Host limits" in `references/commands.md` gives them.

Finds:

- The repository host, and each tool on this machine that reaches it.
- Whether the version-control tool is present.
- For each tool that reaches the host, the account the host reports.
- Where the chosen tool keeps its credential. Learn the place and never the value.
- How the host keeps issues and their templates, and anything particular to this host.
- For each host action the role skills name, how this machine does it with the chosen tool. That covers handing host data to the journal in its forms.
- For the assembly's own label actions, how this machine reads a repository's labels with their descriptions and creates a label with a description. Also how it sets a label's description.
- Three actions for the old precedents: how this machine reads a file at a given revision of a pull request, how it writes to the branch of a pull request, and how it turns the link of an old precedent line into the number of an issue.
- The verifier of Lawman's release, by the paragraph above.

An installation made before these actions existed has no record of one of them. The assembly finds how this machine does it, and records it in the approved Apply, as `SKILL.md` says for the merge form. It asks the user only when it cannot find a way.

Proposes, as rows with their source. The rows are the notes, the recorded actions included.

| Row | Value | Source |
| :-- | :-- | :-- |
| Host | the repository host | found |
| Tool | the tool in use | found or yours |
| Account | the login the host reports, which becomes `trusted_login` at install | found, not editable |
| Credential | the place it lives, never its value | found |
| Issues and templates | how the host keeps them | found |
| Host actions | one row for each action, with how this machine does it | found |
| Verifier | the verifier, or the refusal | found, chosen or declined |

The why line for the login: every role writes as this account, and only its markers count.

Decides: ask in the question tool.

- The tool, when several reach the host. The user chooses.
- The verifier, when several fit, or whether to install one when none fits, or to decline.
- The host, when the finds do not show it.

Stops:

- The version-control tool is missing. Tell the developer to install it.
- No tool reaches the host, or the host reports no account for the chosen tool. Act as "Order" says.

Never:

- Start a scheduled session to read the login.

## The commands of the installation

This screen holds `release`, `verify` and `law-version`. Follow "Commands of the installation" in `references/commands.md`.

Finds: which of the three files exist in `shared/`, and how this machine does each operation.

Proposes: one row for each operation, with how it runs, its source and its proof state. A new or changed command reads "will be proven at Apply".

Decides: for each command, "Write" or "Leave empty", with "Keep as is" first for a command that exists. What `verify` needs under a chosen signature or a refusal is in "Choose the method of verification".

Never:

- Write a command that the proof did not pass.
- Write a `law-version` command from a value that the developer typed.

## Delivery

Alarms and failures arrive on the delivery routes, and so does a stop of the law sync or of the duty desk. Other ticks never do.

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

Decides: which routes receive the alarms, the failures and the stops of the law sync or the duty desk. Ask in the question tool.

- Offer several choices where the harness allows several routes, and one choice where it allows one.
- Keep the file-only route among the visible choices, even when the list is long.
- Offer a delivery route as the unit, never a chat. A specific chat goes in the free-text answer.
- An empty answer asks again. Delivery has no default.

Result: `deliver` names the chosen routes in the form the create command takes.

Never:

- Pick a route because it is the only one set up.
- Test delivery, except by the delivery check that the developer chooses at the end of the install. "Delivery check" gives it.
- Ask whether a message arrived, except during that check.
- Recommend a route that cannot deliver now.

## Models and Schedule

Run "Part Models" and "Part Schedule" of `references/roles.md` for all roles in phase 1. They write nothing before the approval of this install.

## Role entry and Limits

Run "Part Role entry" and "Part Limits" of `references/roles.md` for all roles in phase 1. They write nothing before the approval of this install. The entry files and the mode of the jobs follow the harness page, in the section "Role entry". The size of a part is a fact of the page, and Limits shows it without a question. Limits asks only the numbers of jobs and N.

## TypeSafe

TypeSafe Jev is off by default. This part decides whether the court and the clerk use it.

Finds, before the question: whether the official TypeSafe skill is present. Look for no secret yet.

Proposes: "No" by default, with one line of price. TypeSafe has two uses. The court sends a brief about a conviction, and the clerk sends a request about the departments of a precedent. Both go to the service at `api.typesafe.ai`, and the service charges for each input token. Whether a repository is private or public is asked separately for each repository. What each use sends is in "What leaves the machine" of `docs/configuration.md`. Read it there and do not retell it from memory.

Decides: yes or no. Ask in the question tool.

After a yes:

1. Say that TypeSafe needs an API key.
2. Find whether the key is in the place that scheduled sessions read, which the harness page names under "The TypeSafe key".
3. Learn found or not found and nothing else.
4. Show a key row that reads found or not found in that place and names the variable.
5. When the key is found, record that place.

When the key is found, ask nothing more. When it is not found, ask in the question tool with one question and three choices. The why line reads: "Maybe the key already lies somewhere you know."

- The key lies elsewhere. The developer names the place in free text.
- The developer will put the key in the page's place (recommended).
- Turn TypeSafe off.

Result: typesafe is yes or no. `typesafe_key` names the place in words, or reads none when TypeSafe is off. The consent to send stays per repository, and phase 2 asks it.

Never:

- Ask for, print, read or store the value of the key.
- Run a command whose output can hold the value.
- Run a paid probe.
- Ask which key and where, when the key is found.

## Catalog

The catalog check is off by default. This part decides whether the patrol may check the dependencies of a precinct against an online catalog of known vulnerabilities.

Finds: nothing on this machine. Read no precinct yet.

Proposes: "No" by default, with one line of what leaves. Names and versions of pinned packages go to the catalog service at every visit.

Decides: yes or no. Ask in the question tool. Put "No" first and "Yes" second. A skip means no.

The why line reads: "Names and versions of pinned packages, those of a private repository too, go to the OSV service. The service sees this installation's address. The list leaves again at every visit."

Result: `catalog` is yes or no. The consent for each precinct stays with the precinct path, and phase 2 asks it only when this answer is yes.

Never:

- Send a package name at install.
- Claim anything about how the service keeps data.

## Apply

Apply starts after the approval of phase 1. The order is the same for the first install and for a run of part Host again. The first install is an install with no `config.yaml`. Nothing is installed before the approval. The file by which the next start would skip the install, `config.yaml`, is not written before the proofs succeed. A step with no condition that holds is skipped.

In Apply, "the method" is the verifier or the refusal of the signature in the approved proposal of part Host. `host.md` gets its record only at step 5, so no step before it reads the method from the notes.

1. Write the host notes, with no new record about the verification of the binary. The earlier record stays.
2. Install the verifier that the developer chose, when it is not on this machine.
3. Get the release files. On the first install, go on: check the sum and the signature, install the binary and probe it.
4. Prove the commands of the installation through the journal on a throwaway base.
5. Write the installation: the files of `shared/`, the record of the method, `config.yaml`. Remove the files of the proof.
6. On the first install and in the part "Roles": write and prove the entry files, and create the jobs.

Ask nothing in the middle of Apply. On a failure, stop, name the cause and the fix, and write nothing more.

### Write the host notes

Write `<installation>/host.md` as the approved Host rows show, by the head of "Host". Read the existing `host.md` first. Carry every line of its sections `## Dependency reading` and `## License reading` over unchanged into the new file. Leave the earlier record of the verification of the binary as it is.

### Install a verifier

When the method names a verifier that is not on this machine, install it.

### Install the journal

Lawman's release carries, beside each journal binary, a signed statement of where the binary came from. Before a new binary runs, confirm that it matches the checksum the release publishes. Then, with the verifier of the method, confirm three facts. The statement names the file's own digest. The release workflow of `release_repo` signed it. That workflow built the file from the commit the law folder holds. Check the signature against a trusted root from Sigstore, never from the release. When the method names a verifier, a check that cannot run or that reports anything but success is a stop. A proposal that names neither a verifier nor a refusal is a stop too. After the refusal of the signature, skip the signature check. None of this needs an account on the release host.

At install, also confirm that the verifier rejects a changed copy of the binary. Never run the copy, and remove every file of the test. A verifier that accepts the copy is a stop.

1. Find the OS and the CPU of this machine, name the OS in lowercase, read `x86_64` as `x64` and `aarch64` as `arm64`, and stop on any other OS or CPU.
2. Set `<asset>` to `journal-bun-<os>-<arch>`, and set `<provenance>` to `<asset>.sigstore.json`.
3. Create `bin` and `runs/install-journal`, then fetch `<asset>`, `<provenance>` and `SHA256SUMS` of `<release_tag>` from `<release_repo>` into `runs/install-journal`, replacing files that lie there, and stop if the fetch fails.
4. Check `<asset>` against the line for it in `SHA256SUMS`, and stop unless they match.
5. When the method names a verifier, check `<asset>` against `<provenance>` as the paragraph above says, show the signer workflow `<release_repo>/.github/workflows/release.yml` that it checked, and stop if it fails.
6. When the method names a verifier, run its first test as the second paragraph above says.
7. Copy `runs/install-journal/<asset>` to `bin/journal` and make it executable. Copy it only after the checks of items 4 to 6 passed. The files stay for the proof of `verify`.
8. Run `bin/journal probe --schema <n>`, and stop if it exits non-zero. Read the number on the lines of `probe --schema` in the skills of the roles, take the largest, and keep no copy of it.
9. Compute the SHA-256 digest of `bin/journal`, and record it as `journal_sha256`.

Items 4 to 9 belong to the first install. A run of part Host again does not replace the binary: a new release arrives when a role runs, as `SKILL.md` says. Item 3 runs then only when the four cases of `verify` will run and the folder that `release` built cannot supply the files.

### Prove the commands of the installation

Prove each command that the developer wrote or changed, through the journal on the throwaway base, as "Prove a command" and "Commands of the installation" in `references/commands.md` say. Commands that stay as they are are not proven again on a repeat. Then:

- With a signature chosen, run the four cases of `verify` when `verify`, the method or the verifier changed. Otherwise do not run them.
- When the method changed to a refusal, or a refusal is written for the first time, run the pass of `law-update` on the throwaway installation.

A proof that fails stops Apply before any write of step 5.

### Write the installation

Write in this order.

1. `shared/release`, `shared/verify` and `shared/law-version`, each with the files it needs, unchanged and executable, copied from the throwaway base where they passed the proof. Remove a file that the developer left empty or whose signature was refused.
2. The record of the method of verification in `host.md`. It replaces the earlier record only now.
3. On the first install, `config.yaml`, with `journal_sha256`. See "Write the config".
4. Remove the files of the proof: `SHA256SUMS`, the provenance file and `runs/install-journal`.

### Write the config

1. Take the commit that the facts of the law gave. Record it as `law_commit`.
2. Record the tag and the repository of the release as `release_tag` and `release_repo`.
3. Read `contract_version` in `lawman/skills/lawman-law/references/constitution.md`, and record it.
4. Write `<installation>/config.yaml` with the fifteen keys listed in `SKILL.md`.
5. Take `trusted_login` from Host, `deliver` from Delivery, and `typesafe` and `typesafe_key` from TypeSafe, and `catalog` from Catalog.
6. Write `typesafe_precincts`, `catalog_precincts` and `license_precincts` as none.
7. Write `amended_law_commit` equal to `law_commit`.
8. Write the optional keys that Limits decided: `input_chars` when the harness page names a size, and `jobs` or `progress_checks` only when the developer changed the value.
9. Read the file back, and stop if a required key is missing or a value is empty.

### Write the entry files and create the jobs

1. Write the entry files and prove them, by "Write and prove" in `references/roles.md`. Write only new or different files.
2. Create the jobs paused, in clock order, by "Create or edit" in `references/roles.md`. A new job gets its entry file in the mode the harness page names. An existing job changes only by the rules of that reference, and only what the approval named.

### Where Apply stops

| Stop | What stays | What the next start does |
| :-- | :-- | :-- |
| Steps 1 to 4 | `shared/`, the record of verification and `config.yaml` are as before. The new `host.md` without the new record stays, with the verifier and the downloaded files. On the first install `bin/journal` may stand with no `config.yaml`, and an earlier binary is not replaced before the probe passes. | The first install enters the install again, because there is no `config.yaml`. A repeat needs the developer to run part Host again. |
| Step 5 between two writes | The new files of `shared/` and maybe the record of verification stay. `config.yaml` is as before, because it is written last. A repeat of Apply is safe. | The same. |
| Step 6 | `config.yaml` is already written. | The next start does not enter the install. The roles mode adds the missing jobs, as `SKILL.md` says. |

After a run of part Host again that changed the tool, the summary names the precincts whose commands were proven for the earlier tool, and points to "Re-check a precinct".

## Repositories

Phase 1 asks which repositories to add, as `references/precinct.md` describes.

Phase 2 runs the section "Add a precinct" of `references/precinct.md` from "Clone and read" on, once for each chosen repository. Each repository has its own proposal and its own approval.

## Delivery check

Run this section at the end of the install, after Apply and phase 2. It follows the delivery that the developer chose.

1. Ask a separate question: check both branches of delivery? Offer "Check both" (recommended) and "Skip". A skip, an empty answer and a cancel mean no. Ask nothing for a route that delivers nothing, such as the file-only route. This is not the consent to paid proof runs.
2. The label of the choice names two short runs of the harness's default model, and says that both are paid.
3. Run two one-off jobs without any Lawman skill, by the forms in "One-off run" on the harness page. One carries a synthetic alarm that says it is a delivery check and no alarm. The other is a silent run with a reply in the harness's silence form. Both go to the route the developer chose. No tick, order, journal alarm, issue or precinct is touched.
4. Ask the developer what arrived. For the alarm: "The alarm arrived" or "It did not arrive". For the silent run: "The silent run sent nothing" or "It sent something". The result of each branch is checked, not checked or failed.
5. Remove the one-off jobs on every outcome. Their names do not begin with `[lawman] `, because `SKILL.md` finds the installation by the first job with that prefix.

When the developer skipped the check, or the check is incomplete, the summary calls delivery unchecked. When the harness page has no form of a one-off job, the check does not run, and the summary says it did not run.

## Summary

Follow "Finish" in `SKILL.md`. Name these items.

- The items of "Finish" in `references/roles.md`.
- The commands: which files were written, which were left empty, which were removed, and which are proven in the tick environment and which are not. Name the gap of each command that is not proven in it.
- The limits: the numbers of jobs and N that are in force, and the size of a part when the page gives one.
- The delivery check: checked, not checked, failed, or did not run.
- For a file-only install, three facts. Name the output folder that the harness page gives under "Delivery targets". Say how to see recent runs, as "Run records" says. Say that alarms and failures stay in files.
- What a login stop looks like and where it arrives. A run whose account, as the host reports it, differs from `trusted_login` ends with a stopped outcome. The duty desk checks the account every day, and its stop arrives on the delivery routes.
- After the refusal of the signature, the summary of a refusal that "Choose the method of verification" in `references/commands.md` gives.
- When no `law-version` command was written, that the role reads the facts of the law itself.
- When TypeSafe is on, both uses: the court's brief and the clerk's request. When the key was not found, the place to put the key and the variable it needs.
- "Add a department" as the step after a constitution merges.
- For roles and precincts: the menu of the assembly changes them later.
- Delivery and TypeSafe are set at install. The menu does not change them.

When TypeSafe is on and the official skill was missing at install, add these items.

- Show https://docs.typesafe.ai/agent-skill, and recommend installing the official skill by the method on that page.
- Give the step that attaches the skill to the court job: the add-skill form that the harness page gives under "Editing a job".

Offer the user one manual run of the duty desk, and say that the run is paid. When the duty desk's job is paused, say that the run needs the job resumed, and that the job then runs on its schedule, paid. When the user accepts, resume a paused job by the form the harness page gives under "Paused jobs". Then start the run by the form the harness page gives under "Running a role once". Read its record with the user: what worked, what is missing, and what is broken. For anything broken, propose a fix. Apply a fix only after the user says yes.

Then tell the developer that the install is complete.

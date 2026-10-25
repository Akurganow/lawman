# Install

Install follows the shape of every mode in `SKILL.md`: find, propose, decide, apply and summary. Read "Asking" in `SKILL.md` before the first question. Ask in the question tool at every ask site below.

A stop ends the install. Each stop says what failed, the cause and the fix. Fix the cause, then run the assembly again. It restarts at "Choose the installation" in `SKILL.md`. Every write of Apply is safe to repeat.

## Order

The install finds what is available before it checks any file or role. It finds the repository host and the tools that reach it. For each tool, it finds the account the host reports. It finds where the repositories keep their issues, and how the install verifies Lawman's own release. Round two finds each repository's access before that repository's proposal. When no tool reaches the host, offer choices that fit this machine. When the host reports no account, ask the user to sign in. When the user declines, say plainly that the roles cannot work without it, and end the install. Every role writes as that account.

Round one covers Installation, Host, Delivery, Models, Schedule and Gates, TypeSafe, Catalog, and the choice of repositories.

1. Find the facts of every part.
2. For each part, send one proposal, then ask its decisions, batching the independent ones.
3. Ask for one approval to apply, offering apply and change. The approval names `host.md`, the gate files and each job with its model when known.

Before the approval, write only the installation folder, the plugin link and the repository clones. After it, Apply writes in this order.

1. Write `host.md`.
2. Install a verifier the user chose.
3. Install the journal.
4. Write `config.yaml`.
5. Write the gate files.
6. Create the jobs.

Round two runs "Add a precinct" from "Clone and read" on, for each chosen repository. It comes after the writes of round one, because it needs the journal. The summary comes last.

## Installation

Finds:

- The harness, from "Choose the installation" in `SKILL.md`.
- An existing installation.
- Whether the scheduler runs, by the check that the harness page names.
- Whether the plugin is enabled, by the checks that the harness page names under "Installing the plugin", in the page's order.
- The release repository and the release tag, from the plugin's own clone, by the items of "Find the release" below.

Proposes, as rows with their source:

| Row | Value | Source |
| :-- | :-- | :-- |
| Folder | `<installation>` | current, default or yours |
| Harness | the harness page | found |
| Release | tag and repository | found, not editable |

Decides: nothing when an installation exists. "Choose the installation" in `SKILL.md` asks the folder question when none exists.

Stops:

- The scheduler check fails. Show the start instruction that the harness page gives.
- The harness page names no scheduler check. Tell the developer the page lacks one.
- A check under "Installing the plugin" fails. Stop at the first one, and show the page's note for it.
- The plugin clone's origin is not a GitHub form, or the law commit has no release tag. The items of "Find the release" give both stops.

Never:

- Ask the developer to confirm the release repository.
- Test the harness.

### Find the release

1. Read the law clone's origin.
2. Parse the owner and repo, accepting only the forms `https://github.com/<owner>/<repo>` and `git@github.com:<owner>/<repo>` with an optional `.git`, and stop on any other form.
3. Confirm that the law folder's commit carries a release tag. Stop if it has none, because the law is not on a release. Tell the developer that `main` holds only releases and that the install must wait for one.
4. Record the tag that item 3 read as `release_tag`.

Name the `<owner>/<repo>` of item 2 `release_repo`.

## Host

In Apply, write what part Host found into `host.md` in the installation, never into a repository. The notes name the host, the tool in use and the account the host reports for it. For each host action the role skills name, they record how this machine does it with that tool. That covers handing host data to the journal in its forms. They name how the host keeps issues and their templates, and anything particular to this host. They name the verifier of Lawman's release or the user's refusal. They say where a credential lives, never its value. Never write a token, a password, a key or a credential's content into them. Roles follow the notes and never write them. Part Host keeps every line of the section `## Dependency reading` of an existing `host.md`. The section holds one `- <precinct name>: <words>` line per precinct. The precinct path writes it.

Find a tool on this machine that verifies a Sigstore signature. Examples are [gh](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline), [cosign](https://docs.sigstore.dev/), [sigstore-python](https://pypi.org/project/sigstore/), [@sigstore/cli](https://npmjs.com/package/@sigstore/cli) and [sigstore-go](https://pkg.go.dev/github.com/sigstore/sigstore-go). Another tool is fine. When no tool fits, ask whether the user wants to install one, and offer choices that fit this machine. Apply installs the chosen tool. The user may decline. Then say plainly that Lawman cannot verify its releases and that this is unsafe. Block nothing, and record the refusal in the notes.

Finds:

- The repository host, and each tool on this machine that reaches it.
- Whether the version-control tool is present.
- For each tool that reaches the host, the account the host reports.
- Where the chosen tool keeps its credential. Learn the place and never the value.
- How the host keeps issues and their templates, and anything particular to this host.
- For each host action the role skills name, how this machine does it with the chosen tool. That covers handing host data to the journal in its forms.
- For the assembly's own label actions, how this machine reads a repository's labels with their descriptions and creates a label with a description.
- The verifier of Lawman's release, by the paragraph above.

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
- The developer will put the key in the page's place (recommended).
- Turn TypeSafe off.

Result: typesafe is yes or no. `typesafe_key` names the place in words, or reads none when TypeSafe is off. The consent to send a brief stays per repository, and round two asks it.

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

Result: `catalog` is yes or no. The consent for each precinct stays with the precinct path, and round two asks it only when this answer is yes.

Never:

- Send a package name at install.
- Claim anything about how the service keeps data.

## Apply

Apply starts after the approval of round one.

### Write the host notes

Write `<installation>/host.md` as the approved Host rows show, by the head of "Host". Read the existing `host.md` first. Carry every line of its section `## Dependency reading` over unchanged into the new file.

### Install a verifier

When the notes name a verifier that is not on this machine, install it.

### Install the journal

Lawman's release carries, beside each journal binary, a signed statement of where the binary came from. Before a new binary runs, confirm that it matches the checksum the release publishes. Then, with the verifier the host notes name, confirm three facts. The statement names the file's own digest. The release workflow of `release_repo` signed it. That workflow built the file from the commit the law folder holds. Check the signature against a trusted root from Sigstore, never from the release. When the notes name a verifier, a check that cannot run or that reports anything but success is a stop. Notes that are missing or name neither a verifier nor a refusal are a stop too. When the notes record that the user declined a verifier, skip the signature check. None of this needs an account on the release host.

At install, also confirm that the verifier rejects a changed copy of the binary. Never run the copy, and remove every file of the test. A verifier that accepts the copy is a stop.

1. Find the OS and the CPU of this machine, name the OS in lowercase, read `x86_64` as `x64` and `aarch64` as `arm64`, and stop on any other OS or CPU.
2. Set `<asset>` to `journal-bun-<os>-<arch>`, and set `<provenance>` to `<asset>.sigstore.json`.
3. Create `bin` and `runs/install-journal`, then fetch `<asset>`, `<provenance>` and `SHA256SUMS` of `<release_tag>` from `<release_repo>` into `runs/install-journal`, replacing files that lie there, and stop if the fetch fails.
4. Check `<asset>` against the line for it in `SHA256SUMS`, and stop unless they match.
5. When the notes name a verifier, check `<asset>` against `<provenance>` as the paragraph above says, show the signer workflow `<release_repo>/.github/workflows/release.yml` that it checked, and stop if it fails.
6. When the notes name a verifier, run its first test as the second paragraph above says.
7. Move `runs/install-journal/<asset>` to `bin/journal` and make it executable.
8. Remove `SHA256SUMS` and `<provenance>` from `runs/install-journal`, then remove the empty folder.
9. Run `bin/journal probe --schema 6`, and stop if it exits non-zero.
10. Compute the SHA-256 digest of `bin/journal`, and record it as `journal_sha256`.

### Write the config

1. Read the commit that the law folder holds.
2. Record that commit as `law_commit`.
3. Read `contract_version` in `lawman/skills/lawman-law/references/constitution.md`, and record it.
4. Write `<installation>/config.yaml` with the fourteen keys listed in `SKILL.md`.
5. Take `trusted_login` from Host, `deliver` from Delivery, and `typesafe` and `typesafe_key` from TypeSafe, and `catalog` from Catalog.
6. Write `typesafe_precincts` and `catalog_precincts` as none.
7. Write `amended_law_commit` equal to `law_commit`.
8. Read the file back, and stop if a key is missing or a value is empty.

### Write the gate files and create the jobs

1. Write the gate files by "Write and prove" in `references/roles.md`, and write only new or different files.
2. Create the jobs paused, in clock order, by "Create or edit" in `references/roles.md`, which records each interval.

## Repositories

Round one asks which repositories to add, as `references/precinct.md` describes.

Round two runs the section "Add a precinct" of `references/precinct.md` from "Clone and read" on, once for each chosen repository. Each repository has its own proposal and its own approval.

## Summary

Follow "Finish" in `SKILL.md`. Name these items.

- The items of "Finish" in `references/roles.md`.
- For a file-only install, three facts. Name the output folder that the harness page gives under "Delivery targets". Say how to see recent runs, as "Run records" says. Say that alarms and failures stay in files.
- What a login stop looks like and where it arrives. A run whose account, as the host reports it, differs from `trusted_login` ends with a stopped outcome. The duty desk checks the account every day, and its stop arrives on the delivery routes.
- When the user declined a verifier, name both ways to turn the check on later. The assembly offers it at each start while the notes record the refusal. The menu item "Host" runs part Host again.
- When TypeSafe is on and the key was not found, the place to put the key and the variable it needs.
- "Add a department" as the step after a constitution merges.
- For roles and precincts: the menu of the assembly changes them later.
- Delivery and TypeSafe are set at install. The menu does not change them.

When TypeSafe is on and the official skill was missing at install, add these items.

- Show https://docs.typesafe.ai/agent-skill, and recommend installing the official skill by the method on that page.
- Give the step that attaches the skill to the court job: the add-skill form that the harness page gives under "Editing a job".

Offer the user one manual run of the duty desk, and say that the run is paid. When the duty desk's job is paused, say that the run needs the job resumed, and that the job then runs on its schedule, paid. When the user accepts, resume a paused job by the form the harness page gives under "Paused jobs". Then start the run by the form the harness page gives under "Running a role once". Read its record with the user: what worked, what is missing, and what is broken. For anything broken, propose a fix. Apply a fix only after the user says yes.

Then tell the developer that the install is complete.

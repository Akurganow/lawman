# Lawman

An executive branch for software repositories. Patrols file leads as issues, an investigation builds the case, a prosecutor decides whether to charge, a defender argues against the charge, a court rules, and a clerk carries the verdict to a draft pull request, a spec writer writes its spec, and an executor builds the approved change. It runs inside the agent harness a developer already uses, on that harness's own schedule, with the `git` and `gh` already on the machine. No server, no dashboard, no GitHub access of its own.

This release holds the law, the contracts, the marker grammar, the journal, the duty desk, a response unit for human-filed issues, one generic patrol with ten shared departments (abstractions, agent-config, claims, dependencies, logic, privacy, proportion, security, tests, text-residue), an investigation, a prosecutor, a defender, a court, a clerk, a spec writer, an executor, and the assembly for Hermes Agent. The clerk opens draft pull requests for convictions, adopts open pull requests of the trusted login and carries closes and reopens between an issue and its pull request. The spec writer writes a spec on each pull request, and a maintainer answers it with a 👍 or 👎. The executor takes a pull request whose newest spec a maintainer approved with a 👍. It plans the change, writes the code in the pull request's branch and moves the results into the documentation. It passes the CI gate and marks the pull request ready for review. A maintainer can send it back with a 👎 on its comment or with a request for changes. It then waits for the review and the merge.

## How it is laid out

- `skills/`: the roles, as Agent Skills, and `lawman-law`, which is not a role. `duty-desk` picks a precinct and writes the orders. `response-unit` turns an issue a human filed into a lead comment, asks the reporter one question, or sends the issue out. `patrol` takes its order and files leads. `investigation` builds the case on one lead. `prosecutor` charges, returns or declines the case. `defender` defends, returns or refutes the charge. `court` convicts or acquits the defended case. `clerk` opens a draft pull request for a conviction, adopts the trusted login's open pull requests, keeps an issue and its pull request in step, and records a precedent. `spec-writer` writes one `Spec` comment on a pull request. `executor` builds the change of a pull request a maintainer approved and marks it ready for review. `assembly` sets up an installation, adds precincts and amends their constitutions.
- `skills/lawman-law/references/`: what every role shares. `LAW.md` is the law. `constitution.md` and `departments.md` are the contracts that a precinct's constitution and a department page must satisfy. `markers.md` is the grammar of the state markers that roles leave on issues. `tick.md` holds the steps that the nine roles of a tick share, and the sync of the law after a plugin update. `exhibits.md` holds how a role reads numbered lines, quotes a claim of absence, follows a missing path and runs a source command. `departments/` holds the department pages shipped with the law. A department is a page, not an agent. `harnesses/` holds one page per harness with what a skill cannot know about it.
- `plugin.json` and `.claude-plugin/marketplace.json`: the manifests that make this repository an Agent Plugins package and a marketplace.
- `src/journal.ts`: the journal, one program on Bun with SQLite, compiled to a binary per platform and published on releases. `status` and `leads` show the tracker cache as of the last sync. `tick list` prints the ticks and their reports.

A repository under patrol is a precinct. It carries one file, `LAWMAN.md`, its constitution. Everything repository-specific lives there, never in the law.

## Install

You need `git`, the GitHub CLI signed in as the one account every role uses, and Hermes Agent with its gateway running. The three steps below use Hermes commands as the example, and the harness page gives the commands of another harness. The assembly skill does the rest, one question at a time. It explains roles, models and the schedule before it asks about them.

1. Install the plugin:

   ```bash
   hermes plugins install Akurganow/lawman --enable --no-deps
   ```

2. Create the installation directory and link the plugin into it:

   ```bash
   mkdir -p ~/.lawman
   ln -s "$(dirname "$(hermes config path)")/plugins/lawman" ~/.lawman/lawman
   ```

3. From `~/.lawman`, run the assembly skill in an interactive session and answer its questions. Hermes names it `agent-plugin-lawman-492e59eb:assembly`. It verifies the tools and downloads the journal binary from the release. It checks the binary's checksum and attestation, measures what a scheduled session can do, writes `config.yaml`, adds precincts and creates the scheduled jobs. It asks whether the court may use TypeSafe Jev as priority evidence, which needs a TypeSafe API key, and asks again per precinct. It asks which key you use and where you keep it, and never asks for its value.

Update the plugin with `hermes plugins update lawman`. The next tick of any role completes the update. It downloads the journal of the new release, checks it and records the new commit.

The installation holds `lawman/`, the link to the plugin folder, with `bin/journal`, `journal.sqlite` and `config.yaml`. `precincts/` holds one full clone per precinct. `runs/` holds one working tree per patrol, investigation, clerk or executor tick. `departments/` holds your own department pages for several precincts.

Identity: every role uses one identity, the signed-in `gh` or a token the developer adds at setup. The assembly never asks for a token value.

## Develop

```bash
bun test
```

`main` holds only releases. Work goes on branches, notes and documentation included.

To release, merge the branch into `main` locally and tag the merge commit `v<version>`. Push the tag alone with `git push origin v<version>`. The tag starts the release workflow.

When the release lists the four binaries and `SHA256SUMS`, push `main` with `git push origin main`. If the workflow fails, `main` stays as it was. A tag cannot be reused, so the fix is a new version.

CI runs the tests, a fence that keeps repository-specific words out of the law and the generic roles, a leak scan, and a smoke build. A tag `v*` builds the journal for four targets, signs the macOS binaries ad hoc, attests the artifacts and publishes checksums.

## License

MIT. See `LICENSE`.

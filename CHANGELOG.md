# Changelog

All notable changes to Lawman are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.16.2] - 2026-10-19

### Fixed

- The install downloads the journal and `SHA256SUMS` into a temporary folder and checks them. It moves the journal to `bin/journal` and removes the folder, so no checksum file stays in `bin/`.

## [0.16.1] - 2026-10-19

### Fixed

- A restarted install downloads the journal again over the files a stopped run left.
- A restarted amend skips a precinct whose amendment pull request is still open.
- "Add a department" reuses an existing installation page and never overwrites it.

## [0.16.0] - 2026-10-19

### Changed

- The assembly asks through the harness's own question tool, with choices. It proposes each part of the setup in one message, and the developer approves before it writes.
- Delivery routes come as choices that the harness lists. A file-only route says that alarms stay in files.
- The assembly finds whether the TypeSafe key is in place and never reads its value.
- Explanations moved to `skills/assembly/references/explain.md`. The assembly reads them only when the developer asks.

### Removed

- The delivery test, the scheduled-session probe, the silence probe and the paid key probe.
- The model check.
- The release repository confirm.

## [0.15.0] - 2026-10-19

### Added

- The assembly asks where the installation lives. The default is the working directory of an existing `[lawman]` job, else `~/.lawman`. It creates the folder and the `lawman` link to the plugin folder.
- Documentation: a restructured README, `CONTRIBUTING.md`, this changelog, and the pages `docs/pipeline.md`, `docs/harnesses.md`, `docs/configuration.md`, `docs/journal.md`, `docs/departments.md`, `docs/constitution.md` and `docs/precinct-departments.md`.
- `docs/harnesses.md` records the layout that serves eight harnesses. The README lists Kiro, OpenClaw, Pi, Oh-My-Pi, Claude Code, Codex and GitHub Copilot CLI as TBD.

### Changed

- The journal program moved to `journal/`, with its `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `entitlements.plist` and `src/`.
- Hermes Agent installs Lawman with `hermes plugins install Akurganow/lawman --enable`. The repository root holds no `package.json`, so the install asks no dependency question and needs no `--no-deps`.
- A Hermes user starts the assembly in a chat with `/agent-plugin-lawman-492e59eb:assembly`.
- CI and the release workflow run in `journal/`.
- The test that compares `wake` with the order the dispatcher takes runs in process.

## [0.14.0] - 2026-10-18

- Lawman became an Agent Plugins package. `plugin.json` and a marketplace file sit at the root. The law, the shared department pages and the harness page moved under `skills/lawman-law/`.
- The assembly installs from the plugin and amends precinct constitutions after an update. It asks which TypeSafe key the court uses and where it lives, and records the place, never the value.
- Every tick starts by syncing the law. A role that finds a new release downloads and verifies its journal and lets it complete the installation. The new `law-sync` command rewrites `config.yaml`.
- `main` receives only tagged releases.

## [0.13.0] - 2026-10-18

- The assembly teaches the roles, the models and the schedule before it asks about them.
- The new `wake --role <r>` command prints `idle` or the orders a role can take. A run gate built on it skips sessions with no work.

## [0.12.0] - 2026-10-18

- Lawman became a precinct of itself, with an `internal-affairs` department.
- The new `tick list` command reads tick outcomes and reports.
- A precinct's own department page can name source commands.

## [0.11.1] - 2026-10-18

- Fixes for the defects that a live-run audit found.
- The exhibit rules moved into one shared file, and the skills got shorter.

## [0.11.0] - 2026-10-17

- The court can ask TypeSafe Jev for priority evidence about a conviction.

## [0.10.0] - 2026-10-17

- The executor takes a pull request whose newest spec a maintainer approved, writes the change in the branch and marks the pull request ready.
- The journal tracks the executor's turn on each pull request.

## [0.9.0] - 2026-10-17

- The court sets a priority from P0 to P3 on a conviction.
- The clerk opens draft pull requests for convictions and adopts open pull requests of the trusted login.
- The new spec writer writes one `Spec` comment per pull request. A maintainer votes on it with a 👍 or 👎.
- The journal moves to schema 4. An older binary rejects the new outcome tokens.

## [0.8.0] - 2026-10-16

- Ten shared department pages ship with the law.
- A department visits a precinct about once every D patrol ticks, where D is the number of the precinct's departments.
- The assembly can add a department to a precinct after founding.
- Every scheduled job name starts with `[lawman]`.

## [0.7.0] - 2026-10-16

- The response unit turns an issue a human filed into a lead comment, asks the reporter one question, or sends the issue out.
- The new `intake` command lists issues that wait for the response unit.

## [0.6.0] - 2026-10-16

- The shared tick steps moved into one file that every role reads.
- The assembly updates the installation to a release tag.
- The `pause` command is gone.

## [0.5.0] - 2026-10-16

- The clerk opens a pull request for a ruling's precedent and leaves a marker comment.
- Every role uses one identity.

## [0.4.0] - 2026-10-16

- The court takes one order on a defended case and rules conviction or acquittal.
- An older journal binary rejects the outcomes `convicted` and `acquitted`, so update the installation before the first court tick.

## [0.3.0] - 2026-10-15

- The defender argues against a charge with a defence, a return or a refutation.
- The journal routes a charged case to the defender.

## [0.2.2] - 2026-10-15

- A successful tick answers the silence token. Only alarms, failures and stops reach the delivery platform.

## [0.2.1] - 2026-10-15

- The duty desk syncs every weighted precinct before it writes stage orders.

## [0.2.0] - 2026-10-15

- The investigation and the prosecutor roles, with the `case` and `due` commands.
- The journal split into modules. CI runs Biome and a strict type check before the tests.

## [0.1.2] - 2026-10-15

- The release workflow checks the package version against the tag.
- The journal closes four findings from an inspection.

## [0.1.1] - 2026-10-15

- The assembly proposes a daily default schedule and checks the harness turn limit.
- Lawman sets no cron cap and no time budget. Harness settings change only through the harness's own commands.
- A role can run once through `hermes cron run`, which Hermes records.

## [0.1.0] - 2026-10-14

- The first release: the law, the journal, the duty desk, patrol, the assembly and the Hermes Agent harness page.
- CI with a fence for repository-specific words. A release workflow builds four binaries, signs the macOS ones ad hoc and publishes checksums.

[0.16.2]: https://github.com/Akurganow/lawman/compare/v0.16.1...v0.16.2
[0.16.1]: https://github.com/Akurganow/lawman/compare/v0.16.0...v0.16.1
[0.16.0]: https://github.com/Akurganow/lawman/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/Akurganow/lawman/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/Akurganow/lawman/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/Akurganow/lawman/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/Akurganow/lawman/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/Akurganow/lawman/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/Akurganow/lawman/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/Akurganow/lawman/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Akurganow/lawman/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Akurganow/lawman/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Akurganow/lawman/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Akurganow/lawman/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Akurganow/lawman/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Akurganow/lawman/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Akurganow/lawman/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/Akurganow/lawman/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Akurganow/lawman/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Akurganow/lawman/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/Akurganow/lawman/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Akurganow/lawman/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Akurganow/lawman/releases/tag/v0.1.0

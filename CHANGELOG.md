# Changelog

All notable changes to Lawman are listed here, newest first. The bump workflow writes each entry from the [conventional commits](https://www.conventionalcommits.org/) since the last tag. The entries up to 0.18.0 follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- - -

## v0.23.1 - 2026-11-02
#### Bug Fixes
- (**law**) keep the Blockers list open, name only the normal states (e594cf1)
- (**law**) Blockers holds only what limited the tick (fa0ef13)

- - -


## v0.23.0 - 2026-11-02
#### Features
- (**law**) speak to the user in the user's language (b91b4a0)
#### Bug Fixes
- (**assembly**) merge on request, keep answers on timeout (2a94cb2)
- (**assembly**) always ask license use, true answers on cancel and consent (68d5bd3)
- (**assembly**) ask plain license questions after reading the repository (a85e499)
- (**hermes**) a manual run clears the gate so it always runs the role (0563843)
- (**journal**) a role with an order passes its run gate at every check (d0fc553)
- (**law**) apply branch review findings (a0bbc92)
- (**licenses**) write no for a repository without a license, keep row status mappings in the first check (95c6933)
#### Refactoring
- (**licenses**) the patrol reads sources, the assembly only asks consent (b012b69)

- - -


## v0.22.1 - 2026-11-02
#### Documentation
- add the license facts to LAWMAN.md (8ee37aa)

- - -


## v0.22.0 - 2026-11-02
#### Features
- (**assembly**) add the software-heritage license source row (8f75415)
- (**assembly**) add the revision-file license source row (d9abbec)
- (**assembly**) add the ubuntu license source row (d7bf764)
- (**assembly**) add the debian license source row (976fc76)
- (**assembly**) add the pub-dev license source row (bfe7ceb)
- (**assembly**) add the nimble license source row (6081ecf)
- (**assembly**) add the packagist license source row (d20e7d8)
- (**assembly**) add the homebrew license source row (8300b7f)
- (**assembly**) add the hex license source row (502ff6e)
- (**assembly**) add the conda-forge license source row (c693339)
- (**assembly**) add the cocoapods license source row (3d2af20)
- (**assembly**) add the jsr license source row (88b1a0e)
- (**assembly**) add the clearly-defined license source row (63e9c00)
- (**assembly**) add the metacpan license source row (7a011c3)
- (**assembly**) add the deps-dev license source row (0d814b0)
- (**assembly**) add the conan license source row (c77b93c)
- (**assembly**) add the opam license source row (3d89abf)
- (**assembly**) add the clojars license source row (3e6e313)
- (**assembly**) add the luarocks license source row (21784a1)
- (**assembly**) add the nuget-spec license source row (be449a0)
- (**assembly**) add the elm license source row (4e29ebd)
- (**assembly**) add the vcpkg license source row (4c6738a)
- (**assembly**) add the crandb license source row (2c21440)
- (**assembly**) add the hackage license source row (3ba4627)
- (**assembly**) add the rubygems license source row (1112160)
- (**assembly**) add the crates-io license source row (f97df2e)
- (**assembly**) add the pypi-json license source row (7d8f941)
- (**assembly**) explain the license department (2ccfc2b)
- (**assembly**) write no Departments line for licenses on amend (1374f3f)
- (**assembly**) keep the license reading entries and write the license key at install (5e71e13)
- (**assembly**) ask the license questions on the add path and update them on re-check (32fcf9e)
- (**assembly**) add the license department mode and key to the assembly (183009a)
- (**assembly**) add the license department update mode (228bd6c)
- (**assembly**) add the license department questions (a06ae25)
- (**assembly**) add the index of the license source reference (88a8bc0)
- (**assembly**) add the npm-registry license source row (7e03ad3)
- (**law**) count a license source quote of investigation as an exhibit (1aedfe8)
- (**law**) add the license source time limit to the Hermes page (2abc2d7)
- (**law**) add the rule for reading a long license text (e6c0cbb)
- (**law**) add the rule for reading a value from a source reply (93f1500)
- (**law**) add the law for reading license sources (a909d32)
- (**law**) let investigation read a license source and compare the use (82a322a)
- (**law**) tell the user what an update asks of them in the tick that synced the law (700b0ae)
- (**law**) name the Licenses section as the one exception to margin notes (b9384fb)
- (**law**) add the licenses rotation rule and source form to the department contract (f637d07)
- (**law**) point the patrol to the license reading law (57ba336)
- (**law**) state the license exceptions and the evidence of a source read (cb5014b)
- (**law**) add the licenses department page (4877654)
- (**law**) skip the licenses page without consent in the duty desk (996e6c4)
- (**law**) add the classes of the licenses source line (2b5f190)
#### Bug Fixes
- (**assembly**) let the vcpkg row ground no finding (d36ed4d)
- (**assembly**) use the cost sentence of the row in the source consent question (fc1f627)
- (**assembly**) send a vcpkg pin with an override or a version constraint to not-covered (1f92463)
- (**assembly**) define the User-Agent project address and the reading way, and trim the revision-file block (1d570b3)
- (**assembly**) correct the license source rows and drop unshipped fixture names (38764be)
- (**assembly**) count pins per visit for every row and tighten the row offer (b23cdea)
- (**docs**) state every public sample request of the live read (0ed4627)
- (**docs**) state the wrong-value rule, the User-Agent address and the licenses exception in the shared table (f1864c3)
- (**docs**) state the sources condition of license reading as the law does (4cab224)
- (**license-law**) read a wrong Licenses value one way and keep the lock visit complete (b4b71b6)
- (**license-law**) close the gaps of the reading rules and the text read (1b70a27)
- (**patrol**) open the reading rules only when the license list condition holds (70b8828)
#### Documentation
- (**assembly**) name the value classes of the npm-registry row as the law names them (716f39c)
- add the rule to ship law before code and move the update notice to the tick (ae135aa)
- record the decisions on the license department design (4e416d1)
- state that Lawman supports every harness and that a page holds differences only (6468ce0)
- describe the license key, the entry and what leaves the machine (d2ecda4)
- describe the Licenses section of the constitution (ef07014)
- describe the licenses page and its rotation rule (a76d5a7)
- describe the license department in the readme (552a2f5)
#### Tests
- let the department page tests skip folders (c70ee6f)
#### Refactoring
- (**license-law**) drop sentences that repeat the law from the tick file and role skills (ac062a1)

- - -


## v0.21.4 - 2026-11-01
#### Documentation
- limit the trusted files on the design page to the law's list (323c419)
- add the design page with goals, principles and rejected alternatives (c87aee9)

- - -


## v0.21.3 - 2026-11-01
#### Documentation
- state the update rule as a duty of the change (94cf6e8)
- require design for every user's installation (8a9e3de)

- - -


## v0.21.2 - 2026-11-01
#### Miscellaneous Chores
- remove INTENT.md (dd91055)

- - -


## v0.21.1 - 2026-10-27
#### Tests
- run the referral cases through both runners and share the minimal issues (754ced8)

- - -


## v0.21.0 - 2026-10-26
#### Features
- Hermes page shows how a role calls an expert (b9f3a13)
- Lawman takes any human ticket as a charge, and the court refers a requirement it cannot decide (549cb59)
- Jev grades requirements through a requirement brief (e071481)
- case line gains kind, answer and answer_id, and the referral stage (b535180)
- BREAKING: constitution contract version 3 (d6a6cb5)
- BREAKING: issue sync reads one object with writers, comment ids and reactions. After this update, run the assembly, open the amendment pull request it offers for each precinct, merge it, then choose Host once to rewrite host.md. (f585c3a)
#### Documentation
- any ticket, referrals, experts and the upgrade path (8db47ca)

- - -


## v0.20.0 - 2026-10-25
#### Features
- check each precinct's dependencies against the OSV catalog, run the assembly to answer the consent question (a3c0168)
- investigation reads one catalog record per lead (1802763)
- Hermes forms for sending to the catalog (9bf811b)
- assembly mode for missing catalog answers (cbdd4ab)
- catalog send rules in the exhibits (2d91013)
- journal reads catalog answers and one record per lead (7980b37)
- assembly agrees the dependency reading way per precinct (e5f0d1a)
- known vulnerabilities leave the dependencies department (41c3085)
- journal builds catalog requests in parts (be16256)
- assembly asks for catalog consent at install (a619bdc)
- a catalog match alone raises no alarm (fb74f41)
- vulnerabilities department page (7629e11)
- catalog list form and value classes in the journal (6a8e0fe)
#### Bug Fixes
- catalog mode agrees the reading way for a precinct that already said yes (b876d74)
- a catalog reply always lands on the part it was sent for (10bdd11)
#### Documentation
- Hermes page names the failed-request case (1ae658d)
- review fixes for the catalog check (c0ef3a6)
- Hermes catalog forms pass the harness command check (9eca7a4)
- catalog check, consent keys and the vulnerabilities department (956251b)
#### Refactoring
- catalog entries in their own module (3f7037c)

- - -


## v0.19.0 - 2026-10-25
#### Features
- BREAKING: margin notes and a Labels section in the constitution (f27735c)
- alarm on a pull request that waits for a decider (efb5fa8)
#### Bug Fixes
- a changed alarm detail raises a new alarm (80b0877)

- - -


## v0.18.3 - 2026-10-23
#### Bug Fixes
- reject a stateReason that is no string (a88a4dd)
- reject issue states outside the sync form (f01eaee)

- - -


## v0.18.2 - 2026-10-23
#### Performance Improvements
- find each role's last tick with a window query (00c82ef)

- - -


## v0.18.1 - 2026-10-23
#### Bug Fixes
- give the slow library-failure test 30 seconds on macOS runners (ea98607)
#### Documentation
- say a breaking change raises the minor version before 1.0.0 (f497409)
- describe the release through cocogitto and conventional commits (21d39b5)
#### Continuous Integration
- run the bump in its own workflow (011dba3)
- release with cocogitto on every merge to main (a6268e8)

- - -


## [0.18.0] - 2026-10-23

### Added

- The command `journal clean` prints host text without hidden HTML comments, secrets and hidden characters, and turns each image into a link. Roles read the bodies of issues, pull requests, comments, reviews and inline remarks, and commit messages, only through it.
- The body check finds the secrets of many providers, private key blocks, hidden characters, images and HTML comments in a role's own words.
- The journal has runtime dependencies. The lockfile pins them, and CI and the release install them with the frozen lockfile.
- The repository holds a notices file with the licences of the bundled packages.

### Changed

- `lint-body` reads the text as the host renders it, cleans quotes, prints the cleaned text on stdout and prints reasons on stderr. The host receives that output as the journal printed it.
- Patrol checks the title and the body each alone. The executor checks its commit messages.
- Every role fences a quote with a fence longer than any run of the fence character in the quote.

### Removed

- The body check no longer rejects paths, mentions, title characters, an empty title or a long body. The leak rule stays an instruction for roles.

### Fixed

- The clerk's hand-off of an adopted pull request no longer stops on its old body (#14).

## [0.17.1] - 2026-10-21

### Fixed

- The assembly verifies the real name of every model the developer names before it writes any job. The model check removed in 0.16.0 returns in this form. The agent picks the means, against the provider the job will use. A single real name that resembles the typed one counts as verified.
- When a name cannot be verified, the assembly asks: another name, the harness default, or the name as is. Several matches are listed in the question text.
- The install and roles approvals show each job's model when known.

## [0.17.0] - 2026-10-20

### Changed

- The law, the role skills, the department pages and the assembly state the result each step needs and what must not happen. They name no version-control command, no host command, query or field, and no shell utility. Only the journal's commands and the harness page's forms stay named.
- The assembly has a new part, Host. It finds the repository host, the tools that reach it and the account the host reports, with the user. It writes `host.md` in the installation: how this machine does each host action, and what is particular to the host. Roles follow these notes. The menu gains the item "Host".
- The journal's pull request and decider inputs take Lawman's own flat forms. The new command `journal form <issues|pulls|decider>` prints each form with an example, and a rejected input prints its form.
- The journal normalises every time it accepts to UTC and rejects a value that is no time.
- A repository path may have more than two segments, as in `group/sub/project`. A login may hold `.` and `_`.
- `stopped-gh-auth` is now `stopped-host-auth`.
- An installation from an earlier version needs a reinstall. Roles stop until `host.md` exists, and only the assembly writes it.
- Lawman's release carries a signed provenance file beside each journal binary. A tick checks it with the verifier the host notes name, against a trusted root from Sigstore, and needs no account on the release host. The assembly finds the verifier with the user. A user may decline it with a plain warning and turn the check on later.
- A push to the branch `release-trial` runs the release workflow without publishing a release. The run builds and signs the binaries.
- At the end of the install, the assembly offers one manual run of the duty desk and reads its record with the user. It resumes a paused duty-desk job first when the user accepts.
- Every role but the duty desk gets a run gate by default.
- The choice of repositories takes a list in free text. The clone folder is `precincts/<precinct name>`. Round two shows each repository's access as a row and runs no read probes.
- The assembly offers typical documents a repository lacks: open an issue, draft them now, or skip.

### Fixed

- A judging document is evidence. The assembly never checks its content as a department page, and never drops a department over it. A missing judging path reads as `judged by none`.
- A path that the constitution names and the ref lacks is skipped and named in Blockers. It no longer stops the role with `skipped-bad-constitution`.
- The harness page names a job by its id or its full name `[lawman] <role>`, and gives the resume form for a paused job.

## [0.16.5] - 2026-10-19

### Changed

- A repository whose constitution is already in place and passes lint joins at weight 1. A new draft still starts at weight 0 until its pull request merges.
- Whenever a weight above zero is set and a job is paused, the assembly offers to resume it. A declined offer comes back at the next weight.

## [0.16.4] - 2026-10-19

### Fixed

- The code span pattern of the body lint holds no form that the Hermes plugin scanner rates as an inline shell snippet. That rating blocks a plugin update. CI now runs the scanner of the newest Hermes on every push and pull request.
- An escaped backtick no longer opens a code span in the body lint, so an image after it is caught again.
- "Add a department" sends a change of a reused installation page back to the choice of the place.
- The law says that a stopped tick of the duty desk is delivered.

## [0.16.3] - 2026-10-19

### Changed

- A tick that succeeds, skips or stops answers only the silence form. Its report stays in the journal. Only alarms, failures and stops of the law sync or the duty desk reach the delivery routes.

### Fixed

- The body lint no longer reads a quoted `vec![...]` or another `![` inside code as an image embed. Investigation stopped on such quotes from Rust code.

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

[0.18.0]: https://github.com/Akurganow/lawman/compare/v0.17.1...v0.18.0
[0.17.1]: https://github.com/Akurganow/lawman/compare/v0.17.0...v0.17.1
[0.17.0]: https://github.com/Akurganow/lawman/compare/v0.16.5...v0.17.0
[0.16.5]: https://github.com/Akurganow/lawman/compare/v0.16.4...v0.16.5
[0.16.4]: https://github.com/Akurganow/lawman/compare/v0.16.3...v0.16.4
[0.16.3]: https://github.com/Akurganow/lawman/compare/v0.16.2...v0.16.3
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

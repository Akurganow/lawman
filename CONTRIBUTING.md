# Contributing

Lawman has two kinds of files. The journal is a program with tests. The law, the skills and the harness pages are text that agents read. Each kind has its own checks.

[AGENTS.md](AGENTS.md) holds further rules for an agent that changes this repository.

## Design for every user

Lawman serves every developer who installs it, on repositories its authors have never seen.

- Design every change, question, migration and check for any user's installation and repositories.
- Never focus on the repositories of a maintainer or limit a change to them. They are one installation among others and a source of measurements.
- Keep project rules in this repository. A contributor sees nothing else.
- Bring a change in how Lawman works to each user through the update. After the update, the tick that synced the law must tell the user what to do, from the list in the section "Sync the law". The assembly must explain the change.
- Ship law before code. Put code in the journal only for what must be safe and reliable, such as the cleaning of foreign text. Do not turn a rule into code before an error of the role is measured.
- Make the assembly explain the change and ask the user what happens to the existing data. Make it ask the same at a first install into a repository that holds the old form.
- Let the assembly read the repository before it asks. Ask every question that has no answer in the record. Recommend the answer that a file shows, and name the file's path and line.

## Develop the journal

The journal lives in `journal/`. Run every command from that folder.

```bash
cd journal
bun install --frozen-lockfile
bun run check
bun run test
```

- `bun run check` runs the strict type check, then Biome with warnings as errors.
- `bun run fix` applies the Biome fixes.
- Use the Bun version that `.github/workflows/ci.yml` installs; an older one can hang a parallel run.

`bun run test` also checks the links from the skills to the law. A red result there means a skill names a section that its role does not read, or that left the law.

## Update the documentation

Every change updates the documentation it affects in the same pull request. A change that reverses a design decision also updates [the design page](docs/design.md). An open question goes to an issue.

## What CI runs

CI runs on every push and pull request, in these jobs.

- `commits` runs on pull requests. It checks that every commit of the pull request is a conventional commit, because the release tool reads every commit since the last version tag.
- `test` runs in `journal/`. It installs with the frozen lockfile, then runs `bun run check` and the tests. It compiles a Linux binary and runs it with `--version`. It checks its `clean` output on a small sample.
- `fence` keeps repository-specific text out of `skills/`, except `skills/assembly` and the harness pages. The patterns in `fence-patterns.txt` match paths, manifests and build tools of one repository.
- `leaks` rejects home paths and GitHub tokens in every file.
- `ignore` checks that `docs/gangsta/` stays ignored by git.
- `hermes-scan` runs the plugin scanner on the tree. The scanner comes from the Hermes that users update to. Hermes refuses an update unless the verdict is safe, so the job fails on any other verdict.

## Release

`main` holds only releases. Work goes on branches, notes and documentation included. A plugin update pulls the newest commit of `main`, and the law sync stops on a commit without a release tag. The tag comes from the plugin's clone, or from the installation's `law-version` command.

Every commit message is a [conventional commit](https://www.conventionalcommits.org/), such as `fix: keep the old body of an adopted pull request`. The release reads the type: `feat` raises the minor version and every other type the patch version. A breaking change raises the major version. A breaking change carries `!` after the type or scope, or a `BREAKING CHANGE` footer. Run `cog install-hook commit-msg` once in a clone, so that git refuses any other message.

1. Open a pull request and wait until its CI is green.
2. Merge the pull request on the host.
3. Wait until the release lists the four binaries, the provenance file beside each and `SHA256SUMS`.

Never bump a version, write a changelog entry or push a version tag by hand. The one tag set by hand is a beta tag, described below. Never touch a local `main`: no merge, reset, commit or push from it. `main` changes only when a pull request is merged on the host, or by the version commit of the bump workflow.

The merge starts the bump workflow on `main`. It runs [cocogitto](https://docs.cocogitto.io) with `cog.toml`. The workflow asks for the major version itself when a breaking change came after the last version tag, and does not rely on `--auto` alone. It writes the new version into `plugin.json` and `journal/package.json` and the entry into `CHANGELOG.md`, then commits both and tags the commit. It pushes the commit and the tag with the deploy key, whose private half is the `RELEASE_DEPLOY_KEY` secret.

A version tag starts with `v`, and it starts the release workflow. The workflow installs the dependencies with the frozen lockfile, checks that `journal --version` equals the tag and runs the tests. It builds the journal for four targets and signs the macOS binaries ad hoc. It attests each binary and places its provenance file, `journal-bun-<os>-<arch>.sigstore.json`, beside it. It writes and attests `SHA256SUMS` and publishes the release, with the changelog entry as its notes. A tag cannot be reused, so a failed release is fixed by the next merge.

A push to `release-trial` runs the same build, tests and attestations without the version check. It publishes nothing: no release, no tag and no pre-release.

### Beta

Large work can gather on a working branch, and its pull requests merge into that branch. A beta lets a tester install that branch before it merges into `main`.

- Set a beta tag by hand on a commit of the working branch, and only when the maintainer says so.
- Name it `beta-<version>.<n>`, such as `beta-1.0.0.1` for the first beta of 1.0.0. cocogitto does not read this form as a version, and the bump workflow reads only `v*` tags.
- The beta tag starts the release workflow. It builds, tests and attests the same files as for a version tag and publishes them as a pre-release.
- On a beta tag the workflow does not check `journal --version` against the tag, and it takes no notes from `CHANGELOG.md`.
- A beta changes no file of the branch. The manifests keep their version, so `journal --version` of a beta prints it, and `CHANGELOG.md` gets no section.
- Install the beta at the commit of its tag. Then fetch the tag into the plugin's clone by hand, or have the installation's `law-version` command report it. The install and the law sync need a release tag on that commit.
- The merge of the working branch into `main` is the release. The bump counts from the last version tag, so the changelog entry lists every change after that tag.

## Write law and skill text

Agents read this text and cannot ask what it means. Follow these rules.

- Keep each sentence to 25 words.
- Write in the active voice.
- Use no semicolons.
- Put one thought in one sentence.
- Use plain words.
- Name a source by reference. Do not retell it.
- Put the reason of a rule in `docs/law-reasons.md`, word for word, under the heading of its section. Keep it out of the rule.
- Keep an open list open. Mark it open with a word such as "such as", "for example" or "among". Do not rewrite it as "only these".
- Add a gate only after a measured event or on a recorded decision of the project owner. A gate is a check, a limit, a timeout or a ban.
- Name no deadline and no action for silence in a request to a decider. Silence is waiting.
- Rewrite old text only where a sentence passes 25 words, reads two ways or gives a reason. Rewrite also a sentence that repeats a sentence of the same section or names a time limit, a date or a past event. Keep each condition, order, number and quantifier.
- Name no time limit, date or past event in the law. State the rule. A condition such as "when the host reports it" is a rule.
- Leave alone a line that a test pins word for word, text that a program parses and any text of a precinct.
- Say what to do and not which tool to use. Law and role text names the action.
- Put a tool that the skill cannot know on the harness page of the harness that has it.
- Mark each fact on a harness page by its source, with a mark from [How to read the marks](docs/harnesses.md#how-to-read-the-marks).
- Name no version of the harness.

## Add a harness

Follow [Adding a harness](docs/harnesses.md#adding-a-harness).

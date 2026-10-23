# Contributing

Lawman has two kinds of files. The journal is a program with tests. The law, the skills and the harness pages are text that agents read. Each kind has its own checks.

## Develop the journal

The journal lives in `journal/`. Run every command from that folder.

```bash
cd journal
bun install --frozen-lockfile
bun run check
bun test
```

- `bun run check` runs the strict type check, then Biome with warnings as errors.
- `bun run fix` applies the Biome fixes.
- Use the Bun version that `.github/workflows/ci.yml` installs.

`bun test` also checks the repository around the program:

- `plugin.json` and `journal/package.json` hold the same version.
- The marketplace entry named `lawman` has the source `./`.
- No skill or department page holds a command form that scheduled runs refuse, such as `bash -c` or a heredoc fed to a shell.

## Update the documentation

Every change updates the documentation it affects in the same pull request.

## What CI runs

CI runs on every push and pull request, in six jobs.

- `commits` runs on pull requests. It checks that every commit of the pull request is a conventional commit.
- `test` runs in `journal/`. It installs with the frozen lockfile, runs `bun run check` and `bun test`, compiles a Linux binary, runs it with `--version`, and checks its `clean` output on a small sample.
- `fence` keeps repository-specific words out of `skills/`, except `skills/assembly` and the harness pages. The patterns sit in `fence-patterns.txt`.
- `leaks` rejects home paths and GitHub tokens in every file.
- `ignore` checks that `docs/gangsta/` stays ignored by git.
- `hermes-scan` runs the plugin scanner of the newest Hermes on the tree. Hermes refuses an update unless the verdict is safe, so the job fails on any other verdict.

## Release

`main` holds only releases. Work goes on branches, notes and documentation included. A plugin update pulls the newest commit of `main`, and the law sync stops on a commit without a release tag.

Every commit message is a [conventional commit](https://www.conventionalcommits.org/), such as `fix: keep the old body of an adopted pull request`. The release reads the type: `feat` raises the minor version and every other type the patch version. A breaking change raises the major version from 1.0.0 on and the minor version before it. Run `cog install-hook commit-msg` once in a clone, so that git refuses any other message.

1. Open a pull request and wait until its CI is green.
2. Merge the pull request on the host.
3. Wait until the release lists the four binaries, the provenance file beside each and `SHA256SUMS`.

Never bump a version, write a changelog entry or push a tag by hand. Never touch a local `main`: no merge, reset, commit or push from it. `main` changes only when a pull request is merged on the host, or by the version commit of the bump workflow.

The merge starts the bump workflow on `main`. It runs [cocogitto](https://docs.cocogitto.io) with `cog.toml`. It writes the new version into `plugin.json` and `journal/package.json` and the entry into `CHANGELOG.md`, then commits both and tags the commit. It pushes the commit and the tag with the deploy key, whose private half is the `RELEASE_DEPLOY_KEY` secret.

The tag starts the release workflow. It installs the dependencies with the frozen lockfile, checks that `journal --version` equals the tag and runs the tests. It builds the journal for four targets and signs the macOS binaries ad hoc. It attests each binary and places its provenance file, `journal-bun-<os>-<arch>.sigstore.json`, beside it. It writes and attests `SHA256SUMS` and publishes the release, with the changelog entry as its notes. A tag cannot be reused, so a failed release is fixed by the next merge.

A push to `release-trial` runs the build without the version check and publishes no release.

## Write law and skill text

Agents read this text and cannot ask what it means. Follow these rules.

- Keep each sentence to 25 words.
- Write in the active voice.
- Use no semicolons.
- Say what to do and not which tool to use. Law and role text names the action.
- Put a tool that the skill cannot know on the harness page of the harness that has it.
- Mark each fact on a harness page by its source. Use one of these marks:
  - stated by the docs (URL)
  - stated by `--help`
  - read in the harness code
  - seen in a run
  - checked with the harness's check function
  - not verified
- Name no version of the harness.

## Add a harness

Follow [Adding a harness](docs/harnesses.md#adding-a-harness).

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

CI runs on every push and pull request, in four jobs.

- `test` runs in `journal/`. It installs with the frozen lockfile, runs `bun run check` and `bun test`, compiles a Linux binary and runs it with `--version`.
- `fence` keeps repository-specific words out of `skills/`, except `skills/assembly` and the harness pages. The patterns sit in `fence-patterns.txt`.
- `leaks` rejects home paths and GitHub tokens in every file.
- `ignore` checks that `docs/gangsta/` stays ignored by git.

## Release

`main` holds only releases. Work goes on branches, notes and documentation included. A plugin update pulls the newest commit of `main`, and the law sync stops on a commit without a release tag.

1. Bump `journal/package.json` and `plugin.json` to the same version.
2. Put the entry for the version in `CHANGELOG.md`, with the release date in its heading.
3. Open a pull request and wait until its CI is green.
4. Merge the branch into `main` locally.
5. Tag the merge commit with `git tag v<version>`.
6. Push the tag alone with `git push origin v<version>`.
7. Wait until the release lists the four binaries and `SHA256SUMS`.
8. Push `main` with `git push origin main`.

Never tag before the CI of the pull request is green. A tag cannot be reused, so a failed release gets a new version. If the release workflow fails, `main` stays as it was.

The tag starts the release workflow. It checks that `journal --version` equals the tag and runs the tests. It builds the journal for four targets, signs the macOS binaries ad hoc and attests the binaries. It writes and attests `SHA256SUMS` and publishes the release.

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

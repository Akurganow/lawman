# Lawman

An executive branch for software repositories. Patrols file leads as issues, an investigation builds the case, a prosecutor decides whether to charge, a court rules, and clerks carry a verdict to a pull request. It runs inside the agent harness a developer already uses, on that harness's own schedule, with the `git` and `gh` already on the machine. No server, no dashboard, no GitHub access of its own.

This release holds the law, the contracts, the marker grammar, the journal, the duty desk, one generic patrol with the Abstractions department, an investigation, a prosecutor, and the assembly for Hermes Agent. The defender, the court and the execution come in later releases.

## How it is laid out

- `law/`: what every role shares. `LAW.md` is the law. `constitution.md` and `departments.md` are the contracts a precinct's constitution and a department page must satisfy. `markers.md` is the grammar of the state markers roles leave on issues.
- `skills/`: the roles, as Agent Skills. `duty-desk` picks a precinct and writes the orders. `patrol` takes its order and files leads. `investigation` builds the case on one lead. `prosecutor` charges, returns or declines the case. `assembly` sets up an installation, adds precincts and updates the law.
- `departments/`: department pages shipped with the law. A department is a page, not an agent.
- `harnesses/`: one page per harness with what a skill cannot know about it.
- `src/journal.ts`: the journal, one program on Bun with SQLite, compiled to a binary per platform and published on releases.

A repository under patrol is a precinct. It carries one file, `LAWMAN.md`, its constitution. Everything repository-specific lives there, never in the law.

## Install

You need `git`, the GitHub CLI signed in as the account that will file leads, Hermes Agent with its gateway running, and the two steps below. Then the assembly skill does the rest, one question at a time.

1. Clone the law into the installation directory and check out the latest tag:

   ```bash
   git clone https://github.com/Akurganow/lawman ~/.lawman/lawman && git -C ~/.lawman/lawman checkout "$(git -C ~/.lawman/lawman describe --tags --abbrev=0)"
   ```

2. Make the skills visible to the harness. For Hermes Agent, add `~/.lawman/lawman/skills` to `skills.external_dirs` in its config, as `harnesses/hermes.md` describes.

3. From `~/.lawman`, run the assembly skill in an interactive session and answer its questions. It verifies the tools, downloads the journal binary from the release and checks its checksum and attestation, measures what a scheduled session can do, writes `config.yaml`, adds precincts and creates the scheduled jobs.

The installation holds `lawman/` (the law clone), `bin/journal`, `journal.sqlite`, `precincts/` (one full clone per precinct), `runs/` (one working tree per patrol or investigation tick), `departments/` (your own department pages for several precincts) and `config.yaml`.

Tokens: the assembly never asks for a token value. When a scheduled session cannot reach GitHub, the harness page says where the developer puts a minimal fine-grained token themselves.

## Develop

```bash
bun test
```

CI runs the tests, a fence that keeps repository-specific words out of the law and the generic roles, a leak scan, and a smoke build. A tag `v*` builds the journal for four targets, signs the macOS binaries ad hoc, attests the artifacts and publishes checksums.

## License

MIT. See `LICENSE`.

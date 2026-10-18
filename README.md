# Lawman

An executive branch for software repositories. Patrol files leads as issues. An investigation builds the case. A prosecutor decides whether to charge. A defender argues against the charge. A court rules. A clerk carries the verdict to a draft pull request. A spec writer writes its spec. An executor builds the approved change.

Lawman runs inside the agent harness a developer already uses, on that harness's own schedule, with the `git` and `gh` already on the machine. It has no server, no dashboard and no GitHub access of its own.

A repository under patrol is a precinct. It carries one file, `LAWMAN.md`, its constitution. Everything repository-specific lives there, never in the law.

## How it works

### The pipeline

Each role is an Agent Skill. The scheduler starts a role. The role takes one order, does one job and exits. A duty desk writes the orders. Patrol, and a response unit for issues a human filed, produce leads. Each later stage costs more per case and sees fewer cases.

A spec writer writes a `Spec` comment on each pull request. A maintainer answers it with a 👍 or 👎. The executor takes a pull request whose newest spec a maintainer approved with a 👍. It plans the change, writes the code in the pull request's branch and moves the results into the documentation. It passes the CI gate and marks the pull request ready for review. A maintainer can send it back with a 👎 on its comment or with a request for changes. It then waits for the review and the merge.

[Roles and stages](docs/pipeline.md)

### Harnesses

Lawman installs as an Agent Plugins package, with one manifest at the repository root and one skill folder per role. Lawman installs on Hermes Agent today. The other harnesses are TBD.

[Harnesses and layout](docs/harnesses.md)

### Configuration

The installation keeps its settings in `config.yaml`, plain `key: value` lines. It holds twelve keys, among them the harness, the law commit, the release, the trusted login, the delivery platform and the TypeSafe answers. It never holds the value of a token or a key.

[config.yaml](docs/configuration.md)

### The journal

The journal is one program on Bun with SQLite. It compiles to a binary per platform, which each release publishes and the installation keeps as `bin/journal`. It holds the orders, the ticks, the alarms and a cache of the tracker.

[Journal commands](docs/journal.md)

### Departments

A department is a page, not an agent. One generic patrol reads the page and sweeps its subject. Ten shared departments ship with the law: abstractions, agent-config, claims, dependencies, logic, privacy, proportion, security, tests and text-residue. A precinct adds its own pages in `.lawman/departments/`.

[Departments](docs/departments.md)

[Special departments of a precinct](docs/precinct-departments.md)

### The constitution

A precinct's `LAWMAN.md` states what is true of that repository and of no other. The assembly writes a draft once, and the owner reviews it. Later amendments come from the owner and from court rulings.

[Writing a constitution](docs/constitution.md)

## Install

Lawman runs inside an agent harness, on that harness's own schedule. You need `git` and the GitHub CLI signed in as the one account every role uses. The assembly skill sets up the rest, one question at a time.

### Hermes Agent

Hermes Agent runs each role as a scheduled job. It needs its gateway running.

1. Install and enable the plugin in a terminal:

   ```bash
   hermes plugins install Akurganow/lawman --enable
   ```

2. In a Hermes chat, in the terminal or the desktop app, type the assembly command:

   ```
   /agent-plugin-lawman-492e59eb:assembly
   ```

The assembly asks where the installation lives. The default is the working directory of an existing `[lawman]` job, else `~/.lawman`. It creates the folder and the `lawman` link to the plugin folder. Then it explains the roles, the models and the schedule before it asks about them. It verifies the tools and downloads the journal binary from the release. It checks the binary's checksum and attestation. It proves the installation with one probe job that measures what a scheduled session can do. It writes `config.yaml`, creates the scheduled jobs and adds precincts.

It asks whether the court may use TypeSafe Jev as priority evidence. That needs a TypeSafe API key, and the assembly asks again for each precinct. It asks which key you use and where you keep it. It never asks for the value.

Run the assembly again to change the installation. It reads `config.yaml` and offers a menu. The menu adds a precinct, re-checks one, raises a weight, adds a department, or changes the schedule and the models.

#### Update

Update the plugin in a terminal with the harness update command:

```bash
hermes plugins update lawman
```

The next tick of any role completes the update. It downloads the journal of the new release, checks it and records the new commit. When the release changes the constitution contract, the assembly amends the precinct constitutions.

#### Uninstall

TBD

### Kiro

TBD

### OpenClaw

TBD

### Pi

TBD

### Oh-My-Pi

TBD

### Claude Code

TBD

### Codex

TBD

### GitHub Copilot CLI

TBD

## What an installation holds

The installation lives outside the plugin, so a plugin update never touches it. It holds `lawman/`, the link to the plugin folder, with `bin/journal`, `journal.sqlite` and `config.yaml` beside it. `precincts/` holds one full clone per precinct. `runs/` holds one working tree per patrol, investigation, clerk or executor tick. `departments/` holds your own department pages for several precincts.

Identity: every role uses one identity, the signed-in `gh` or a token the developer adds at setup. The assembly never asks for a token value.

## How the repository is laid out

- `skills/`: one Agent Skill per role (`duty-desk`, `response-unit`, `patrol`, `investigation`, `prosecutor`, `defender`, `court`, `clerk`, `spec-writer`, `executor`), `assembly`, and `lawman-law`, which is not a role.
- `skills/lawman-law/references/`: what every role shares. It holds the law, the contracts for constitutions and departments, and the marker grammar. It also holds the tick steps, the exhibit rules, the shared department pages and one page per harness.
- `journal/`: the journal program, with its `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `entitlements.plist` and `src/`.
- `plugin.json` and `.claude-plugin/marketplace.json`: the manifests that make this repository an Agent Plugins package and a marketplace.
- `docs/`: one page per concept of "How it works".
- `LAWMAN.md` and `.lawman/`: the constitution of Lawman itself and its own department page. Lawman is a precinct of itself.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

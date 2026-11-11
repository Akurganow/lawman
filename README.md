# Lawman

An executive branch for software repositories. Patrol files leads as issues. An investigation builds the case. A prosecutor decides whether to charge. A defender argues against the charge. A court rules. A clerk carries the verdict to a draft pull request. A spec writer writes its spec. An executor builds the approved change.

Lawman runs inside the agent harness a developer already uses, on that harness's own schedule. It has no server, no dashboard and no access to a repository host of its own.

A repository under patrol is a precinct. It carries one file, `LAWMAN.md`, its constitution. Everything repository-specific lives there, never in the law.

## How it works

### The pipeline

Each role is an Agent Skill. The scheduler starts a role. The role takes a few orders, does one job for each and exits. A duty desk writes the orders. Patrol, and a response unit for issues a human filed, produce leads. Any ticket that a human writes enters as a defect or a requirement. Each later stage costs more per case and sees fewer cases.

[Roles and stages](docs/pipeline.md)

### Harnesses

Lawman installs as an Agent Plugins package, with one manifest at the repository root and one skill folder per role. Only Hermes Agent is Supported. Every other harness in the table of the harnesses page is TBD. OpenClaw has a page and install steps that no live run has proved yet.

[Harnesses and layout](docs/harnesses.md)

### Configuration

The installation keeps its settings in `config.yaml`, plain `key: value` lines. It holds, among others, the harness, the law commit, the release, the trusted login, the delivery routes, the TypeSafe, catalog and license answers. It never holds the value of a token or a key.

[config.yaml](docs/configuration.md)

### The journal

The journal is one program on Bun with SQLite. It compiles to a binary per platform, which each release publishes and the installation keeps as `bin/journal`. It holds the orders, the ticks, the alarms and a cache of the tracker with the cleaned texts of issues, pull requests and comments. It runs your read commands for a precinct when the installation has them. It cleans the text that others wrote before a role reads it, and it checks the text a role writes.

[Journal commands](docs/journal.md)

### Departments

A department is a page, not an agent. One generic patrol reads the page and sweeps its subject. Twelve shared departments ship with the law: abstractions, agent-config, claims, dependencies, licenses, logic, privacy, proportion, security, tests, text-residue and vulnerabilities. The `licenses` department is off by default. A precinct rotates it only after you answer yes to the assembly question for that precinct. It checks dependencies, datasets and foreign code against the license of the project itself. The `vulnerabilities` department checks the pinned dependencies of a precinct against the OSV catalog of known vulnerabilities. A precinct adds its own pages in `.lawman/departments/`.

[Departments](docs/departments.md)

[Special departments of a precinct](docs/precinct-departments.md)

### The constitution

A precinct's `LAWMAN.md` states what is true of that repository and of no other. The assembly writes a draft once for a repository without one, and the owner reviews it. Later amendments come from the owner, and from the assembly when the contract version moves. The file also names the labels that mean something, among them the one that marks an issue for a person. The court applies that label when it refers a requirement to a decider, and removes it when it rules.

[Writing a constitution](docs/constitution.md)

## Install

Lawman runs inside an agent harness, on that harness's own schedule. You need to be signed in to your repository host as the one account every role uses. The assembly skill finds the rest, including a way to verify Lawman's release, a check you may decline. After a plugin update, the journal updates itself with the same checksum and signature checks.

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

The assembly finds what it can by itself, then sends one message for each part of the setup. You decide with choices, then approve before it writes. Each repository then gets its own calls and its own approval.

After you approve, the assembly writes the host notes in `host.md` and installs the [journal](docs/journal.md). It proves the commands of the installation, which update the journal, and writes them into `shared/`. It writes [`config.yaml`](docs/configuration.md), the entry file of each role and one paused job for each role of the [pipeline](docs/pipeline.md). Where the harness allows it, each job starts with its entry file.

For each chosen repository the assembly proves the commands of the [precinct](docs/journal.md#commands-of-the-installation-and-the-precincts) on a temporary database, then writes them into `configs/<precinct>/`. A command that fails its proof is never written, and an operation without a command stays a step of the role. The issues and the pull requests may live in another tracker than the repository host. A proof in the scheduler's environment is a paid run of the harness's default model. The assembly asks once for each pass whether it may run it.

For each chosen repository without a [constitution](docs/constitution.md), the assembly opens a pull request with a draft. A repository whose constitution is already in place joins at weight 1, and the assembly offers to resume the jobs. When the constitution holds old numbered lines under `## Precedents`, the assembly asks whether to move them into files in `.lawman/precedents`. A move opens the pull request "Move the precedents to files". An open pull request of the old form gets the files by a commit in its branch. If you keep them as notes, nothing is written.

At the end of the install the assembly offers a delivery check, when a route delivers anything. It runs two short paid jobs on the default model of the harness. One sends a synthetic alarm to your route and the other ends silently. You say whether the alarm arrived and whether the silent run sent nothing.

TypeSafe Jev is off by default. See [configuration](docs/configuration.md).

The catalog check is off by default, and the assembly asks for your consent at install and again for each repository. When you say yes, the names and versions of the pinned packages of that repository, a private one too, go to the OSV service at every visit, and the service sees the installation's address. The check works on any harness whose page carries a send form. The Hermes page carries one today. On a harness without one, the patrol sends nothing and reports that the check did not run. See [configuration](docs/configuration.md#what-leaves-the-machine).

The license department is off by default. The assembly asks once for each repository. It reads the repository first. It asks how people get the project and what it earns only when no sign in the repository answers. An answer taken from a sign shows in the approval with its path and line, and "Change" asks both questions. A license source gets data only after a separate yes for that source. The assembly sends nothing to a source. The patrol finds the way to read it. See [configuration](docs/configuration.md#what-leaves-the-machine).

Run the assembly again to change the installation. It offers keep as is, roles, precincts or host. Roles covers the entry files, the limits and the jobs. Precincts covers a repository's commands, proved again, and, when you ask, the late move of old precedents. Host covers the host notes and the commands of the installation.

#### Update

Update the plugin in a terminal with the harness update command:

```bash
hermes plugins update lawman
```

The next tick of any role completes the update, and so does the assembly when you run it first. The sync downloads the journal of the new release, checks it and records the new commit. When the release changes the constitution contract, the assembly amends the precinct constitutions.

After this update, run the assembly. It offers the amendment pull request for each precinct, which you merge, and asks about old precedents there. It then goes on to the later parts and ends at the menu. The menu names what the earlier release left behind, such as a job in an old form or an installation or a precinct with no command, and recommends the choice that mends it. It asks again after each part. It does not find rows of `host.md` that an earlier release wrote in an old form: choose Host once to rewrite them.

After an update, the tick that synced the law tells you to run the assembly. You answer the license question for each precinct without an answer. A yes or a no removes that line.

An installation that predates the catalog check has no answer to its consent question. Run the assembly. It sees which answers are missing and asks only those. Until you answer, the check does not run and no role stops.

#### Uninstall

TBD

### Kiro

TBD

### OpenClaw

OpenClaw runs each role as a scheduled job with an entry script. It needs its gateway running. These steps rest on OpenClaw's documentation, and no live run has proved them yet.

1. Install and enable the plugin in a terminal:

   ```bash
   openclaw plugins install lawman --marketplace Akurganow/lawman
   ```

2. In an OpenClaw chat, run the skill `assembly`. The OpenClaw docs name the forms `$assembly` and `/assembly` (not verified).

3. The assembly asks you to create one OpenClaw agent whose workspace is the installation folder. It shows the lines and waits, because creating an agent changes OpenClaw's settings. You apply them:

   ```bash
   openclaw agents add <agent id> --workspace "<installation>" --non-interactive
   ```

The assembly then goes on as it does on Hermes Agent. The OpenClaw page has no send form for the catalog check, so that check cannot run on OpenClaw. The assembly writes one paused job for each role, with the entry script of that role and the model you chose. A job holds a copy of its script. A change to the script reaches a job only when the assembly writes the job again.

#### Update

Stop the gateway, update the plugin, then start the gateway:

```bash
openclaw gateway stop
openclaw plugins update lawman
openclaw gateway start
```

No tick runs while the gateway is stopped. Then run the assembly, as after a Hermes update.

#### Uninstall

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

The installation lives outside the plugin, so a plugin update never touches it. [Configuration](docs/configuration.md) and [Harnesses](docs/harnesses.md#what-lives-outside-the-plugin) name what it holds.

Identity: every role uses one account on the repository host, the one that the host notes name. The assembly never asks for a token value.

## How the repository is laid out

- `skills/`: one Agent Skill per role (`duty-desk`, `response-unit`, `patrol`, `investigation`, `prosecutor`, `defender`, `court`, `clerk`, `spec-writer`, `executor`), `assembly`, and `lawman-law`, which is not a role.
- `skills/lawman-law/references/`: what every role shares. It holds the law, the contracts for constitutions and departments, and the marker grammar. It also holds the tick steps, the exhibit rules, the shared department pages and one page per harness.
- `journal/`: the journal program, with its `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`, `entitlements.plist` and `src/`.
- `plugin.json` and `.claude-plugin/marketplace.json`: the manifests that make this repository an Agent Plugins package and a marketplace.
- `docs/`: one page per concept of "How it works", and [the design page](docs/design.md) with the goals, the principles and the rejected alternatives.
- `LAWMAN.md` and `.lawman/`: the constitution of Lawman itself and its own department page. Lawman is a precinct of itself.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

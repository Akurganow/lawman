# Harnesses

Lawman runs inside an agent harness, on that harness's own schedule. This page records the layout that lets one package serve every harness. It also records the facts that shaped the layout and the steps that add a harness.

Hermes Agent is the only supported harness today. Seven more are planned. This page keeps their facts so that a change made for one harness does not break another.

## How to read the marks

Every fact about a harness names its source in brackets. Six marks exist.

- `(stated by the docs, <URL>)` means the harness's own documentation says it.
- ``(stated by `--help`, <command>)`` means the help text of the harness's own command says it.
- `(read in the harness code, <path>)` means the harness's source says it. Nobody ran it.
- `(seen in a run)` means a command ran and printed it.
- `(checked with the harness's check function)` means the harness's own approval check accepted the command form.
- `(not verified)` means nobody checked it. Check it live before you rely on it.

Harnesses change fast. Read the live documentation when the work on a harness starts.

## The principle

One package serves every harness. The root of the repository holds no file that only one harness reads.

- A file that one harness needs and the others do not read stays out of the root.
- The law and the skills name no harness and no tool. They say what must happen.
- The commands of one harness live on that harness's page under `skills/lawman-law/references/harnesses/`. That includes the send forms: the fixed commands that carry a request, which the journal built, to the catalog and hand its reply back.
- The setup is the skill `assembly` on every harness. The user starts it from a chat. The package adds no command, hook or install script that runs it.

## The layout that serves the set

```text
plugin.json                       the manifest every harness reads
.claude-plugin/marketplace.json   the one catalog
skills/<name>/SKILL.md            the roles, the assembly and the shared law
journal/                          the journal program, its tests and its build files
docs/                             the documentation
README.md
LICENSE
```

### The root `plugin.json`

- The `$schema` is exactly `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.
- The standard requires only `$schema` and `name`. Its schema allows no other top-level field than the ones it lists (stated by the docs, https://agent-plugins.org/schemas/1.0.0/plugin.schema.json).
- Lawman also fills `version`, `description`, `author.name` and `keywords`, because Kiro lists them as required (stated by the docs, https://kiro.dev/docs/powers/create).
- Optional fields that Lawman fills are `author.url`, `homepage`, `repository` and `license`.
- A test pins the version in `plugin.json` equal to the version of the journal program.

### The skills

- Each skill is `skills/<name>/SKILL.md`, one level under the root.
- The frontmatter `name` equals the folder name. It holds lowercase letters, digits and single hyphens. It has at most 64 characters.
- The frontmatter holds only `name` and `description`. The description has 1 to 1024 characters.
- GitHub Copilot CLI reads Agent Plugins skills only from `skills/` (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
- `lawman-law` sits in `skills/` but is not a role. It holds the shared files. Nothing starts it.

### The marketplace

- One file, `.claude-plugin/marketplace.json`, lists the plugin `lawman` with `source` set to `"./"`.
- The `./` keeps the repository root as the plugin root.
- The repository root as the plugin root is the simplest choice for every harness. It needs no path form per harness.
- The file serves Claude Code, Codex, GitHub Copilot CLI, Oh-My-Pi and OpenClaw. Each reads it as a fallback or as its catalog.
- Oh-My-Pi upgrades only entries that declare a `version` (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md). The entry carries none today. The Oh-My-Pi phase decides this.

### What the root does not hold

- No `package.json`, lockfile or `pyproject.toml`. The journal program and its build files live in `journal/`.
- No `plugin.yaml`, `__init__.py` or `after-install.md`. Hermes then reads the root `plugin.json` like every other harness.
- No `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` or other harness manifest. A manifest appears when its harness phase starts. It then mirrors the root fields.
- No other marketplace file, unless it is identical to the one catalog.
- No commands, hooks or MCP files. Their names differ per harness and Lawman uses none.

### What lives outside the plugin

- The installation folder holds `config.yaml`, `host.md`, `bin/journal`, `journal.sqlite`, the precinct clones and the runs. It sits outside the plugin folder.
- Its entry `lawman` links to the folder of the installed plugin. The harness page gives the link form.
- The journal binary sits in `bin/` of the installation. A release provides it, with a provenance file beside it. The assembly checks the checksum. It checks the signature in the provenance file when the host notes name a verifier. A declined verifier leaves only a checksum from the same release, which proves no origin.

## The harnesses

A cell without a mark rests on a fact with its source in the section "What each harness does". For Hermes Agent it rests on the Hermes page. A cell marked `(not verified)` has no such fact.

| Harness | Install | Manifest | Skill names | Setup | Scheduler | Status |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Hermes Agent | `hermes plugins install Akurganow/lawman --enable` | `plugin.yaml`, else the root `plugin.json` | `agent-plugin-lawman-492e59eb:<skill>` | The skill `assembly`, started as a chat command | `hermes cron create` with `--skill` and `--workdir` | Supported |
| Kiro | IDE: Powers panel, import from GitHub. CLI: `/powers install <name\|path>` | `plugin.json`, or the legacy `POWER.md`, at the power's package root | `<skill>` (not verified) | The skill `assembly` (not verified) | None found (not verified). Headless `kiro-cli chat --no-interactive` under an external cron | TBD |
| OpenClaw | `openclaw plugins install lawman --marketplace Akurganow/lawman` | Other bundle manifests first, then the root `plugin.json` | `<skill>` (not verified) | The skill `assembly` (not verified) | `openclaw cron add` with an agent whose workspace is the working directory | TBD |
| Pi | `pi install git:github.com/Akurganow/lawman` | `package.json` key `pi`, else conventional folders | `<skill>`, `/skill:<skill>` | The skill `assembly` (not verified) | None found (not verified). Headless `pi -p` under an external cron | TBD |
| Oh-My-Pi | `omp plugin marketplace add Akurganow/lawman`, then `omp plugin install lawman@lawman` | The root `plugin.json` with the exact schema | `<skill>` | The skill `assembly` (not verified) | None found (not verified). Headless `omp -p --cwd <dir>` under an external cron | TBD |
| Claude Code | `/plugin marketplace add Akurganow/lawman`, then `/plugin install lawman@lawman` | `.claude-plugin/plugin.json`, optional | `lawman:<skill>` | The skill `assembly` (not verified) | Desktop scheduled tasks, `/loop` in a session, or `claude -p` under an external cron | TBD |
| Codex | `codex plugin marketplace add Akurganow/lawman`, then `codex plugin add lawman@lawman` | The root `plugin.json` with the exact schema, else `.codex-plugin/`, `.claude-plugin/` or `.cursor-plugin/` | `lawman:<skill>` | The skill `assembly`. The manifest has an onboarding skill field that Lawman does not use | Desktop app scheduled tasks, or `codex exec` under an external cron (not verified) | TBD |
| GitHub Copilot CLI | `copilot plugin marketplace add Akurganow/lawman`, then `copilot plugin install lawman@lawman` | The root `plugin.json`, which wins over the legacy manifests | `lawman:<skill>` (not verified) | The skill `assembly` (not verified) | `/every` and `/loop` in a session, or `copilot -p` under an external cron (not verified) | TBD |

The Hermes page carries the send forms of the catalog check, in its section "Sending to the catalog". A harness whose page has none does not send, and the patrol reports that the check did not run. The page also carries the command that starts an expert, in its section "Calling an expert". A harness whose page has none lets the role go on without the expert. See [the pipeline](pipeline.md#experts). The law and the skills name no harness. See [the journal](journal.md#the-catalog-check).

No harness lets a plugin declare a schedule (not verified). Hermes attaches a skill and a working directory to a scheduled job (stated by `--help`, `hermes cron create --help`). No other harness was found to do both (not verified).

## Asking the developer

The assembly asks the developer through the harness's question tool. Each row names that tool for one harness.

| Harness | Question tool | Several values | Limits |
| :-- | :-- | :-- | :-- |
| Hermes Agent | `clarify` (read in the harness code) | yes (read in the harness code) | 1 to 5 questions, up to 4 choices, extra choices dropped without an error (read in the harness code) |
| Claude Code | `AskUserQuestion` (stated by the docs, https://code.claude.com/docs/en/agent-sdk/user-input) | yes (stated by the docs, https://code.claude.com/docs/en/agent-sdk/user-input) | 1 to 4 questions, 2 to 4 options (stated by the docs, https://code.claude.com/docs/en/agent-sdk/user-input) |
| Codex | `request_user_input` (read in the harness code) | no (read in the harness code) | 1 to 3 questions, 2 to 3 options, Plan mode only by default (read in the harness code) |
| GitHub Copilot CLI | `ask_user` (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) | (not verified) | (not verified) |
| OpenClaw | `ask_user` (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md) | yes (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md) | 1 to 3 questions, 2 to 4 options (stated by the docs, https://docs.openclaw.ai/tools/ask-user.md) |
| Oh-My-Pi | `ask` (read in the harness code) | yes (read in the harness code) | no hard limit (read in the harness code) |
| Kiro | none built in (stated by the docs, https://kiro.dev/docs/tools.md) | (not verified) | (not verified) |
| Pi | none built in (read in the harness code) | (not verified) | (not verified) |

A harness page names the question tool in its own section. When the page has none, the model finds the tool itself.

A harness without a question tool uses the plain numbered message. The plain message does not serve messengers.

## What each harness does

### Hermes Agent

- Hermes looks for `plugin.yaml` first and for `plugin.json` second (read in the harness code).
- A `plugin.yaml` and an `__init__.py` at the root make Hermes ignore `plugin.json` and run the Python file (read in the harness code, hermes_cli/plugins_discovery.py).
- Hermes rejects a root `plugin.json` whose `$schema` differs. It ignores unknown top-level fields (read in the harness code).
- A broken root `plugin.json` makes Hermes refuse the install (read in the harness code, hermes_cli/agent_plugins.py).
- Hermes requires the folder name and the skill `name` to match (read in the harness code, hermes_cli/agent_plugins.py).
- The chat command `/agent-plugin-lawman-492e59eb:assembly` works in the CLI, the TUI and the desktop app. It does not work in messengers (read in the harness code, agent/skill_commands.py).

The page for Hermes holds the rest, among it the send forms for the catalog check and the call of an expert: `skills/lawman-law/references/harnesses/hermes.md`.

### Kiro

- Kiro requires `plugin.json` with six fields (stated by the docs, https://kiro.dev/docs/powers/create). They are `$schema`, `name`, `version`, `description`, `author` and `keywords`. The legacy `POWER.md` format still works (stated by the docs, https://kiro.dev/docs/powers/create).
- A power needs `plugin.json` or `POWER.md` at its package root. A power may sit in a folder of a repository (stated by the docs, https://kiro.dev/docs/powers/installation and https://kiro.dev/docs/powers/create).
- The IDE imports a power from a GitHub URL (stated by the docs, https://kiro.dev/docs/powers/installation). Whether the URL may name a folder is unknown (not verified).
- The CLI installs a power by catalog name or local path with `/powers install <name|path>` (stated by the docs, https://kiro.dev/docs/powers/installation). An install from a GitHub URL in the CLI is not stated (not verified).
- A skill `name` must equal its folder name (stated by the docs, https://kiro.dev/docs/skills).
- The skill name inside a power may carry a prefix (not verified).
- The IDE and the CLI offer no scheduler (not verified). Headless runs use `kiro-cli chat --no-interactive`. Tool calls need approval flags such as `--trust-all-tools` (stated by the docs, https://kiro.dev/docs/cli/headless).
- Where Kiro puts an installed power is unknown (not verified).

### OpenClaw

- `openclaw plugins install <plugin> --marketplace <owner/repo>` installs from a GitHub marketplace (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/cli/plugins/install.md).
- A remote marketplace may list only relative path sources inside its own repository (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/cli/plugins/install.md).
- The install copies the plugin. `-l` links a local directory instead (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/cli/plugins/install.md).
- OpenClaw picks the first manifest it finds in this order (read in the harness code, openclaw/src/plugins/bundle-manifest.ts):
  1. `.codex-plugin/plugin.json`
  2. `.cursor-plugin/plugin.json`
  3. `.claude-plugin/plugin.json`
  4. `openclaw.plugin.json`
  5. a root `plugin.json` with the exact schema
- The detection returns native when `package.json` declares `openclaw.extensions` and `openclaw.plugin.json` sits at the root. It returns native too when the root holds a default plugin entry file and no bundle manifest (read in the harness code, openclaw/src/plugins/bundle-manifest.ts).
- Discovery treats a package whose `package.json` declares `openclaw.extensions` as a native package, before it looks for a bundle manifest (read in the harness code, openclaw/src/plugins/discovery.ts).
- Plugin skills load at low precedence. A same-named workspace, agent, managed or bundled skill overrides them (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/tools/skills.md).
- A plugin skill appears under its bare name (not verified).
- `openclaw cron` registers the automation commands. `openclaw cron add` creates a job (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/cli/cron.md).
- A detached cron agent-turn job runs in the workspace of the scheduled agent. A job bound to an existing session uses that session's saved workspace and working directory (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/automation/cron-jobs/payloads.md).
- The docs read give a per-job working directory only to command payloads, through `--command-cwd`. A command payload runs a shell command and not a skill (stated by the docs, https://github.com/openclaw/openclaw/blob/main/docs/automation/cron-jobs/payloads.md).
- Naming a skill in a cron prompt works (not verified).

### Pi

- `pi install git:github.com/<owner>/<repo>` clones the repository (stated by the docs, https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).
- Pi finds `skills/` by convention, or through the `pi` key of `package.json` (stated by the docs, https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).
- The docs read describe `package.json` and conventional folders. They mention no `plugin.json` (not verified).
- An update runs `git reset --hard` and `git clean -fdx` in the clone (read in the harness code, packages/coding-agent/src/core/package-manager.ts). Untracked files in the clone are lost.
- Pi neither requires nor warns when a skill `name` differs from its folder (stated by the docs, https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md).
- `/skill:<name>` forces a skill (stated by the docs, https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md). `pi -p` runs once and exits (stated by the docs, https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli.md).
- Pi has no scheduler (not verified).

### Oh-My-Pi

- `omp plugin marketplace add <source>` and `omp plugin install name@marketplace` install from a catalog (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).
- The catalog is `.omp-plugin/marketplace.json`, or `.claude-plugin/marketplace.json` when the first is absent (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).
- A string `source` in a catalog must start with `./` (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md). The exact value `"./"` is not tested (not verified).
- The install copies the plugin into a cache whose path holds the version (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).
- The install version comes from the catalog `version`, then `.claude-plugin/plugin.json`, then the root `plugin.json`, then `package.json` (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).
- A root `plugin.json` with the Agent Plugins schema gets the portable provider (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).
- A closed set of frontmatter keys applies to skills of an Agent Plugins package (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md).
- Skill names are bare. `/skill:<name>` invokes a skill (stated by the docs, https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md).
- Oh-My-Pi has no scheduler (not verified). A headless run is `omp -p --cwd <dir>` (not verified).

### Claude Code

- `/plugin marketplace add <owner/repo>` registers a marketplace. `/plugin install <plugin>@<marketplace>` installs from it (stated by the docs, https://code.claude.com/docs/en/discover-plugins).
- `claude plugin update <plugin>@<marketplace>` updates a plugin (stated by the docs, https://code.claude.com/docs/en/discover-plugins).
- A marketplace install is a copy in a plugin cache (stated by the docs, https://code.claude.com/docs/en/plugin-marketplaces).
- The manifest is `.claude-plugin/plugin.json` and it is optional. The plugin name prefixes every component (stated by the docs, https://code.claude.com/docs/en/plugins-reference).
- A root `plugin.json` is not mentioned in the docs read (not verified).
- Non-interactive runs such as `claude -p` load installed plugins (stated by the docs, https://code.claude.com/docs/en/discover-plugins).
- Desktop scheduled tasks run on the machine in a chosen folder. `/loop` needs an open session (stated by the docs, https://code.claude.com/docs/en/desktop-scheduled-tasks and https://code.claude.com/docs/en/scheduled-tasks).
- Claude Code runs a package install when the plugin root holds a `package.json` and a lockfile (not verified).

### Codex

- `codex plugin marketplace add` registers a marketplace. `codex plugin add <plugin>@<marketplace>` installs from it (read in the harness code, codex-rs/cli/src/plugin_cmd.rs).
- A root `plugin.json` with the Agent Plugins schema is the plugin manifest (read in the harness code, codex-rs/utils/plugins/src/plugin_namespace.rs).
- Without it, Codex reads `.codex-plugin/`, `.claude-plugin/` or `.cursor-plugin/` (read in the harness code, codex-rs/utils/plugins/src/plugin_namespace.rs).
- Codex reads the first marketplace file it finds (read in the harness code, codex-rs/core-plugins/src/marketplace.rs):
  1. `.agents/plugins/marketplace.json`
  2. `.agents/plugins/api_marketplace.json`
  3. `.claude-plugin/marketplace.json`
  4. `.cursor-plugin/marketplace.json`
- A `source` of `"."` or `"./"` means the marketplace root (read in the harness code, codex-rs/core-plugins/src/marketplace.rs).
- A skill appears as `<plugin>:<skill>` (read in the harness code, codex-rs/ext/skills/src/loader/namespace.rs).
- The manifest may name an onboarding skill in `extensions["com.openai"].onboardingSkill` (read in the harness code, codex-rs/core-plugins/src/manifest.rs). Lawman does not use it.
- The app-server protocol defines a scheduled task with a key, a name, a prompt and a schedule. The schedule is hourly, daily, weekdays or weekly (read in the harness code, codex-rs/app-server-protocol/schema/typescript/v2/ScheduledTaskSummary.ts and ScheduledTaskSchedule.ts).
- Whether a scheduled task loads a local plugin is unknown (not verified). Whether `codex exec` under cron loads one is unknown (not verified).

### GitHub Copilot CLI

- `copilot plugin marketplace add OWNER/REPO` registers a marketplace. `copilot plugin install PLUGIN@MARKETPLACE` installs from it (stated by the docs, https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing).
- `copilot plugin install OWNER/REPO` installs from the root of a GitHub repository. `OWNER/REPO:PATH` installs from a subdirectory (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
- The install lands in `~/.copilot/installed-plugins/` (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
- A root `plugin.json` for Agent Plugins wins over `.plugin/`, `.github/plugin/` and `.claude-plugin/` manifests (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
- The marketplace file order is `marketplace.json`, `.plugin/marketplace.json`, `.github/plugin/marketplace.json`, then `.claude-plugin/marketplace.json` (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
- Skill names carry the plugin prefix (not verified).
- `/every`, `/after` and `/loop` schedule prompts in a session (stated by the docs, https://github.com/github/copilot-cli/blob/main/changelog.md).
- Whether a scheduled prompt outlives its session is unknown (not verified). Whether `copilot -p` under cron works is unknown (not verified).

## The conflicts

These are the ways one harness can break another. Each line says what goes wrong and what the layout does about it. The facts and their marks sit in the sections above.

1. A `package.json` at the root. Hermes, Pi, Oh-My-Pi and OpenClaw read it, and Claude Code may run an install from it (not verified). The layout moves the journal program to `journal/`.
2. A `plugin.yaml` and `__init__.py` at the root. Hermes then ignores `plugin.json`. The layout adds neither.
3. No root `plugin.json`. Kiro, GitHub Copilot CLI, Codex and Oh-My-Pi then miss the plugin or demote it. The layout keeps the root `plugin.json`.
4. A second manifest in `.claude-plugin/` or `.codex-plugin/`. OpenClaw reads it before the root manifest, and the two drift apart. The layout adds a second manifest only in its harness phase, as a mirror of the root.
5. A broken root `plugin.json`. Hermes refuses the install, and OpenClaw and Codex ignore the file. The layout keeps the exact `$schema`.
6. Extra keys in skill frontmatter, or a name that differs from its folder. Oh-My-Pi checks the keys. Kiro and Hermes check the name. The layout keeps two keys and the folder name.
7. An update that deletes files. Pi cleans its clone. Oh-My-Pi, OpenClaw and Claude Code copy the plugin into a cache. The link `lawman` may break after an upgrade (not verified). The layout keeps the installation and the binary outside every clone and cache.
8. A second marketplace file. Codex, GitHub Copilot CLI and Oh-My-Pi each prefer a file of their own. The layout keeps the one catalog.
9. The `source` of the catalog entry. Kiro and GitHub Copilot CLI can install from a subdirectory, so the repository root is not required as the plugin root. Claude Code then copies the whole repository into its cache (not verified). The layout uses `"./"`.
10. Skill names differ per harness. The table above lists each form. A job prompt that names a skill therefore differs, and each harness page gives the form.
11. Scheduling differs, and the table above lists each scheduler. Several harnesses need an open app or an external cron with a headless run. That design waits for each harness phase.
12. Setup differs. Codex has an onboarding skill field in its manifest, and no other harness was found to have one (not verified). The layout uses the skill `assembly` everywhere.
13. File names for commands, hooks and MCP differ per harness (stated by the docs, https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference). The layout uses none of them.

## Adding a harness

A new harness needs four things:

- a page `skills/lawman-law/references/harnesses/<harness>.md`
- a subsection `### <Harness>` in the README section Install
- a row in the table above
- a live install proof

The page answers the eight sections of the Hermes page. They are installing the plugin, syncing the law, running a role once, commands in scheduled runs, scheduling, isolation, budget and token, and asking the developer.

A page may also carry the send forms for the catalog check, and the form that calls an expert. Both sections are optional and not among the eight. A harness that adds them gains the check or the experts with no change to the law or the skills.

The assembly step "Choose the installation" needs five things from the page. They are the detection command and the job-list command that shows each job's working directory. The others are the folder and change-directory forms, the link form and the link check. The install steps need a sixth, the scheduler check.

Follow these steps.

1. Read the harness's live documentation for install, skills, scheduling and approval of commands.
2. Check each root file of the layout against what the harness reads. Record every conflict in the list above.
3. Add no root file unless every harness reads it by the standard.
4. When the harness needs its own manifest, put it where the harness looks and mirror the root fields.
5. Write the page with the eight sections.
6. Write the five things of "Choose the installation" and the scheduler check on the page.
7. Mark every fact on the page by its source.
8. Run each command that a scheduled session sends through the harness's own approval check.
9. Replace the TBD text of the README subsection with the real install steps.
10. Change the status of the table row to Supported.

### Definition of done

A harness is done when all of these hold.

- The page exists, answers the eight sections and gives the six things above.
- The README subsection holds the real steps. Only its Uninstall part may hold TBD until the assembly can uninstall.
- The table row says Supported.
- A clean harness profile installs the plugin by the README steps alone.
- The assembly runs to the end in that profile and writes `config.yaml`.
- One role runs through the harness's scheduler or its recorded manual command and leaves an attempt record in the harness.
- Every other harness row still holds. The root gained no file that another harness reads wrongly.

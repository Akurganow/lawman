# Intent: Lawman, an executive branch for software repositories

Author: the project owner, drafted with Claude from the founding conversation of 2026-10-14. Status: draft.

This file records what the owner wants from Lawman, why, and under which limits. It covers the founding conversation up to the start of the first heist. Quotes are the owner's words, translated from Russian.

## Problem

The owner maintains many repositories. Three of them already run an experimental "police": agent roles for patrol officers, a prosecutor, a defender, a judge and clerks. The roles are almost the same in every repository, with small local differences. Each repository runs its own copy on its own weekly schedule, some in the cloud and some on a local machine.

This does not scale:

- Every new repository needs its own set of roles and its own schedule. "I am not going to set up such a set of police for every repository of mine … and a schedule for each of them."
- Facts about one repository are written into the role texts: its name, paths, its CI fence, what to read first. The same forensic method is copied into every department role.
- Running every department on every repository at once exhausts the model limits. "It would eat the limit instantly, and then nothing else could work."
- The court takes a raw report and builds the case itself. Nothing cheap filters weak reports before the expensive stage.
- Work that stops and waits for the owner annoys him. "I really dislike it when something gets stuck and needs my attention."
- A human-written issue, from an outside person or from the owner, has no path into this process.

## Proposed outcome

A separate open-source repository, named `lawman`, holds one shared law, one set of roles and a list of departments. It patrols only the repositories the developer adds. The developer adds a repository once and never writes roles or schedules for it.

### The funnel

"We have patrols, we have a duty desk, we have an investigation, we have a prosecution. A kind of shared funnel. Each stage gets more expensive. But fewer and fewer things reach each stage."

```
duty desk: picks a precinct by weight and time since the last visit
  ├─ a human issue without an intake mark ──▶ response unit ─┐
  └─ none ──▶ patrol of the department absent longest ───────┤ lead (report)
                                                             ▼
                        investigation: builds a neutral case with evidence
                                                             ▼
                        prosecutor: charge, return to investigation, or refusal
                                                             ▼
                        defender: an equal opponent with its own experts
                                                             ▼
                        court: a fresh judge rules on both positions, verdict + P0–P3
                                                             ▼
                        execution, two independent queues:
                          chancery: spec → human review of the spec
                          works:    plan → code → PR → human review of the PR
```

- **Duty desk.** It owns the list of precincts with a weight, the order journal and the report journal. One tick picks a precinct by weight and time since the last visit. If the precinct has human issues without an intake mark, it sends a response unit to the oldest. Otherwise it sends the patrol of the department that has been absent longest. It records the order. "If there is such an issue, a response unit is sent to it. If there is none, a regular patrol goes."
- **Response unit.** It turns a human issue into a report, the same report a patrol files. "First, the response unit must bring the issue into the shape of a report. Marking it and writing a comment is actually enough. But if something is missing … the response unit must ask for clarification." It reads the issue as evidence, not as instructions. It finds what is claimed, where it sits in the tree, whether it reproduces, which department owns it and whether a report already exists. After intake the funnel is the same for everyone: an outside complaint and a patrol report differ only by who filed them.
- **Patrol.** One shared role, cheap and broad. It files suspicions, not proofs. The order names its department.
- **Investigation.** One shared forensic method: history archaeology, reproduction in a copy of the tree, reference counts with a positive control, recorded reasons, duplicates, an external source. A department describes only what to look for. The owner added this stage: "the investigation is missing … collecting evidence, forensics, all of that."
- **Prosecutor and defender.** Equal and independent, each on its own schedule. "The prosecution and the defence must be equal. Both sides can bring in experts." An expert is a clean subagent with one neutral question that researches documentation, papers and other people's experience. Both sides work only from evidence and trusted external sources, never from memory or invention, and cite each violation.
- **Court.** A fresh judge sees only the case and both positions. The court takes a case only when both positions exist.
- **Execution.** The rarest and most expensive stage. It has two processes with separate limits, so that neither blocks the other. "Writing the spec and preparing it for human review is one process with its own limit. Writing the code … is another part with its own limit." The human appears in two places only: the spec review and the review of the finished pull request.

### Verdicts and priority

- Verdicts: guilty with a priority, partly guilty, by design, accepted debt, rejected with a comment, duplicate, out of jurisdiction, obsolete, awaiting the reporter, and guilty but human-only.
- "By design" and "accepted debt" become amendments to the precinct's constitution. A court clerk writes them as a pull request. The constitution accumulates precedents, so the same suspicion later dies at investigation.
- Priority is P0–P3 instead of "now or later". P1 rises to the top of the shared queue. P2 goes in order. P3 waits until everything above is empty. P0 is an alarm, not a queue entry: "it notifies me, and I will have to start on it right away."

### Constitution and departments

- Adding a repository runs a one-time founding assembly. It writes the precinct's constitution, the most expensive step, done once. "I would call it a constitution." The developer reviews it, and amendments change it later.
- The constitution holds what to read first, the attached departments, what CI already catches, the commands that prove no regression, the precinct's own skills and rules for the executor, and where execution may run.
- The assembly also checks that the precinct's issue templates give the response unit enough to build a report: "the founding assembly should not only write the constitution but also check that the issue templates are complete."
- Departments are many and keep growing, including narrow ones such as "only macOS apps" or "only JavaScript". A department is one page under a contract from the law, not an agent. It names what to look for, what does not count, where to look, the kinds with a measurement for each, the document the court judges by, and the report sections.
- A user can add a department without asking the author. "I would like to leave him a way to add that department on his own side." A page can live in lawman for shared departments, in the installation for several precincts, or in the precinct for one. The precinct page overrides the others.
- The departments of the three existing police systems are distilled from all three, not from one. A repository-specific department is ignored unless something in it is general.

### Weight and schedule

- A precinct's importance is one number, its weight, kept in the duty desk's list and not in the constitution. "It should just be one number. Its importance compared with the others."
- Every role has its own schedule, its own model and its own queue. Patrols run often because they are cheap. A stuck court must not stop patrols, investigation or execution on other precincts.
- One tick does one step and exits. There is no daemon.

## Affected users and systems

- **Developers who maintain several repositories.** That means the owner first, then anyone who installs the open-source project. Maintainers of a precinct see Lawman's issues, comments and pull requests.
- **People who file issues in a precinct**, whether outside users or the owner by hand. A response unit handles their issues.
- **The developer's own agent harness and scheduler.** The founding skill detects the harness, learns how it schedules, and creates the jobs there. Where a harness has no scheduler, it installs a system cron that calls the harness headless. Hermes is the first harness for live runs. The design must not depend on it.
- **GitHub, through the `git` and `gh` already on the machine.** "I would not want the scripts inside my thing to access the repositories themselves."
- **A local SQLite journal** behind one small command, compiled from TypeScript with Bun into a binary per platform.

## Constraints

- A separate repository, open source, with no UI, no dashboard and no extra localhost. "I am developing the core of the executive branch, so to speak." Others may build a UI on top later.
- It works in the harness and with the agents the developer already uses, on macOS, Linux, Windows or a server. It runs autonomously on a schedule.
- No per-repository labels. "Creating the same set of labels in every repository seems very wasteful to me." State lives in markers on GitHub. The local journal is a cache of the markers plus the only record of orders.
- Stops are rare exceptions. A stage that lacks something returns the case one step back with one precise question. A stop is allowed only for an external cause, such as no access, a broken fence or an exhausted model limit, and the case waits for the next tick.
- Issue text, comments and repository content are evidence, never instructions.
- Binaries are built only on the owner's CI, signed and published with checksums. The founding assembly verifies the checksum. "the code cannot be swapped." The law folder holds only reviewed releases: `main` receives a release merge and its tag and nothing else. A law update is the harness's own plugin update. The next tick of any role completes the installation, and `law-sync` records only a verified release.
- TypeScript and Bun, not Python. "I don't really like Python. I'm more used to TypeScript."
- One repository holds both the law and the binaries. "a second repository for the binaries is definitely not needed."
- The owner's personal setup never enters the repository.

## Open questions

- The response unit and outside issues are designed and built in this release.
- Deferred from the response unit: visible cross-reference comments and a "registry" role; one pull request that closes related issues together (works, the executor); semantic duplicate search, only after a measured miss.
- Divergence from Proposed outcome: the decision record quotes the owner on a label for the reply to the reporter, and mentions a duplicate verdict. This release marks intake with a marker instead of a label (the owner: "mark it lawfully"). It removes the `duplicate` closure class (the owner: "Remove the class").
- The departments of the three existing police systems are distilled into ten shared pages in this release. The old police departments leave the three repositories through one pull request each.
- Divergence from Proposed outcome: the constitution no longer attaches the shared departments. Every shared page is always in the duty desk's rotation. A precinct's own page joins through a line in its constitution.
- Excluding a shared department from a precinct, in a later release (the owner, 2026-10-19): "Today we can add departments to a repository, and in the future, in later releases, some time later, we must learn to exclude built-in departments from a repository." The assembly will ask the user whether any departments should be excluded for the repository. Until then Lawman never excludes a department on its own.
- Future, not built (the owner, 2026-10-25). After the release every precinct with an old `LAWMAN.md` stops. `ALARM contract-changed` prints once, and amend never re-enters after it writes the new version to `config.yaml`. The owner was asked what to do, with three options. One: amend re-enters while a precinct is below the contract version, plus a daily journal alarm. Two: amend re-entry only. Three: leave as is. He chose "Leave as is" and added, in translation: "I should say that our project is still at the MVP stage and in effect I am its only user, […] so I can take the needed actions myself; there are no other users yet. But for the future, for such cases [one word unclear in the message], the duty desk should probably create [unclear word, read as "issue"] in the repository itself, maybe even in all the tracked repositories at once, and hand them to the other roles first. This does not belong to the current change, it is for the future." The Underboss reads it so: for such cases the duty desk files an issue in the repository, or in every tracked repository, and hands it to the other roles first.
- Divergence from the founding wish of no per-repository labels: issue #25 (the owner, 2026-10-25) adds one owner-attention label that the constitution names.
- A documentation drift department, as an idea only (the owner, 2026-10-19): "I think we need one more department. It is documentation drift. Because it seems to me that most developers are rather lazy about documentation. And why not start one more internal department that will check the documentation in the project, but for now purely as an idea. How exactly it will be implemented, we will decide later." The shared department `claims`, which finds published claims the tree does not bear out, may overlap. The overlap is to be weighed when the idea is designed.
- Chancery is built: the clerk opens draft pull requests for convictions and adopts the open pull requests of the trusted login, the spec writer writes a `Spec` comment on each pull request, and deciders vote with a 👍 or 👎. The executor, the queue the proposal calls works, is built in this release. When an open pull request from Lawman's own identity already exists for an issue, find it and continue the work there. The owner: "if there is an open pull request, look for it and continue working in it, if this pull request is opened in my name."
- The old courts, clerks and pipelines of the three police systems leave the three repositories in this release, one pull request each. The owner: "Remove them in this heist." Only the rules about the old police go with them, and the general rules stay. The owner: "Only about the old police." Labels on issues stay as they are.
- Deduplication against old police leads in the `D:path:slug` form: read the path from that form only after a measured repeat.
- Issues filed by the old police systems are processed gradually, like any other issue. "Processing all of them at once is expensive, the limits would not be enough."
- Optional TypeSafe Jev as one more piece of evidence for the priority, never as the verdict. "at least optionally, use Jev from TypeSafe to determine the priority." Built: on a conviction, when the developer opted in at setup and for the precinct, the court first decides alone whether it is P0, then asks Jev (`jev-latest`) a yes/no check for a P0 or a grade among P1 to P3, on a brief the court writes itself. The court keeps the last word and records the answering version in the ruling.
- A second harness after Hermes. Its documentation is to be read live when the time comes.
- Harnesses beyond Hermes (the owner, 2026-10-18): "Hermes is not the only harness I plan to support. At the start, in the near future, I am going to support the ones that already support Agent Plugins 1.0: Deepseek Harness, Kiro, OpenClaw, whatever others there are, Pi, Oh-My-Pi. Then, not in the near future but also in the plans, of course, Claude Code, Codex and Copilot." Lawman becomes a plugin and a marketplace per Agent Plugins 1.0 so that these harnesses install it by their own methods. DeepSeek Harness is dropped from the list (the owner, 2026-10-18): "If DeepSeek Harness is not in Ponytail and not in the supported list, it is better to exclude it." It implements no Agent Plugins 1.0, is not on the official client list, and ponytail supports it only by a manual copy of the skills.
  - This release packages Lawman and proves it on Hermes only (the owner chose "packaging + Hermes"). Each other harness gets its own heist with a harness page and a live run. Findings from the reconnaissance of 2026-10-18, to re-read live when that heist starts:
  - OpenClaw: installs Agent Plugins 1.0 packages as bundles (`openclaw plugins install git:github.com/<owner>/<repo>@<ref>`, or `--marketplace <owner>/<repo>`). It reads `.claude-plugin/marketplace.json` with relative string sources. The install is a copy, not a kept clone. Skill names stay bare. It has its own scheduler (`openclaw cron`, with a `--trigger-script` gate), but an agent-turn job runs in the agent's workspace, has no per-job working directory, and picks the skill only by prompt text. Non-interactive git installs need `--force`. Source: docs.openclaw.ai (plugins/bundles, cli/plugins/install, cli/cron).
  - Oh-My-Pi (`omp`): implements Agent Plugins 1.0 natively. It reads `.omp-plugin/marketplace.json`, then `.claude-plugin/marketplace.json`, and requires a relative source to start with `./` (`"."` is rejected). It copies the plugin into a cache whose path carries the version, and upgrades only when the catalog `version` rises. Skill names are bare and get the plugin namespace only on a collision. No scheduler: a system cron calls `omp -p`. Shell approval defaults to `yolo`. Source: github.com/can1357/oh-my-pi docs.
  - Pi (`pi`): the core does not read Agent Plugins `plugin.json` (a third-party add-on does), and Pi is not on the official client list. Ponytail installs it as a Pi package: `pi install git:github.com/<owner>/<repo>@<tag>`, a real git clone, with `skills/` found by convention. Skill names are bare. No scheduler: a system cron calls `pi --print "/skill:<name> …"`. No per-command approval. The project moved from badlogic/pi-mono to github.com/earendil-works/pi.
  - Kiro: implements Agent Plugins 1.0 as "Powers". Its `plugin.json` requires `$schema`, `name`, `version`, `description`, `author.name` and `keywords`. A power installs from GitHub only through the IDE's Powers panel. No CLI scheduler: a system cron calls `kiro-cli chat --no-interactive`, where every `ask` counts as a deny unless `--trust-tools` or a permissions file allows it. Source: kiro.dev/docs/powers, kiro.dev/docs/cli/headless.
  - Claude Code, Codex, Copilot (later): all read a marketplace manifest (`.claude-plugin/marketplace.json`; Codex also `.agents/plugins/marketplace.json`; Copilot also `.github/plugin/`) and install into a versioned cache. None has a plugin-run scheduler. Claude Code and Codex have scheduled tasks in their apps, and Claude Code and GitHub Copilot CLI schedule prompts inside a session. A system cron can call the headless CLI.
  - Common to all: no harness offers an install hook, so the assembly keeps downloading the journal binary with its checksum and attestation. Skill text gets no common root variable (Hermes `${HERMES_SKILL_DIR}`, OpenClaw `{baseDir}`, Oh-My-Pi `[Skill directory]`). Ponytail's skills read nothing outside their own folder.
  - Layout for the whole set (the owner, 2026-10-18): "It is very bad that you concentrate on Hermes. I will repeat once more: Hermes is not the only harness. And your proposal, as it seems to me, may get in the way of the other harnesses. So when you check something, please do not concentrate on the current task, concentrate on the common task." On recording it: "So that you stop getting confused, the correct layout that comes out must be written into the documentation at once. Doing the whole layout is not required. For now we will do only Hermes anyway. But so that you do not get stuck in Hermes, write it into the documentation, write the To Be Done pieces into the README and write it into the Intent." On the install form: "Like everyone, by the standard." Hermes installs Lawman as a plain Agent Plugins package, like every other harness. `docs/harnesses.md` holds the layout that serves the whole set. It also holds the table of eight harnesses with install, skill names, scheduler and status, and the list of conflicts. Each fact carries its source. The README Install section holds one subsection per harness, with TBD for the ones not built. Only the Hermes part is built in the release that records this.
  - Open points per harness, each to be read live when that harness's heist starts:
    - Scheduler: no plugin-run scheduler exists for Pi, Oh-My-Pi, Kiro, Claude Code, Codex and GitHub Copilot CLI. Each needs a system cron that calls the headless CLI (`pi -p`, `omp -p --cwd`, `kiro-cli chat --no-interactive`, `claude -p`, `codex exec`, `copilot -p`) or an app that stays open. None of these routes is run.
    - OpenClaw: a cron agent-turn job runs in the workspace of the scheduled agent. The docs read give a per-job working directory only to command payloads, which run a shell command and not a skill (https://github.com/openclaw/openclaw/blob/main/docs/automation/cron-jobs/payloads.md). The installation would have to be that workspace. Naming a skill in the cron prompt is not verified.
    - Link to the plugin: a harness that copies the plugin into a versioned cache may break the installation's link `lawman` at an upgrade. This holds for Oh-My-Pi, Claude Code, Codex, GitHub Copilot CLI and OpenClaw. Not verified.
    - Oh-My-Pi upgrades only catalog entries that declare a `version`. The entry in `.claude-plugin/marketplace.json` declares none.
    - Pi: whether a package with a root `plugin.json` and no root `package.json` installs and finds its skills. Not verified.
    - Kiro: where an installed power lands, whether its skill names carry a prefix, and whether the CLI installs from a GitHub URL. Not verified.
    - Claude Code: whether a root `plugin.json` is read at all, and whether a root `package.json` with a lockfile triggers a package install. Not verified. The second reason is why the journal program lives in `journal/`.
- Tool-neutral text (the owner, 2026-10-18): "Focusing on concrete commands is actually rather destructive. Even for Git and the GitHub CLI. The plugin's user may work with another version control system. He may work not with GitHub but with another provider or some personal installation. So I would consider not naming concrete tools but describing what must be done." On measured failures: "Just as with the commands themselves, we can describe the structure and describe what must not be done. So I see no contradiction." This release writes what it changes in that style. The rest of the law and the roles move to it in a later heist.
- Tracker-neutral design (the owner, 2026-10-18): "The deep binding to GitHub was also a consequence of the MVP, but it is not a limit, not an obligation. The user may use another tracker, a third-party tracker, or keep his tasks inside the harness or even just in a file. So a hard binding to GitHub and its issues is also wrong. But at the current stage it is enough to record dropping the hard binding to GitHub as a tracker in the intent." Today markers live in GitHub issues and comments, and the journal syncs from `gh` output.
- Where user-specific facts live (the owner, 2026-10-18): "depending on the harness, depending on the user's intentions and wishes, the key may lie in different places. This also has to be taken into account, and we need to describe which key is needed and what for. And the agent working inside the harness, together with the user, must determine where the key lies in the specific case and which key to use. I think all these things — keys, tracker, tools — should be either part of the repository's constitution, if the user allows it, or a part that agents and the schedule read but that is not committed to the repository. The user should probably have a place where he keeps such things and how he uses them. And we, accordingly, must allow this and must not build obstacles to it." This release applies it to the TypeSafe key: the court text names the key and its purpose, the assembly asks where it lives, and the installation's `config.yaml` records that place, never the value. Trackers and tools follow in a later heist.
- The executor's first live runs are not measured yet: one full run on a precinct, and a CI wait longer than the harness's command limit.
- The schedule: ten roles each running every day spend model usage fast. Thin the schedule by each role's difficulty, its caps and similar measures. The owner: "the schedule needs to be diluted a little, depending on difficulty, caps and so on." Not designed yet.

## Decision record of the founding conversation

What the owner proposed, what Claude proposed, and what was accepted or rejected, in order.

| Topic | Proposed by | Proposal | Outcome |
| :-- | :-- | :-- | :-- |
| Starting point | owner | One system patrols chosen repositories. Init draws a "map" of each. A court takes the oldest issue. A clerk writes the spec. A human reviews spec and PR. Any harness. Shared plugins for roles. | Accepted as the goal |
| Dispatcher placement | Claude | Cloud plus local dispatchers, two lists | Rejected: "The clerks are the dispatchers". One local dispatcher for all added repositories |
| Map location | Claude | One file per precinct, a passport with platform, team, budget, fence and gear | Reframed: "I would call it a constitution." Team size and stars do not matter |
| Thinking style | owner | "Let's go from the general to the particular", no options or questions until brainstorming starts | Accepted. Claude switched to listening mode |
| Duty desk | owner | Sends patrols, registers reports, keeps the journal, knows precincts, departments, recency and limits | Accepted |
| Prosecution with both sides | owner | Accuser and defender inside the prosecution | Claude: in reality prosecution is one-sided and a cheap filter, while the contest happens in court. Owner agreed: "that sounds more logical" |
| Investigation | owner | A missing stage between report and prosecution | Accepted. Claude: forensics is written once, departments shrink to one page |
| Defender equal to prosecutor | owner | Equal, each with experts, court sees both | Accepted |
| Budget per precinct | Claude | Runs per day plus a work-in-progress limit | Rejected. One weight number per precinct |
| Response unit for human issues | owner | Duty desk checks human issues first, sends a response unit, else a patrol | Accepted |
| Reply to the reporter | Claude | Stay silent until the ruling | Paused by the owner, then answered: a label and a comment, ask for clarification when evidence is thin, and the assembly checks issue templates |
| Priority | owner | P0–P3 instead of now or later. P0 notifies the owner | Accepted |
| Packaging | Claude | Roles as an Agent Plugins package plus a small TypeScript CLI | Rejected: a separate repository, "I don't want it to be just agent plugins". Schedules are created inside the user's harness by a founding skill |
| Access | owner | Guide the user through tokens | Reversed by the owner: scripts never call GitHub, the machine's `git` and `gh` do |
| Design summary | owner | Asked for a short design with diagrams | Delivered |
| Execution split | owner | Spec-writing and code-writing as two processes with own limits | Accepted |
| Schedules | owner | Each role on its own schedule and model, nobody blocks anybody | Accepted. Claude: court ticks take cases that have both positions |
| Labels | owner | Asked for alternatives to labels | Claude proposed markers in comments as the record and a local journal as cache. Not objected |
| Stops | owner | Return one step back instead of stopping | Accepted. Claude added one precise question per return and a round counter that closes the case after the third round. Not objected |
| Journal | owner | SQLite instead of a text file | Accepted. Claude: roles never write SQL, a small command wraps it |
| Verdicts | owner | Guilty, by design, rejected. What else? | Claude proposed ten verdicts and a court clerk for amendments. The owner closed the topic: "we have discussed everything here" |
| Sub-project order | Claude | Foundation, police, investigation and prosecution, court, execution, more departments | Corrected: distil from all three repositories, not one |
| Repository-specific department | owner | Ignore it unless something is general | Accepted |
| User-defined departments | owner | Users add their own departments | Accepted. Claude: a department is a page with three lookup places |
| First harness | owner | Write with Claude, run first in Hermes, support every harness | Accepted |
| Language | Claude | Python | Rejected: TypeScript, then Bun compiled to a binary |
| Binaries | owner | No second repository. Signed binaries with checksums | Accepted. Claude: the law clone is pinned the same way |
| Name | owner | One slang word, not "executive branch" | Claude proposed lawman. Accepted |
| Repository | owner | Create it on GitHub, public | Done |
| Installation layout | Claude | One installation folder with the journal, clones, departments and config | Accepted: "Option 1 works" |
| Method | owner | Build it with the gangsta plugin | Accepted. The first heist started |
| Department set of a precinct | owner | The duty desk picks a precinct by round robin, takes the shared departments plus the precinct's own, then picks the patrol by a second round robin. "First it picks the squad, if there is somewhere to send it, and then the patrol" | Accepted |
| Install route | owner | Install Lawman as a plugin and a marketplace per Agent Plugins 1.0, and update it with the harness's own commands. `main` holds only releases. | Accepted. Lawman keeps its law, its journal binary and its assembly. The "only agent plugins" rejection stands. |

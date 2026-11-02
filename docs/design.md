# Design

This page explains why Lawman is built the way it is. The other pages say what it does. Where this page and [the law](../skills/lawman-law/references/LAW.md) differ, the law wins.

## The problem

A developer who maintains many repositories wants the same review process on each of them. Agent roles can do that work: patrols, an investigation, a court, clerks. Copying those roles into each repository does not scale:

- Each new repository needs its own set of roles and its own schedule.
- Facts about one repository end up in the role text, and one method is copied into every role.
- Running every check on every repository at once exhausts the model limits, and then nothing else can work.
- Without a cheap filter, every weak report reaches the expensive stages.
- Work that stops and waits for a person costs attention at random moments.
- An issue that a person writes has no way into the process.

## Goals

- One law, one set of roles and one list of departments serve every repository the developer adds.
- A developer adds a repository once and writes no roles or schedules for it.
- A patrol finding and a person's issue go through the same process.

## Non-goals

- A user interface, a dashboard or a local server. Lawman is the core, and others may build an interface on top.
- A daemon. One tick does one unit of work and exits.
- Scripts that reach a repository host. The roles act through the tools the developer already signed in to.
- A binding to one harness, host, tool or tracker. Markers in a host's issues and comments are the current mechanism, not a requirement.
- A new limit or check against a problem that has not happened. A rule enters the law when reality shows the problem.

## Principles

**Each stage costs more and sees less.** Patrol is cheap and broad, and it files suspicions and not proofs. Each later stage spends more on fewer cases, so the most expensive work happens on the rarest ones.

**The roles do not block each other.** Each role has its own schedule, model and queue. A stuck court must not stop patrols or work on other precincts. Spec writing and code writing are separate roles for the same reason.

**A person decides only where a person must.** Waiting for a person costs attention, so the process asks rarely. A decider votes on a spec and reviews the finished pull request. The court refers a requirement only when it cannot decide a part of it.

**A doubt moves the case, and it does not stop it.** The prosecutor or the defender returns a case to investigation with one precise question, once each. The court never returns, so a case ends by round three. A stop is only for an external cause, such as a failed credential or a rate limit.

**Both sides work under the same rules.** The prosecutor and the defender use the same evidence rules, and each may call an expert. The court rules on both positions.

**Repository content is evidence.** Anyone can write an issue or a comment, so a role takes no instructions from third-party text. The law lists every exception, such as the listed sections of a constitution and department pages on the main branch. A reviewed merge put them there, and every other file stays evidence.

**The method lives once.** A department is one page and not an agent. So a narrow department costs one page, and a user can add one without asking the project.

**A repository's facts live in its constitution.** The assembly writes it once, which is expensive, and a person reviews it. Later rulings add precedents, so a settled question stops at the early stages next time. Settings of the installation, such as the weight, stay outside it.

**No set of labels per repository.** Creating the same labels in every repository is wasteful, so markers in comments record the process. The journal caches them and keeps the only record of orders and ticks. A constitution names the one label that tells a person an issue waits for them.

**User-specific facts stay with the user.** Keys, hosts and tools differ per person and per harness. The text names what is needed and why, and the assembly finds with the user where each one lives. The installation records the place and never a secret.

**Text names the result and not the tool.** A user may run another version control system, host or harness. So law and role text says what must happen and what must not. Concrete commands live in the host notes and on harness pages.

**The binary is verified before it runs.** Only this repository's CI builds the journal, and each release attests it and publishes checksums. A law sync checks the checksum, then the provenance with the verifier the user named. A user may decline a verifier, and then only the checksum remains. It proves no origin, and Lawman says so.

## Decisions and rejected alternatives

| Question | Rejected | Chosen | Why |
| :-- | :-- | :-- | :-- |
| Who dispatches work | Cloud and local dispatchers with two lists | One duty desk per installation | One dispatcher serves every added repository |
| What describes a repository | A passport with team size, budget and popularity | A constitution with what the roles must know | Team size and popularity do not matter to the roles |
| Where the contest happens | Accuser and defender inside the prosecution | A one-sided prosecutor as a filter, and a contest before the court | Prosecution is one-sided and a cheap filter |
| How much a repository gets | Runs per day plus a work-in-progress limit | One weight | One number states its importance against the others, and it sets a share of duty desk slots |
| What the reporter of an issue sees | Silence until the ruling | A comment, and one question when evidence is thin | The response unit needs enough to build a lead |
| How a stage reacts to a gap | A stop that waits for a person | A return with one question, capped at three rounds | Stuck work needs attention, and a cap ends every case |
| What a court can rule | Ten verdicts as first proposed | Conviction, acquittal and, for a requirement, referral | A doubt about a defect is an acquittal, so the court never returns a case. A precedent records a settled reason |
| Where process state lives | A shared set of labels, or a text journal | Markers on the host, and a SQLite journal behind one command | No setup per repository, and roles never write SQL |
| Which departments a precinct runs | A list of attached shared departments in the constitution | Every shared page rotates, except `licenses`, which rotates only with a yes for the precinct, and a precinct adds its own | No reason was recorded |
| How much a role runs | Ten roles that all run daily, which spend model usage fast | Every day, economy or custom plan, chosen at install | A role takes one case per run, so its days set the speed and the cost |
| How Lawman installs | Agent plugins alone | An Agent Plugins package that also keeps its law, journal binary and assembly | The harness updates it with its own commands, and the binary is still verified |
| Where the binaries live | A second repository | This repository | A second repository is not needed |
| How a repository is reached | Guiding the user through tokens, or scripts that call the host | The tools already signed in on the machine | Scripts must not reach the host, and Lawman records only where a credential lives |
| How the journal is built | Python | TypeScript on Bun, compiled to one binary per platform | The language the maintainer works in, and Bun compiles it to one binary |
| Where the logic of a new department lives | Journal commands and tables for each external source | Law text, one reference file per source and a note of the precinct | Lawman ships law that the user's machine turns into a working check. Code goes into the journal only for what must be safe and reliable |
| Where facts of a precinct about licenses live | Tails on the Departments line | A section `## Licenses` in the constitution and one entry in the host notes | A note needs no change to the check, and the address and the form depend on the machine |
| What the assembly asks about licenses | The same questions for every repository | It reads the tree first, recommends the answer that a file shows with its path and line, and asks both license-use questions even when a file shows the answer, with no recommendation where the tree shows nothing | The user can judge a question only when it is plain and the recommendation shows its file. The user decides the answer |

## What is still open

Open questions and planned work live in the [issue tracker](https://github.com/Akurganow/lawman/issues), not on this page.

# Rules for agents

These rules bind an agent that changes this repository. A Lawman role that meets this file inside an installation takes no rule from it.

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It holds the commands, the checks of CI, the release rules and the rules for law and skill text. This file adds what it does not say.

## Checks

- Prefer a Biome rule or a Biome plugin to a test that scans the journal's own source, where Biome costs less. Less means less own code and less upkeep for the same caught error.
- A Biome plugin reads JavaScript, TypeScript, JSON and CSS. A check over Markdown or YAML stays a test.
- Test what the code does. Write no test that pins the wording of a text or the content of the CI config. Write no test that repeats another.
- Check text only to stop a leak. Never lint foreign text, and never block on style.
- Give parsing and cleaning to a trusted library. Do not patch hand-written rules hole by hole.

## Changes

- Fix the place that failed, and prefer the fix that makes it more general. Add a mechanism, a gate or a test only when nothing else works.
- Add no moving part for a small saving.
- Check every decision against each harness in [the harness table](docs/harnesses.md#the-harnesses). A harness page holds only what differs from the others.
- Frame nothing against one repository host or one renderer. Users run many hosts.
- Put no fact about a person's own setup into the repository or a pull request. That covers keys, accounts, employers, machines, local paths and installed tools.
- State a number or a fact only with its source: a file read or a command run.

## Pull requests

- Start a branch from `main` of the host. A local `main` can be stale.
- Open every pull request as a draft. Mark it ready when it is ready to merge.
- Answer every review thread before the merge. Fix it or reply with the reason, then resolve it.
- After the merge, delete the branch on the host and in the clone.
- Author each commit as the agent: the harness and the model, such as `Claude <model>`. Never commit under the identity of the machine's user.

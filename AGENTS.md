# Rules for agents

These rules bind an agent that changes this repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) before a change. This file adds rules that it does not state.

## Checks and tests

- Prefer a Biome rule or a Biome plugin to a test that scans the source in `journal/`, where Biome costs less. Biome costs less when it catches the same error with less own code and less upkeep.
- A Biome plugin reads only some languages, and the Biome documentation lists them. A check over a file in another language stays a test.
- Write no new test whose only check is the wording of a text or the content of the CI config. Write no test that repeats another.
- Add a test only where the behaviour would otherwise stand unprotected. Prefer a new case in an existing test.
- Add a check on a text only when it stops a leak or protects the journal's own parsing. Never block a text on style.
- Never lint a body that Lawman did not write, such as the body of a foreign issue or pull request.
- Parse and clean text with an established library, as the journal does for Markdown and HTML. Do not write own rules for it and patch them hole by hole.

## Design

- Repair a defect in the place that has it, and prefer the repair that also covers the neighbouring cases. Add a new part only when no such repair works.
- A small saving does not justify a new part.
- Before a decision that touches a harness, read [the principle](docs/harnesses.md#the-principle). Check the decision against every harness of that page.
- Do not prove a behaviour on one repository host alone, such as how one host renders Markdown. Users run many hosts.
- Put no fact about anyone's own setup into the repository or a pull request. That covers keys, accounts, employers, machines, local paths and installed tools.
- State a number or a fact only with its source, such as a file read, a command run or a page of documentation.

## Pull requests

- Branch from the base branch as the host holds it. A local copy can be stale.
- Open every pull request as a draft. Mark it ready when its CI is green and no review finding is open.
- Answer every review thread before the merge. Fix what the thread names or reply with the reason, then resolve the thread.
- Merge only when the maintainer says so. After the merge, delete the branch on the host and in the clone.
- Commit under the agent's own name, in the author and the committer field. The name is the tool and the model, such as `Claude <model>`, and never the machine's user.

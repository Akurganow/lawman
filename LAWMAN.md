---
contract_version: 4
---

# Constitution of Akurganow/lawman

## Read first

- README.md

## Departments

- internal-affairs: judged by none

## Fence

- Type check, lint and tests run on every push and pull request: .github/workflows/ci.yml (job `test`)
- A class fence keeps words of one repository out of the law, the departments and the roles: .github/workflows/ci.yml (job `fence`)
- A leak scan rejects home paths and GitHub tokens in every file: .github/workflows/ci.yml (job `leaks`)
- A commit check rejects a pull request commit that is not a conventional commit: .github/workflows/ci.yml (job `commits`)
- A check rejects a tree where `docs/gangsta/` is not ignored by git: .github/workflows/ci.yml (job `ignore`)
- A plugin scan rejects a tree that the Hermes scanner does not rate safe: .github/workflows/ci.yml (job `hermes-scan`)
- The fence does not prove that a text of the law or of a skill says what it should. A rule can pass every job and still mislead a role.

## Regression proof

- cd journal && bun install --frozen-lockfile
- cd journal && bun run check
- cd journal && bun test --timeout=30000

## Not judged

- journal/bun.lock
- journal/src/fixtures
- journal/src/cases-fixture.ts
- journal/src/clerk-jobs-fixture.ts
- journal/src/pulls-fixture.ts

## Execution

- Run code only in a copy under the run directory. Never run it in the clone.
- The tree expects the Bun version that .github/workflows/ci.yml installs.

## Executor loads

- fence-patterns.txt

## Labels

- `needs-human` (owner attention): Lawman cannot decide this issue alone. A person decides on it.

## Licenses

reaches copies
use non-commercial
sources deps-dev,npm-registry,clearly-defined

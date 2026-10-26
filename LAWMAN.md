---
contract_version: 3
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
- The fence does not prove that a text of the law or of a skill says what it should. A rule can pass every job and still mislead a role.

## Regression proof

- cd journal && bun install --frozen-lockfile
- cd journal && bun run check
- cd journal && bun test

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

## Precedents

none

---
contract_version: 1
---

# Constitution of example/widgets

## Read first

- README.md
- docs/architecture.md "Module boundaries"
- CONTRIBUTING.md "Review rules"

## Departments

- abstraction: judged by docs/review/abstractions.md
- dead-code: judged by docs/review/dead-code.md
- docs-drift: judged by none

## Regression proof

- make lint
- make typecheck
- make test

## Not judged

none

## Execution

- Run code only in a copy under the run directory. Never run it in the clone.
- The tree expects the runtime version named in .runtime-version.

## Executor loads

- skills/widget-api/SKILL.md
- rules/testing.md

## Precedents

- 2026-09-02 #1: The legacy adapter in src/compat stays. Two released versions still call it.
- 2026-09-20 #2: Duplicate fixtures under test/data are accepted debt. Each test file owns its copy.

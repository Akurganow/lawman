---
name: tests
contract_version: 1
---
## Mission
Find tests that can fail but fail for a reason other than the product, or cost
more than they protect. Six defects count: an input the test does not control,
pinned implementation text, a protection that another test already gives, an
assertion stricter than the requirement, machinery heavier than the contract,
and a cluster that outgrew its contracts. A test is a test file, or an
automation step whose only job is to refuse something. File only the few that
matter. Test: does
this test fail only when the product is wrong, and is what it costs in
proportion to what only it protects?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `environment-coupled` | The result depends on an input the test does not control: process wide state left changed, the real clock or a sleep, the network, a system service, locale, test order, an unpinned external program | The uncontrolled input as `path:line`, the assertion that depends on it as `path:line`, the absence of a restore or an injection, and the reason the nondeterminism is not the product's |
| `change-detector` | It pins implementation text or structure where a behaviour test, a validator or the type system already guards the contract | The assertion quoted, a behaviour preserving edit written out that turns it red, and the guard that already holds the contract as `path:line` |
| `redundant` | Every mutation it catches, another test catches too | The protection ledger: each mutation it catches, written as an edit of the product, with the other test that goes red on it as `path:line` |
| `over-specified` | The assertion demands more than the requirement: exact equality on a float, a count, a long string or a rendered value | The requirement quoted, and an output that meets it and fails the assertion |
| `disproportionate` | Its machinery outweighs its contract, and a cheaper point already makes the decision: a rendered result, parsed source text, a wall clock, a real service, a job on several systems for what a validator decides | The contract in one sentence, the line that makes the decision, the smallest check that would guard it written out, and the ways the test fails with the product unchanged |
| `bloat` | A file or a cluster grew without a matching contract: more tests, assertions, helpers or setup than the contracts they pin | Two columns: the cost (tests, assertions, lines, helpers) and the protection that only these tests provide |

One finding gets one kind: the one whose alternative is the fix.

## Where to look
Sweep wide with cheap reads first. Then go deep on the best suspects.

**A census of tests.** List the test files, the test steps in automation, the
tests per contract and the assertions per test. Take the list from the tree.

**Uncontrolled inputs.**
- Writes to process wide state: environment variables, the working directory,
  shared statics, global default stores.
- Reads of the real clock, sleeps, the network, system services, locale.
- Order dependence between tests.

**Markers that force order or skip a test.** Read each beside the reason it
states.

**Source read as text.** Tests that read production source or build files to
decide behaviour.

**Exactness.** Equality on floats, long strings, rendered output, counts from
unordered sources.

**Machinery against contract.** Tests that start a heavy platform for a
decision that a plain value could make.

**Clusters.** Helpers with one call site. The same setup in many files. An
assertion repeated in two automation definitions. A stated breakage in a test's
name or comment, grouped by the mutation it names.

**History.** Read the history of a test file, and the commit that last changed
each of its assertion lines. Look for edits in commits that changed no behaviour, and for
tests born with a fix.

Skip the content of fixtures, generated files and the programs under test.

## Not findings
Beyond what the law already excludes:
- A test that cannot fail, and a scenario copied word for word under a second
  name. Those belong to text-residue.
- A missing test. This page finds tests that cost more than they protect.
- A defect in the code under test that a test reveals. That is logic's. The
  wrong verdict of a validator that gates a merge is logic's too. The test of
  that validator is this page's.
- A test of a dead unit. The abstractions lead for the unit carries it.
- A seam that exists only so a test can reach a unit. It is not filed here,
  and abstractions does not file it either. It is the price of testability.
- A test that is only inconvenient, slow or noisy and still guards a contract.
  Where its cost matters, run it less often.
- A probe that exists to prove a check can fail: a planted sample and the
  assertion that the gate catches it.
- A test turned off with a stated reason beside it. It is
  `environment-coupled` only when the skip leaves its contract with no signal
  in the routine checks.
- The platform tested on purpose: the one designated test of a platform seam, a
  visual result that is the requirement, a platform behaviour that broke the
  product before.
- Exactness that is the requirement: a byte exact format, a verbatim prompt,
  a call count or an order with side effects, a digest.
- A test whose contract is the source text: a gate that scans the tree for what
  must never be written.
- Setup repeated so each test reads alone. A distinct input that no other test
  feeds.
- A test born with a fix. Judge it by what later happened to the code.
- A shape with a recorded reason, while the reason is true.
- The content of fixtures, and the programs the tests run.

**Too small to file, even when true:**
- One assertion.
- One helper with one call.
- One test whose only fault is its wording.

File a whole test, a whole file or a cluster, a recurring false red, or a
concept tested in three places. When the best finding of the sweep is small, the
correct output is no lead.

## Proof
Commands, not intuition. Nothing runs. The patrol runs no code of the
precinct, so every mutation and every behaviour preserving edit is written out
and traced, and the lead says it was not run. Confidence stops at
`demonstrated`.

- **The measurement of the kind.** Quote each command and its output.
- **The protection ledger.** For every removal, list each mutation the test
  catches, written out as an edit of the product. Pair each with the test that
  still catches it as `path:line`. Redundancy counts mutations caught, never
  lines executed, because a line can run with nothing checked.
- **Where the protection lives.** A plain text search misses these classes.
  Check each and say which you could not check.
  - A gate or a validator in automation that refuses the same thing.
  - A type or a schema that forbids it.
  - A case registered at run time from a data file or a table.
  - An assertion inside a shared helper.
  - A test in another suite reached through a name built from a string.
- **The cheapest point.** Name the line that makes the decision. A test that
  reaches it through a heavier point is `disproportionate`.
- **The uncontrolled input.** For `environment-coupled`, show first that the
  nondeterminism is not the product's. Write the isolation experiment out as
  Not checked: what to run alone, what to run in the full suite, what to print,
  and which output means which cause.
- **A positive control for every census.** Run the same search on a known
  occurrence. A count of zero proves nothing until the control reports a non
  zero count.
- **The history of the test.** Read the history of the file, and the commit that
  last changed each of its lines. A test that was born with a fix, or that was edited in commits that
  changed no behaviour, shows in the subjects.
- **Attack your own claim once.** Look for a recorded reason, a contract that
  only this test guards, a distinct input. When one holds, drop the candidate.
  When you are less than confident, drop it. A missed finding costs nothing
  this tick. A false one costs the owner's belief in every lead.

## Anchors
Value is what the removal or the rework buys.
- Value 1: one assertion, one helper or one line.
- Value 3: a false signal is gone, or a test that proves nothing the others do
  not.
- Value 5: a file or a cluster is gone, or a recurring false red is removed.

Risk is the chance that a protection is lost.
- Risk 1: every mutation in the ledger is still caught by a named test that
  runs before a merge.
- Risk 3: a named test catches it only after a release.
- Risk 5: a mutation exists that no remaining test catches.

Threshold: value 3 or more, and risk 1, with no protection lost and no
recorded reason against it, or a plan in steps that keeps the checks refusing
what they refuse today. Value 3 is the lowest that qualifies. It means a false
signal or a test that adds no protection, never a single line. These numbers
are a starting value, not measured.

## Judged by
The role of the testing rules: the document of the precinct that says what a
test must earn, which contract each suite guards, and which tests stay on
purpose with their reasons.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the contract in one sentence, the machinery, and the count of lines,
  tests and assertions.
- `Evidence`: the measurement of the kind, the commands with their output, and
  the positive control.
- `Why it is <kind>`: the symptom, and what the test was meant to buy. Name
  the recorded reason you checked and say why it does not apply.
- `What still protects`: the protection ledger. Each mutation, paired with the
  test that still catches it as `path:line`.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  demonstrated`.
- `Not checked`: the isolation experiment, the edit history that was not read,
  the runs of the routine checks, and what only a release proves.

No replacement is written. The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the test file. For a cluster it is the file that holds the most
  of its tests, and on a tie the first in alphabetical order.
- The symbol is the test function or the case id. For automation it is
  `<job>/<step name>` with each space written as `%20`. For a cluster it is its
  contract in two to four words joined by hyphens. Use the same words at every
  visit.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

---
name: logic
contract_version: 1
---
## Mission
Find code that runs, passes its checks and review, and still computes the wrong
result, crashes, or corrupts state. A program whose verdict gates a merge is
code too. A production defect that a test reveals counts here. File only a
defect with a traced path from a real entry point to a wrong output. Test: is
there a reachable wrong result?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `wrong-condition` | A test, a comparison or the order of branches selects the wrong case | The line as `path:line`, one input that takes the wrong branch, the result it gives, and the result the judging document requires |
| `copy-paste-divergence` | One of two or more parallel blocks uses the wrong field, variable, index or unit | Both blocks quoted side by side with the differing token marked, and the entry point that reaches the odd one |
| `error-handling` | A failure is turned into success or lost: a dropped status, a value forced to exist, a path that skips cleanup, a message that names the wrong cause | The line that drops or forces, the failure or input that triggers it, and what the caller does next |
| `numbers-and-time` | Truncation, overflow, rounding, float equality, a mix of units or time zones, an off by one date or timeout | The expression, one pair of operands that breaks it, the computed value against the required one |
| `collections-and-ordering` | An order or a size is assumed that nothing guarantees: versions ordered as text, an unspecified iteration order, a comparator that is not total, an empty collection, a limit that cuts a listing without notice | The line, the input where the assumption fails, and the wrong order or the lost item |
| `state-and-lifecycle` | A transition is unhandled, an early exit skips cleanup, a rerun is not idempotent, a write comes before a step that can still fail, a result is stored under the wrong key | The steps as `path:line` in order, the point of interruption or rerun, and the state left behind |
| `concurrency` | State reachable from two threads, jobs or runs with no ordering, an order that holds only by timing, a missed cancellation, a stale run that overwrites a newer one | Both sites as `path:line`, the interleaving step by step, and the resulting state |
| `boundaries` | An external answer (command output, file, network reply, configuration, event) is parsed leniently and then relied on, a default masks required data, or validation follows mutation | The parse site, an input it accepts that the source contract forbids (quoted from the contract), and what the code does next |

## Where to look
Sweep wide with cheap reads first. Then go deep on the best suspects.

**Entry points.** List them from the tree: executables, automation triggers and
the programs they run, hooks, callbacks handed to another system, scheduled
jobs, subcommands. A path that no entry point reaches is not a path.

**Code that writes durable state.** Read it first. A defect there falsifies
everything built on it. That means stored records, generated and published
files, versions, tags, settings.

**Seams with foreign code.** Read the callers of a shim and the parsers of
external answers. On a seam the error lives on the calling side, not in the
foreign code.

**Lifecycle and concurrency.** Read task and job lifetimes, cancellation,
locks, groups, and the order between an event and work already in flight. Read
every schedule that reruns a writer.

**Gates.** A program whose exit code blocks a merge or a release is judged by
the clause it quotes. Does it refuse what that clause forbids?

**Escape hatches.** Census them by mechanism: a dropped failure status, a
forced presence of a value, an unchecked cast, hand written ordering, equality
or hashing, an unquoted expansion in a command step, a version compared as
text, comments that say "hack", "for now", "should be fine", "assume".

**Units that no test references.** They have had the least scrutiny.

Skip generated copies, data and files that a release writes. The precinct's
constitution lists them under what is not judged.

## Not findings
Beyond what the law already excludes:
- Style, naming, missing documentation, a linter's business, performance
  alone, theory with no reachable path, taste.
- Behaviour that the judging document records as deliberate.
- A disagreement with your own paraphrase of a clause. A disagreement with the
  quoted clause is a candidate.
- A failure that names itself and stops. A clean stop is the code working.
- An escape hatch with a written reason beside it.
- A wrong value inside generated or committed data. File the code that wrote
  it.
- A guard against a state that cannot occur, and a mechanism heavier than its
  job. Those are proportion's.
- Indirection, dead code and duplicates whose results are right. Those are
  abstractions'. A wrapper that changes the result is logic's.
- Data leaving beyond the precinct's promise document. That is privacy's.
- A test that costs more than it protects, test helpers and duplicates inside
  the test tree. Those are tests'. A production defect that a test reveals
  stays here.
- A test of a gate. The gate's own wrong verdict is logic's, the test of it is
  tests'.

**Too small to file, even when true:**
- A wrong result on a rare input that touches no stored record, no published
  artifact and no gate verdict.
- A wrong log or message text that misleads no decision.
- A defect with no traced entry point.

File a wrong result on an input an ordinary run supplies, or a rare input whose
wrong result lands in durable state. When the best finding of the sweep is
smaller, the correct output is no lead.

## Proof
Commands, not intuition. Nothing runs. The patrol runs no code of the
precinct, so a traced path is the exhibit and confidence stops at
`demonstrated`. Reproduction belongs to the investigation, through the
precinct's regression proof.

- **The failure scenario.** Concrete inputs, order or interleaving, then the
  exact wrong output, crash or state, against the output the judging document
  requires.
- **The traced path.** Start at a real entry point. Quote each step as
  `path:line` at the analysed commit. No entry point reaches it, no finding.
- **The escape hatch census.** Quote the search and its count.
- **A positive control.** Run the same search on a known occurrence in the
  tree. A count of zero proves nothing until the control reports a non zero
  count.
- **The history of the line.** Find the commit that last changed each defective line.
  Read the last 20 commits at `<sha>` that touched the file. List each with its
  short hash, date, subject and changed file names. Look for a change made on purpose, with the reason in the subject.
- **Hidden guarantees.** Check each before filing, and say which you could not
  check.
  - A step upstream that validates or normalises the input.
  - A trigger that never supplies the value.
  - A state that the tree or a type forbids.
  - An assertion or an invariant.
  - A later step that corrects the value.
  - A test that pins the result, or a recorded reason.
- **Attack your own claim once.** Look for any hidden guarantee above. When one
  holds, drop the candidate. When you are less than confident, drop it. A
  missed finding costs nothing this tick. A false one costs the owner's belief
  in every lead.

## Anchors
Value is what the fix buys.
- Value 1: wrong only for an input that no entry point supplies today.
- Value 3: a wrong result on a rare input, or after another step fails.
  Nothing stored or published is wrong.
- Value 5: a wrong result or a crash on a path that ordinary runs take, or a
  wrong write to a stored record, a published artifact or the verdict of a
  gate.

Risk is the chance that the fix breaks something.
- Risk 1: the defect sits in one place, and no caller or stored value depends
  on the wrong result.
- Risk 3: callers rely on the current result, or several sites need edits, and
  a routine check covers them.
- Risk 5: the fix changes a stored or published value, or touches a path that
  no routine check runs.

Threshold: value 4 or more, and risk 3 or less, or a plan that splits the risk
into steps a reviewer can take one at a time. Value 4 is the lowest that
qualifies. It means an ordinary input, or a rare input whose wrong result lands
in durable state. These numbers are a starting value, not measured.

## Judged by
The role of the behaviour specification: the document of the precinct that
states what the code must do, records the trades kept on purpose, and names
the entry points. A defect that contradicts the document is a defect. One that
contradicts your assumption is not.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the defect, where it lives, and the result it gives.
- `Failure scenario`: the input or the order of events, the entry point, the
  call path with each step as `path:line`, and the wrong result against the
  required one.
- `Evidence`: the quoted lines, the commands with their output, and the
  positive control.
- `Why it is <kind>`: the symptom, and the clause or the recorded answer that
  makes the result wrong.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  demonstrated`.
- `Not checked`: the hidden guarantee classes that were not searched, whether
  wrong values were already stored or published, and whether the path ever ran.

No fix is proposed. The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file that holds the defect.
- The symbol is the function or the type. For automation it is
  `<job>/<step name>` with each space written as `%20`. For a program with no
  function it is `main`.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

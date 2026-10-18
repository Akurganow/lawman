---
name: proportion
contract_version: 1
---
## Mission
Find code and decisions that are out of proportion to their job, or that nobody
would have designed on purpose. The code runs correctly and its interface is
sound. The finding is: this is not what this problem looks like. Four defects
count: a mechanism heavier than the job, a leftover of a change that only half
landed, nonsense born where two features meet, and a tool that never fit. This
is the most subjective department, so it holds the highest bar. A lead that
reads as taste costs the owner's belief in every lead. Test: knowing only the
requirement, could a competent person have arrived at this shape, and does no
comment, rule or document explain it?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `oversized` | The mechanism is heavier than the job: a type with one case that nothing matches on, three helpers chained for a value computed once, an error type per call site, a job that only computes what the next job could compute itself | What the code does in one sentence, against the count of files, types, hops and lines it takes |
| `vestigial` | The leftover of a change that only half landed, inside live code: a branch that nothing can take, a parameter that every caller passes as the same value, a value written and never read, a step for a path that moved, an install line for a tool that no step runs | The branch or parameter quoted, the caller search with its positive control, every site as `path:line`, and the commit that created it beside the commit that made it pointless |
| `emergent` | Nonsense born where two features meet, which neither author would write alone: the same normalisation applied twice, a guard for a case an earlier step already made impossible, one problem solved from both ends, the same fact stored twice and agreeing by accident, a retry inside a retry, an order that works only through a side effect | Both halves quoted as `path:line`, the path where they meet, and the two commits that brought them together |
| `mismatched` | The tool never fit the problem: hand written code where a dependency already present does the job, a table written as a long chain of conditions, logic held in configuration or configuration held in logic, a bare string passed between internal units where a set of named constants is obvious, a float where the domain counts | The fitting tool, present where the code runs, named by the file that provides it, and the code it replaces |

## Where to look
Start from the requirement, then read the code against it. Read `log <sha>
--format='%h %ad %s' --date=short -n 50 --name-only` and start with the paths
that appear most often, because a shape whose purpose moved sits where history
is busy.

**Values and steps in automation.** A step that prepares something no later
step uses. An environment value or input that no program reads. A declared job
output or an install line that nothing consumes. A step for a path that moved.

**Parameters and branches in code.**
- A parameter that every caller passes identically.
- A branch on a value that no caller supplies.
- A key written to a record that no reader reads.
- A variable assigned and never read.

**Two layers, one problem.**
- The same normalisation applied twice on one path.
- The same fact checked in a program and again in the automation that runs it.
- One failure handled at both ends.
- A guard for a state that a layer above makes impossible.

**Tool and problem.**
- Hand written parsing, date arithmetic or validation where an installed
  dependency does the job.
- A table written as a long chain of conditions.
- Logic held in configuration, or configuration held in logic.
- A bare string between internal units where a set of constants is obvious.

**Weight.** A class, a helper layer or a job whose size is far from its work.
Prefer the narrow mechanism until a second caller exists. A general one needs a
reason that is written down.

Skip generated copies and files that a release writes. The precinct's
constitution lists them under what is not judged.

## Not findings
Beyond the law's list:
- A shape that the judging document argues for, and a mechanism that the
  requirements document argues for. A mechanism built for a client's behaviour
  or for reliability reads like ceremony from outside, so read the requirement
  first.
- Behaviour that a check pins with a reason beside it.
- A cost that is written down with its reason.
- A single instance that is trivial and stands outside a cluster. A cluster is
  several instances of one tell in one unit, which together show that the unit
  grew by accretion.
- Anything that is only slow. Performance alone is not a finding.
- Data and committed fixtures.
- A whole unit that no entry point reaches, a forwarding wrapper and a
  duplicated concept. Those are `abstractions`.
- A class with one method, a builder with one path and a wrapper type. Those
  are `abstractions.superfluous`.
- Hand written code whose recorded reason the tree now meets:
  `dependencies.stale-reason`.
- A wrong result that a reachable path produces, including a swallowed error.
  That is `logic`.
- A check that cannot fail, and text that carries no fact. A comment that
  describes behaviour that is gone is `text-residue` when the comment is the
  whole defect. When it sits on a dead branch, it goes with the branch here.
- Whether an installed dependency is current or safe. That is `dependencies`.

**Too small to file, even when true:**
- One needless variable, one extra helper, one redundant guard.
- A single branch that no caller takes, when nothing else around it is wrong.
- One step or one install line for a path that moved, alone in its file.
- Anything a reviewer fixes in passing.

File only a whole mechanism, layer, job or class, or a cluster that shows one
unit grew by accretion. When the best finding of the sweep is small, the
correct output is no lead.

## Proof
Commands and numbers, not taste. Quote every command and its output.

**The requirement.** Quote the sentence of the requirement that the shape is
out of proportion with, and name the document it comes from.

**The measurement.** State what the code does in one sentence. Then give its
cost as a count: files, types, hops, lines, or "N call sites, all passing the
same value". Add the count of lines that would disappear.

**Present means present where the code runs.** For `mismatched`, name the file
that installs or imports the fitting tool in the environment where the code
runs. A tool that exists only on a maintainer's machine does not count.

**The state can arise.** A defence is in proportion when the state it guards can
occur where the code runs. To call a guard disproportionate, name the layer that
makes the state impossible, with `path:line`.

**A positive control.** For `vestigial`, search the whole tree for every caller
that supplies the value or takes the branch. Run the same search on a branch
known to be taken. Quote both outputs. A count of zero proves nothing until the
control has reported a non zero count.

**Hidden callers.** A plain text search misses a reader that takes the branch
or supplies the value through a table chosen at run time, a default argument,
reflection, a value built from a string, the environment, the inputs of a
reusable block, a file that a tool's configuration names, or a registered
handler. Check each class and say which you could not check.

**History.** For `vestigial` and `emergent`, read `log <sha> --format='%h %ad %s'
--date=short -n 20 --name-only -- <path>` for the file and `blame -s -L` on the
lines. Take no search string from the tree. Name two commits: the one that
created the shape and the one that made it pointless or brought the two halves
together. Read the subject of the creating commit. A subject that explains the
shape closes the candidate. If the history is too short to name both commits,
put the missing commit in `Not checked`.

**Attack your own claim once.** Look for the reason the shape exists, a
document that argues for it, and a check that pins it. When one holds, record
it and drop the candidate. When you are less than confident, drop it.

## Anchors
Value is what the removal buys.
- Value 1: a line or a constant saved.
- Value 3: a mechanism that a reader no longer has to learn.
- Value 5: a class, job, reusable workflow or layer is gone.

Risk is the chance that the change moves behaviour or output.
- Risk 1: no output of any program moves, as with a branch that nothing can
  take.
- Risk 3: the output of one program can change in a case that a routine check
  covers.
- Risk 5: the change touches a generated copy, a file that a release writes, or
  a path that no routine check runs.

Threshold: value 4 or more, and risk 3 or less, or a plan that splits the risk
into steps a reviewer can take one at a time. Value 4 is the lowest that
qualifies. It means a whole mechanism, never a part of one. These numbers are a
starting value, not measured.

## Judged by
The role of the design vocabulary: the document of the precinct that names the
symptoms, the rules of judgement, what counts as present, and the shapes the
precinct has already argued for.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the shape, where it lives, and what it does in one sentence.
- `Requirement`: the requirement as one quoted sentence, and the document it
  comes from.
- `Evidence`: the measurement with its counts, every site as `path:line`, and
  the commands with their output, positive control included.
- `Why it is <kind>`: the symptom in the judging document's words, and why a
  competent person would not choose this shape. Name the recorded answer you
  checked and say why it does not apply.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: what investigation must verify. List the commits that were not
  named, the hidden caller classes that were not searched and the remedy that
  was not designed.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file that holds the shape, or the workflow file.
- The symbol is the function, class, type or constant. For automation it is the
  job, or `<job>/<step name>` with each space written as `%20`. For a cluster it
  is the one concept the instances share.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

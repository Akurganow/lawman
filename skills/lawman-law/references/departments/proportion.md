---
name: proportion
contract_version: 1
---
## Mission
Find code and decisions that are out of proportion to their job, or that nobody
would have designed on purpose. The code runs correctly and its interface is
sound. The finding is: this is not what this problem looks like. Four defects
count: a mechanism heavier than the job, a leftover of a change that only half
landed, nonsense born where two features meet, and a tool that never fit.
Test: knowing only the requirement, could a competent person have arrived at
this shape, and does no comment, rule or document explain it?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `oversized` | The mechanism is heavier than the job: a type with one case that nothing matches on, three helpers chained for a value computed once, an error type per call site, a job that only computes what the next job could compute itself | What the code does in one sentence, against the count of files, types, hops and lines it takes |
| `vestigial` | The leftover of a change that only half landed, inside live code: a branch that nothing can take, a parameter that every caller passes as the same value, a value written and never read, a step for a path that moved, an install line for a tool that no step runs | The branch or parameter quoted, the caller search with its positive control, every site as `path:line`, and the commit that created it beside the commit that made it pointless |
| `emergent` | Nonsense born where two features meet, which neither author would write alone: the same normalisation applied twice, a guard for a case an earlier step already made impossible, one problem solved from both ends, the same fact stored twice and agreeing by accident, a retry inside a retry, an order that works only through a side effect | Both halves quoted as `path:line`, the path where they meet, and the two commits that brought them together |
| `mismatched` | The tool never fit the problem: hand written code where a dependency already present does the job, a table written as a long chain of conditions, logic held in configuration or configuration held in logic, a bare string passed between internal units where a set of named constants is obvious, a float where the domain counts | The fitting tool, present where the code runs, named by the file that provides it, and the code it replaces |

## Where to look
Start from the requirement, then read the code against it. Read the last 50 commits at `<sha>`. List each with its short
hash, date, subject and changed file names. Start with the paths that appear
most often.

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

Skip generated copies and files that a release writes.

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
- A comment that describes behaviour that is gone, when the comment is the
  whole defect. When it sits on a dead branch, it goes with the branch.

**Too small to file, even when true:**
- One needless variable, one extra helper, one redundant guard.
- A single branch that no caller takes, when nothing else around it is wrong.
- One step or one install line for a path that moved, alone in its file.
- Anything a reviewer fixes in passing.

File only a whole mechanism, layer, job or class, or a cluster that shows one
unit grew by accretion.

## Proof
**The requirement.** Quote the sentence of the requirement that the shape is
out of proportion with, and name where the tree states it. The tree states a
requirement in places such as a requirements document, a specification or the
unit's own stated purpose.

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
known to be taken.

**Hidden callers.** A plain text search misses a reader that takes the branch
or supplies the value through a table chosen at run time, a default argument,
reflection, a value built from a string, the environment, the inputs of a
reusable block, a file that a tool's configuration names, or a registered
handler.

**History.** For `vestigial` and `emergent`, read the last 20 commits at `<sha>` that touched the file. List each with its
short hash, date, subject and changed file names. Find the commit that
last changed each of the lines. Name two commits: the one that
created the shape and the one that made it pointless or brought the two halves
together. Read the subject of the creating commit. A subject that explains the
shape closes the candidate. If the history is too short to name both commits,
put the missing commit in `Not checked`.

## Anchors
Value is what the removal buys.
- Value 1: a line or a constant saved.
- Value 3: a part of a mechanism that a reader no longer has to learn.
- Value 5: a class, job, reusable workflow or layer is gone.

Risk is the chance that the change moves behaviour or output.
- Risk 1: no output of any program moves, as with a branch that nothing can
  take.
- Risk 3: the output of one program can change in a case that a routine check
  covers.
- Risk 5: the change touches a generated copy, a file that a release writes, or
  a path that no routine check runs.

Threshold: value 4 or more. Value 4 is the smallest finding that Not findings
says to file.

## Judged by
The role of the design vocabulary: the document of the precinct that names the
symptoms, the rules of judgement, what counts as present, and the shapes the
precinct has already argued for.

## Lead body
Add one section, `Requirement`, after `Why it is <kind>`: the requirement as
one quoted sentence, and where the tree states it. For `vestigial` and
`emergent` it may hold the word `none`. `What` says what the shape does in one
sentence. `Not checked` lists the commits that were not named and says that
no remedy was designed.

## Identity
- The path is the file that holds the shape, or the workflow file.
- The symbol is the function, class, type or constant. For automation it is the
  job, or `<job>/<step name>` with each space written as `%20`. For a cluster it
  is the one concept the instances share.

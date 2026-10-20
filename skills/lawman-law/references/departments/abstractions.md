---
name: abstractions
contract_version: 1
---
## Mission
Find abstractions that cost a maintainer reading time and buy nothing. An
abstraction is any named unit a reader must learn: a function, class, type,
interface, module, constant, subcommand, job or workflow, or one concept
modelled in several places. Four defects count: the unit is dead, it is
superfluous indirection, its seam is cut in the wrong place, or it duplicates
another. File only the few whose removal matters. Test: does the removal change
the shape a maintainer holds in their head?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `dead` | A unit that no entry point reaches, or one reached only by other dead code. This includes a declared dependency that no unit uses, and an error case or variant that nothing constructs | The definition as `path:line`, the reference count with the search it came from, every site as `path:line`, the positive control, and the hidden caller check |
| `superfluous` | Indirection that buys nothing: a forwarding wrapper, a class with one method, a dispatch table with one entry, an interface with one implementation and no test double, a type parameter bound to one type everywhere, a wrapper type that holds no invariant and is unwrapped at every use, a builder with one construction path, a module that only re-exports, a reusable CI block with one caller and no second trigger | The indirection quoted beside the one thing it forwards to, and every call site |
| `wrong` | The seam sits in the wrong place: a flag that switches two behaviours, a return value of which callers use half, two files kept in step by convention, cases that force every consumer to handle states that cannot occur, an implementation that stubs half of an interface, an interface that leaks its only implementation, a name visible wider than any caller needs | Both halves quoted, and the callers that adapt to the seam |
| `duplicated` | Three or more places model one concept: parallel types or enumerations of the same states, two configuration types that parse one input, one algorithm written twice, competing error types | Every site quoted, what differs between them, and the one place that should own the concept |

## Where to look
Sweep wide with cheap reads first. Then go deep on the best suspects. Take the
list of units to sweep from the tree's own manifests, never from a list kept on
a page.

**A census of definitions.** List every function, class, type, constant and
exported name. List every job, step, input, output and secret in the automation
definitions. Count the references of each across the whole tree.

**Entry points.** Everything needs a caller. Each subcommand needs a caller in
automation or in a document that tells a person to run it. Each job needs a
reader. Each template or data file needs a reader. Each script that a
package installs needs a caller or a stated user. Each declared dependency
needs a unit that uses it.

**Public surface.** A name visible wider than its callers, with no reference
outside its own unit and no re-export. It is dead or wrongly public, unless a
recorded answer defends it.

**Checks that hide dead code.**
- A suppression of an unused-code warning. One without a written reason is a
  candidate. One with a reason is closed by it.
- A condition that no longer holds, or a deprecation marker that nothing
  removed.
- Code compiled only in a configuration or on a platform that nobody builds.

**Indirection that buys nothing.**
- A function whose body forwards its arguments to one other call.
- A class with one method.
- A dispatch table with one entry.
- An interface with one implementation, no test double and no recorded second
  implementation.
- A type parameter that every use binds to the same type.
- A wrapper type that holds no invariant.
- A builder with one construction path.
- A reusable CI block with one caller and no other trigger.

**Near duplicates.**
- Parallel functions or classes with the same shape.
- Parallel enumerations of the same states, and same-shaped types in different
  modules.
- The same list derived from one source in more than one place.
- A multi step block repeated across jobs or workflows.
- Repeated parsing, validation, quoting or error mapping helpers.

Skip generated copies and files that a release writes. The precinct's
constitution lists them under what is not judged.

## Not findings
Beyond the law's list:
- A shape that the judging document argues for. Engage its recorded answer on
  its own terms, or do not file.
- Several layers that enforce one rule. The overlap is the design. Two guards on
  one forbidden dependency are not duplication.
- Test code, fixtures and a seam that exists only so a test can reach the unit.
  Test code is another department's subject. Nobody files that seam.
- A type that only tests use and that lives in a separate test support unit.
- A generated copy of its source, and a file that a release writes.
- A unit whose only fault is a missing or stale comment.
- A branch or parameter inside live code that nothing can take. That is
  `proportion.vestigial`. A parameter that every caller passes as the same value
  belongs there too.
- A declared job output, input, matrix key or environment value that nothing
  reads, and an install line for a tool that no step runs. Those are
  `proportion.vestigial`.
- Residue and noise in any file that configures an agent (instruction files,
  rules, skills and their reference files, agent definitions, commands,
  prompts, hooks) belongs to `agent-config`. Orphans there are
  `agent-config.orphan`.
- A mechanism too heavy for its job, such as a type for a single value or three
  stages for a value computed once. That is `proportion.oversized`.
- Hand written code where an installed dependency already does the job. That is
  `proportion.mismatched`.
- A wrapper that changes the result. It is not a pass through, and its defect,
  if any, is a `logic` defect.
- A closed set of members that each do their own work behind one interface. The
  dispatch is the interface, not a pass through.
- Formatting, taste in names, and anything the references cannot back.

**Too small to file, even when true:**
- One unused function, constant, import or private item.
- One suppression on one line.
- A five line helper duplicated twice.
- A wrapper used in one file.
- A step block repeated in two jobs.
- Anything a reviewer fixes in passing.

File only a whole class, type, interface, subcommand, module, job or workflow,
or a concept modelled in three or more places. When the best finding of the
sweep is small, the correct output is no lead.

## Proof
Commands, not intuition. Quote every command and its output.

**The reference count.** Search the whole tree for the name. Include documents,
automation definitions, configuration and every script. Give each site as
`path:line`. Say what search the count came from.

**A positive control.** Run the same search on a unit known to be called. Quote
both outputs. A count of zero proves nothing until the control has reported a
non zero count.

**Hidden callers.** A plain text search misses these classes. Check each and
say which you could not check.
- A name chosen from a table at run time.
- A function or value passed as a default argument.
- Reflection, or lookup of a name built from a string.
- A subcommand reached through the dispatch of a command line parser.
- A method reached only through the interface it implements, by dynamic
  dispatch.
- A function registered by name as a handler or callback.
- A caller generated at build time: code produced from an annotation, a
  declaration or a template, or a file included as text.
- A call by a registered name or selector inside a framework.
- Code reached only in another build configuration or on another platform.
- A caller in a document or an example that a tool runs.
- Code that a build tool's plugin or a package manifest names.
- A caller outside the tree: the public interface of a published package, or a
  script a package installs on a user's machine.
- An automation value read through a job dependency, a matrix, the environment
  or the inputs of a reusable block.
- A file that a tool's configuration names.
- A file read at run time: a template, a fixture, a data file.

**History.** For `dead`, read the last 20 commits at `<sha>` that touched the file
that defines the unit. List each with its short hash, date, subject and changed
file names. Find the commit that last changed the lines around its
last use. Take no search string from the tree. Quote the
commit that removed the last caller. Say whether the unit was ever wired in or
was cut loose, because the two need different remedies.

**What counts as a caller.** Take the rule from the judging document. An
interface that runs ahead of its caller is not kept alive by its own tests, by
examples that ship with it, or by a binary built from it.

**Name the symptom.** Put the objection in the design vocabulary's words. An
objection with no symptom is withdrawn.

**Attack your own claim once.** Look for a reader the search could not see, a
recorded reason for the shape, or a caller side guarantee. When one holds, drop
the candidate. When you are less than confident, drop it. A missed finding
costs nothing this tick. A false one costs the owner's belief in every lead.

## Anchors
Value is what the removal buys.
- Value 1: a line or a constant saved.
- Value 3: a concept that a reader no longer has to hold, such as a flag or a
  parameter and the branches it drives.
- Value 5: a class, subcommand, job, reusable workflow or layer is gone.

Risk is the chance that the removal breaks something.
- Risk 1: no reference exists outside the definition, and no hidden caller
  class applies.
- Risk 3: callers in one program need edits, and a routine check covers them.
- Risk 5: the removal touches a path that no routine check runs, such as a
  release job, a name that other packages import, or a script that a package
  installs on a user's machine.

Threshold: value 4 or more, and risk 3 or less, or a plan that splits the risk
into steps a reviewer can take one at a time. Value 4 is the lowest that
qualifies. It means a whole unit, never a part of one. These numbers are a
starting value, not measured.

## Judged by
The role of the design vocabulary: the document of the precinct that names the
symptoms, the rules of judgement, what counts as a caller, and the shapes the
precinct has already argued for.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the abstraction, where it lives, and why it is a problem.
- `Evidence`: the definition as `path:line`, the reference count with every
  site, and the commands with their output, positive control included.
- `Why it is <kind>`: the symptom in the judging document's words, and what the
  abstraction was meant to buy. Name the recorded answer you checked and say why
  it does not apply.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: what investigation must verify. List the hidden caller classes
  that were not searched and the remedy that was not designed.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file that defines the unit, or the workflow file.
- The symbol is the function, class, type or constant. For automation it is the
  job, or `<job>/<step name>` with each space written as `%20`. For a
  `duplicated` lead it is the concept. Use the same words at every visit. An
  unused declared dependency: `dep/<name>`.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

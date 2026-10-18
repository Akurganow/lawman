---
name: dependencies
contract_version: 1
---
## Mission
Find a dependency whose state in the tree disagrees with the reason it is held
that way. A dependency is a library, a tool, a component of the automation or a
runtime that the tree names. Two groups count. The tree alone proves the first:
a recorded reason whose condition the tree already meets, and one dependency
named by versions that disagree. Only an outside source can say the second: a
workaround that upstream may have fixed, a known vulnerability in a pinned
version, a release that breaks or unlocks a line, a defect that a release
fixes. The patrol proves the tree side and hands the rest to investigation.
Test: does this fact about a dependency land on a named line, step or sentence
of the tree that it makes wrong or needless?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `stale-reason` | A recorded reason for a pin, a flag or hand written code names a condition, and the tree itself already meets it: a version floor reached, a target dropped, a feature removed | The reason quoted as `path:line`, the condition in words, and the version or fact that meets it as `path:line` |
| `drift` | One dependency is named by versions that disagree: a manifest and a lockfile, a pin and its trailing version comment, two lockfiles | Both places quoted as `path:line`, and what reads each |
| `workaround` | The tree carries code or a step written around a defect or a missing feature of a dependency, and the recorded reason waits on a release | The workaround quoted as `path:line` with its reason, then in Not checked `Source: releases <owner>/<repo>` |
| `advisory` | A pinned version may carry a published vulnerability notice | The pin as `path:line` with the name and version as the tree states them, then in Not checked `Source: advisories <ecosystem> <package>@<version>` |
| `breaks` | A newer release may break a promise the tree makes: a flag or pin called load bearing, or a documented floor | The line that holds the promise as `path:line`, then in Not checked `Source: releases <owner>/<repo>` |
| `unlocks` | A newer release may let a line, step or hand written detour go | The line that could go as `path:line`, then in Not checked `Source: releases <owner>/<repo>` |
| `fixes` | A newer release may fix a defect that the tree blames on a dependency: a skipped test, an expected failure, a comment | The line that blames it as `path:line`, then in Not checked `Source: releases <owner>/<repo>` |

A kind with a source needs two things from the tree: the line it lands on, and
the identifiers its `Source:` line needs. Copy the values as the tree writes
them. When the tree gives neither, or gives one without the other, file nothing
of that kind. Write one `Source:` line for each source, with nothing else on the
line. The patrol never reads the network. Investigation reads the source.

## Where to look
Build the inventory from the tree, not from memory.

**Declared and resolved versions.** The manifests that declare dependencies and
the lockfiles that resolve them. Direct dependencies first. A transitive one
enters only through `advisory`, and only when a lockfile line names it.

**Pins in the automation.** Components pinned by an immutable reference, with a
version in a trailing comment. Runtime and tool versions that the tree sets.

**Every file that cites a version.** Find all the files that name the same
dependency before you reach any conclusion.

**Recorded reasons.** Comments and notes that justify a pin, a flag or hand
written code. Search them with
`no (library|package)|hand-rolled|by hand|workaround|work around|until .* supports|upstream|for now|pinned|because .* does not`.
Each hit names a condition, a dependency or both.

**Promises.** A flag or pin whose comment calls it load bearing. A document line
that rests on a version. A test that blames a dependency.

Skip what the precinct's constitution lists under Not judged.

## Not findings
Beyond what the law already excludes (the Fence section, Not judged and the
recorded answers):
- A newer version with no content for this tree.
- "N releases behind", and a major version with no reason.
- A pin whose recorded reason the tree does not refute.
- A transitive dependency that the tree neither calls nor names.
- A vendored copy with a recorded origin.
- A version that appears in a release record.
- A source kind with no anchor in the tree. A claim about upstream needs a line
  of this tree to land on.
- A movable reference that a secret or a write token reaches. That is
  `security`. The test: the fix that pins the reference belongs to `security`,
  and the fix that moves to another version belongs here.
- A secret inside a manifest or a lockfile, and a credential inside a registry
  address. These belong to `security` as an alarm.
- Hand written code with no recorded reason: `proportion.mismatched`.
- An unused declared dependency is `abstractions.dead`.

**Too small to file, even when true:**
- One comment that names a version, with no consequence.
- A disagreement between a comment and a pin in one place that changes nothing
  that is installed or published.
- A version that is behind, and nothing more.

File drift that changes what is installed or published. File a workaround, a
detour or a promise of several lines, or of a whole step. When the best finding
of the sweep is small, the correct output is no lead.

## Proof
Commands, not intuition. Quote every command and its output.

**The inventory.** List the manifests, lockfiles and automation definitions
with `git -C <tree> ls-files`. Name each by its role.

**Every site of one dependency.** Run `git -C <tree> grep -n -e '<name>'` and
quote every site.

**The reason search.** Run
`git -C <tree> grep -n -i -E -e '<reason pattern>'` with the pattern from Where
to look.

**A positive control.** Run each search again over a case known to be in the
tree: a dependency that is declared and imported, a reason that is written.
Quote both outputs. A zero proves nothing until the control prints a non zero
count.

**The condition against the tree.** For `stale-reason`, quote the reason and
the condition in words. Quote the version or fact that meets it from the
manifest, the lockfile or the setting.

**Dating the reason and the pin.** Run
`git -C <tree> blame -s -L <from>,<to> <sha> -- <path>` on the reason and on
the pin.

**The tree claim of a source kind.** The claim is that the anchor line exists
and that its identifiers are the tree's. It makes no claim about upstream.

**Hidden readers.** A plain text search misses these classes. Check each and say
which you could not check.
- A version supplied by a variable or a template.
- A pin in a file that a tool's configuration names.
- A version in a document on which a promise stands.
- A dependency called as a command in the automation, not imported.
- A workspace with several manifests for one dependency.
- A version range in the manifest against the version the lockfile resolves.

**Attack your own claim once.** Look for a reason recorded beside the pin, a
comment on the dependency, an assertion or test that holds the behaviour, and
the judging document's answer. When one holds, drop the candidate. When you are
less than confident, drop it. A missed finding costs nothing this tick. A false
one costs the owner's belief in every lead.

## Anchors
Value is what the change buys.
- Value 1: one line, word or version in a comment moves.
- Value 3: a detour of several lines or a sentence goes, or a named fact about a
  version needs a recheck.
- Value 5: a whole step, a job or a class of pins goes.

Risk is the chance that the change breaks something.
- Risk 1: the change alters nothing that a check reads.
- Risk 3: the change alters output that a check or a document reads.
- Risk 5: the change alters what the automation installs or what a release
  publishes.

Threshold: value 4 or more, and risk 3 or less, or a plan that splits the risk
into steps a reviewer can take one at a time. Value 4 is the lowest that
qualifies. It means a whole step or a whole detour, never a line. These numbers
are a starting value, not measured.

## Judged by
The role of the rule on upstream judgements: the document of the precinct that
says what a claim about an upstream may stand on, and which pins the precinct
records as deliberate. With no line, the department is judged by none.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the two places and how they disagree, or the anchor and the claim.
- `Evidence`: every quote as `path:line`, and the commands with their output,
  controls included.
- `Where it lands here`: the lines, steps or sentences that the fact makes wrong
  or needless.
- `Why it is <kind>`: the symptom in the judging document's words, and the
  recorded reason you checked.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`. The
  confidence of a source kind speaks to the claim about the tree.
- `Not checked`: what investigation must verify. Name the hidden reader classes
  not searched and the remedy not designed. For a source kind, add the
  `Source:` lines here, one for each source, in the exact forms of the Kinds
  table:
  - `Source: advisories <ecosystem> <package>@<version>`
  - `Source: releases <owner>/<repo>`

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file that declares the pin or names the version. For `drift`
  it is the file that sorts first by path among the files in disagreement.
- The symbol is the dependency's name as its own package system spells it. An
  `@` in a name becomes `%40`. Security prefixes its symbols with `pin/` and
  `perm/`. Keep yours plain, so the two never collide.
- The kind is one row of the Kinds table. `drift` takes the same path and symbol
  form.

No version, line number, count or commit enters the identity.

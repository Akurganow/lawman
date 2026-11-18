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
workaround that upstream may have fixed, a release that breaks or unlocks a
line, a defect that a release fixes. The patrol proves the tree side and hands the rest to investigation.
Test: does this fact about a dependency land on a named line, step or sentence
of the tree that it makes wrong or needless?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `stale-reason` | A recorded reason for a pin, a flag or hand written code names a condition, and the tree itself already meets it: a version floor reached, a target dropped, a feature removed | The reason quoted as `path:line`, the condition in words, and the version or fact that meets it as `path:line` |
| `drift` | One dependency is named by versions that disagree: a manifest and a lockfile, a pin and its trailing version comment, two lockfiles | Both places quoted as `path:line`, and what reads each |
| `workaround` | The tree carries code or a step written around a defect or a missing feature of a dependency, and the recorded reason waits on a release | The workaround quoted as `path:line` with its reason, then in Not checked `Source: releases <owner>/<repo>` |
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
the lockfiles that resolve them. Direct dependencies first.

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
- A secret inside a manifest or a lockfile, and a credential inside a registry
  address. A live secret follows the law's rule for alarms and is never a lead.

**Too small to file, even when true:**
- One comment that names a version, with no consequence.
- A disagreement between a comment and a pin in one place that changes nothing
  that is installed or published.
- A version that is behind, and nothing more.

File drift that changes what is installed or published. File a workaround or
a detour. File a promise of several lines, or of a whole step.

## Proof
**The inventory.** List the manifests, lockfiles and automation definitions
that the tree holds. Name each by its role.

**Every site of one dependency.** Search the tree for `<name>`, handing the name
to the tool as data. Quote each site as `path:line`.

**The reason search.** Search the tree, ignoring case, for the pattern from
Where to look, as a regular expression.

**A positive control.** Run each search again over a case known to be in the
tree: a dependency that is declared and imported, a reason that is written.

**The condition against the tree.** For `stale-reason`, quote the reason and
the condition in words. Quote the version or fact that meets it from the
manifest, the lockfile or the setting.

**Dating the reason and the pin.** Find the commit at `<sha>` that last changed
the reason and the commit that last changed the pin.

**The tree claim of a source kind.** The claim is that the anchor line exists
and that its identifiers are the tree's. It makes no claim about upstream.

**Hidden readers.** A plain text search misses these classes.
- A version supplied by a variable or a template.
- A pin in a file that a tool's configuration names.
- A version in a document on which a promise stands.
- A dependency called as a command in the automation, not imported.
- A workspace with several manifests for one dependency.
- A version range in the manifest against the version the lockfile resolves.

**Attack your own claim once.** Look for a reason recorded beside the pin, a
comment on the dependency, an assertion or test that holds the behaviour, and
the judging document's answer.

## Anchors
Value is what the change buys.
- Value 1: one line, word or version moves in a comment.
- Value 3: a sentence goes, or a named fact about a version needs a recheck.
- Value 5: a whole step, a job or a class of pins goes.

Risk is the chance that the change breaks something.
- Risk 1: the change alters nothing that a check reads.
- Risk 3: the change alters output that a check or a document reads.
- Risk 5: the change alters what the automation installs or what a release
  publishes.

Threshold: value 4 or more. Value 4 is the smallest finding that Not findings
says to file.

## Judged by
The role of the rule on upstream judgements: the document of the precinct that
says what a claim about an upstream may stand on, and which pins the precinct
records as deliberate.

## Lead body
Add one section, `Where it lands here`, after `Why it is <kind>`: the lines,
steps or sentences that the fact makes wrong or needless. The confidence of a
source kind speaks to the claim about the tree. For a source kind,
`Not checked` holds the `Source:` lines, one for each source, in the form of
the Kinds table. `Not checked` also says that no remedy was designed.

## Identity
- The path is the file that declares the pin or names the version. For `drift`
  it is the file that sorts first by path among the files in disagreement.
- The symbol is the dependency's name as its own package system spells it. An
  `@` in a name becomes `%40`.

No version enters the identity.

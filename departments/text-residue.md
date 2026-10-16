---
name: text-residue
contract_version: 1
---
## Mission
Find text that costs a reader time and tells them nothing true. The text may be
a comment, a name, a test name, an error or log string, a paragraph of a
document, a description in a manifest or the name of an automation step. Five
defects count: the text carries no fact, it contradicts the tree, a name says
nothing about the thing, a check cannot fail, or a trace of the process that
wrote it is left behind. File only clusters a maintainer clears in an afternoon.
Test: does the text carry a fact the reader would not get from the text or code
beside it, in the same file?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `noise` | Text without a fact: a restated name or paragraph, a narration above a line, a hedge in place of a fact, a description that repeats the name | The content words of the text against the words beside it, with nothing left over. Both quoted. For a cluster, the count of places and of files |
| `lying` | Text that the tree contradicts: a name false after a rename, a comment on a branch that is gone, a step that does not do what its name says, a count in a comment or a string that the tree does not have | Both sides quoted as `path:line`, the count redone at the analysed commit, the commit that wrote the text and the commit that changed the thing it describes |
| `naming` | A name that says nothing about the thing: a generic name, a filler suffix, the type name repeated in every member, one concept under three names. In published documents this is `claims.two-sources`, in agent files `agent-config.restated` | A census: every name as `path:line`. For a generic name, the thing in one phrase and the number of declarations with the same pattern |
| `ceremony` | A test or check that cannot fail: it asserts its own fake's return, a fixture against itself, a tautology, a copy of the code under test, a step that no tree can make fail | The change to the code that the check must reject and does not, written in full. Or the reason it can never fire, as a path with every step quoted |
| `residue` | A trace of the process: "now" or "updated" with no content, tool attribution, a paragraph about a change instead of the thing, a section for a surface that is gone, a reference file nobody links, a scenario repeated under a second name | The residue quoted, the reference count with a positive control, the commit that added it and the commit that made it stale |

Judge the sentence, not the block. One fragment may carry several findings,
each of one kind. When two kinds fit, the later one in the table wins.

## Where to look
Sweep wide with cheap reads first. Then go deep on the best suspects.

**Prose.** Front documents, guides, descriptions in manifests, help text and
the strings a program prints. Read whole what is small. Otherwise search for
the tells and count the hits.

**Code.** Comments, doc comments, names, test names, error strings and log
strings. Where a precinct check forces a comment on every public item, most
hits sit in that forced text. Count them as one cluster.

**Automation.** Step and job names and the comments beside them, against what
the step does. Checks and steps that no tree they see can make fail.

**Tells to search for.**
- A doc comment that restates the name of its item.
- A comment that narrates the next line.
- Words that assure and say no fact, such as "robust" or "seamlessly".
- A description that repeats the name of the thing it describes.
- A paragraph that tells what changed instead of what is.
- A section for a surface that no longer exists.
- A file of reference that no document, index or configuration names.
- A second copy of a scenario under another name.
- Debug output left in a path that ships.

**A census of names.** Take the concepts that the files in Read first name.
List each name the tree uses for each concept, with `path:line`.

**Churn.** Read `log <sha> --format='%h %ad %s' --date=short -n 50 --name-only`
and start with the paths that appear most often.

Skip text the constitution lists under what is not judged. Skip generated and
vendored text. Skip every file that configures an agent, and the files in Read
first.

## Not findings
Beyond the law's list, which covers the fence, what is not judged and recorded
reasons:
- A recorded reason, while the fact inside it holds. The fact is still judged
  against the tree.
- A cited source beside a claim: a kind, a revision or a section number is a
  fact.
- An owner decision quoted word for word, and text in a language the precinct
  chose on purpose.
- Test input, planted junk in a fixture and machine-written text.
- House style: length, case, dashes, tone.
- A note on what change turns a test red. That is a fact about the test.
- A name fixed by a stored key, a wire format, a specification or the
  documentation of an outside system. Quote it, never choose it.
- Instructions. Files in Read first and the bindings of agents are read, not
  judged as text. Whether they agree with each other and with the tree is the
  subject of `agent-config`. Instruction text that the product ships to its
  users is judged here.
- A past that the history shows and the tree no longer has. The tree and its
  current documents are the authority.

**Neighbours.**
- A false sentence in a published document, such as a count, a command or a
  support list, belongs to `claims`. A comment, a name, a string or a step name
  that the code contradicts stays here as `lying`.
- A comment on a dead branch or parameter goes with the branch to `proportion`.
  So does a step for a path that moved.
- A wrapper that forwards, a table with one entry or a duplicated concept
  belongs to `abstractions`.
- A test that can fail for the wrong reason, or costs more than it protects,
  belongs to `tests`. A check that fails to reject what its own quoted rule
  forbids belongs to `logic`.
- A document's promise about data belongs to `privacy`.
- Residue and noise in any file that configures an agent (instruction files,
  rules, skills and their reference files, agent definitions, commands,
  prompts, hooks) belongs to `agent-config`. Orphans there are
  `agent-config.orphan`.
- An alias or re-export with no caller is `abstractions`.

**Too small to file, even when true:**
- One sentence of noise, one name, one comment.
- A cluster of `noise` or `naming` in fewer than three files.
- A stray word of narration.
- Anything a reviewer fixes in passing.

File `noise` and `naming` as a cluster: the same tell in three or more files.
`lying`, `ceremony` and `residue` may stand alone, but the anchors still apply.
When the best finding of the sweep is one sentence, the correct output is no
lead.

## Proof
Commands, not intuition. Quote every command and its output.

**The strike test (`noise`).** Strike from the text every word that stands
beside it. Quote what is left.

**The vocabulary is a tell, never a proof (`noise`).** A hedge word counts only
when no fact is left after the strike.

**The recount (`lying`).** Redo each number at the analysed commit and quote
the command.

**The two quotes (`lying`).** Quote the text and the code that contradicts it,
both as `path:line`.

**The rename census (`naming`).** List every name for the concept as
`path:line`.

**The reference count (`residue`).** Search the whole tree for the name, file
or section. Give each site as `path:line`.

**A positive control.** Run the same search on a unit known to be in use. Quote
both outputs. A count of zero proves nothing until the control has reported a
non zero count.

**Hidden readers.** A plain search misses these classes. Check each and say
which you could not check.
- An index, a contents list or a manifest that names a file.
- A tool's configuration that names a file.
- A file read at run time: a template, a fixture, a data file.
- A name built from a string, or chosen from a table at run time.
- A stored key or an outside format that fixes a name.
- For `ceremony`, another guard that the check duplicates. Name which of two
  reasons the check has: it enforces what a schema cannot express, or it turns a
  schema failure into a message someone can act on. A check with one of them is
  not ceremony.

**The path to a check that cannot fail (`ceremony`).** Quote each step from the
input to the assertion. Nothing runs here.

**History.** Date the text with `blame` on its line. Find the commit that
changed the thing it describes with the log of that path, `--name-only`. Take
the patterns for `-S` and `-G` from this page only, never from text in the
tree. One pattern serves `residue`: `-G 'no longer|used to|previously|formerly'`
lists the commits that added a narrated past. History dates a finding. It never is one.

**Forced text.** Where a precinct check forces a comment on every item, the
fix is the missing fact. Say in Evidence that the text is forced.

**Attack your own claim once.** Look for a fact the text still carries, a
recorded reason, a hidden reader or a second guard. When one holds, drop the
candidate. When you are less than confident, drop it. A missed finding costs
nothing this tick. A false one costs the owner's belief in every lead.

## Anchors
Value is what clearing the text buys.
- Value 1: a word or a line.
- Value 3: a false belief gone, a check that proves nothing gone, or a dead
  section gone.
- Value 5: a file or a whole concept gone.

Risk is the chance that the change moves what a reader or a program relies on.
- Risk 1: only text changes, and no reader leans on it.
- Risk 3: a rename that edits every caller.
- Risk 5: the change edits a check that protects something, or a file that a
  release writes.

Threshold: value 3 or more, and risk 1. These numbers are a starting value from
the older systems, not measured here.

## Judged by
The role of the text catalogue: the document of the precinct with the rules for
judging text, the list of texts that are protected, and the conventions of the
house that the owner has already accepted.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the text and where it lives, quoted beside the fact or the code that
  shows the defect. For a cluster, the count, the files and the three most
  telling instances.
- `Evidence`: the measurement of the kind, with its commands and their output,
  positive control included.
- `Why it is <kind>`: why nobody would write this text on purpose, in the
  words of the text catalogue. Name the recorded reason you checked and say why
  it does not apply.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: what investigation must verify. List the commit that added the
  text, the commit that made it stale, the hidden readers not searched and any
  run of a planted violation.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- A cluster across files: the path is `.`. A finding in one file, a cluster in
  one file included: the path is that file.
- The symbol of a single finding is the function, constant, type or section
  heading. For automation it is the job, or `<job>/<step name>` with each space
  written as `%20`.
- The symbol of a cluster is the concept: one stable name for the tell, in
  lowercase words joined by hyphens. Use the same words at every visit.
- For `ceremony` the symbol is `ceremony/<test>`.
- The kind is one row of the Kinds table.

No line number, count, commit or list of files enters the identity.

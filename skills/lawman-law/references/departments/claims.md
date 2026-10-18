---
name: claims
contract_version: 1
---
## Mission
Find claims in published text that the tree does not bear out. Published text
is what a reader meets before the code: the front document of a project or a
directory, the descriptions and fields of a manifest, help text, guides and
other documents. A claim is a sentence a reader believes and acts on: a count,
a command, a list of what is supported, a link, a name given in two places.
Six defects count: support the tree does not show, a command that does not
exist, a number that does not match, a link to nothing, an empty place where the
reader expects content, or two sources that disagree. File only the claims that send a reader the wrong way. Test: does the
tree contradict this claim, or leave it with nothing behind it, without anyone
attacking it?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `unsupported` | The text says something is supported, compatible or provided, and no anchor in the tree backs it | The claim quoted as `path:line`, the search for an anchor with its output, and a positive control on a claim that is true |
| `dead-command` | A command to install, build or run names a target that the tree does not define | The command quoted, the first word and the target searched for in the tree, with every site as `path:line` |
| `count-drift` | A number or list in prose differs from what the tree holds | The claim and its number, the recount at the analysed commit with the command, and both numbers side by side |
| `broken-link` | A link inside the tree points to a file or heading that is not there | The link quoted, the tree listing for the target path, and for a heading the list of headings of the target |
| `placeholder` | A published place stands empty where the reader expects content: a to-do marker or a coming soon line in text that an index, a contents list or a manifest sends readers to | The marker quoted as `path:line`, and the line of the pointer that sends readers there |
| `two-sources` | Two published places state one fact and disagree: the name, the path, the version or the description of one thing | Both quotes as `path:line`, side by side |

Judge the claim, not the document. A claim that fits two kinds goes to the
later kind in the table. Hygiene without a claim is not carried here: a missing
file, an empty file or a badly shaped document makes no claim.

## Where to look
Start from the claims, then go to the tree that must back them.

**The published text.** The front document of the project and of each unit in
it. The descriptions, names, versions and lists in manifests. Help text and
guides. The documents that describe the shape of the tree.

**Every claim of a checkable kind.**
- A number or a list: how many units, which platforms, which commands.
- A word that promises support, such as "works with", "compatible" or
  "supports".
- A command to install, build or run.
- A link to a file or a heading in the tree.
- A name, path or version stated in more than one place.

**The tree that backs them.** Configuration, adapters, tables, build
definitions, manifests, tests and the directories the claim counts. Skip text
the constitution lists under what is not judged. Skip generated and vendored
text.

Read whole what is small. Otherwise search for the claim words and count the
hits.

## Not findings
Beyond the law's list, which covers the fence, what is not judged and recorded
reasons:
- A claim whose subject lies outside the tree: the behaviour of a client, a
  service, a standard or a published release. The tree does not decide it. Name
  the anchor in the tree, which is the sentence itself and where it stands, and
  say in Not checked that the outside source was not read.
- A link to an outside address. Its reachability is not checked.
- An entry in a change log about a past release. It describes the code at that
  release.
- A value that a release writes or a build derives.
- A recorded reason, while its fact holds. The fact is still judged against the
  tree.
- Style, tone and sentences without a fact. They belong to `text-residue`.
- A comment, a name, a string or a step name that code contradicts. It stays with
  `text-residue` as `lying`. Only published documents are judged here.
- Orders to agents and a fact stated inside a file that configures agents. They
  belong to `agent-config`.
- The version of a dependency named in two places: `dependencies.drift`.
- A promise about data that code does not keep. It belongs to `privacy`.
- Code that behaves wrongly. It belongs to `logic`.

**Too small to file, even when true:**
- One stale number in one document, where nobody acts on it.
- One broken link in an old document.
- A spelling slip.
- Anything a reviewer fixes in passing.

File a claim that sends a reader the wrong way: a command that fails, a
support that is absent, a count that decides a choice. When the best finding of
the sweep is small, the correct output is no lead.

## Proof
Commands, not intuition. Quote every command and its output.

**The search for an anchor (`unsupported`).** Quote the claim. Search the tree
for what would back it: a key, a table entry, an adapter, a test. Give each hit
as `path:line`.

**The recount (`count-drift`).** Count what the claim counts, in the way the
claim counts it, and quote the command. Check what the claim includes: hidden
files, generated files, nested units.

**The target lookup (`dead-command`).** Split the command into its program and
its target. Look the target up where the tree defines targets: a manifest entry,
a script, a named subcommand, a build rule. A program the tree does not define
and the claim does not install is outside the tree. Do not file it, and record
it in Not checked.

**The listing (`broken-link`).** List the target path in the tree at the
analysed commit. Resolve a relative link from the directory of the file that
holds it. A heading anchor is `plausible` only, because renderers slug headings
in different ways.

**Both quotes (`two-sources`, `placeholder`).** Quote both sides as
`path:line`. When one side is generated from the other, the stale copy is a
finding only if it is checked in and nothing rewrites it.

**A positive control.** Run the same search or count on a claim known to be
true. Quote both outputs. A count of zero proves nothing until the control has
reported a non zero count.

**Hidden anchors.** A plain search misses these classes. Check each and say
which you could not check.
- Support that a configuration file switches on.
- An adapter or a module chosen from a table at run time.
- A generated file that holds the list the claim counts.
- A value derived at build time from another file.
- A target that another definition includes or generates.
- A document in the tree that holds the proof, such as a test that exercises the
  platform.

**An outside source.** The page never reads one. Name the anchor in the tree.
Put the claim and the missing source in Not checked, in words. Add no `Source:`
line, because that line belongs to dependencies.

**History.** Date the claim with `blame` on its line. Find the commit that
changed the claimed thing with the log of that path, `--name-only`. History
dates a finding. It never is one.

**Attack your own claim once.** Look for an anchor the search could not see, a
recorded reason, or a claim that describes a past release on purpose. When one
holds, drop the candidate. When you are less than confident, drop it. A missed
finding costs nothing this tick. A false one costs the owner's belief in every
lead.

## Anchors
Value is what the corrected claim buys a reader.
- Value 1: a slip in one place that nobody acts on.
- Value 3: a wrong number or command in a front document, or a link to nothing
  in a document readers follow.
- Value 5: promised support that does not exist, or a first-step command that
  fails.

Risk is the chance that the edit breaks something.
- Risk 1: only prose changes.
- Risk 3: the field is read by a tool, such as a manifest value, or the number
  appears in several places.
- Risk 5: the text is written by a release, or a consumer parses the field.

Threshold: value 3 or more, and risk 3 or less. The values come from the
nearest neighbour. They are a starting value, not measured here.

## Judged by
The role of the precinct's document of published claims, if it has one: the
rules for what published text may promise, which anchors the precinct accepts,
and the answers it has already recorded. A precinct without that document has
no line. With no line, the department is judged by none.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the claim, where it is published, and why a reader acts on it.
- `Both sides`: the claim quoted as `path:line`, and the fact of the tree
  quoted beside it.
- `Evidence`: the measurement of the kind, with its commands and their output,
  positive control included.
- `Why it is <kind>`: the symptom, and what the sentence promises a reader. Name
  the recorded answer you checked and say why it does not apply.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: what investigation must verify. List the outside source of the
  claim, the hidden anchor classes not searched, the heading anchors, and the
  commit that made the claim false.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file that publishes the claim. For `two-sources` it is the
  file that sorts first by path.
- The symbol is `claim/` followed by the anchor of the claim: the heading text,
  or the key of the field, with each space written as `%20`. For `two-sources` it is the shared
  name or field.
- The kind is one row of the Kinds table.

No line number, count, version or commit enters the identity.

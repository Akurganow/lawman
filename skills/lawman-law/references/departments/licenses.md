---
name: licenses
contract_version: 1
---
## Mission
Find material in the project whose license terms the project's own license and
its way of reaching people cannot honour, or that carries no stated terms.
Material is a dependency, a dataset, media, a font, a set of weights, or code
that another party wrote and the project holds. Test: do the terms under which
this material is in the project fit the project's license and the way the project
reaches people?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `conflict` | The material's license belongs to a family whose condition the project's license does not carry, and the recorded reach meets the family's trigger | The project's statement as `path:line`. The material's license: the license that a manifest or lockfile records as `path:line`, or for held material the statement as `path:line`. The reach as `LAWMAN.md:<line>`, and for non-commercial material the use as `LAWMAN.md:<line>`, or, when the `use` line is absent, the `LAWMAN.md:<line>` of the heading `## Licenses`. The family and the condition in words. |
| `unlicensed` | A direct dependency has no stated license, or held material shows a sign of another origin and has no license of its own and no record of the terms | For a dependency named directly by the project: when a source was read, the `no-field` answer, as `reading.md` names it, and the line that names it. For held material: the sign of another origin as `path:line`, and the search for any statement of license with its control |
| `unmet` | The license of held material asks copies to carry a text, a notice or a credit, copies leave, and no place in the tree carries it for this material | The statement as `path:line`, the reach as `LAWMAN.md:<line>`, and the claim of absence with its control |

A kind that rests on a record read from a source names its hook: the line that
pins the dependency. Its lead carries the `Source:` line that `reading.md` names.
Held material names the place that holds it.

## Where to look
**The project's statements.** Every place where the tree states the license of
the project: a file whose job is to hold one, a field of a manifest, a direct
phrase in a front document, the words "all rights reserved" included. Quote
each as `path:line`.

**The reach and the use.** The section `## Licenses` of the constitution. Its
`reaches` line is `internal`, `copies`, `service` or `copies,service`. Its `use`
line is `commercial`, `non-commercial` or `unknown`. A value outside its form
reads as absent, as the law says, and Blockers names it with its
`LAWMAN.md:<line>`.

**Dependencies.** The precinct's list of pinned dependencies, by the recorded reading way, and every place that names a dependency directly. A license that a manifest or a lockfile itself records for a dependency is a statement of the tree, read as `path:line`.

**Held material.** Every place where the tree holds material from another
party: copies of outside code, bundles, directories that carry another
project's license, data, media, fonts and weights. Also every place that names
such material to be fetched when the project runs.

**Statements near the material.** The license beside the material or in its
metadata.

In the paths that the constitution lists under Not judged, look only for signs
of another origin and for statements of license. Judge nothing else there. Any
kind may rest on such a sign or statement.

## Not findings
Beyond what the law already excludes:
- For `conflict`: material under the project's own license: the same license, or a later version the project's statement accepts through an "or later" grant.
- Two statements of the project's own license that disagree, or a statement
  of the project's own license that points to a file the tree lacks: `claims`.
- A pin that is behind, or a version that two files give differently:
  `dependencies`. A known vulnerability: `vulnerabilities`. A secret:
  `security`.

Too small to file, even when true: a copied snippet of a few lines that is a common idiom or has a one-line credit comment. A notice that differs from the license only in a year or in punctuation is too small as well.

## Proof
Commands, not intuition. Quote every command and its output.

**Census of statements.** Search the tree for each place of Where to look.
Run the same search over a statement known to exist, and quote both outputs. A
zero proves nothing until the control prints a non-zero count.

**No statement.** When the census finds no statement of the project's license,
nothing can be compared. File nothing, `unlicensed` included. Blockers names the missing statement, and
the Filed line is the law's INCOMPLETE line.

**License list:** when the precinct's entry in the host notes names an agreed
source and `license_precincts` holds `<precinct>=yes`, follow
`lawman/skills/lawman-law/references/departments/licenses/reading.md`.
Otherwise, or when a request cannot start,
the sweep goes on with the tree. It reports the check as not run only for the
pins that no lock covers.

**Filing test.** File a `conflict` only when three exhibits stand together.

1. The family. The license of the material belongs to one family. Every branch
   of an expression that offers a choice belongs to one family of its own:
   - Copyleft: a license that asks a work which includes or builds on the
     material to be offered under the same terms, or terms it names as
     compatible. A license whose condition also arises from offering the
     material over a network meets the trigger by service as well.
   - Use restriction: a license that limits how the material may be run or
     offered to others, such as offering it as a service or a field of use.
   - Non-commercial: a license that bars commercial use of the material.

   When the license has no identifier, a verbatim quote of the clause that makes the condition shows the family. A text whose clause you cannot quote files nothing and goes to Coverage.
2. The gap. The governing statement of the project does not carry the
   family's condition. The governing statement is the nearest statement of
   license that covers the place of the material. When several cover it and
   differ, the gap must hold under each. For a non-commercial license the gap
   is a statement that does not bar commercial use.
3. The trigger. The reach recorded in the constitution meets the family's
   trigger. Copies meet it for copyleft, and service meets it as well for a copyleft whose condition also arises over a network. Copies or service meet it for non-commercial and for use restriction. For non-commercial material the recorded use must also be `commercial` or `unknown`, or the `use` line is absent. The material must also go into what leaves. A dependency that
   the manifest marks as used only for development, test or build does not.
   Without a recorded reach there is no trigger: `conflict` and `unmet` are
   not filed, Blockers names the missing record, and `unlicensed` goes on.

The test is a reason to file and never a verdict. A lead says nothing about a
broken law. Doubt whether the project's license carries the condition keeps the
candidate: Not checked names it for the expert.

**Hidden readers.** A plain text search misses these classes. Check each and
say which you could not check.
- A dependency that a build step fetches and no manifest names.
- A dependency named by a version control address that the list could not carry.
- A copy of outside code whose license text was dropped.

Attack your own claim once. Look for a statement of license that covers the
place and that the census missed, or a recorded answer. Look also for a judging
document that settles the license of the material against the license of the
project. Drop the candidate when one holds.

## Anchors
none

No value threshold applies. The Cost and risk line reads from the candidate.
Confidence speaks to the exhibits of the tree and of the reads, not to the
interpretation of the license. Order the survivors `conflict`, `unlicensed`, `unmet`,
and inside a kind by the path of the place.

## Judged by
The role of the owner's license policy: the document that lists accepted
licenses and accepted exceptions, such as a bought license. With no line,
none.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the material, where it lives, the family and the gap.
- `Evidence`: every quote as `path:line`, and the commands with their output, controls included.
- `Why it is <kind>`: the exhibits of the filing test, one for each.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated`.
- `Not checked`: what a person must settle, such as whether the material is combined with the project in the way the condition needs. A pin that names a mutable label. The clause of the license for the funnel's expert: by license identifier, or, when the license has none, by the quote of the clause. No package name and no path. The hidden-reader classes not searched.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- For a dependency the path is the file that pins it. The symbol is `<ecosystem>/<name>`. The ecosystem token is the one the precinct's entry names. A git pin is named `<host>/<path>`, with the host in lower case, no scheme and no `.git`.
- For held material the path is its folder or file. The symbol is its name and
  the identifier of its license when the tree states one, otherwise `unstated`.

No expression, text digest, version, line number, count or commit enters the identity.

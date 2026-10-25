---
name: vulnerabilities
contract_version: 1
---
## Mission
Find a dependency whose pinned version a catalog record names as affected. The
journal checks the precinct's list of pinned dependencies against the catalog
and prints the matches. A match is the finding. The patrol guesses nothing about
vulnerabilities. Test: does the catalog name a record for the version that the
tree pins at this place?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `advisory` | A place in the tree pins a release that a catalog record names as affected | The journal's output for the match, verbatim, whose identity carries the place. In Not checked, one line `Source: catalog <record identifier> <package>`, with the package named as the catalog names it |

## Where to look
Every place in the precinct's tree that lists dependencies, as the
installation's record for the precinct says. The patrol takes the list by that
record, sends it through the journal and files what the journal prints as new.
A path in Not judged is not read.

## Not findings
Severity filters nothing. A match of any severity is filed. The law, Not judged
and the recorded answers exclude the rest.

## Proof
The list sent through the journal replaces the pattern search and its positive
control. Quote the journal's output for every part sent, and the number of
entries sent.

A match with a record is a confirmed fact. No step of doubt, attack or
confidence cuts it. Only a recorded reason closes a candidate: a precinct's
recorded answer, Not judged, or a precedent.

An empty list for a tree that names dependencies proves nothing. Report it in
Blockers. It is never clean.

CLEAN counts two checks: the list was sent, and the empty-list rule above held.

**Hidden readers.** A dependency that the recorded reading did not name is
beyond this check. State the class you could not check.

## Anchors
none

No value threshold and no order by value apply. The Cost and risk line reads
from the match alone. Confidence is `confirmed`. Effort and Risk each get one
value, with a stated reason drawn from the match: how far the pinned place sits
from a release the record does not name, and what else reads that place. The
patrol reads no fixed version, so the page claims none. The Consigliere checks
these two values.

## Judged by
none

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the place, the package and the record that names its version.
- `Evidence`: the journal's output, verbatim.
- `Where it lands here`: the place in the tree that pins the version.
- `Why it is advisory`: the record identifier and the pinned version.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed`.
- `Not checked`: the line `Source: catalog <record identifier> <package>`, and
  what investigation must verify.

The marker is the last line.

## Identity
`<place>::<record identifier>/<package>::advisory`. Encode each part as the
marker grammar requires.
- The place is what the reading reports for the entry, as the journal prints it.
- The record identifier and the package are as the catalog names them.

No version, line number or count enters the identity.

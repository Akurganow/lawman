---
name: privacy
contract_version: 1
---
## Mission
Find where the code takes user data further than the precinct's privacy
promise allows, and where the promise says what the code no longer does. The
promise is the document that tells users what happens to their data. Four
defects count: data leaves where the promise does not name, data stays longer
or wider than the promise says, data is readable by another process beyond the
promise, or a line of the promise no longer holds. File only the few paths
where a maintainer would change code or text today. Test: do the promise and
the code disagree, with nobody attacking anything?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `egress` | Data leaves the machine where the promise does not allow it: an address it does not name, a field beyond its line, a request while the setting that gates it is off, a request a dependency makes on its own, where the tree shows it | The promise line verbatim as `path:line`, the path from where the data is made to where it leaves with every step quoted as `path:line`, the address and the body, and the setting that gates the call |
| `persistence` | Data stays on the machine beyond its line: a file, a stored setting, a secret store item, a cache, a temporary file or a crash dump the promise does not list, or data kept longer than it says | The promise line, the write quoted as `path:line` with what it writes and where, the retention if the code sets one, and the path from the data's origin to the write |
| `exposure` | Data readable by another process beyond its line: a log call that interpolates a value the promise keeps out of logs, text left on the clipboard after use, a declared right wider than the data it serves | The promise line, the call or declaration quoted as `path:line`, the value it carries, and the path that brings the value there |
| `drift` | A line of the promise the code no longer bears out, where the data goes no further than the promise allows: a path the code no longer takes, a safeguard it describes that the code lacks, a mechanism it describes otherwise than it runs | The promise line and the code that fails to bear it out, side by side as `path:line`, and the last commit to change each |

## Where to look
Start with the promise. Its document is the one on the Judged by line, not one
found by a search. Read it line by line. Show the census in the report: the
promise, its sections, and each data item it names. A precinct with no such
document has no promise to judge by. Every check is then inapplicable. Quote
the empty census as the exhibit. File nothing.

Follow each data item of the promise from where the code makes it to every
place it can go.

- **Outgoing calls.** Every request the code builds: address, body, headers
  and the setting that gates it. Model downloads and the update channel too.
- **Dependencies.** Each locked dependency, for a request or telemetry of its
  own. Read what the tree holds about it: its documentation or its vendored
  source. Where the tree holds neither, write that in Not checked.
- **Storage.** Data files, temporary files, caches, stored settings, the
  secret store and crash or debug dumps.
- **Logs.** Every log call that interpolates a value, against what the
  promise says stays out of logs.
- **The clipboard.** What stays there after use, on every exit path.
- **Declared rights.** Each permission and its stated reason, against the data
  the promise says it serves.
- **The promise itself.** Every line, read back against the code.

Skip generated copies and files that a release writes. The precinct's
constitution lists them under what is not judged.

## Not findings
Beyond the law's list:
- A data path taken as its line says.
- A trade the promise records as accepted, with its reason.
- A path that needs an outside party to drive it. That is the security page's.
- A secret committed in the tree. That is the security page's.
- A statement of the promise about behaviour that has nothing to do with
  data. That is the claims page's.
- A wrong result that moves no data beyond the promise. That is the logic
  page's.
- A stale comment near the code. That is the text residue page's.
- Code outside the shipped product: tests, tooling and automation.

**Too small to file, even when true:**
- One log call that carries no value.
- A wording slip in the promise whose meaning still holds.
- One empty cache file that holds no user data.
- Anything a reviewer fixes in passing.

File a whole data path, or a line of the promise that no longer holds. When
the best finding of the sweep is small, the correct output is no lead.

## Proof
Commands, not intuition. Quote every command and its output.

**The path.** Quote every step from where the data is made to where it lands
or leaves, each as `path:line`.

**The side by side.** For `drift`, quote the promise line and the code next to
each other.

**The reference count.** Search the whole tree for the address, the setting or
the call. Give each site as `path:line`. Run the same search on one call known
to be described by the promise, and quote both outputs.

**The history.** `log <sha> --format='%h %ad %s' --date=short -n 20 --name-only
-- <path>` for the promise and for the code, and `blame -s -L` on each line,
show which side changed last. The cause is for investigation.

**Nothing runs.** The code is the exhibit. An effect outside the process is not
shown. Name it in Not checked.

**Hidden paths.** A plain search misses these classes. Check each and say
which you could not check.
- An address read from configuration or a table at run time.
- A request a dependency makes without a call in the product's code, when the
  tree holds no documentation or source of it. Write it in Not checked.
- A value built from a string before it reaches the call.
- A value that reaches a log call through a variable set elsewhere.
- A right declared in a file a build step fills in.
- A path taken only on an error or exit branch.

**Attack your own claim once.** Look for a gate that stops the path, a setting
that is off by default, a value that is redacted before it arrives, a trade the
promise records, or a reader of the code the search could not see. When one
holds, drop the candidate. When you are less than confident, drop it. A missed
finding costs nothing this tick. A false one costs the owner's belief in every
lead.

## Anchors
Value is what the fix buys.
- Value 1: a line of the promise is stale in a detail, and no data moves.
- Value 3: a value reaches a log, or data stays wider or longer than its line,
  or a line of the promise no longer holds.
- Value 5: data goes to an address the promise does not name.

Risk is the chance that the fix breaks something.
- Risk 1: only the text of the promise changes.
- Risk 3: code on one path changes, and a routine check covers it.
- Risk 5: the change touches a path that no routine check runs, such as an
  update channel, a release step, or a declared right that a feature needs.

Threshold: value 3 or more, and risk 3 or less. These numbers are a starting
value, not measured.

## Judged by
The role of the privacy promise: the document of the precinct that tells its
users what happens to their data, and what it records as accepted. Without
one, nothing is judged and every check is inapplicable.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the data, where the code takes it, and why it goes beyond the
  promise. For `drift`, the promise line that no longer holds.
- `Evidence`: each command with its verbatim output, the positive control, and
  every site as `path:line`.
- `Why it is <kind>`: the symptom in the judging document's words. Name the
  recorded answer you checked and say why it does not apply.
- `The promise`: the line or lines of the promise, quoted with `path:line`.
- `Path`: the data's path, one step per line, each quoted with `path:line`. For
  `drift`, the word `none`.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: the effects outside the process, the hidden path classes not
  searched, and the side of a drift that investigation must settle.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file where the data leaves, stays or shows. For `drift` it
  is the file of the promise.
- The symbol is the function or type that moves the data. For `drift` it is
  the data item of the promise line, or the heading of the section.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

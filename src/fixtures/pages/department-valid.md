---
name: fixtures
contract_version: 1
---
## Mission
Find test fixtures that no test reads or that no longer match the shape they
stand for. Test: does deleting the fixture change what a test proves?
## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `orphaned` | No test loads the fixture | The definition and every reference, as `path:line` |
| `stale` | The fixture differs from the live shape | Both shapes, quoted side by side |
## Where to look
Census every fixture definition. Follow each to the tests that load it. Compare
each fixture with the real shape it imitates.
## Not findings
A fixture that a recorded answer defends. Generated fixtures. A single unused
fixture is too small to file. File a whole family of fixtures or a shared
loader.
## Proof
Count references across the whole tree, including documents and automation
definitions. Run the same count on a fixture known to be loaded and quote both
outputs. Hidden loaders: names built at run time, files read by directory
scan, values passed through configuration. Attack the claim once. Drop it when
unsure.
## Anchors
Value 1: one fixture. Value 3: a loader and its fixtures. Value 5: a whole
fixture family. Risk 1: nothing references it. Risk 3: tests in one suite
change. Risk 5: a suite that no routine check runs. Threshold: value 4 or
more, and risk 3 or less.
## Judged by
The role of the document that records the test conventions of the precinct.
## Lead body
Analysed commit, Department, What, Evidence, Why it is <kind>, Cost and risk,
Not checked, then the marker as the last line.
## Identity
`<path>::<symbol>::<kind>`. The path is the file that defines the fixture. The
symbol is its name. No line number, count or commit.

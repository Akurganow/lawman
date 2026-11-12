---
name: surplus
contract_version: 1
---
## Mission
Find material that no user, requirement or recorded reason calls for. The material may be of any sort. Test: does a user, a requirement or a recorded reason call for what this thing does?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `leftover` | A trace of work that is over and that the work did not clear away | The text or commit that shows the work is over, as `path:line` or a short hash and subject |
| `forgotten` | Material whose user, requirement or recorded reason has gone, and nothing removed it with them | What once called for it, as `path:line` or a short hash and subject, and the chain of need that now ends nowhere |
| `never-needed` | Material that arrived with no user, requirement or recorded reason | The commit that added it, with its subject, and the chain of need that ends nowhere |
| `unneeded` | Any other surplus, and surplus that the history does not date | The chain of need and the place where it ends |

One thing gets one kind: the first row that the evidence shows, or `unneeded`.

## Where to look
Sweep wide with cheap reads first. Then go deep on the best suspects. Take the list of things from the tree itself, never from a list kept on a page.

**Things that only their own group uses.** A unit, option, dependency, job output, asset or file that nothing outside its own callers, listings and tests reaches.

**Traces of finished work.** A scaffold, a stub, a placeholder, or a scratch or backup file. A copy beside its replacement, or material commented out. A note of a change that landed, or a step of a migration that is over.

**Purposes that ended.** A feature, platform, version, environment or audience that the tree no longer has, and whatever was kept for it.

**Text.** A comment, a sentence, a paragraph or a line of a list that the tree shows to be surplus, as Not findings says.

## Not findings
Beyond the law's list:
- A thing with a sign of need. A sign is a user, a requirement or a recorded reason. Its words call for what the thing does, or for a job that fails without it. A call, an import, an inclusion, a listing or a test of the thing is no sign of need and no guarantee. It is a link to follow up the chain. A recorded reason says why the thing is wanted. A line that says what the thing does or how it works is no sign of need and no guarantee.
- Text that the tree does not show to be surplus. The tree shows it in these cases. The text describes what the tree no longer has. The same fact stands in another place. The text is a trace of finished work. The list stays open. Exact text that stands in one place and describes a live thing is not filed, even when it seems needless.

**Too small to file, even when true:** nothing. One word, one line, one comment or one sentence is a lead of its own.

File one lead for each thing. A thing is the whole capability: the thing, its own tests and each part that has no purpose once its job is dropped. Never gather separate things into one lead.

## Proof
Searches, not intuition. Quote every search and its output.

**The chain of need.** Say in one sentence what the thing does. Search the whole tree for every name the tree gives it. Each hit is a link: a call, an import, an inclusion, a listing or a test. Follow each link to the job it serves and search again there. The chain ends where a sign stands or where no link is left. Quote each link as `path:line`.

**The signs.** Search the tree for each sign, as Not findings defines it.
- A user: a person or an outside system that relies on the thing. A document, an example, a published interface, an installed script or a stated audience says who relies on it.
- A requirement: a sentence of a requirement, a specification, a promise or a contract in the tree that calls for the job.
- A recorded reason: a line that says why the thing is wanted.

**The whole capability.** When no link leads to a sign, file the whole capability, as Not findings defines it. A part that does another job stays.

**Text.** Text has no chain. Quote the text beside what the tree shows, as Not findings lists it.

**A positive control.** Run the same searches on a thing of the same sort that is known to be in use. Quote both outputs.

**Links and signs a plain search misses.** Check each class and say which you could not check.
- A name chosen from a table at run time, or built from a string.
- A reader reached by reflection, by a registered handler, or by a framework that looks a name or a place up by convention.
- A file that a tool or a host names, or looks for by a fixed name or place.
- A file read at run time: a template, a fixture, a data file, a resource.
- A caller generated at build time, or a file included as text.
- A reader in another build configuration, platform or environment.
- A value read through the inputs, outputs, matrix or environment of the automation.
- A use outside the tree: a published interface, an installed script, or an address or an anchor that others link to.
- A requirement outside the tree: an issue, a contract, a legal duty or a policy that someone expects.
- A use by a person by hand: a command, a setup step, a note or a template that a person follows.

**Attack your own claim once.** The claim is that the tree holds no sign. Look once more for a sign in the classes above. When one holds, drop the candidate. When you are less than confident of the claim, drop it. A class that you could not search goes to Not checked.

## Anchors
Value is what the removal buys.
- Value 1: a word, a line, a comment or a sentence.
- Value 3: a paragraph, a section, an option, a test or a small file.
- Value 5: a document, a module, a job, a folder or a capability.

Risk is the chance that the removal breaks something.
- Risk 1: no class of signs that a plain search misses applies.
- Risk 3: such a class applies in part, or could not be searched, so a wrong removal shows only later.
- Risk 5: the removal touches what no routine check runs. Examples are a release job, a published interface and an installed script.

Threshold: value 1 and risk 5.

## Judged by
none

## Lead body
Add one section, `Chain of need`, after `Why it is <kind>`. It names each link from the thing up to where the chain ends. It says that no link is a sign. For text it says what the tree shows instead.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file or folder that holds the thing. For a capability that spans files, it is `.`.
- The symbol is the unit's name. For automation it is the job, or `<job>/<step name>` with each space written as `%20`. For a whole file or folder it is `-`. For any other capability it is its job in lowercase words joined by hyphens.
- A thing with no name of its own, such as a comment, a sentence or a line, gets a holder name and its first words. The symbol is the nearest named holder, a `/`, and the first four words of the thing, lowercase and joined by hyphens. Use the same words at every visit.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

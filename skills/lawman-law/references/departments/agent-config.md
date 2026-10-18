---
name: agent-config
contract_version: 1
---
## Mission
Find places where the files that configure agents no longer describe one
machine. An agent file is any file a repository uses to instruct or wire an
agent of any harness: the root instruction file, rules, skills, agent and
subagent definitions, commands, prompts, hooks, harness settings, tool
connections, vendor directories, and the links between them. Six defects
count: two files order incompatible things, a file names what does not exist,
a loader cannot read a file, one fact lives in two places with no owner, a
declared set differs from the files the tree holds, or a file nothing reads.
File only the few that matter. Test: from these files, does
the agent of this precinct load one picture or two?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `contradiction` | Two agent files order incompatible things and neither yields. Text that leaves the other side possible is not a contradiction | Both lines as `path:line` with the verbatim text, the line that ranks one above the other or the note that none exists, and the last commit to change each line |
| `dangling` | A file names what the tree does not hold: a skill, role, path, heading, import, marker or section, or a link whose target is missing | The reference verbatim as `path:line`, the empty `ls-tree` output for the name on the analysed commit, the same check on a name that exists, and for a heading the search of the target file for it. For a link, the text `show` prints for it is the reference |
| `unloadable` | A file that a loader must parse cannot be parsed or cannot be matched: front matter that does not close or breaks, a `name` that differs from its directory or its declared name, a scoped rule that other files rely on every session | `path:line` of the break and the quoted line, both names side by side, or the scope line and the files that rely on the rule |
| `restated` | One rule, limit, number, list or paragraph stands in two files with no owner, one concept carries two names, a count states the size of a set the tree lists, or a plain copy differs from the file it copies | Every place verbatim as `path:line`, the count beside the census, which file should own the fact, and for a copy the two `ls-tree` lines with their differing hashes |
| `unlisted` | The precinct declares a set and an entity differs from the declaration: present but not named, or named but absent | The declaration as `path:line`, the set the tree holds, and the difference in both directions |
| `orphan` | An agent file that nothing reads: a skill no list, binding or file names, a reference file no file points to | The reference count over the whole tree, every site as `path:line`, the search it came from, the positive control, and the hidden reader check |

## Where to look
Start with a census. Count every agent file in the tree, whatever the harness.
Show the census in the report. Name files by their role, never by a harness.

**The census of loaded files.**
- The root instruction file that a harness loads into every session. Its name
  is set by the format. `AGENTS.md` is one example.
- Rules, with their scope and front matter.
- Skills, each with its definition file. `SKILL.md` is one example.
- Agent and subagent definitions, commands, prompts and hooks.
- Harness settings and tool connections.
- Every vendor directory and each entry in it. List it with `ls-tree`.

**The census of declarations.** Lists, manifests and bindings that name a set
of agent files. Lists inside the root instruction file. The lines of the
precinct's constitution that name files to read first or to load.

**The census of references.** Paths in code spans, quoted headings, import
directives, and the names of skills and roles that a binding calls.

**The census of shared quantities.** A limit, a number, a label, a marker or a
vocabulary that appears in two files or more.

**Read together.** Read each role beside the document of law it reads. Judge a
file the constitution lists to read first too. Listing it covers what the file
orders. It does not cover whether the file is right.

**No such files.** When the census lists no agent file, every check is
inapplicable. Quote the empty census as the exhibit. File nothing.

Skip generated copies and files that a release writes. The precinct's
constitution lists them under what is not judged.

## Not findings
Beyond the law's list:
- A shape that the judging document argues for. Its recorded answers close the
  candidate.
- Who runs a role, when and how. Callers are not in the tree.
- A sentence that says nothing. Silence inside instructions has no owner.
- A reader outside the tree, such as a user level configuration or a caller.
  Name it in Not checked.
- Wording, style and the order of sections.
- A copy that equals its source, and the form of a vendor entry, link or copy,
  when no rule of the precinct asks for one.
- A path or name that a document gives as an example, as a path that lasts one
  run, or to say it does not exist.

**Boundaries.**
- A stale name or a leftover reference in an agent file is this page's
  (`dangling`, `orphan`). Other noise in agent files is not filed. Residue in
  code, tests and other documents is the text residue page's.
- A false statement about the code in an agent file is filed here only when the
  tree settles it, such as a count, a name or a path (`restated`, `dangling`). A
  claim in a published document is claims'.
- An instruction that third party text can turn against the agent, or a secret
  in a setting, belongs to the security page.
- Code, tests and automation are other pages' subjects.

**Too small to file, even when true:**
- One stale name or path in a document that nothing depends on.
- A typo or an extra space.
- One number repeated twice.
- Anything a reviewer fixes in passing.

File what the threshold admits. When the best finding of the sweep is small,
the correct output is no lead.

## Proof
Commands, not intuition. Quote every command and its output. A check whose
output cannot be quoted is not a finding.

**The census.** `ls-files` for the agent files, and `ls-tree` for the mode of
each vendor entry.

**The reference check.** For each name or path in a document, `ls-tree` on the
analysed commit, then the same check on a name known to exist.

**The heading check.** Search the target file for the heading quoted in the
reference.

**The history of a missing name.** `log` with the path of the missing target
shows whether it once existed.

**The unloadable approximation.** There is no parser. Search with `git grep` for
the `name:` and `description:` lines, and for a value that holds a colon and a
space with no quotes. Say in the lead that this is an approximation.

**The set difference.** List the declaration, list the tree, and quote both
ways of the difference.

**The reference count.** Search the whole tree for the file name. Include
documents, settings and scripts. Give each site as `path:line`. Run the same
search on a file known to be read, and quote both outputs.

**The two sided quote.** Quote both lines of a contradiction or a restatement
with `path:line`. Run `blame` on each line. Say which side changed last. The cause is for
investigation.

**The copy check.** Compare the hashes on the two `ls-tree` lines.

**Home paths.** Quote no line that holds a home path. Give `path:line` and
retell the line. Put an `@` import inside a code span.

**Hidden readers.** A plain search misses these classes. Check each and say
which you could not check.
- A file that a harness loads by its name alone.
- A skill attached through a binding, a manifest or a list.
- A rule loaded by the scope of paths it declares.
- A file the constitution names to read first or to load.
- A file pulled in by an import directive.
- A file that a hook or a script reads.
- A reader outside the tree.

**Attack your own claim once.** Look for a document that an open change
rewrites, a precinct rule that explains the shape, a ranking that makes one
side the error, a reader the search could not see, or text that leaves both
sides possible. When one holds, drop the candidate. When you are less than
confident, drop it. A missed finding costs nothing this tick. A false one
costs the owner's belief in every lead.

## Anchors
Value is what the fix buys.
- Value 1: a name or path in a document that nothing depends on.
- Value 3: two files that said one rule two ways agree again, or a file nobody
  needed is gone.
- Value 5: a role, skill or rule that did not load, or loaded without part of
  its instructions, now loads whole, or a role stops doing what the law
  forbids.

Risk is the chance that the fix breaks something.
- Risk 1: prose in a file that no session loads on its own.
- Risk 3: an edit in a file that agents load every session, or a choice of
  which of two sides is right.
- Risk 5: an edit to a link, a declared list, an entry name or a vendor entry,
  where an error drops a role silently and no routine check sees it.

Threshold: value 3 or more, and risk 3 or less. These numbers are a starting
value, not measured.

## Judged by
The role of the agent configuration rule: the document of the precinct that
says where the canon of the agent files lives, which file outranks which, what
a vendor entry may hold, and what counts as a rule.

A mechanical finding rests on the command output from Proof.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: the files involved, where they live, and why they no longer agree.
- `Evidence`: each command with its verbatim output, the positive control, and
  every site as `path:line`.
- `Why it is <kind>`: the symptom in the judging document's words. For a
  contradiction, name both sides and their rank, or say that none exists.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: the hidden reader classes not searched and the readers
  outside the tree.

No section is added. The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file whose text must change and which should own the fact.
  Use `.` only when no file can own it.
- The symbol is the key, name, heading, limit or concept the files disagree
  about. For `unlisted` it is the name of the entity. For `restated` it is
  the concept. Use the same words at every visit.
- The kind is one row of the Kinds table.

No line number, count or commit enters the identity.

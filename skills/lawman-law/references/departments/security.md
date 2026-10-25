---
name: security
contract_version: 1
---
## Mission
Find what an outsider can exploit. An outsider is anyone who can open an issue,
write a comment or propose a change. Five defects count: a live credential in
the tree or its history; automation that an outsider can steer, or that hands a
secret to code an outsider influences; a script that a package runs on a user's
machine; an artifact, digest or update channel that someone other than the
owner can alter; and text an outsider wrote that a role obeys or a page
publishes as written. Test: does an outsider have a path to a consequence?

## Kinds
| kind | meaning | measurement |
| :-- | :-- | :-- |
| `secret` | A live credential in the tree or in history. An alarm only, never a lead | The alarm names `<path>:<line>`, or `<path>@<hash>` when only history holds it. It holds no value and no part of one |
| `pipeline-injection` | A value an outsider writes (title, body, branch name, label name, comment text) is expanded into a shell command, a push or a release step | The quoted path from the value to the sink, each step as `path:line` |
| `pipeline-permissions` | A job holds a permission or secret that its steps do not need, a trigger runs an outsider's change with the precinct's secrets, or a step prints a secret or writes it into a published artifact | The permission, secret or trigger quoted, and the step that needs less |
| `unpinned-component` | A job runs an outside component by a movable reference, and a secret or write token reaches that job | The component, the movable reference, and the secret or token that reaches it, each as `path:line` |
| `release-integrity` | A released artifact, its digest or the update channel is taken on faith, and someone other than the owner can change what it believes | The step that takes it on faith, quoted, and who can change what it believes |
| `install-script` | A script that a package runs at install or start on a user's machine reads an input an outsider can write and reaches a shell or a path outside the package | The script, the input, who writes the input, and the sink, each as `path:line` |
| `agentic-injection` | A role reads text an outsider wrote and acts on it as an instruction, or a template applies a label that lets an outsider's issue start a role's work | The role, the text an outsider writes, the line where it is acted on, and the recorded guard that does not apply |
| `rendered-output` | External data reaches a published text, such as a changelog, release notes or a page, with no sanitiser between | The data source, the template line that prints it, and the absence of a sanitiser, each as `path:line` |

## Where to look
Read the threats from the tree. Ask which triggers let an outsider start work.
Ask who can open an issue or propose a change. Assume the history is readable
by everyone who can read the precinct. Assume nothing about the tracker's
audience.

Sweep the surfaces in this order.

**Secrets.** Credentials in the tree and in history, by the two shapes of the
alarm check. Also every step that could print a secret to a public log or
write it into a published artifact.

**Automation definitions.** For each one, read the trigger, the token
permissions and the inputs an outsider can write. Follow each such input to a
shell, an expression, a push, a signature, a release or a model client. Read
these closest:
- a trigger that runs an outsider's change with the precinct's secrets;
- a definition that passes every secret to a definition it calls;
- a job that holds a write token, a signing key or a release step.

Also read how each outside component is referenced: by an immutable commit, or
by a name that can move.

**Scripts a package runs on a user's machine.** Hooks, install commands and
launch scripts that a package ships. Take a census of them first. For each,
read what it reads, who writes that, and whether it reaches a shell, an
evaluation or a path outside the package.

**The agentic surface.** Roles that act as the owner while they read text
strangers wrote. Issue templates and forms that apply a label which starts
work. A finding is a place where the precinct's recorded guard is not applied,
traced to the line.

**Published output.** Changelogs, release notes and pages built from external
data, such as a change title, a commit header or an issue field. Trace each one
from its writer to the output, and look for a sanitiser on the way.

**Release and update.** How a released artifact, its digest and its update
channel are produced and accepted. Ask who other than the owner can change what
the receiver believes.

## Not findings
Beyond what the law already excludes (the Fence section, Not judged and the
recorded answers):
- Advice with no weakness shown. "Consider adding X" is taste.
- A shape that a recorded mechanism covers, unless you show the bypass.
- A fact of the threat model, such as a rule that lets a collaborator push,
  until an outsider is traced through it.
- A path whose first step needs write access to the precinct. That is an
  insider, and review of the merged text is the defence.
- A placeholder in the place of a secret: an example, a documented test
  credential, or a value this page names.
- A known vulnerability in a version of a dependency. That belongs to
  `vulnerabilities`. A stale pin and version drift belong to `dependencies`.
- A sentence in a security document that does not match the protection. The
  wrong sentence is another department's. The missing protection is this
  page's when an outsider can walk through it.

**Too small to file, even when true:**
- Broad permissions on a job that holds no secret and no write token.
- A movable reference to a component in a job that no secret and no write token
  reaches.
- A test or stand-in credential.
- Anything of value 3 or less, which includes every medium severity.

File only a path that an outsider can walk to a consequence of value 4 or 5.
When the best finding of the sweep is smaller, the correct output is no lead.

## Proof
Commands, not intuition. Quote every command and its output.

Alarm check: look for a live credential with two patterns, and print positions
only. Pattern one is a private key header, `-----BEGIN [A-Z ]*PRIVATE KEY-----`.
Pattern two is a password inside an address,
`://[A-Za-z0-9._~%-][A-Za-z0-9._~%-]*:[A-Za-z0-9._~%-][A-Za-z0-9._~%-]*@`.
The two placeholders for the positive control follow. Neither is a secret.
`-----BEGIN EXAMPLE PRIVATE KEY-----`
`https://example-user:example-pass@host.invalid/`
Run the positive control first: search this page, as shipped in the law folder,
for both patterns. The search yields the path and the line of each of the two
lines that hold the placeholders, and nothing else. When it yields nothing, no
clean result counts. Then search the tree for both patterns.
Search history once per pattern. Replace `<pattern>` with each in turn. List the
last 20 commits at `<sha>` whose change added or removed a line that matches the
pattern. List each with its short hash, date, subject and changed file names.
Then search the tree of each listed commit `<hash>` for both patterns.
Every search yields a path and a line, and never the matched text or a part of
it. The list of commits holds headers and file names, never a line of content.
Never trace the author of a line that holds a credential. Read each hit. A
placeholder, a documented example or a test credential is no alarm. A live
credential is an alarm. Print
`ALARM sweep <precinct> <path>:<line> <one line>` first in the reply, or
`ALARM sweep <precinct> <path>@<hash> <one line>` when only history holds it.
The line holds no value and no part of one.

**Census of definitions.** List the automation definitions, the shipped scripts
and the issue templates that the tree holds.

**Census of expressions.** Search the definitions for the open mark of a value
that the automation expands before a shell runs it. Read each such value that
sits in a shell block.

**Census of grants and references.** Search the definitions for the keys that
grant permissions, pass secrets or reference an outside component.

**A positive control for each census.** Run the same search over a definition
known to hold the construct. Quote both outputs. A zero proves nothing until
the control prints a non zero count.

**The path.** Write four parts: who the outsider is, what they control, the
quoted path from input to sink as `path:line` at `<sha>`, and the consequence.

**Hidden paths.** A plain text search misses these classes. Check each and say
which you could not check.
- An expression built from variables or step outputs before it reaches a shell.
- A value that passes through an intermediate file or an environment variable.
- A definition called by another, which inherits its secrets.
- A secret that reaches a component through a configuration file the component
  reads.
- Text a role fetches at run time through a command, not through its prompt.
- A label applied by automation, not by a person.

**Attack your own claim once.** Look for a guard that breaks the path. Candidates
are a permission block, missing secrets for changes from outside the precinct,
a label only the owner can apply, an escape, a signature or digest check, a
protection rule on the environment, and the Fence section. When one holds,
drop the candidate. When you are less than confident, drop it. A missed finding
costs nothing this tick. A false one costs the owner's belief in every lead.

**No probes.** Run nothing from the tree, test no credential, open no issue.

## Anchors
Severity becomes value. Value is how much an outsider gains.
- Value 1: a gap with no outsider path. Never filed.
- Value 3: a smaller gain, or a path that needs a second weakness which also
  exists. This is a medium severity. Never filed.
- Value 4: an outsider changes what a job with a write token does, or makes a
  role write. This is a high severity.
- Value 5: an outsider obtains a secret, changes a release or its digest, or
  runs code on a user's machine or in the automation with the precinct's
  secrets. This is a critical severity.

Risk is the chance that the fix breaks something.
- Risk 1: the fix edits a declaration that nothing executes, such as a
  permission line on a job that writes nothing.
- Risk 3: the fix changes what a job installs or runs.
- Risk 5: the fix touches a release, or a hook on a user's machine.

Threshold: value 4 or more, at any risk. The danger decides. The cost of the
fix does not. A `secret` has no score. It is an alarm. These numbers are a
starting value, not measured.

## Judged by
The role of the precinct's security policy: the document that names where
problems are reported, which versions are supported and which protections the
precinct promises. It judges only what it speaks to. With no line, the
department is judged by none.

## Lead body
Analysed commit and Department come first. The law owns those two lines. Then
these sections, in this order:

- `What`: who can do what, and where. Name the missing guard. Give no input that
  helps an attack.
- `Evidence`: the unguarded place as `path:line`, the guard that is missing, the
  path as a list of `path:line`, and the commands with their output, controls
  included.
- `Why it is <kind>`: the symptom in the judging document's words, the outsider,
  and the recorded guard you checked and why it does not apply.
- `Cost and risk`: one line, `Effort S|M|L, Risk low|medium|high, Confidence
  confirmed|demonstrated|plausible`.
- `Not checked`: what investigation must verify. Name the history that was not
  searched, the host settings the patrol cannot read, the hidden path classes
  not checked, and the probes and reproduction that were not run.

A `secret` has no lead body. The alarm replaces it.

The marker is the last line.

## Identity
`<path>::<symbol>::<kind>`. Encode each part as the marker grammar requires.
- The path is the file that holds the unguarded place.
- The symbol depends on the kind, and the prefix keeps it apart from other
  departments:
  - `pipeline-injection`: `inject/<job>/<step name>`, each space written as `%20`.
  - `pipeline-permissions`: `perm/<job>`.
  - `unpinned-component`: `pin/<component>`.
  - `release-integrity`: `release/<job or artifact>`.
  - `install-script`: `script/<name>`.
  - `agentic-injection`: `<role or workflow>/<read point>`.
  - `rendered-output`: `render/<output>`.
- The kind is one row of the Kinds table. `secret` has no identity, because it
  is never filed.

No line number, severity or commit enters the identity.

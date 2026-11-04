# The journal

The journal is the memory of an installation. It is one program on Bun with SQLite. It keeps the precincts, the orders, the ticks, the alarms and a cache of each tracker, with the cleaned texts of its issues, pull requests and comments. Every role asks it what to do next and records what it did.

The journal reads and writes local files only. It makes no network request. It runs no version-control tool and no hosting tool of its own. The only programs it starts are your commands in `configs/` and `shared/` beside its database. See [commands of the installation and the precincts](#commands-of-the-installation-and-the-precincts). Without a command, a role hands it host data on standard input, in the input forms that `journal form` prints.

## Where it comes from

The program is compiled to a binary per platform. A release tag builds four targets, signs the macOS binaries ad hoc, attests the artifacts and publishes checksums. The assets are named `journal-bun-<os>-<arch>`, with `x64` or `arm64` as the architecture. Beside each binary the release publishes its provenance file, `journal-bun-<os>-<arch>.sigstore.json`. The checksum file is `SHA256SUMS`.

The assembly downloads the binary of the release that matches your plugin. It checks the checksum, moves the file to `bin/journal` and records its SHA-256 in `config.yaml`. See [configuration](configuration.md).

The signature in the provenance file is checked when the host notes name a verifier. The verifier confirms that the release workflow of Lawman's repository signed the file and built it from the commit of the law folder. The assembly finds a Sigstore verifier with you at install.

A declined verifier leaves only the checksum from the same release. That checksum proves no origin. You can turn the check on later. The assembly offers it at each start when it finds a verifier on this machine, and the menu item "Host" runs the part again.

The database file `journal.sqlite` sits in the installation directory, next to `bin/`. The binary applies its schema migrations when it opens the file. A database newer than the binary is refused with exit code 6.

## Updates

You update the plugin with your harness. The law then moves ahead of the binary. The next tick of any role completes the update.

- The role compares the commit of the law folder with `law_commit` in `config.yaml`.
- It downloads the journal asset, its provenance file and `SHA256SUMS` from the release of the tag that the commit carries.
- It checks the checksum. It checks the signature too when the host notes name a verifier.
- It runs the `law-sync` command of the new file.

`law-sync` renames the new binary over `bin/journal` and rewrites the sync keys of `config.yaml`. Before the swap it only reads, so a failure leaves the installation as it was. It refuses when the skills ask for a newer schema than the binary has.

Never open the database or run SQL on it. The commands below are the only way in.

## Commands

The program prints a usage line on stderr when it gets wrong arguments, then exits 1. Each line in the blocks below follows `usage: journal`. A name that is not a command prints the list of commands.

### Installation and health

- `--version`: prints the version of the binary.
- `probe`: opens the database, applies pending migrations, tries a write that it rolls back, and prints the version, the schema number and the journal mode. `--schema N` exits 6 when the binary is older than schema N.
- `law-sync`: swaps in the new binary and rewrites the sync keys of `config.yaml`. It prints `synced <tag>` and may print an `ALARM contract-changed` line.

```
journal <--version|probe|precinct|role|next|dispatch|tick|alarm|status|sync|leads|seen|cap|last|rotation|case|due|intake|clean|lint-body|lint-page|department-line|precedent|pull|handoff|decider|form|jev|catalog|wake|law-sync|commands|run> [args]
journal probe [--schema N]
journal law-sync --tag <tag> --commit <commit> --installation <folder>
```

### Precincts and roles

- `precinct`: adds a precinct with a weight, sets a weight, or lists precincts with repository, weight, credit and last sync. A repository path may have more than two segments, such as `group/sub/project` or `owner/.github`.
- `role set`: records how often a role runs, in minutes. The alarms use the interval.
- `next`: chooses the next precinct for a role by weight and prints its name and repository.

```
journal precinct <add <name> --repo <owner/repo> --weight <n>|set <name> --weight <n>|list>
journal role set <role> --every <minutes>
journal next --role <role> [--exclude <precinct>]…
```

### Orders and ticks

- `dispatch`: `add` writes an order for a role. `take` claims the oldest takeable order of a role. A repeated open order exits 2.
- `tick`: `start` opens a tick and prints its id. With `--order`, it takes that order and prints the tick's input, as [the role entry](#the-role-entry) says. `input` prints a part of an input. `end` closes a tick with an outcome and a report from stdin, and closes the order it names. `list` prints ticks newest first with their reports.
- `due`: prints the precinct and the number of the next case or pull request that a role is due on. It prints nothing when the role has an open order.
- `rotation`: reads department names on stdin and prints each with its last visit and its cap, in rotation order.
- `wake`: the role entry. It prints nothing when the role has no takeable order, and the first part of the role's input otherwise. It also records the check. See [the role entry](#the-role-entry).

```
journal dispatch <add --precinct <p> --role <r> [--department <d>] [--issue <n>]|take --role <r>>
journal tick <start --role <r> [--order <id>]|input (<id> [--part <k>]|--role <r> --part <k>)|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]|list (--limit <n>|--id <n>) [--role <r>] [--precinct <p>]>
journal due --role <role> [--exclude <precinct>]…
journal rotation <precinct> --role <role> (stdin: department names, one per line)
journal wake --role <r>
```

### Alarms and status

- `alarm`: computes the alarms and prints an `ALARM` line for each new one. `--repeat` adds the open alarms that nobody mentioned for a day. Only the duty desk passes it.
- `status`: prints the open orders, the last tick of each role, the open alarms and the lead counts.

```
journal alarm [--repeat]
journal status
```

### The tracker cache

- `sync`: replaces the cache of a precinct's issues with the issues form on stdin. The form is one object with the fields `writers` and `issues`. For an issue whose newest court marker is a referral, the sync also derives the answer of a decider from the reactions and comments. The old form, a bare list, exits 4 and leaves the cache untouched. The message tells you to run the assembly, finish any amendment it offers, then choose Host once to rewrite `host.md`. With `--pulls` the sync replaces the pull request cache from the pulls form. It prints the counts. `--reset` lets an empty list replace a filled cache. The sync also stores the texts of the issues, the pull requests and their comments, cleaned as `journal clean` cleans them. A cleaning library that fails gives exit 1 and leaves the cache as it was.
- `leads`: lists the open leads of a precinct, or of one department.
- `seen`: answers `none`, `open #n`, `declined #n` or `fixed #n` for a finding id.
- `cap`: prints `cap=<n> open=<k>` for a department of a precinct.
- `last`: prints the last visit of a role to each department of a precinct.
- `case`: prints the stage of an issue, with the next role, the round, the returns, the commit, the clerk's job and the pull request. It ends with three fields. `kind=` is `requirement`, `defect` or `-`. `answer=` is `up`, `down`, `comment` or `-`. `answer_id=` is the id of the decider's comment for a `comment` answer. A requirement is a lead of the response unit whose id ends in `required`. The answer counts only while the newest court marker is a referral.
- `intake`: names the next human-written issue that waits for the response unit. With `--issue` it prints `need=` and `state=` for one issue.
- `pull`: prints the stage of a pull request, with the next role, the spec vote, the executor's work state, the sources and the priority.
- `decider`: reads the decider form on stdin and says whether the actor of the last close or reopen is a decider.
- `form`: prints the input form of one kind, `issues`, `pulls`, `decider` or `catalog`, with one example. The issues form holds `writers` and `issues`. Each comment carries `id`, and `approvedBy` and `rejectedBy` for the comments of the trusted login on open issues. The journal normalises every time of an input to UTC, as `YYYY-MM-DDTHH:MM:SSZ`, and rejects a value that is not a time.

```
journal sync <precinct> --author <login> [--reset | --pulls]
journal leads <precinct> [--department <d>]
journal seen <precinct> --id <path::symbol::kind>
journal cap <precinct> --department <d>
journal last <precinct> --role <role>
journal case <precinct> <issue>
journal intake <precinct> [--issue <n>]
journal pull <precinct> <pull request>
journal decider < response.json
journal form <issues|pulls|decider|catalog>
```

### Checks and builders

- `clean`: reads host text on stdin and prints it without hidden comments, secrets and hidden characters, and with each image turned into a link. Plain text is the default form. The option `--json` reads one JSON value or several and cleans every string. A JSON input that does not parse gives exit 1 and no output.
- `lint-body`: reads a text on stdin as the host renders it and prints the cleaned text. Exit 7 prints the reasons on stderr, prints nothing on stdout and never prints the matched value.
- `lint-page`: checks a constitution or a department page on stdin. Exit 8 prints the reasons. A good constitution prints one line per department with its judging document. It then prints one line that starts with `#` for each section the contract does not list. A good department page with an alarm check prints `alarm-check`.
- `department-line`: reads a constitution on stdin and prints it with one Departments line set. Exit 8 when the result fails the page check.
- `handoff`: builds the hand-over comment of the clerk for a pull request and prints it. With `--adopted` it cleans the old body of the pull request first. It never exits with 7.
- `precedent`: reads the newest counted ruling of a case from the journal's cache and writes its precedent files into the folder `.lawman/precedents/` of a tree. It prints one line for each change: `entry <name> [<reason>]`, `cancel <name or -> [missing]`, `none` or `no-entry <reason>`. A taken name gets the next free one, so no precedent is lost. The model passes no ruling text. A link or a folder in the path that is no plain file or folder gives a non-zero exit and no write.
- `jev`: `request` builds the request body for TypeSafe Jev from a brief on stdin. `answer` turns the reply and its status line into one `jev` evidence line. The journal sends nothing.
- `catalog`: checks a precinct's pinned dependencies against the OSV catalog. `request` builds each request and `answer` reads each reply, for the two kinds `batch` and `record`. The journal sends nothing. See [The catalog check](#the-catalog-check).

```
journal clean [--json] (stdin: host text, or with --json one or more JSON values)
journal lint-body [--no-marker] (stdin: the text to write)
journal lint-page <constitution|department> [--name <expected>] (stdin: the page)
journal department-line --name <department> --judged-by <path|none> (stdin: the constitution)
journal handoff --sources <a,b,…> [--adopted] [--merged <m>] (stdin: the old pull request body, with --adopted)
journal precedent <precinct> --issue <n> --source <ruling comment URL> --tree <folder>
journal jev <request|answer> --kind <p0|grade|requirement>
journal catalog request --kind batch --tick <tick id> [--precinct <p>] (stdin with --precinct: the list)
journal catalog answer --kind batch --tick <tick id> (stdin: the reply, then the status line)
journal catalog request --kind record (stdin: a Source line)
journal catalog answer --kind record --id <identifier> (stdin: the reply, then the status line)
```

Cleaning host text has these known limits:

- Specially built Markdown can make cleaning slow.
- A token split by emphasis markup is not masked.
- When cleaning removes something, the text comes back as normalised Markdown.
- Text hidden by styling (a hidden attribute, a style block) reaches the role as text.

Among other things, the body check rejects these in the text a role writes:

- a secret, such as a token or a private key
- a hidden character
- an image embed
- an element that loads an address
- an HTML comment other than the marker
- a last line that is not a valid marker, unless `--no-marker` says the text has none

It cleans a quote and does not reject it. It checks no path, no mention and no size.

See [the law](../skills/lawman-law/references/LAW.md) for when roles call it.

## Commands of the installation and the precincts

The journal knows a fixed set of read operations. Your command for an operation decides how it runs on your machine. A command only reads: it never writes to the host. The assembly writes each command with your consent. An operation without a command is a step that the role does itself.

### Where the commands live

The journal looks for two folders in the folder of its database. Without `LAWMAN_DB` that is the installation directory.

- `configs/<precinct>/` holds the commands of one precinct and the files they need. It lies outside the clone and outside the precinct's repository.
- `shared/` holds the commands of the installation and the files they need.

A command is an executable file named after its operation. No file means the operation is empty.

### How a command runs

- The journal runs the file by its absolute path, with no shell, and passes each argument as one value.
- Standard input is closed, so a command that reads it ends at once.
- The working folder is the command's folder.
- The command gets the journal's environment unchanged.
- There is no time limit.

### The operations of a precinct

| Operation | Arguments | Output of the command |
| :-- | :-- | :-- |
| `fetch` | none | one line: the revision at the tip of the default branch after the clone is updated |
| `identity` | none | one line: the login the tool acts as |
| `issues` | none | the form of `journal form issues` |
| `pulls` | none | the form of `journal form pulls` |
| `decider` | the word `issue` or `pull`, and a number | the form of `journal form decider` |
| `file` | a revision and a path of a precinct file | the text of the file at the revision |
| `files` | a revision | the paths of the files at the revision, one per line |

- `issues`, `pulls` and `decider` use the forms that `journal form` prints. The same readers take them as take the standard input of `sync` and `decider`.
- The output of `fetch` passes the revision class, the output of `identity` the login class.
- A one-line output may end in one `\n` or one `\r\n`. Any other output is outside the form.
- Output that does not read as UTF-8 is outside the form.
- The lines of `files` are not checked: the list prints inside a fence. A path from the list passes the path class when it goes to `file`.
- A missing file at a revision has no mark of its own. Whoever reads a file takes the list of `files` first.
- `fetch` updates the local clone of the precinct. That is not a write to the host.

The installation has the operations `release` and `verify`. Their forms come with the update of the binary.

### The commands

- `commands`: prints `folder <folder>`, the folder the journal found, then one line per operation: `<operation> command` when the file is there, `<operation> empty` otherwise. Without a precinct it lists the operations of the installation, with one the operations of the precinct. The `empty` lines are the steps that the role does itself. A precinct with no folder in `configs/` has every operation empty.
- `run`: runs one operation of a precinct, as the role's entry runs it.
  - `issues` and `pulls` take `--author <login>`, and `issues` takes `--reset`, as `sync` does. They update the cache by the same path and print the same counts as `sync`.
  - `fetch` prints `revision=<revision>`.
  - `identity` prints `login=<login>`.
  - `file` prints the text in a `file` fence, `files` the list in a `files` fence.
  - `decider` prints what `journal decider` prints on the same form.
  - An operation without a command prints `<operation> empty` and exits 0.
  - The arguments pass their classes before the journal looks for the file, so an argument for the command outside its class gives `reason=argument` even for an empty operation.

A wrong number of arguments, an unknown operation or a precinct that the journal does not list is a usage error with exit 1. The messages name only what the journal itself holds.

```
journal commands [<precinct>]
journal run <precinct> <fetch|identity|files <revision>|file <revision> <path>|decider <issue|pull> <number>|issues --author <login> [--reset]|pulls --author <login>>
```

### The classes of the arguments

The journal checks every argument against its class before the command runs. An argument outside its class never reaches the command.

- A revision is one string of ASCII letters, digits and `.` `_` `-` `/` `:` `+`. It does not start with `-`. Its length and shape are free, so a Git hash of 40 or 64 characters and a Subversion number both pass.
- A path of a precinct file is a string of ASCII letters, digits and `.` `_` `-` `/`. It has no `..` segment and does not start with `/` or `-`. The command reads `./a` and `a//b` itself. A file whose name lies outside the class shows in the list of `files`, but `file` does not read it.
- A number of an issue or a pull request is a positive integer without a leading zero.
- A link is an `https` or `http` address with no space and no control character. No operation takes a link yet.
- The word of `decider` is exactly `issue` or `pull`.

### Failures and their reasons

A failure prints one line, `<operation> failed reason=<reason>`, and an `error` fence below it.

The reasons are `argument`, `start`, `exit`, `form` and `clean`.

| Reason | When | Inside the `error` fence | Exit code |
| :-- | :-- | :-- | :-- |
| `argument` | an argument is outside its class, and the command did not run | nothing | 5 |
| `start` | the file did not start | nothing, because the system message carries the installation path | 5 |
| `exit` | a non-zero exit or a signal | the command's standard error | 5 |
| `form` | the output is outside the operation's form, or a reader refused it | the journal's message, with the form for a reader's refusal | 4, or 3 for the ceiling of 1000 issues |
| `clean` | a cleaning library failed | nothing, because the library's message can quote the input | 5 |

The text inside the `error` fence passes the character layer of the cleaning. Every refusal of the readers of `issues`, `pulls` and `decider` prints as `form` inside the fence: the ceiling, an empty list over a filled cache without `--reset`, and a broken cache constraint. A comment id that repeats has its own message.

### Fences

The journal prints foreign text inside a fence of `~` characters. The fence line carries the kind as its info string, such as `~~~file`. The fence is longer than any run of `~` in the cleaned text, so no line inside closes it. The fence adds no change to the text, except that it drops one final line break. A tilde fence also sits safely inside a harness that wraps the output in backticks.

The kinds so far are `issue`, `comment`, `pull`, `file`, `files`, `error`, `title`, `constitution`, `department` and `lint`. Later kinds join as the journal prints more foreign text.

### Texts in the cache

The cache holds the texts of issues, pull requests and comments after the cleaning of `journal clean`. The output of `file` and `files` and the text of `error` are data, not Markdown: they pass the character layer, which removes hidden characters and masks secrets. A text is cleaned again each time it prints, so a text that an older cleaning stored prints clean.

A printed issue or pull request is its body in an `issue` or `pull` fence, then each comment, by time and then by id. Each comment has a `comment at=<time>` line and a `comment` fence. The first line inside that fence is `id="<id>" author="<login>"`, written as JSON strings, or `author=null` when the host gave no author.

## The role entry

The role entry tells whether a role has work and gives the role what it reads at the start. It comes in two calls. The first reads only local files. The second, the start of the tick, runs the commands of the precinct and prints the case.

### No work and work

`journal wake --role <r>` records the check of the role. A role has work when it has an order it can take, by the same rule as `dispatch take`.

- No work: the journal prints nothing and exits 0. The output is the same at every check, and a broken `config.yaml` does not change it.
- Work: the journal prints the first part of the role group. The first line carries the check time, so the output changes at every check.
- The duty desk always has work. Its group has no orders.

The entry runs no command and touches no network. It writes only the check time of the role. A broken database exits non-zero and prints nothing.

### The role group

The role group is the local part of the input. Its blocks come in this order:

1. The sections of the law that the role reads at the start. A line `law <path>` stands before the sections of each file. The path starts at `lawman/skills/lawman-law/references/`.
2. The section `Silence` of the harness page. The key `harness` of `config.yaml` names the page. A line `harness <path>` stands before it.
3. One line per order the role can take, oldest first, in the order `dispatch take` gives them.

Every line of a law section and of the harness page prints behind `| `, and an empty line prints as `|`. After the prefix the text follows byte for byte. So no line of the group starts with a backtick, whatever the law holds. A line without the prefix is a line of the journal.

A section is its heading and everything up to the next heading of the same or a higher level. The intro is everything before the first second-level heading. The sections of a file print in the order of the document. A Markdown parser finds the headings.

| Role | Law |
| :-- | :-- |
| patrol | `LAW.md`, `tick.md` (common sections, Sync the tracker, Check the constitution, Resolve the department page, Alarm), `markers.md`, `departments.md` |
| response-unit | `LAW.md`, `tick.md` (common sections, Reading without a tree, Sync the tracker, Check the intake order, Check the constitution, Write a comment, Alarm), the section "The `id` value" of `markers.md` |
| investigation | `LAW.md`, `tick.md` (common sections, Sync the tracker, Read the stage, Check the constitution, Write a comment, Alarm) |
| prosecutor | `LAW.md`, `tick.md` (common sections, Reading without a tree, Sync the tracker, Read the stage, Check the constitution, Write a comment, Close the issue, Alarm) |
| defender, court | as the prosecutor, and Resolve the department page |
| clerk | `LAW.md`, `tick.md` (common sections, Sync the tracker, Sync the pull requests, Read the stage, Check the decider, Write a comment, Close the issue, Alarm) |
| spec-writer | `LAW.md`, `tick.md` (common sections, Reading without a tree, Sync the pull requests, Read the pull stage, Check the constitution, Write a comment) |
| executor | `LAW.md`, `tick.md` (common sections, Sync the pull requests, Read the pull stage, Check the constitution, Write a comment) |
| duty-desk | the sections Silence is the default, One tick, one case, exit, Alarms and their repetition, and Tick outcomes of `LAW.md`, and Sync the law of `tick.md` |

`LAW.md`, `markers.md` and `departments.md` print whole where the table names no section. The common sections of `tick.md` are the intro, One end, Sync the law, Working rules, Instructions and evidence, Fetch the precinct and End the tick.

A file, a section, `config.yaml` or the key `harness` that the journal cannot read stands as a self line in place of its block. `<harness>` stays as it is in that line when no harness is named. So a binary and a law of different releases never stop a role.

### The start of the tick

`journal tick start --role <r> --order <id>` runs these steps in order.

1. The order must belong to the role, be open and be takeable. Otherwise the journal prints `order <id> untakeable` alone and starts no tick. Otherwise it starts the tick.
2. It computes the alarms as `journal alarm` does without `--repeat`, and prints each `ALARM` line.
3. It reads `trusted_login` from `config.yaml`.
4. It runs the operation `identity` and compares the login with `trusted_login`, ignoring ASCII case.
5. It takes the order in one transaction, after it checks again that the order is free. It records the precinct, the department and the order in the tick, and prints the order line.
6. It checks the fields of the order. An issue role needs an issue number, the spec writer and the executor a pull request number. A patrol order has a department and no issue number.
7. It runs `fetch`.
8. It runs `issues` and `pulls` as the role needs them, with `trusted_login` as the author. They update the cache by the same path as `run`.
9. When `fetch`, `issues` or `pulls` gave a self line, the start prints its lines and stops. The role does those steps itself and then runs `tick input <tick id>`.
10. It reads the stage: `case` for the issue roles but the response unit, `intake` for the response unit and `pull` for the spec writer and the executor. The line prints as the command prints it.
11. For the roles that read a constitution, it lists the files at the revision and reads `LAWMAN.md`. The check of `lint-page constitution` prints in a `lint` fence, the text in a `constitution` fence.
    For the roles that get precedents, it reads each direct `.md` file of `.lawman/precedents/` from the same list. It prints the line `precedent <name> kind=<protects|condemns|-> departments=<a,b|all|->` and the whole file in a `precedent` fence, by name. An empty or missing folder prints `precedents none`. A value outside its class prints `-`. A department list outside its class reads as all departments. The prosecutor, the defender, the court, the spec writer and the executor get all precedents. Investigation and the response unit get those of the case's department. Patrol gets those of the visit's department. A department `-` gets all precedents. The clerk gets none.
12. For patrol, the defender and the court, it resolves the department page. Patrol takes the department from the order, the defender and the court from the stage. `-` means no page. The places are `.lawman/departments/<d>.md` of the precinct, `departments/<d>.md` of the installation and the page of the law, in that order. A failed check never falls through. The line `department <d> place=<1|2|3>` stands before the fences. The check prints in a `lint` fence, the page in a `department` fence.
13. It prints the texts: the issue title in a `title` fence, then the issue or the pull request from the cache. The clerk also gets the pull request of the stage's `pull` field.
14. The self lines come last.

A failed or empty operation prints the lines of `run` and a self line, and the start goes on. Only a usage error and a broken database exit non-zero.

### The outcomes the journal writes

The journal ends the tick itself when the outcome follows from what it read. Before the order is taken, the tick ends without it, and the order stays open for the next start. After, the order closes with the same outcome in the same transaction.

| Outcome | Report |
| :-- | :-- |
| `failed` | `config.yaml is missing`, `config.yaml has no trusted_login` (before the order is taken) |
| `stopped-identity-changed` | `Host identity changed: <login>` (before the order is taken) |
| `silent` | `No order.` when another run took the order first |
| `failed` | `The order has no issue number`, `The order has no pull request number`, `The patrol order has an issue number or no department`, `The stage check failed` |
| `silent` | `Order stale: <stage line>` |
| `skipped-no-constitution` | `No constitution at <revision>` |
| `skipped-contract-version`, `skipped-bad-constitution` | `Constitution check failed at <revision>` |
| `stopped-bad-department` | `Department page check failed: <d>`, or `The department name is not safe` |

The stale rules of the issue roles and the pull request roles are the rules of their skills. An order closes as stale only after the sync of the same start.

An ended tick prints one part, `part 1 of 1`, whatever its size. Its last lines are `ended <outcome>` and `report <report>`. It prints no `title`, `constitution` or `department` fence and no case text. A constitution or department outcome prints only its `lint` fence. The role then only answers.

### The lines of the input

`<form>` is the version of the input's form, `1` in this release. A role tells the output of an older binary by it. The fields of a line are separated by one space.

The frame of a part:

- the first line of the part that `wake` prints: `lawman input <form> role=<role> at=<time> part 1 of <n>`;
- the first line of a part of the role group that `tick input --role` prints: `lawman input <form> role=<role> part <k> of <n>`;
- the first line of a part of the tick group: `lawman input <form> role=<role> tick=<tick id> part <k> of <n>`;
- the last line of every part: `end part <k> of <n>`.

The role group:

- `law <path>`;
- `| <line of the law or the harness page>`, and `|` for an empty line;
- `harness <path>`;
- `order <id> <precinct> <repository> <department|-> <issue or pull request number|->`.

The tick group:

- `order <id> <precinct> <repository> <department|-> <issue or pull request number|->`;
- `order <id> untakeable`, without a frame, the only line of the output;
- the `ALARM` lines as `journal alarm` prints them;
- `login=<login>`, `revision=<revision>` and the sync counts as `journal run` prints them;
- the stage line as `case`, `intake` or `pull` prints it;
- `department <d> place=<1|2|3>`;
- `precedent <name> kind=<protects|condemns|-> departments=<a,b|all|->` and `precedents none`;
- `comment at=<time>` as the print of the cache gives it;
- `<operation> empty`, `<operation> failed reason=<reason>` and the `error` fence as `journal run` prints them;
- `self <step>`;
- `ended <outcome>`, then `report <report>`.

### Self steps

A line `self <step>` names a step that the journal could not do. The role does it itself. In the role group the line stands in place of its block. In the tick group the lines come last. The list stays open: a later release adds a step with each block it adds.

| Step | What the role does |
| :-- | :-- |
| `identity` | item 5 of step 0 of its skill, the identity check |
| `fetch` | the section "Fetch the precinct" of `tick.md` |
| `issues` | the section "Sync the tracker" |
| `pulls` | the section "Sync the pull requests" |
| `stage` | the section "Read the stage", "Check the intake order" or "Read the pull stage" |
| `constitution` | the section "Check the constitution" |
| `precedents .lawman/precedents/` | reads the direct `.md` files of that folder at the revision, and the filter by department of its role |
| `department <d>` | the section "Resolve the department page" |
| `department` | the same section, for a name outside its class, which the line leaves out |
| `issue <n>`, `pull <m>` | the read of the issue or the pull request that its skill names |
| `law <path> <section>` | reads that section of the law file, `intro` for the intro and nothing for the whole file |
| `harness <path> <section>` | reads that section of the harness page |

### Parts

The size of a part is the key `input_chars` of `config.yaml`, 16 000 without the key. The size counts Unicode characters of the content, fence lines included, each line with its line break. The first and the last line of a part do not count.

- Each group splits on its own. A group within the size is one part.
- A split falls between blocks. A block longer than the size splits by lines, a line longer than the size by characters. Each piece of a law line keeps the prefix. Each piece of a foreign text gets a fence of its own with the same kind. A `comment at=` line goes with the fence of its comment.
- When the role group splits, its orders take the last part or parts. The parts of the law and the page then stay the same while the orders change, and the count changes only with the law folder. The role takes the order id from the last part. The duty desk has no orders.
- A part without its last line was cut from the end by the harness.

`journal tick input --role <r> --part <k>` builds the role group again and prints part `k`. The journal stores no role group. The content of a part stays the same while the law folder and the orders of that part stay the same.

The journal stores the tick group when it builds it. `journal tick input <tick id> --part <k>` prints a stored part. `tick end` and an end by the journal clear the parts.

The output of a start that stopped on its own steps is one part and is not stored. `journal tick input <tick id>` then builds the tick group from the cache and prints its first part. When the tick group is already stored, it prints the stored first part instead. It prints the stage line and the texts. A failed stage check gives the self line `stage`. The constitution, the precedents and the department page become self lines. It ends no tick and applies no stale rule.

An unknown tick, an ended tick, a role without an input and a part outside the group are usage errors with exit 1.

### What the input leaves out

The input never prints:

- the author and the labels of an issue, the state and the title of a pull request;
- the files a role reads later in its work: `skills/clerk/references/jobs.md`, `skills/executor/references/work.md`, `skills/executor/references/gate.md`, `exhibits.md` and the license pages;
- the tree of a precinct and the results of a search.

## The catalog check

The patrol of the department `vulnerabilities` and the investigation of its leads use `catalog`. The journal builds every request and reads every reply. It opens no socket and starts no process. The role sends what the journal printed, with a send form of the harness page, and hands the reply back unread. The check works on any harness whose page carries those forms. The Hermes page carries them today, in its section "Sending to the catalog". A harness page without them cannot send, so the patrol ends its tick and reports that the check did not run. See [harnesses](harnesses.md).

### The list

`journal form catalog` prints the list form. The role writes one entry per line, with four fields separated by a tab: the place, the ecosystem, the package and the version. The place is a canonical path relative to the repository, with no leading `/` or `./` and no `.` or `..` segment. The ecosystem and the package are named as the catalog names them. A version that the reading way did not resolve is `-`.

The journal checks each field against a class. A field holds ASCII only, and never whitespace, a control character, a quote or a backtick. Each field also has a length limit. The classes and limits live in [catalog-entries.ts](../journal/src/catalog-entries.ts), the one place that holds them. The record identifier of a `Source:` line has its own class there.

An entry outside its class is refused. An entry with the version `-` is not sent. The journal names both by their number, counted from 1 over the non-empty lines, and never prints their text.

### Parts and state

The journal cuts the entries it accepts into parts of at most 1000. That is the batch limit of the catalog. The body of a part holds only entries of the list, as a JSON request.

The first request carries the tick id, the precinct and the list on standard input. It prints the body of part 1. Each later request carries the tick id only and prints the body of the first part not yet answered. A request before the answer prints the same part again. A request after the last part is answered, or a request with no list for the tick, exits 1. A list that leaves no entry to send exits 1 with `catalog none entries=<n> refused=<numbers> not-sent=<numbers>`.

The journal keeps the list of the tick in `catalog.json` in `runs/<tick id>/` of the installation, found from the folder of its database file. The role never reads or writes it. The folder belongs to the tick, and the tick's cleanup removes it. The database gets no new table.

### The answer

A reply goes on standard input, with the status line of the send as the last line. The journal accepts a reply only for a part it printed and has not yet answered, and exits 1 otherwise. The reply carries no copy of the entry, so the journal maps result number `i` to entry `i` of that part.

A part fails when the status line is missing or is `000` (no reply came), when the status is not 200, or when the reply cannot be read. A reply is unreadable when it is not JSON, when its result count differs from the part's entry count, when it carries a next-page token, or when a record identifier lies outside its class. The reason is `no-reply` for the first two, `status-<code>` for another status and `bad-answer` for an unreadable reply. A failed part is never an empty result. The journal follows no next-page token and retries nothing.

While a part is left, the answer prints a `catalog part <n> failed reason=<reason>` line for a failed part, then `catalog next`. After the last part it prints the result.

- One tab-separated row for each new match: `new`, the lead identity and the `Source:` line. A match whose lead was closed as completed prints `fixed #<n>` in place of `new`. Open and declined matches come as counts only.
- `catalog entries=<n> parts=<n> failed=<n> open=<n> declined=<n> new=<n> fixed=<n>`
- `catalog refused=<numbers> not-sent=<numbers>`
- One `catalog part <n> failed reason=<reason>` line for each failed part.

The rows follow byte order of the place, the package and the record identifier. The journal compares each match with the cache of the precinct's leads, so the role files in the journal's order and never searches the tracker. The matches of the parts that did not fail print even when another part failed.

### The Source line and the identity

A lead of the department carries the line `Source: catalog <record identifier> <package>`. The package token is `<ecosystem>/<name>`. An ecosystem holds no `/`, so the first `/` ends the ecosystem, and two ecosystems never collide on one name. A line outside the classes is refused and its text is never printed.

The identity of the lead is `<place>::<record identifier>/<package>::advisory`. Each part is encoded as the marker grammar requires. The version is not part of it, so a lead keeps its identity when the pin changes.

### One record

The investigation reads one fresh record for a lead. `catalog request --kind record` takes the `Source:` line on standard input, checks it against the classes and prints the record identifier. `catalog answer --kind record --id <identifier>` takes the reply and the status line and prints one line:

```
catalog record id=<identifier> severity=<value> modified=<UTC time> read=<UTC time> [dropped=<fields>] summary=<text>
```

The journal takes four fields of the record and drops the rest. A field the record lacks prints as `unknown`. A field outside its class prints as `unknown` too, and its name goes into `dropped=`. A summary of more than 1000 characters counts as outside its class. The summary passes the same cleaning as host text, with no new cleaning code, and the journal cuts it to 240 characters. The cleaning libraries load only when a record is read. An instruction inside the summary is a fact about the text.

When no record can be shown, the journal prints `catalog none reason=<reason>`:

| Reason | Reply |
| :-- | :-- |
| `missing` | The status is 404, 410 or 422. |
| `failed` | Any other status, or a body that is not JSON. |
| `unconfirmed` | The body is empty, or it names another identifier. |

## Exit codes

| Code | Meaning |
| :-- | :-- |
| 0 | Success |
| 1 | Usage, argument or input error |
| 2 | Duplicate open order |
| 3 | Issue sync ceiling reached |
| 4 | Invalid sync input |
| 5 | A command of the installation or of a precinct failed |
| 6 | Database newer than the binary, or a schema version above the supported one was requested |
| 7 | Body check rejection |
| 8 | Page check rejection |

Codes 3 and 4 cover `run` too, as the table of failure reasons says. Code 4 prints the form that the input broke, with an example. The issue sync ceiling is 1000 records. A list of exactly that size is rejected and never truncated. The pull request sync has no ceiling. The law lists the codes in [LAW.md](../skills/lawman-law/references/LAW.md).

A role treats exit 2 as silence. Skills cite the other codes by number.

## Source files

- [journal.ts](../journal/src/journal.ts): the command table.
- [db.ts](../journal/src/db.ts): the exit codes and the database path.
- [form.ts](../journal/src/form.ts): the input forms and their examples.
- [migrations.ts](../journal/src/migrations.ts): the schema.
- [args.ts](../journal/src/args.ts): the classes of the arguments.
- [launch.ts](../journal/src/launch.ts): the places of the commands and their start.
- [operations.ts](../journal/src/operations.ts): `commands`, `run`, the forms of the output and the reasons.
- [fence.ts](../journal/src/fence.ts): the fence.
- [cache-text.ts](../journal/src/cache-text.ts): the texts in the cache and their print.
- [input-roles.ts](../journal/src/input-roles.ts): the blocks of each role's input.
- [input-parts.ts](../journal/src/input-parts.ts): the blocks, the parts and their frame.
- [role-entry.ts](../journal/src/role-entry.ts): the role group.
- [tick-start.ts](../journal/src/tick-start.ts): the start of a tick with an order and the tick group.
- [law-sync.ts](../journal/src/law-sync.ts): the update command.
- [clean-host.ts](../journal/src/clean-host.ts): the cleaning of host text.
- [clean-quote.ts](../journal/src/clean-quote.ts): the cleaning of quotes.
- [catalog-entries.ts](../journal/src/catalog-entries.ts): the list form, the value classes and the `Source:` line.
- [catalog.ts](../journal/src/catalog.ts): the parts, the state and the printed result.
- [catalog-record.ts](../journal/src/catalog-record.ts): the read of one record.
- [tick.md](../skills/lawman-law/references/tick.md): the command forms that roles run.

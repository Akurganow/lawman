# The journal

The journal is the memory of an installation. It is one program on Bun with SQLite. It keeps the precincts, the orders, the ticks, the alarms and a cache of each tracker. The cache holds the cleaned texts of its issues, pull requests and comments. Every role asks it what to do next and records what it did.

The journal reads and writes local files only. It makes no network request. It runs no version-control tool and no hosting tool of its own. The only programs it starts are your commands in `configs/` and `shared/` beside its database and, at an update, the new binary of a release. That binary runs after the checks of [the update](#updates). See [commands of the installation and the precincts](#commands-of-the-installation-and-the-precincts). Without a command, a role hands it host data on standard input, in the input forms that `journal form` prints.

## Where it comes from

The program is compiled to a binary per platform. A release tag builds four targets, signs the macOS binaries ad hoc, attests the artifacts and publishes checksums. The assets are named `journal-bun-<os>-<arch>`, with `x64` or `arm64` as the architecture. Beside each binary the release publishes its provenance file, `journal-bun-<os>-<arch>.sigstore.json`. The checksum file is `SHA256SUMS`.

At install the assembly downloads the binary of the release that matches your plugin. It checks the checksum, moves the file to `bin/journal` and records its SHA-256 in `config.yaml`. At an update the journal gets the new binary itself, as [Updates](#updates) says. See [configuration](configuration.md).

A verifier checks the signature in the provenance file. At an update that is your `verify` command in `shared/`. Without that command, the role uses the verifier that the host notes name. The verifier confirms that the release workflow of Lawman's repository signed the file and built it from the commit of the law folder. The assembly finds a Sigstore verifier with you at install.

A declined verifier leaves only the checksum from the same release. An update accepts the checksum alone only when `shared/` has no `verify` command. A `verify` command always runs, whatever the host notes say. You can turn the check on later. The assembly offers it at each start when it finds a verifier on this machine, and the menu item "Host" runs the part again.

The database file `journal.sqlite` sits in the installation directory, next to `bin/`. The binary applies its schema migrations when it opens the file. A database newer than the binary is refused with exit code 6.

Two environment variables serve tests and throwaway runs. `LAWMAN_DB` is the path of the database file, in place of the default `journal.sqlite` next to `bin/`. `LAWMAN_NOW` is a timestamp such as `2026-01-01T00:00:00Z`. It replaces the clock and needs `LAWMAN_DB`. The command `probe` refuses both with exit 1.

## Updates

You update the plugin with your harness. The law then moves ahead of the binary. The next tick of any role completes the update. The role runs `journal law-update <role>`, and the journal does the work. The journal gets the release files, checks the checksum itself, checks the signature with the verifier you chose and runs the new file.

Each call of `law-update` is one pass over these steps. The pass ends at the first step that gives a line to print.

1. It reads `law_commit` and `release_repo` from `config.yaml`. When the file or a key cannot be read, it prints `law current`.
2. It gets the facts of the law folder: the revision, whether the folder holds a local change, and the release tag of the revision. Your `law-version` command gives them. Without that command, the role reads them and answers with options.
3. It checks the revision and `law_commit` against 40 lowercase hexadecimal digits. When the two are equal, it prints `law current`.
4. It checks `release_repo` against its class: `<owner>/<repo>`, with letters, digits, `.`, `_` and `-`, neither part `.` or `..`, and no `-` at the start. A local change stops the pass. So does a revision with no release tag. The tag must hold letters, digits, `.`, `_` and `-`, must not be `.` or `..` and must not start with `-`.
5. It names the asset `journal-bun-<os>-<arch>` for the platform it runs on. The release builds `darwin` and `linux`, with `x64` or `arm64`. Another platform stops the pass.
6. It gets the release files into the folder `runs/sync-<role>-<first seven characters of the revision>` of the installation. Your `release` command does it. Without that command, the role does it.
7. It checks that the asset, its provenance file and `SHA256SUMS` are plain files. A link or a folder in their place counts as missing.
8. It checks the checksum of the asset itself. `SHA256SUMS` needs exactly one line for the asset, with a hash of 64 lowercase hexadecimal digits.
9. It checks the signature. Your `verify` command does it. Without that command, the role does it.
10. It makes the asset executable and runs `<asset> law-sync --tag <tag> --commit <revision> --installation <installation folder>`. The new file swaps itself over `bin/journal`. The journal keeps the `ALARM contract-changed` lines and the line `synced <tag>` from its output and drops the rest.

The command opens no database and writes no tick, because the tick does not exist yet. It writes nothing into the law folder. It changes neither `bin/journal` nor `config.yaml`: only the `law-sync` of the checked file does. It prints fixed lines and values that passed their classes. It never prints a word of the output of your commands. One exception: after the character layer, it prints the `ALARM contract-changed` lines and the first line of the error output of the new binary's `law-sync`.

After a stop at step 6 or later, the journal removes the folder of the release. A failed file operation in these steps is a stop too, never exit 1. These are the failures: the folder cannot be removed or made, a release file cannot be read, or the asset cannot be made executable. After success the folder stays.

### What `law-update` prints

| Line | Meaning |
| :-- | :-- |
| `law current` | There is nothing to update. |
| `self law-version` | The role reads the revision, the local change and the release tag of the law folder. |
| `self release <repo> <tag> <folder> <asset>` | The role puts the asset, its provenance file and `SHA256SUMS` of that release into the folder, which exists. `<folder>` is a path relative to the installation folder, and `<asset>` is a file name. |
| `self verify <asset> <provenance> <repo> <commit>` | The role checks the signature of the asset against the provenance file. `<asset>` and `<provenance>` are paths relative to the installation folder. The journal already checked the checksum. |
| `ALARM …`, then `synced <tag>` | The update is done. |
| `stop <token> <reason>` | The update stopped. |

A stop is an answer and exits 0. A non-zero exit means the command itself failed. The role answers a stop with the token, a colon and the reason, and ends. The next tick tries again.

The paths of the lines `self release` and `self verify` are relative to the installation folder. No field of the line holds a space. The commands `release` and `verify` still get absolute paths. After a `self` line the role does the step and calls the command again. Each call starts at the first step, so it carries every answer given so far. The command keeps no state between calls, except the folder of the release.

```
journal law-update <role> [--revision <revision> --state clean|changed [--tag <tag>]|--revision unreadable] [--release done|missing|failed] [--verify passed|failed|not-run|declined|unnamed]
```

| Option | Answers the line | Value |
| :-- | :-- | :-- |
| `--revision` | `self law-version` | The revision of the law folder, or `unreadable` when it cannot be read. |
| `--state` | `self law-version` | `clean` or `changed`. It is required with a revision. |
| `--tag` | `self law-version` | The release tag of the revision. Leave it out when the revision has none. |
| `--release` | `self release` | `done`, `missing` when the release or a file is absent, or `failed`. |
| `--verify` | `self verify` | `passed`, `failed`, `not-run`, `declined` or `unnamed`. |

- An answer counts only while the file of its operation is absent. A `verify` command always runs, so `passed` or `declined` does not skip it.
- With a `--release` answer while `release` has no file, or a `--verify` answer while `verify` has no file, the pass does not call `release`. It does not build the folder. It checks the files that already lie in the folder, so the answer about the signature covers the bytes that run later.
- `declined` takes the checksum alone. `unnamed` means the host notes name neither a verifier nor a refusal.
- A usage error exits 1. A `<role>` outside its class is one. So are an unknown option, a repeated option, an option with no value and a word outside the list. Usage errors are also `--state` or `--tag` without `--revision`, `--revision` with a revision but no `--state`, and `--revision unreadable` with `--state` or `--tag`. A revision or a tag outside its class is a stop, not a usage error.

### The stops

Every stop carries the token `stopped-law-drift`, except the local change, which carries `stopped-dirty-law`. The list of reasons stays open: a new reason arrives with the path that mends it.

A law folder with a local change at `law_commit` is no stop here: `law-update` prints `law current`, because the revision equals `law_commit`. The tick start then stops with `stopped-dirty-law`.

| Reason | When | What you do |
| :-- | :-- | :-- |
| the law-version command failed | `shared/law-version` did not start, exited non-zero or printed outside its form | Check three places: the execute permission of the file, its exit code and its output form. See [the law-version file](#the-law-version-file). |
| the law folder gives no facts: put a `law-version` command in `shared/`, form in docs/journal.md | No `law-version` command exists, and the role could not read the revision of the law folder | Write the `law-version` file in `shared/`, as [the law-version file](#the-law-version-file) says. |
| a value is not safe | The revision is empty or is not 40 lowercase hexadecimal digits, or `law_commit` is not, or `release_repo` is outside its class | Check the `revision=` line of the command, and `law_commit` and `release_repo` in `config.yaml`. |
| the law folder has a local change | The folder holds a change that its release does not | Restore the law folder to its release, or update the plugin again with your harness. |
| the law is not on a release | The revision carries no release tag | Move the plugin to a released version, or make the `law-version` command print the tag of the revision. |
| the tag is not safe | The tag is outside its class | Use a release tag of letters, digits, `.`, `_` and `-`, which does not start with `-`. |
| no binary for this platform | The release builds no journal for this system or architecture | Run the installation on `darwin` or `linux` with `x64` or `arm64`. |
| binary not ready | The release, or its asset, provenance file or `SHA256SUMS`, is missing, or a file is a link or a folder, or the journal cannot read a release file. A `release` command that exits 2 says the same. | Wait until the release lists the binary, its provenance file and `SHA256SUMS`. If the stop repeats, check that the journal can read the files in the release folder. The next tick tries again. |
| the release download failed | The `release` command did not start, or ended with a failure other than 2, or the journal cannot remove or make the release folder | Check the execute permission and the exit code of `shared/release`, the network, and that the journal can write the folder `runs/` of the installation. |
| the checksum failed | The asset does not match `SHA256SUMS`, or the file has no line or several lines for the asset | Do not run the file. The next tick downloads it again. If the stop repeats, open an issue in Lawman's repository. |
| the check could not run | The `verify` command did not start, or the role could not run the verifier | Check the execute permission of `shared/verify`, or install the verifier that the host notes name. |
| the provenance check failed | The signature check did not confirm the file | Do not run the file. If the stop repeats, open an issue in Lawman's repository. |
| the host notes name neither a verifier nor a refusal | No `verify` command exists, and the host notes name neither a verifier nor a refusal | Run the assembly and its part Host, then name a verifier or decline one. |
| the new binary did not start | The asset did not start on this machine, or the journal cannot make it executable | Check that the machine matches the platform of the asset, and that the journal may change the mode of the files in the release folder. The installation stays as it was. |
| the new binary did not confirm the update | The new file exited 0 and printed no `synced <tag>` line | `bin/journal` may already hold the new file. Open an issue in Lawman's repository. |
| the first line of the new binary's error output, or the new binary failed | The new file refused the update, for example because the skills ask for a newer schema than it has | Read the reason. Before the swap `law-sync` only reads, so the installation stays as it was. |

The start of every tick checks the law folder too, and it has one more reason. See [the check of the law folder](#the-check-of-the-law-folder).

| Reason | When | What you do |
| :-- | :-- | :-- |
| the law folder is not at law_commit | The law folder holds another commit than `law_commit` when a tick starts | Nothing, as a rule: the next tick updates first. If the stop repeats, check that the law folder holds the commit that `law_commit` names. When `config.yaml` has no `release_repo`, the update prints `law current` and cannot mend it: run the assembly. |

`law-sync` renames the new binary over `bin/journal` and rewrites the sync keys of `config.yaml`. Before the swap it only reads, so a failure leaves the installation as it was. It refuses when the skills ask for a newer schema than the binary has.

Never open the database or run SQL on it. The commands below are the only way in.

## Commands

The program prints a usage line on stderr when it gets wrong arguments, then exits 1. Each line in the blocks below follows `usage: journal`. A name that is not a command prints the list of commands.

### Installation and health

- `--version`: prints the version of the binary.
- `probe`: opens the database, applies pending migrations and tries a write that it rolls back. It prints the version, the schema number and the journal mode. `--schema N` exits 6 when N is above the schema of the binary.
- `law-sync`: the checked new binary runs it to swap itself over `bin/journal` and rewrite the sync keys of `config.yaml`. It prints `synced <tag>` and may print an `ALARM contract-changed` line. It does not touch the tracker cache, which `sync` writes.
- `law-update`: makes one pass of the law update and prints one line from [the table](#what-law-update-prints). It runs the checks, and the `law-sync` of the checked file changes the binary and the keys. See [Updates](#updates).

```
journal <--version|probe|precinct|role|dispatch|tick|status|sync|leads|seen|cap|last|case|intake|clean|text|lint-body|lint-page|department-line|precedent|old-precedent|pull|handoff|decider|form|jev|catalog|wake|law-sync|law-update|commands|run|run-installation> [args]
journal probe [--schema N]
journal law-sync --tag <tag> --commit <commit> --installation <folder>
```

### Precincts and roles

- `precinct`: adds a precinct with a weight, sets a weight, or lists precincts with repository, weight, credit and last sync. Setting a weight resets the credit of every precinct to 0. A repository path may have more than two segments, such as `group/sub/project` or `owner/.github`.
- `role set`: records the interval of a role in minutes. The alarms use the interval.

```
journal precinct <add <name> --repo <owner/repo> --weight <n>|set <name> --weight <n>|list>
journal role set <role> --every <minutes>
```

### Orders and ticks

- `dispatch`: `add` writes an order for a role by hand. A repeated open order exits 2. The duty desk writes the other orders.
- `tick`: `start` opens a tick. With `--order`, it takes that order and prints the tick's input, as [the role entry](#the-role-entry) says. With `--role duty-desk` and no order, it starts the tick of the duty desk, as [the duty desk](#the-duty-desk-tick) says. Another role without `--order` exits 1. `continue` carries on an open tick of the duty desk. `input` prints a part of an input. `end` closes a tick with an outcome and a report from stdin, and closes the order it names. `list` prints ticks newest first with their reports.
- `wake`: the role entry. It prints nothing when the role has no takeable order, and the first part of the role's input otherwise. It also records the check, which counts as activity for `role-silent` and, except for the duty desk, toward `no-progress`. See [the role entry](#the-role-entry).

```
journal dispatch add --precinct <p> --role <r> [--department <d>] [--issue <n>]
journal tick <start --role <r> --order <id>|start --role duty-desk|continue <id>|input (<id> [--part <k>]|--role <r> --part <k>)|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]|list (--limit <n>|--id <n>) [--role <r>] [--precinct <p>]>
journal wake --role <r>
```

### Alarms and status

- `status`: prints the open orders, then a line `queue <role> <number> oldest <time>` for each role with open orders, by role name. It then prints the last tick of each role, the open alarms and the lead counts. `oldest` is the time of the oldest open order of the role, as `since` shows it on an `order` line.

No command computes the alarms alone. Every tick start does, and prints a line `ALARM …` for each new alarm. [The pipeline](pipeline.md#alarms) lists the alarms and says who raises each. The start of the duty desk prints the open alarms again, except those it raised itself.

```
journal status
```

### The tracker cache

The journal's cache is refreshed when a role syncs. Issues by bots (an author with `is_bot` set, or a login that starts with `app/`) and issues with no author do not enter the cache. The duty desk syncs every precinct with a weight above zero before it writes stage orders. An order rests on the tracker's state at the start of that tick. A lead filed or closed after that sync is seen at the next tick.

The pull request cache holds every open pull request of the trusted login, with its source issues, its spec vote and its `work`. The duty desk refreshes it right after the issue cache of the same precinct. A failed pull request sync of one precinct writes no order and closes no stale order for that precinct in that tick. It does not end the tick.

- `sync`: writes the cache of the tracker. It replaces the cache of a precinct's issues with the issues form on stdin. The form is one object with the fields `writers` and `issues`. For an issue whose newest court marker is a referral, the sync also derives the answer of a decider from the reactions and comments. The old form, a bare list, exits 4 and leaves the cache untouched. The message tells you to run the assembly, finish any amendment it offers, then choose Host once to rewrite `host.md`. With `--pulls` the sync replaces the pull request cache from the pulls form. It prints the counts. `--reset` lets an empty list replace a filled cache. The sync also stores the texts of the issues, the pull requests and their comments, cleaned as `journal clean` cleans them. Each text is cleaned alone, and only when its content or the journal version changed since the last sync: a sync of unchanged texts cleans nothing. A text that the cleaning cannot process, or that does not finish within 5 seconds, is stored as the fixed line "This text could not be cleaned and is withheld." It is never stored raw or partly cleaned, and the sync goes on. The sync line ends with `withheld=<n>` when the sync withheld texts, and the alarm `withheld-text` names them. To restore a withheld text, edit or delete it on the host and sync again.
- `leads`: lists the open leads of a precinct, or of one department.
- `seen`: answers `none`, `open #n`, `declined #n` or `fixed #n` for a finding id.
- `cap`: prints `cap=<n> open=<k>` for a department of a precinct.
- `last`: prints the last visit of a role to each department of a precinct.
- `case`: prints the stage of an issue as one line of fields. A requirement is a lead of the response unit whose id ends in `required`. The fields are in [Read the stage](../skills/lawman-law/references/tick.md#read-the-stage).
- `intake`: prints `need=` and `state=` for one issue.
- `pull`: prints the stage of a pull request as one line of fields. The fields are in [Read the pull stage](../skills/lawman-law/references/tick.md#read-the-pull-stage).
- `decider`: reads the decider form on stdin and says whether the actor of the last close or reopen is a decider.
- `form`: prints the input form of one kind, `issues`, `pulls`, `decider` or `catalog`, with one example. The issues form holds `writers` and `issues`. Each comment, in the issues form and in the pulls form, carries `id`, `approvedBy` and `rejectedBy`. Both lists are required on every comment. In the issues form they matter only for the comments of the trusted login on open issues. In the pulls form they carry the spec vote and the work state, from the trusted login's comments on open pull requests. Elsewhere they stay empty. The `issues` and `pulls` commands return the whole list and exit non-zero when they cannot. An issue and a pull request may carry `url`, the address that opens it, and the journal keeps it only when it is a plain `http` or `https` address. The journal normalises every time of an input to UTC, as `YYYY-MM-DDTHH:MM:SSZ`, and rejects a value that is not a time.

```
journal sync <precinct> --author <login> [--reset | --pulls]
journal leads <precinct> [--department <d>]
journal seen <precinct> --id <path::symbol::kind>
journal cap <precinct> --department <d>
journal last <precinct> --role <role>
journal case <precinct> <issue>
journal intake <precinct> --issue <n>
journal pull <precinct> <pull request>
journal decider < response.json
journal form <issues|pulls|decider|catalog>
```

### Checks and builders

- `clean`: reads host text on stdin and prints it without hidden comments, secrets and hidden characters, and with each image turned into a link. Plain text is the default form. The option `--json` reads one JSON value or several and cleans every string. A JSON input that does not parse gives exit 1 and no output. A text that cannot be cleaned, or takes more than the time budget, prints as the withheld line, as the sync stores it. The option `--part <k>` prints part `k` of an output longer than one part, as [Parts of clean and text](#parts-of-clean-and-text) says.
- `text`: prints the whole cleaned text that a `full` line names, from the cache, in parts. Its arguments are the words after `full text`, as [Cut texts](#cut-texts) says.
- `lint-body`: reads a text on stdin as the host renders it and prints the cleaned text. Exit 7 prints the reasons on stderr, prints nothing on stdout and never prints the matched value.
- `lint-page`: checks a constitution or a department page on stdin. Exit 8 prints the reasons. A good constitution prints one line per department with its judging document. It then prints one line that starts with `#` for each section the contract does not list. A good department page with an alarm check prints `alarm-check`.
- `department-line`: reads a constitution on stdin and prints it with one Departments line set. Exit 8 when the result fails the page check.
- `handoff`: builds the hand-over comment of the clerk for a pull request and prints it. With `--adopted` it cleans the old body of the pull request first. It never exits with 7.
- `precedent`: reads the newest counted ruling of a case from the journal's cache. It writes its precedent files into the folder `.lawman/precedents/` of a tree. It prints one line for each change: `entry <name> [<reason>]`, `cancel <name or -> [missing]`, `none` or `no-entry <reason>`. A taken name gets the next free one, so no precedent is lost. The model passes no ruling text. A link or a folder in the path that is no plain file or folder gives a non-zero exit and no write. Each new file carries its original list in `departments`, as [constitution](constitution.md) says. It prints `drop <name> <department or ->` for each name the court gave that is no candidate. It prints `drop` only for a file that stays. It prints `ask <name>` for each file it wrote from a new line of the ruling as it stands. It prints `ask` when the precinct allows Jev and the original list is not empty and leaves a candidate out. With `--request <name>` it prints the TypeSafe Jev request body for that file. The body is built from its cache, the tree and the pages of the candidates outside the list. When the body cannot be built, it prints nothing and exits non-zero. With `--answer <name>` it reads the reply and its status line on stdin. It changes only the `departments` field, and only of a file that still holds its original list. It prints one line: `jev model=<model> departments=<a,b|all>`, `jev unchanged` or `jev none reason=<reason>`. A file that the gate refuses gets its cause on stderr: no `ask` line in the write, and `jev none reason=brief` in the answer. Any other error is a fault: it prints on stderr and exits non-zero. A department source in the tree that exists and cannot be read is such a fault. A failed listing of the shared department pages and a case missing from the cache are such faults too. A write call with one writes nothing. The journal sends nothing. The lines that `precedent` prints, `entry`, `cancel`, `drop` and `ask` among them, separate their fields with one tab. The `jev` answer line and the lines of `old-precedent` use spaces.
- `old-precedent`: moves the numbered lines of an old `## Precedents` section of `LAWMAN.md` into precedent files.
  - `list` reads a page on stdin. It prints `line <n> date=<date> link=<yes|no> position=<p>` and the rule in a `rule` fence for each numbered line, and `outside position=<p>` for an item outside the form. `<n>` is the number of the precedent in the section, not an issue. A page with no item prints `none`.
  - `added` prints the same lines for the numbered lines of the page at `--head` whose number the page at `--base` lacks. The base is the page at the merge base of a pull request. For that reason a pull request that is stale after a move gets no moved line. An edited line keeps its number and is not added. A free note is no old line.
  - `check` reads the issues form, without the cache. The precinct's `issues` command gives it. A precinct without that command takes the form on stdin. For each `<line>:<issue>` it prints `line <n> kind=<protects|condemns>` when every counted court ruling on the issue gives one kind. Otherwise it prints `line <n> ask reason=<reason>`. The reasons are `no-issue`, `absent`, `repeated`, `no-ruling`, `mixed`, and `form`. A marker of another stage is no ruling.
  - `move` takes the kind the same way, or the user's `--kind` when the rulings give none. It writes the file `<date>-<gist>.md` into `.lawman/precedents/` of the tree, or `<date>-<gist>-<k>.md` with the next free number `<k>` from 2 when that name is taken. It also takes the line out of `LAWMAN.md` of the tree: both stand, or neither does. A page that is not UTF-8 is refused. The rest of the page keeps its bytes, and a section with no item left reads `none`. The file holds `kind`, `departments: []`, `date` and `ruling`, the link of the line. A tail in parentheses that fails the link class is no link: it stays part of the rule, in the list and in the file. It prints `entry <name>` or `ask reason=<reason>`. A link or a folder in the place of `LAWMAN.md`, `.lawman` or `.lawman/precedents` gives a non-zero exit and no write.
  - When the precinct's `issues` command itself fails, `check` and `move` print `issues failed reason=<reason>` and an `error` fence, as [Failures and their reasons](#failures-and-their-reasons) says. They exit with the code of that failure.
- `jev`: `request` builds the request body for TypeSafe Jev from a brief on stdin. `answer` turns the reply and its status line into one `jev` evidence line. The journal sends nothing.
- `catalog`: checks a precinct's pinned dependencies against the OSV catalog. `request` builds each request and `answer` reads each reply, for the two kinds `batch` and `record`. The journal sends nothing. See [The catalog check](#the-catalog-check).

```
journal clean [--json] [--part <k>] (stdin: host text, or with --json one or more JSON values)
journal text <precinct> <issue|pull> <number> body|comment <at> <j> [--part <k>]
journal lint-body [--no-marker] (stdin: the text to write)
journal lint-page <constitution|department> [--name <expected>] (stdin: the page)
journal department-line --name <department> --judged-by <path|none> (stdin: the constitution)
journal handoff --sources <a,b,…> [--adopted] [--merged <m>] (stdin: the old pull request body, with --adopted)
journal precedent <precinct> --issue <n> --source <ruling comment URL> --tree <folder>
journal precedent <precinct> --issue <n> --tree <folder> --request <name>
journal precedent <precinct> --issue <n> --tree <folder> --answer <name> (stdin: the reply, then the status line)
journal old-precedent list (stdin: the page)
journal old-precedent added --base <file> --head <file>
journal old-precedent check <precinct> <line>[:<issue>]... (stdin: the issues form, when the precinct has no issues command)
journal old-precedent move <precinct> --tree <folder> --line <n> --gist <gist> [--issue <n>] [--kind protects|condemns] (stdin: the same)
journal jev <request|answer> --kind <p0|grade|requirement>
journal catalog request --kind batch --tick <tick id> [--precinct <p>] (stdin with --precinct: the list)
journal catalog answer --kind batch --tick <tick id> (stdin: the reply, then the status line)
journal catalog request --kind record (stdin: a Source line)
journal catalog answer --kind record --id <identifier> (stdin: the reply, then the status line)
```

Cleaning host text has these known limits:

- Specially built Markdown can make cleaning slow. A text that takes more than 5 seconds is withheld.
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

### Parts of clean and text

A part holds at most `input_chars` characters, counted as [the parts of a role's input](#parts) count them. A framed part of `text` or `clean` starts with `lawman input 1 text part <k> of <n>` or `lawman input 1 clean part <k> of <n>`, and ends with `end part <k> of <n>`.

- `clean` prints an output that fits in one part: the same bytes, with no frame, in plain and in `--json` mode. A longer output prints framed parts in both modes. `--part <k>` prints part `k`, and part 1 without it. An output of one part prints unframed, with or without `--part 1`.
- Nothing is cut. `clean` reads standard input, and the journal keeps no copy of it. The caller sends the same reply again with `--part <k>` for each other part it needs.
- The journal cleans the whole text before it splits it. In `--json` mode it cleans each string. Each value is one line, and a line longer than a part is cut into pieces of characters. A piece of a long value is not JSON.
- The option order is `clean [--json] [--part <k>]`. Another order, or a part that is not a whole number above zero, exits 1 with the usage line. A part outside the output exits 1 too.
- `text` always frames its part, even when the text fits in one part. Its parts split by lines, as the input does, and a line longer than a part is cut into characters.

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

The installation has three operations: `release`, `verify` and `law-version`. Their files sit in `shared/`. The update of the binary uses them. [The operations of the installation](#the-operations-of-the-installation) give their forms.

### The commands

- `commands`: prints `folder <folder>`, the folder the journal found, then one line per operation: `<operation> command` when the file is there, `<operation> empty` otherwise. Without a precinct it lists the operations of the installation, in the order `release`, `verify`, `law-version`. With a precinct it lists the operations of the precinct. The `empty` lines are the steps that the role does itself. A precinct with no folder in `configs/` has every operation empty.
- `run`: runs one operation of a precinct, as the role's entry runs it.
  - `issues` and `pulls` take `--author <login>`, and `issues` takes `--reset`, as `sync` does. They update the cache by the same path and print the same counts as `sync`.
  - `fetch` prints `revision=<revision>`.
  - `identity` prints `login=<login>`.
  - `file` prints the text in a `file` fence, `files` the list in a `files` fence.
  - `decider` prints what `journal decider` prints on the same form.
  - An operation without a command prints `<operation> empty` and exits 0.
  - The arguments pass their classes before the journal looks for the file. An argument for the command outside its class gives `reason=argument` even for an empty operation.

A wrong number of arguments, an unknown operation or a precinct that the journal does not list is a usage error with exit 1. The messages name only what the journal itself holds.

```
journal commands [<precinct>]
journal run <precinct> <fetch|identity|files <revision>|file <revision> <path>|decider <issue|pull> <number>|issues --author <login> [--reset]|pulls --author <login>>
```

### The operations of the installation

The update runs these operations through `shared/`. Each runs as [How a command runs](#how-a-command-runs) says, with no time limit. The journal reads the exit code of each: a number, or none when a signal ended the file. It reads the output of `law-version` only. It prints the output of none of them.

An operation with a file is ready, and the role does not do its step. A ready operation that fails stops the update. An operation without a file is a step that the role does itself.

#### `release`

- Arguments, in order: `release_repo`, the tag, the destination folder and the asset name.
- The destination folder is `runs/sync-<role>-<first seven characters of the revision>` in the installation, as an absolute path. The journal removes an old folder of that name and creates it empty. It builds the path from a role and a revision that passed their classes.
- The asset name is `journal-bun-<os>-<arch>` for the platform that the journal runs on.
- Result: the folder holds three plain files of the release of that tag. They are the asset, `<asset>.sigstore.json` and `SHA256SUMS`.
- Exit 0: done. Exit 2: the release or a file does not exist, which stops the update with "binary not ready". Any other exit, or an end by signal: a failure, which stops it with "the release download failed".
- The journal passes no credential. The download needs no account on the host of the release.

#### `verify`

- Arguments, in order: the absolute path of the asset, the absolute path of its provenance file, `release_repo` and the commit. The commit is the revision of the law folder, the commit that the tag names. Both paths lie in the folder of the release.
- Result: exit 0 only when the verifier confirmed three facts. The statement names the digest of the file itself. The release workflow of `release_repo` signed it. That workflow built the file from the commit it got. The verifier takes its root of trust from the signature system and never from the release.
- Exit 0: confirmed. Any other exit, or an end by signal: not confirmed, which stops the update with "the provenance check failed". A file that does not start stops it with "the check could not run".

#### The law-version file

- The file is `law-version` in `shared/`. It must be executable. Put it there when the law folder has no history to read, for example when your harness puts the plugin there as plain files.
- One argument: the absolute path of the law folder, which is `lawman` in the installation.
- The command prints exactly three lines in this order, and each line ends in `\n` or `\r\n`:

```
revision=<revision>
changed=<yes|no>
tag=<tag>
```

- `revision` is the commit of the law folder, the same kind of value as `law_commit`: 40 lowercase hexadecimal digits.
- `changed` is `yes` when the law folder holds a change that its release does not, and `no` otherwise.
- `tag` is the release tag of the revision, the tag that names a release with assets. It is empty, as `tag=`, when the revision has no release tag. The word `none` is an ordinary tag.
- The command exits 0.
- The output is in form when it is valid UTF-8 and holds these three lines, in this order, with no other line. A value is any text on one line, and a value may be empty. The value of `changed` is `yes` or `no` only. A file that does not start, a non-zero exit, a signal or an output outside the form stops the update with "the law-version command failed". The check at the start of a tick reads such a file as an absent one and hands the facts to the role.
- A value in form still passes its class. A revision outside its class, an empty one included, stops the update with "a value is not safe". A tag outside its class stops it with "the tag is not safe". An empty tag means no tag. The journal judges nothing more about the tag. The step that gets the release judges it: with no release it says "binary not ready".
- With the file in `shared/`, the update and the check at the start of a tick need no step of the role. They get the facts of the law folder themselves. Without it, the role reads the revision and the state itself.

#### Running an operation of the installation

`run-installation` runs one operation of the installation the way the update runs it. The assembly uses it to prove a command before it writes the command into the installation.

```
journal run-installation <release <repo> <tag>|verify <asset> <provenance> <repo> <commit>|law-version>
```

- It opens no database and needs no precinct.
- The arguments pass the classes of `law-update`. `release_repo` has two segments and the tag is the release tag class. The commit is 40 lowercase hexadecimal digits.
- `release`: the journal removes the folder `runs/installation-release` of the database folder and creates it empty. It passes its absolute path and the asset name of this platform. On success it prints `release done folder=runs/installation-release asset=<asset>`.
- `verify`: the asset and the provenance file are paths relative to the database folder, inside `runs/`. Each is a plain file, and no link stands on the way. The journal builds nothing and passes the absolute paths. On exit 0 it prints `verify passed`.
- `law-version`: the journal passes the law folder, `lawman` in the database folder. Output in form prints the three facts, `revision=<revision>`, `changed=<yes|no>` and `tag=<tag>`. Output outside the form, or not UTF-8, prints `law-version stop the law-version command failed`. A revision outside its class prints `law-version stop a value is not safe`, a tag outside its class `law-version stop the tag is not safe`. Each stop exits 5.
- An operation without a file prints `<operation> empty` and exits 0.
- A failure prints `<operation> failed reason=<reason>` and an `error` fence, as `run` does. The reasons are `argument`, `start`, `exit` and `clean`. The fence holds the cleaned standard error after `exit`.
- The journal prints no word of the standard output of `release` and `verify`. Of `law-version` it prints only the three facts in their classes.

### The classes of the arguments

The journal checks every argument against its class before the command runs. An argument outside its class never reaches the command.

- A name of a precinct, a role or a department starts with a lowercase letter and holds lowercase letters, digits and `-`.
- A login is a string of ASCII letters, digits, `.`, `_` and `-`. It does not start with `.` or `-`.
- A name of a precedent is a string of ASCII letters, digits, `.`, `_` and `-`. It starts with a letter or a digit.
- An outcome of `tick end --outcome` is a token that [the law](../skills/lawman-law/references/LAW.md#one-tick-one-case-exit) names, or `skipped-<slug>` or `stopped-<slug>`. A slug holds lowercase letters, digits and `-`. The journal refuses any other token.
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
| `form` | the output is outside the operation's form, or a reader refused it | the journal's message, with the form for a reader's refusal | 4 |
| `clean` | a cleaning library failed | nothing, because the library's message can quote the input | 5 |

The text inside the `error` fence passes the character layer of the cleaning. Every refusal of the readers of `issues`, `pulls` and `decider` prints as `form` inside the fence. The refusals are an empty list over a filled cache without `--reset`, and a broken cache constraint. A comment id that repeats has its own message.

### Fences

The journal prints foreign text inside a fence of `~` characters. The fence line carries the kind as its info string, such as `~~~file`. The fence is longer than any run of `~` in the cleaned text, so no line inside closes it. The fence adds no change to the text, except that it drops one final line break. A tilde fence also sits safely inside a harness that wraps the output in backticks.

The kinds are `issue`, `comment`, `pull`, `file`, `files`, `error`, `title`, `constitution`, `department`, `lint`, `precedent` and `rule`. Other kinds join as the journal prints more foreign text.

### Texts in the cache

The cache holds the texts of issues, pull requests and comments after the cleaning of `journal clean`. The output of `file` and `files` and the text of `error` are data, not Markdown. They pass the character layer, which removes hidden characters and masks secrets. A text prints as the sync stored it.

A printed issue or pull request is its body in an `issue` or `pull` fence, then each comment, by time and then by id. Each comment has a `comment at=<time>` line and a `comment` fence. The first line inside that fence is `id="<id>" author="<login>"`, written as JSON strings, or `author=null` when the host gave no author.

## The role entry

The role entry tells whether a role has work and gives the role what it reads at the start. It comes in two calls. The first reads only local files. The second, the start of the tick, runs the commands of the precinct and prints the case.

### No work and work

`journal wake --role <r>` records the check of the role. A role has work when it has an order it can take. A taken order stays takeable; orders nobody took come first. An order of patrol on a precinct with weight 0 cannot be taken. The check counts as activity for the alarm `role-silent`. It also counts toward the alarm `no-progress`. A check that finds an order it can take adds one. A check that finds none starts the count again. `tick input --role <r> --part <k>` counts nothing.

- No work: the journal prints nothing and exits 0. The output is the same at every check, and a broken `config.yaml` does not change it.
- Work: the journal prints the first part of the role group. The first line carries the check time, so the output changes at every check.
- The duty desk always has work. Its group has no orders. Its check counts as activity for `role-silent` and adds nothing to the `no-progress` count.

The entry runs no command and touches no network. It writes only the check time and the check count of the role. A broken database exits non-zero and prints nothing.

### The role group

The role group is the local part of the input. Its blocks come in this order:

1. The sections of the law that the role reads at the start. A line `law <path>` stands before the sections of each file. The path is relative to `lawman/skills/lawman-law/references/`, as in `law LAW.md` and `harness harnesses/hermes.md`.
2. The section `Silence` of the harness page. The key `harness` of `config.yaml` names the page. A line `harness <path>` stands before it.
3. One line per order the role can take, up to the number of jobs of the role (`jobs` in `config.yaml`, see [configuration](configuration.md#jobs-and-progress-checks)). Orders nobody took come first, then taken ones. Within each group the oldest order comes first. Patrol lists its orders by weight: the precinct that the credit picks first, then by credit plus weight, then by name. Taking a patrol order moves the credit. Each precinct with an order that can be taken gains its weight, and the precinct taken loses the sum.

Every line of a law section and of the harness page prints behind `| `, and an empty line prints as `|`. After the prefix the text follows byte for byte. So no line of the group starts with a backtick, whatever the law holds. A line without the prefix is a line of the journal.

A section is its heading and everything up to the next heading of the same or a higher level. The intro is everything before the first second-level heading. The sections of a file print in the order of the document. A Markdown parser finds the headings.

| Role | Law |
| :-- | :-- |
| patrol | `LAW.md` (intro, Role patrol, Silence is the default, Writing, Exhibits, Third-party text, Execution, Sources, Recorded reasons, Texts of the precinct, Precedents, One tick, one case, exit, Alarms a role prints, Returns instead of stops, Write discipline, Dedupe, Terms, The cap table, Five-part report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Sync the tracker, Check the constitution, Resolve the department page, Alarm), `markers.md` (Line shape, Fields, The `id` value, Defined markers), `departments.md` (whole) |
| response-unit | `LAW.md` (intro, Role response unit, Silence is the default, Writing, Exhibits, Third-party text, Execution, Recorded reasons, Texts of the precinct, Precedents, One tick, one case, exit, Alarms a role prints, Write discipline, Terms, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Reading without a tree, Sync the tracker, Check the intake order, Check the constitution, Write a comment, Alarm), `markers.md` (The `id` value) |
| investigation | `LAW.md` (intro, Role investigation, Silence is the default, Writing, Exhibits, Third-party text, Execution, Sources, Texts of the precinct, Precedents, One tick, one case, exit, Alarms a role prints, Returns instead of stops, Write discipline, Terms, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Sync the tracker, Read the stage, Check the constitution, Resolve the department page, Write a comment, Alarm) |
| prosecutor | `LAW.md` (intro, Role prosecutor, Silence is the default, Writing, Exhibits, Third-party text, Execution, Sources, Recorded reasons, Requirement parts, Texts of the precinct, Precedents, One tick, one case, exit, Alarms a role prints, Returns instead of stops, Write discipline, Closure classes, Terms, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Reading without a tree, Sync the tracker, Read the stage, Check the constitution, Resolve the department page, Write a comment, Close the issue, Alarm) |
| defender | `LAW.md` (intro, Role defender, Silence is the default, Writing, Exhibits, Third-party text, Execution, Sources, Recorded reasons, Requirement parts, Texts of the precinct, Precedents, One tick, one case, exit, Alarms a role prints, Returns instead of stops, Write discipline, Closure classes, Terms, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Reading without a tree, Sync the tracker, Read the stage, Check the constitution, Resolve the department page, Write a comment, Close the issue, Alarm) |
| court | `LAW.md` (intro, Role court, Silence is the default, Writing, Exhibits, Third-party text, Execution, Sources, Recorded reasons, Requirement parts, Texts of the precinct, Precedents, One tick, one case, exit, Alarms a role prints, Returns instead of stops, Write discipline, Closure classes, Terms, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Reading without a tree, Sync the tracker, Read the stage, Check the constitution, Resolve the department page, Write a comment, Close the issue, Alarm), `markers.md` (Precedent) |
| clerk | `LAW.md` (intro, Role clerk, Silence is the default, Writing, Third-party text, Execution, One tick, one case, exit, Alarms a role prints, Write discipline, Closure classes, Terms, Pairs, Votes and work, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Sync the tracker, Sync the pull requests, Read the stage, Check the decider, Write a comment, Close the issue, Alarm) |
| spec-writer | `LAW.md` (intro, Role spec writer, Silence is the default, Writing, Exhibits, Third-party text, Execution, Texts of the precinct, Precedents, One tick, one case, exit, Write discipline, Terms, Votes and work, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Reading without a tree, Sync the pull requests, Read the pull stage, Check the constitution, Write a comment) |
| executor | `LAW.md` (intro, Role executor, Silence is the default, Writing, Third-party text, Execution, Orders, Texts of the precinct, Precedents, One tick, one case, exit, Write discipline, Terms, Votes and work, Three-line report, Journal exit codes, The leak rule, Hard constraints), `tick.md` (common sections, Sync the pull requests, Read the pull stage, Check the constitution, Write a comment) |
| duty-desk | `LAW.md` (Role duty desk, Silence is the default, One tick, one case, exit, Alarms a role prints, Alarms the journal computes), `tick.md` (intro, Parts, Sync the law, Sync the tracker, Sync the pull requests) |

`LAW.md` and `markers.md` print by section, as the table names them. No role gets `LAW.md` whole, and every section of `LAW.md` reaches at least one role. `departments.md` prints whole for patrol. The common sections of `tick.md` are the intro, Parts, One end, Sync the law, Working rules, Instructions and evidence, Fetch the precinct and End the tick. The section "Sync the law with an older journal" belongs to no group of a role. No input prints it. A role reads it from the file when it finds a binary outside the form, as [the lines of the input](#the-lines-of-the-input) say.

A file, a section, `config.yaml` or the key `harness` that the journal cannot read stands as a self line in place of its block. `<harness>` stays as it is in that line when no harness is named.

### The start of the tick

`journal tick start --role <r> --order <id>` runs these steps in order. A start of another role than the duty desk with no `--order` is a usage error and exits 1.

1. The order must belong to the role, be open and be takeable. Otherwise the journal prints `order <id> untakeable` alone and starts no tick. Otherwise it starts the tick.
2. It computes the alarms and prints each `ALARM` line of a new alarm.
3. It reads `trusted_login` from `config.yaml`.
4. It checks the law folder, as [the check of the law folder](#the-check-of-the-law-folder) says.
5. It runs the operation `identity` and compares the login with `trusted_login`, ignoring ASCII case.
6. It takes the order in one transaction, after it checks again that the order is free. It records the precinct, the department and the order in the tick, and prints the order line.
7. It checks the fields of the order. An issue role needs an issue number, the spec writer and the executor a pull request number. A patrol order has a department and no issue number.
8. It runs `fetch`.
9. It runs `issues` and `pulls` as the role needs them, with `trusted_login` as the author. They update the cache by the same path as `run`.
10. When `fetch`, `issues` or `pulls` gave a self line, the start prints its lines and stops. The role does those steps itself and then runs `tick input <tick id>`.
11. It reads the stage. `case` is for the issue roles but the response unit. `intake` is for the response unit, and `pull` for the spec writer and the executor. The line prints as the command prints it.
12. For the roles that read a constitution, it lists the files at the revision and reads `LAWMAN.md`. The check of `lint-page constitution` prints in a `lint` fence, the text in a `constitution` fence.
    For the roles that get precedents, it reads each direct `.md` file of `.lawman/precedents/` from the same list. It prints the line `precedent <name> kind=<protects|condemns|-> departments=<a,b|all|->` and the whole file in a `precedent` fence, by name. An empty or missing folder prints `precedents none`, and so does a folder where no file serves the role's department. A value outside its class prints `-`. A department list outside its class reads as all departments. The prosecutor, the defender, the court, the spec writer and the executor get all precedents. Investigation gets those of the case's department. Patrol gets those of the visit's department. The stage of the response unit names no department, so it gets all precedents. A department `-` gets all precedents. The clerk gets none.
13. For patrol, the defender and the court, it resolves the department page. Patrol takes the department from the order, the defender and the court from the stage. `-` means no page. The places are `.lawman/departments/<d>.md` of the precinct, `departments/<d>.md` of the installation and the page of the law, in that order. A failed check never falls through. The line `department <d> place=<1|2|3>` stands before the fences. The check prints in a `lint` fence, the page in a `department` fence.
14. It prints the texts: the issue title in a `title` fence, then the issue or the pull request from the cache. The clerk also gets the pull request of the stage's `pull` field. A text longer than one part is cut, as [cut texts](#cut-texts) says.
15. The self lines come last.

A failed or empty operation prints the lines of `run` and a self line, and the start goes on. For `fetch`, `issues` and `pulls` it stops at step 10. Only a usage error and a broken database exit non-zero.

### The outcomes the journal writes

The journal ends the tick itself when the outcome follows from what it read. Before the order is taken, the tick ends without it, and the order stays open for the next start. After, the order closes with the same outcome in the same transaction.

The order of a tick that never ended stays open; a later tick of its role takes it.

| Outcome | Report |
| :-- | :-- |
| `failed` | `config.yaml is missing`, `config.yaml has no trusted_login`, `config.yaml has no law_commit` (before the order is taken) |
| `stopped-law-drift`, `stopped-dirty-law` | The reasons of [the check of the law folder](#the-check-of-the-law-folder) (before the order is taken) |
| `stopped-identity-changed` | `Host identity changed: <login>` (before the order is taken) |
| `silent` | `No order.` when the order was closed first |
| `failed` | `The order has no issue number`, `The order has no pull request number`, `The patrol order has an issue number or no department`, `The stage check failed` |
| `silent` | `Order stale: <stage line>` |
| `skipped-no-constitution` | `No constitution at <revision>` |
| `skipped-contract-version`, `skipped-bad-constitution` | `Constitution check failed at <revision>` |
| `stopped-bad-department` | `Department page check failed: <d>`, or `The department name is not safe` |

The stale rules of the issue roles and the pull request roles are the rules of their skills. An order closes as stale only after the sync of the same start.

An ended tick prints one part, `part 1 of 1`, whatever its size. Its last lines are `ended <outcome>` and `report <report>`. It prints no `title`, `constitution`, `department` or `precedent` fence and no case text. A constitution or department outcome prints only its `lint` fence. The role then only answers.

### The check of the law folder

The start of every tick checks the law folder against `law_commit` before it reads the host. A role does it before the identity check and before it takes the order. The duty desk does it before it visits a precinct.

1. A `law_commit` that cannot be read ends the tick `failed`, with the report `config.yaml has no law_commit`.
2. With a `law-version` command, the journal runs it. A command that fails, exits non-zero or prints outside its form is treated as an absent one: item 4 applies.
3. The journal then judges the facts in this order. Each report is a fixed text without a value.
   - A revision or a `law_commit` outside the 40 lowercase hexadecimal digits ends the tick `stopped-law-drift` with the report `a value is not safe`.
   - A local change ends it `stopped-dirty-law` with the report `the law folder has a local change`.
   - A revision that differs from `law_commit` ends it `stopped-law-drift` with the report `the law folder is not at law_commit`.
4. Without the command, or when it failed, the start prints the line `self law-version` and goes on. The role reads the revision and the local change of the law folder itself, as soon as it has read its group. It compares the revision with `law_commit` in the same order of judgement. Its stop ends the tick and the order with the same outcome.

The check ignores the tag. The journal writes the end of the tick itself. It takes no order for a stopped role, as for `stopped-identity-changed`. A stopped duty desk reads no host and writes no order.

The journal records the stop of the duty desk as an ended tick. The answer of the duty desk reaches you as any stop of the duty desk does. Three such stops in a row raise the alarm `tick-failing`.

### The duty desk tick

`journal tick start --role duty-desk` starts the tick of the duty desk. It takes no order and no `--precinct`. The journal does the work of the tick, and the duty desk model answers with what the journal prints.

The start runs these steps in order.

1. It writes the tick, computes the alarms and prints the open alarms again, except those it raised in this start. The `ALARM` lines print first.
2. It reads `config.yaml`. A missing file or a missing `trusted_login` ends the tick `failed`.
3. It checks the law folder, as [the check of the law folder](#the-check-of-the-law-folder) says. A stop ends the tick here, before any precinct is read.
4. For each precinct with a weight above zero, by name, it runs the operations `identity`, `issues` and `pulls`, with `trusted_login` as the author. A different login ends the tick `stopped-identity-changed`. A failed tracker sync ends it `stopped-sync`. A failed pull request sync leaves the precinct without orders for every role.
5. An operation with no command, or a failed `identity`, gives a line `self <step> <precinct> <repo>`. The step is `identity`, `issues` or `pulls`. A law folder with no `law-version` command gives the line `self law-version`. It names no precinct and stands first among the self lines. When any self line stands, the start prints the `ALARM` lines and the self lines, and stops. The tick stays open and has written no order. On the path of `self law-version` the start has already run the host sync of item 4, so the issue cache may hold what it read.
6. Otherwise it reads each precinct whose tracker and pull requests were synced in this tick: `fetch`, `LAWMAN.md` and the page of a patrol department. It only reads. It records, for each precinct, whether the constitution is missing, fails its check or is usable.
7. It closes the stale orders of those precincts. An order closes when nobody took it and the stale rule of its role says stale. A stage that the cache cannot give closes nothing. Patrol has no stale rule. On a precinct whose constitution is missing or fails its check, it also closes the untaken orders of the roles that need the constitution.
8. It writes the orders. Investigation, the prosecutor, the defender, the court, the clerk, the spec writer and the executor each get one order per due case or pull request. The cache shows what is due. The response unit gets one for each issue that waits for it. Patrol gets one for each precinct with no open patrol order, in the department that the rotation and the cap choose. A precinct of weight 0 gets none. A precinct whose constitution is missing or fails its check gets only the orders of the clerk, which does not read the constitution. An open order of the same role, precinct and issue is the only bar.
9. It ends the tick `ordered`, when it wrote an order, and `silent` otherwise. A precinct that was skipped goes into the report under Blockers. A failing `law-version` command is no stop, and the report names it under Blockers.

The output is one part, framed as the tick group. It holds the `ALARM` lines, the `order` lines of the orders written, `ended <outcome>` and the lines `report <line>`. A start that stopped on self lines holds the `ALARM` lines and the self lines.

`journal tick continue <tick id>` carries on the open tick of the duty desk after the self steps. It runs steps 6 to 9 and prints no `ALARM` line. A tracker of a precinct with a weight above zero that was not synced in this tick ends the tick `stopped-sync`. An ended tick, an unknown tick and the tick of another role exit 1 with a message that names the id. They read no host and write no order. The journal does not keep the result of the identity check, so the continuation trusts the duty desk on it. It trusts the duty desk on the law folder too, and checks nothing of it again.

A duty desk tick that the model ends itself uses `tick end <tick id> --outcome <token>`, as the skill says.

### The lines of the input

`<form>` is the version of the input's form. It is `1`. A role tells the form of an output by it. A binary outside the form is a binary older than the law. It prints no line that starts with `lawman input`. Without work it prints the one line `idle`. With work it prints a line `order <id>` for each order and a last line `at <time>`. So an output that is not empty, and whose first line does not start with `lawman input`, comes from a binary outside the form. The role then updates the journal by the section "Sync the law with an older journal" of `tick.md` and takes its input again. An empty output still means no work. The fields of a line are separated by one space.

The frame of a part:

- the first line of the part that `wake` prints: `lawman input <form> role=<role> at=<time> part 1 of <n>`;
- the first line of a part of the role group that `tick input --role` prints: `lawman input <form> role=<role> part <k> of <n>`;
- the first line of a part of the tick group: `lawman input <form> role=<role> tick=<tick id> part <k> of <n>`;
- the first line of a part of `text`: `lawman input <form> text part <k> of <n>`, also when the text has one part;
- the first line of a part of `clean`, when its output has more than one part: `lawman input <form> clean part <k> of <n>`;
- the last line of every part: `end part <k> of <n>`.

The role group:

- `law <path>`;
- `| <line of the law or the harness page>`, and `|` for an empty line;
- `harness <path>`;
- `order <id> <precinct> <repository> <department|-> <issue or pull request number|->`.

The tick group:

- `order <id> <precinct> <repository> <department|-> <issue or pull request number|->`;
- `order <id> untakeable`, without a frame, the only line of the output;
- the `ALARM` lines of the new alarms;
- `login=<login>`, `revision=<revision>` and the sync counts as `journal run` prints them;
- the stage line as `case`, `intake` or `pull` prints it;
- `link <precinct>#<number> <url>`, right after the stage line, when the cache holds the link of the order's issue or pull request. The role copies it onto an alarm about that case;
- `department <d> place=<1|2|3>`;
- `precedent <name> kind=<protects|condemns|-> departments=<a,b|all|->` and `precedents none`;
- `comment at=<time>` as the print of the cache gives it;
- `cut kept=<head>+<tail> of=<n> secrets=<s>` and `full text <precinct> <issue|pull> <number> body|comment <at> <j>` for a cut text, as [cut texts](#cut-texts) says;
- `<operation> empty`, `<operation> failed reason=<reason>` and the `error` fence as `journal run` prints them;
- `self <step>`;
- `ended <outcome>`, then `report <report>`.

### Self steps

A line `self <step>` names a step that the journal could not do. The role does it itself. In the role group the line stands in place of its block. In the tick group the lines come last, and `self law-version` stands first among them. The list stays open: a step joins it with every new block.

The line `self law-version` of the tick group is not the line that `law-update` prints. The first belongs to the check at the start of a tick, and its stop ends the tick. The second asks for the facts of an update, and the facts that differ from `law_commit` start the update, as [Updates](#updates) says.

| Step | What the role does |
| :-- | :-- |
| `law-version` | the check of the law folder: reads the revision and the local change, and compares the revision with `law_commit` |
| `identity` | the row `identity` of the table of self steps in the intro of `tick.md`, the identity check |
| `fetch` | the section "Fetch the precinct" of `tick.md` |
| `issues` | the section "Sync the tracker" |
| `pulls` | the section "Sync the pull requests" |
| `stage` | the section "Read the stage", "Check the intake order" or "Read the pull stage" |
| `constitution` | the section "Check the constitution" |
| `precedents .lawman/precedents/` | reads the direct `.md` files of that folder at the revision, and the filter by department of its role |
| `department <d>` | the section "Resolve the department page" |
| `department` | the same section, for a name outside its class. The line leaves the name out. The name comes from another place: the skill or the order |
| `issue <n>`, `pull <m>` | the read of the issue or the pull request that its skill names |
| `law <path> <section>` | reads that section of the law file, `intro` for the intro and nothing for the whole file |
| `harness <path> <section>` | reads that section of the harness page |

### Parts

The size of a part is the key `input_chars` of `config.yaml`, 16 000 without the key. The size counts Unicode characters of the content, fence lines included, each line with its line break. The first and the last line of a part do not count. The same key sets the size at which a case text is cut, and the part size of `text` and `clean`. See [cut texts](#cut-texts) and [parts of clean and text](#parts-of-clean-and-text).

- Each group splits on its own. A group within the size is one part.
- A split falls between blocks. A block longer than the size splits by lines, a line longer than the size by characters. Each piece of a law line keeps the prefix. Each piece of a foreign text gets a fence of its own with the same kind. A `comment at=` line goes with the fence of its comment.
- A cut case text is one block. Its pieces and its two journal lines stay in one part.
- When the role group splits, its orders take the last part or parts. The parts of the law and the page then stay the same while the orders change, and the count changes only with the law folder. The role takes the order id from the last part. The duty desk has no orders.
- A part without its last line was cut from the end by the harness.

`journal tick input --role <r> --part <k>` builds the role group again and prints part `k`. The journal stores no role group. The content of a part stays the same while the law folder and the orders of that part stay the same.

The journal stores the tick group when it builds it. `journal tick input <tick id> --part <k>` prints a stored part. `tick end` and an end by the journal clear the parts.

The output of a start that stopped on its own steps is one part and is not stored. `journal tick input <tick id>`, with or without `--part <k>`, then builds the tick group from the cache and stores it. It prints part `k`, or the first part. When the tick group is already stored, it prints the stored first part instead. It prints the stage line and the texts. A failed stage check gives the self line `stage`. The constitution, the precedents and the department page become self lines. It ends no tick and applies no stale rule.

An unknown tick, an ended tick, a role without an input and a part outside the group are usage errors with exit 1.

### Cut texts

A case text is the body of its issue or pull request, and each comment of it. A body's block is one fence of its kind, `issue` or `pull`. A comment's block is one fence of kind `comment`, with a `comment at=<time>` line before it. The first line inside a comment's fence is `id=… author=…`. When a block, counted with its fence lines and its `comment at=` line, is longer than `input_chars`, the journal cuts it. The cut keeps the start and the end of the text and removes the middle:

```
~~~issue
<the first lines of the text>
~~~
cut kept=<head>+<tail> of=<n> secrets=<s>
full text <precinct> issue <number> body
~~~issue
<the last lines of the text>
~~~
```

- The start is the first whole lines of the text, and the end the last whole lines. The two pieces together get the largest number of characters for which the cut block fits in one part. Each piece gets at most half of that number. A first or last line that does not fit in its half is cut by characters. The head keeps the start of the first line, and the tail keeps the end of the last line. A shorter line stays whole.
- The `cut` line starts with the word `cut` and holds `kept=`, `of=` and `secrets=`, each with its value. `kept=<head>+<tail>` gives the characters of the start and of the end. `of=` gives the characters of the whole text inside the fence, including the `id=… author=…` line of a comment. `secrets=` gives the number of secret marks in the removed middle. Numbers count characters, each line with its line break.
- The `full` line starts with the words `full text`. After them come the precinct, `issue` or `pull`, the number, and `body` or `comment <at> <j>`. Those words are the arguments of `text`.
- A comment is named by its time `at` and by its number `j`. `j` counts from 1 among the comments with that time, in id order. A comment added with another time does not change `j`. A comment added with the same time and a smaller id does.
- Never cut: the title, the constitution, a department page, the precedents and the orders. They split by lines, and a journal line is never cut. A text that fits in its part prints unchanged, byte for byte.
- A cut block stays in one part with its two journal lines, so no part ends between a piece and its `cut` line. A part too small for even the shortest cut does not cut the text. It splits the text by lines.

The command `text` prints the whole text that a `full` line names, from the cache:

```
journal text <precinct> <issue|pull> <number> body|comment <at> <j> [--part <k>]
```

It prints part `k` of the cached text as the sync stored it, 1 without the option. The parts are framed as [parts of clean and text](#parts-of-clean-and-text) says. It reads the cache, not the host, and it needs no open tick, so it works after a tick ends. It exits 0 on success. It exits 1 for a usage error, for a part outside the text, for a text the cache lacks, and when the cleaning library fails. A text the cache lacks gets a message that says to read the host itself, as for a self step.

### What the input leaves out

The input never prints:

- the author and the labels of an issue, the state and the title of a pull request;
- the files a role reads later in its work: `skills/clerk/references/jobs.md`, `skills/executor/references/work.md`, `skills/executor/references/gate.md`, `exhibits.md` and the license pages;
- the tree of a precinct and the results of a search.

## The catalog check

The patrol of the department `vulnerabilities` and the investigation of its leads use `catalog`. The journal builds every request and reads every reply. It opens no socket and starts no process. The role sends what the journal printed, with a send form of the harness page, and hands the reply back unread. The check works on any harness whose page carries those forms. The Hermes page carries them today, in its section "Sending to the catalog". A harness whose section says none cannot send, so the patrol ends its tick and reports that the check did not run. See [harnesses](harnesses.md).

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

A part fails when the status line is missing or is `000` (no reply came). It also fails when the status is not 200 or when the reply cannot be read. A reply is unreadable when it is not JSON or when its result count differs from the part's entry count. It is also unreadable when it carries a next-page token or when a record identifier lies outside its class. The reason is `no-reply` for the first two, `status-<code>` for another status and `bad-answer` for an unreadable reply. A failed part is never an empty result. The journal follows no next-page token and retries nothing.

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
| 4 | Invalid sync input |
| 5 | A command of the installation or of a precinct failed |
| 6 | Database newer than the binary, or a schema version above the supported one was requested |
| 7 | Body check rejection |
| 8 | Page check rejection |

`law-update` adds no code. A stop is an answer and exits 0, and a usage error exits 1. Code 4 covers `run` too, as the table of failure reasons says. It prints the form that the input broke, with an example. Neither sync has a ceiling on the size of its list. The law lists the codes in [LAW.md](../skills/lawman-law/references/LAW.md).

A role treats exit 2 as silence. Skills cite the other codes by number.

## Source files

- [journal.ts](../journal/src/journal.ts): the command table. The other files of [the source folder](../journal/src/) hold one command or one part each.
- [tick.md](../skills/lawman-law/references/tick.md): the command forms that roles run.

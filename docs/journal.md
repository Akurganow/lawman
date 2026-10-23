# The journal

The journal is the memory of an installation. It is one program on Bun with SQLite. It keeps the precincts, the orders, the ticks, the alarms and a cache of each tracker. Every role asks it what to do next and records what it did.

The journal reads and writes local files only. It makes no network request. It runs no version-control tool and no hosting tool. Roles hand it host data on standard input, in the input forms that `journal form` prints.

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
journal <--version|probe|precinct|role|next|dispatch|tick|alarm|status|sync|leads|seen|cap|last|rotation|case|due|intake|clean|lint-body|lint-page|department-line|precedent|precedent-merge|pull|handoff|decider|form|jev|wake|law-sync> [args]
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
- `tick`: `start` opens a tick and prints its id. `end` closes it with an outcome and a report from stdin, and closes the order it names. `list` prints ticks newest first with their reports.
- `due`: prints the precinct and the number of the next case or pull request that a role is due on. It prints nothing when the role has an open order.
- `rotation`: reads department names on stdin and prints each with its last visit and its cap, in rotation order.
- `wake`: the run gate. It prints `idle`, or one `order <id>` line per takeable order and a `day <date>` line. It also records the check.

```
journal dispatch <add --precinct <p> --role <r> [--department <d>] [--issue <n>]|take --role <r>>
journal tick <start --role <r>|end <id> --outcome <token> [--precinct <p>] [--department <d>] [--dispatch <id>]|list (--limit <n>|--id <n>) [--role <r>] [--precinct <p>]>
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

- `sync`: replaces the cache of a precinct's issues with the issues form on stdin. With `--pulls` it replaces the pull request cache from the pulls form. It prints the counts. `--reset` lets an empty list replace a filled cache.
- `leads`: lists the open leads of a precinct, or of one department.
- `seen`: answers `none`, `open #n`, `declined #n` or `fixed #n` for a finding id.
- `cap`: prints `cap=<n> open=<k>` for a department of a precinct.
- `last`: prints the last visit of a role to each department of a precinct.
- `case`: prints the stage of an issue, with the next role, the round, the returns, the commit, the clerk's job and the pull request.
- `intake`: names the next human-written issue that waits for the response unit. With `--issue` it prints `need=` and `state=` for one issue.
- `pull`: prints the stage of a pull request, with the next role, the spec vote, the executor's work state, the sources and the priority.
- `decider`: reads the decider form on stdin and says whether the actor of the last close or reopen is a decider.
- `form`: prints the input form of one kind, `issues`, `pulls` or `decider`, with one example. The journal normalises every time of an input to UTC, as `YYYY-MM-DDTHH:MM:SSZ`, and rejects a value that is not a time.

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
journal form <issues|pulls|decider>
```

### Checks and builders

- `clean`: reads host text on stdin and prints it without hidden comments, secrets and hidden characters, and with each image turned into a link. Plain text is the default form. The option `--json` reads one JSON value or several and cleans every string. A JSON input that does not parse gives exit 1 and no output.
- `lint-body`: reads a text on stdin as the host renders it and prints the cleaned text. Exit 7 prints the reasons on stderr, prints nothing on stdout and never prints the matched value.
- `lint-page`: checks a constitution or a department page on stdin. Exit 8 prints the reasons. A good constitution prints one line per department with its judging document. A good department page with an alarm check prints `alarm-check`.
- `department-line`: reads a constitution on stdin and prints it with one Departments line set. Exit 8 when the result fails the page check.
- `handoff`: builds the hand-over comment of the clerk for a pull request and prints it. With `--adopted` it cleans the old body of the pull request first. It never exits with 7.
- `precedent`: reads a ruling comment on stdin and adds its numbered precedent line to a constitution file. It prints `entry <n>`, `none` or `no-entry <reason>`.
- `precedent-merge`: resolves a conflict in the Precedents section. It moves the lines that a pull request added after the highest number of the main branch.
- `jev`: `request` builds the request body for TypeSafe Jev from a brief on stdin. `answer` turns the reply and its status line into one `jev` evidence line. The journal sends nothing.

```
journal clean [--json] (stdin: host text, or with --json one or more JSON values)
journal lint-body [--no-marker] (stdin: the text to write)
journal lint-page <constitution|department> [--name <expected>] (stdin: the page)
journal department-line --name <department> --judged-by <path|none> (stdin: the constitution)
journal handoff --sources <a,b,…> [--adopted] [--merged <m>] (stdin: the old pull request body, with --adopted)
journal precedent --page <path> --source <ruling comment URL> (stdin: the ruling comment)
journal precedent-merge --base <file> --ours <file> --theirs <file> --out <file>
journal jev <request|answer> --kind <p0|grade>
```

Cleaning host text has these known limits:

- Specially built Markdown can make cleaning slow. The journal sets no limit.
- A token split by emphasis markup is not masked.
- Cleaning writes host text back as normalised Markdown. Escapes and formatting can differ from the original.

Among other things, the body check rejects these in the text a role writes:

- a secret, such as a token or a private key
- a hidden character
- an image embed
- an HTML comment other than the marker
- a last line that is not a valid marker, unless `--no-marker` says the text has none

It cleans a quote and does not reject it. It checks no path, no mention and no size.

See [the law](../skills/lawman-law/references/LAW.md) for when roles call it.

## Exit codes

| Code | Meaning |
| :-- | :-- |
| 0 | Success |
| 1 | Usage, argument or input error |
| 2 | Duplicate open order |
| 3 | Issue sync ceiling reached |
| 4 | Invalid sync input |
| 6 | Database newer than the binary, or a schema version above the supported one was requested |
| 7 | Body check rejection |
| 8 | Page check rejection |

Code 5 is not used. Code 4 prints the form that the input broke, with an example. The issue sync ceiling is 1000 records. A list of exactly that size is rejected and never truncated. The pull request sync has no ceiling. The law lists the codes in [LAW.md](../skills/lawman-law/references/LAW.md).

A role treats exit 2 as silence. Skills cite the other codes by number.

## Source files

- [journal.ts](../journal/src/journal.ts): the command table.
- [db.ts](../journal/src/db.ts): the exit codes and the database path.
- [form.ts](../journal/src/form.ts): the input forms and their examples.
- [migrations.ts](../journal/src/migrations.ts): the schema.
- [law-sync.ts](../journal/src/law-sync.ts): the update command.
- [clean-host.ts](../journal/src/clean-host.ts): the cleaning of host text.
- [clean-quote.ts](../journal/src/clean-quote.ts): the cleaning of quotes.
- [tick.md](../skills/lawman-law/references/tick.md): the command forms that roles run.

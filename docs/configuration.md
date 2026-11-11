# Configuration

An installation keeps its settings in one file, `config.yaml`. The file holds the facts that only your installation knows. They are the harness, the trusted login, the delivery routes and the release that the journal came from.

## Where it lives

`config.yaml` sits in the installation directory. The directory also holds:

- `lawman/`, the link to the plugin folder
- `bin/journal`, the journal binary
- `journal.sqlite`, the database
- `precincts/`, the clones of the precincts
- `runs/`, where the journal makes the release folder of an update, the folder of `run-installation` and the catalog state of a tick, and where roles keep their trees
- `host.md`, the host notes
- `configs/` and `shared/`, the commands of the precincts and of the installation
- `departments/`, the installation's own department pages, when it has any

See [the journal](journal.md).

The file stays in the installation. It never enters a precinct, a pull request, an issue or a commit. Only `host.md` holds such facts beside it.

The file holds plain `key: value` lines. There is one line per key and no nesting.

## The commands

The journal looks for `configs/` and `shared/` in the folder of its database, which is the installation directory.

- `configs/<precinct>/` holds the commands of one precinct and the files they need.
- `shared/` holds the commands of the installation and the files they need. The installation has three: `release`, `verify` and `law-version`. The update of the journal uses them. See [the operations of the installation](journal.md#the-operations-of-the-installation).

A command reads only and never writes to the host. The assembly writes each command with your consent, and only after the command passed a proof. The proof runs the command through the journal on a temporary database that lies outside the installation, then compares the output with what the host reports. The file that passed is the file the assembly writes. A command that fails its proof is not written. An operation without a command is a step that the role does itself, and a command you leave empty removes its file. See [the commands](journal.md#commands-of-the-installation-and-the-precincts).

A command carries the facts it reads, such as the repository on the host, the tool, the place of the tracker and the account. The issues and the pull requests of a precinct may live in another tracker than its repository host, or in a source without a host. A command must not send the host a request beyond the host's limits, and a request that the host refuses for its size fails the proof.

Each command is either proved in the scheduler's environment or not. A proof there is a short paid run of the harness's default model, and the assembly asks your consent once for each pass. Without it, the command is proved in the environment of the assembly's session, and the summary names it as not proved in the scheduler's environment.

## What it never holds

`config.yaml` never holds a key or a token value. The key `typesafe_key` says where the TypeSafe API key lives, in words or as a variable name. The assembly never asks for the value, never prints it and never stores it.

## The host notes

`host.md` sits beside `config.yaml`. The assembly writes it in its part Host, and the roles only read it. It holds the facts of this machine about the repository host, and no value of a key or a token.

- The host, the tool that reaches it, the account the host reports for that tool and the place where its credential lives.
- How the host keeps issues and their templates, and anything particular to this host.
- The action record: for each host action that the role skills name, how this machine does it with the chosen tool. That includes handing host data to the journal in its forms. `journal form` prints them. Three actions serve the move of the old precedents: reading a file at the revision of a pull request, writing to the branch of a pull request and turning the link of an old precedent line into an issue number. The notes keep every line, even when a command now does the same work, because the roles read the notes for the steps they do themselves.
- The verifier of Lawman's release, or the record that you declined one. An update uses it only when `shared/` has no `verify` command. The assembly replaces the record of the binary check only after the commands of the installation passed their proof.
- The section `## Dependency reading`, with one line `- <precinct name>: <words>` for each precinct that said yes to the catalog check. The words say which dependencies to check, where they are listed and by what way they are read, or `none` when the precinct lists no dependencies. You and the assembly agree the line when the precinct joins or when the assembly asks for the missing answer. The way never runs code of the precinct or a tool that the precinct configures. The patrol reads the line and checks only what it names. A precinct that said yes and has no line gets no check. Rewriting the notes in part Host keeps every line of this section.
- The section `## License reading`, with one line `- <precinct name>: <words>` for each precinct that said yes to the license question. Nested lines under it hold the blocks of the agreed license sources, which the assembly copies word for word from the file of each row. You see the whole entry before the assembly writes it. The entry says, for each ecosystem of the precinct, whether its lock records the license and which sources are agreed, in order. It also keeps the rows you refused. It holds `none` when nothing is agreed. Rewriting the notes in part Host keeps every line of this section too.

The menu item "Host" runs the part again, for a change of tool. It also writes and proves the commands of the installation, and it can install a verifier. It never changes `trusted_login`. After a change of tool, its summary names the precincts whose commands were proved for the earlier tool. The job "re-check a precinct" proves them again. See [the journal](journal.md#where-it-comes-from).

## The fifteen keys

```
harness: hermes
law_commit: 0123456789abcdef0123456789abcdef01234567
release_tag: v0.0.0
release_repo: example/lawman
journal_sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
trusted_login: example-login
deliver: example-platform
typesafe: no
typesafe_precincts: none
typesafe_key: none
catalog: no
catalog_precincts: none
license_precincts: none
contract_version: 4
amended_law_commit: 0123456789abcdef0123456789abcdef01234567
```

Every value above is a placeholder. `hermes` and `openclaw` are the names of the shipped harness pages. The order follows the assembly skill.

Three more keys are optional: `input_chars`, `jobs` and `progress_checks`. The assembly does not require them. `input_chars` sets the size of one part of a role's input, in Unicode characters. Without it the size is 16 000. The same size is the cut size of a case text longer than one part, and the part size of `text` and `clean`. The harness page names a size that fits its output limit. When the page names one and the key is absent, the assembly writes it, and it never overwrites a key that is there. The assembly shows `jobs` and `progress_checks` with their current values or defaults and writes them only when you change a value. `law-sync` fills a missing one from its defaults. A value outside the whole numbers above zero is asked again. A value of `input_chars` that is not a whole number above zero makes the role's input exit 1 when the role has work, and makes `text` and `clean` exit 1. See [the journal](journal.md#the-role-entry) and [cut texts](journal.md#cut-texts).

| Key | Meaning | Written by |
| :-- | :-- | :-- |
| `harness` | The name of the harness page, without `.md`. | The assembly at install |
| `law_commit` | The commit of the plugin folder at install or at the last sync. | The assembly at install, then `law-sync` |
| `release_tag` | The tag of the release that the law and the journal came from. | The assembly at install, then `law-sync` |
| `release_repo` | The `<owner>/<repo>` of that release. | The assembly at install |
| `journal_sha256` | The SHA-256 of `bin/journal`. | The assembly at install, then `law-sync` |
| `trusted_login` | The login that the repository host reports for the chosen tool when the assembly ran. Every role uses this one identity. | The assembly at install |
| `deliver` | The delivery routes for alarms, failures and stops of the law sync or the duty desk, one or several. | The assembly at install |
| `typesafe` | `yes` or `no`. Whether the court may use TypeSafe Jev as evidence for a priority, and whether the clerk may ask it which departments to add to those the court named for a precedent. | The assembly at install |
| `typesafe_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the court may send its brief and the clerk its precedent request. | The assembly when it adds a precinct |
| `typesafe_key` | The place where the assembly found the TypeSafe API key, or where you will put it, in words. `none` when TypeSafe is off. Never the value. | The assembly at install, or `law-sync` as a default |
| `catalog` | `yes` or `no`. Whether the patrol may check the dependencies of a precinct against the OSV catalog. An absent key reads as no. | The assembly at install, or when it asks the missing answer |
| `catalog_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the patrol may send the precinct's packages. A precinct with no pair reads as no. | The assembly when it adds a precinct, or when it asks the missing answer |
| `license_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the `licenses` department is in the rotation and may read a license source. A precinct with no pair reads as no. | The assembly when it adds a precinct, or when it asks the missing answer |
| `jobs` | The number of orders a session of each role takes, as `<role>=<n>` pairs. See [Jobs and progress checks](#jobs-and-progress-checks). | `law-sync` as a default |
| `progress_checks` | How many checks in a row may find a takeable order and take none before `no-progress` rises. | `law-sync` as a default |
| `contract_version` | The constitution contract version that the precinct constitutions stand at. | The assembly at install and at amend |
| `amended_law_commit` | The law commit at which the precinct constitutions were last brought in line. | The assembly at install and at amend, or `law-sync` as a default |

## Jobs and progress checks

The key `jobs` sets how many orders a session of a role takes, one tick for each order. Its value is a list of `<role>=<n>` pairs separated by spaces. The role entry lists at most that many orders, and the role runs one tick for each.

| Role | Jobs |
| :-- | :-- |
| patrol | 1 |
| response-unit | 2 |
| investigation | 1 |
| prosecutor | 1 |
| defender | 1 |
| court | 1 |
| clerk | 3 |
| spec-writer | 1 |
| executor | 1 |

- The journal reads only the nine roles of the shared tick. The duty desk has no number, because it covers every precinct with a weight above zero.
- A pair that names another role is not read.
- A number is a whole number above zero, with no sign and no leading zero. A pair outside that form is not read.
- When a role has several readable pairs, the first one wins.
- The value `none`, a missing key and a role with no readable pair give the default of the table.
- The journal reads the key at every role entry, so a change acts at once.

The key `progress_checks` is a whole number above zero. The alarm `no-progress` rises when that many checks of a role entry in a row find a takeable order and no take. A take, or a check that finds no takeable order, starts the count again. A value outside the form reads as 3, which is the default. See [the pipeline](pipeline.md#alarms).

## Who writes it

The assembly writes the file at install, after the commands of the installation passed their proof, so that a stopped proof leaves no `config.yaml` behind. It writes `config.yaml` with the fifteen keys and reads it back. If a key is missing or empty, it stops. It requires none of the three optional keys.

After a plugin update, the next tick of any role completes the update, with the journal command `law-update`. It gets the journal of the new release, checks its checksum itself and checks its signature with your `verify` command or the verifier in the host notes. Then it runs the `law-sync` command of that file. The command `law-sync` writes `law_commit`, `release_tag` and `journal_sha256`. It also fills a missing key from its defaults. The defaults cover `typesafe_key`, `amended_law_commit`, `jobs` and `progress_checks`. The last two take the values of the table above. The first becomes `environment variable TYPESAFE_API_KEY` when `typesafe` is `yes`, and `none` otherwise. The second takes the value that `law_commit` held before the update. A key that is already there stays as it is. It does not fill `catalog`, `catalog_precincts` or `license_precincts`. Only the assembly writes them, because only you can consent.

No role replaces `bin/journal` or `config.yaml` by any other means.

The assembly writes `contract_version` and `amended_law_commit` again when it amends the precinct constitutions. If the new law carries another constitution contract version, `law-sync` prints an `ALARM contract-changed` line, and `law-update` passes it on. Run the assembly to amend. See [constitution](constitution.md).

The assembly sets `typesafe_precincts` per precinct. When `typesafe` is `yes`, it asks whether the court may send its brief about a conviction in that precinct to `api.typesafe.ai`. It writes the pair `<precinct>=<answer>` and replaces any earlier pair of that name. The question names both uses, the address of the service, whether the repository is private or public, what each use sends and that no issue text leaves. It also says that the service charges for each input token. The same answer allows the clerk's request about the departments to add to a precedent. Answers given for the court's brief allow that request too. The assembly states this once as a fact in the summary of an update and asks nothing. Precedents come from convictions and acquittals, so the request goes for both. The consent covers only the request to Jev. The court names the departments of a precedent, and the journal checks them, without consent: nothing leaves the machine for that.

The assembly sets `catalog_precincts` per precinct in the same way, when `catalog` is `yes`. It then agrees the reading way with you for each precinct that said yes. An installation that predates the keys has neither. Run the assembly: it sees the missing answer and asks only that. A skip writes `no`. A cancel writes nothing, so the question returns at the next start. No role stops for a missing key, and no alarm or chat message goes out.

The assembly sets `license_precincts` per precinct in the same way. It also writes the section `## Licenses` of the constitution. For an existing constitution it opens a pull request from the branch `lawman/licenses-sources`. For a precinct without one, the section goes into the draft of the same pull request. See [constitution](constitution.md).

After an update, the tick that synced the law prints one line, `Licenses: run the Lawman assembly and answer the license question for <precinct names>.` It names each precinct that has weight and no pair in `license_precincts`. A yes or a no removes the line.

## What leaves the machine

Roles read no network. Four exceptions exist: the catalog check of the patrol, the record read of the investigation, the license reading of both, and TypeSafe Jev for the court and the clerk. All are off until you say yes.

- The patrol sends the names and versions of the pinned packages of a precinct, with their ecosystems, to the OSV service at `api.osv.dev`. It does so for a private repository too. The paths of your tree do not leave.
- The investigation sends one record identifier to the same service for a lead of the catalog check.
- The service sees the address of the installation that sends.
- The list leaves again at every visit of the department, even when the tree did not change, because the catalog changes without a commit.
- Lawman states nothing about how the service keeps what it receives.
- A license source gets only what the file of its row names, at every visit, and sees the address of the installation. The patrol and the investigation read a license source only when three things hold. The precinct said yes in `license_precincts`. Its entry under `## License reading` agrees the row. Its section `## Licenses` has no `sources` line, or has one that names the row and is not `none`. A `sources` value outside its form reads as `none`. The assembly sends nothing to a source. The patrol finds the way to read it and checks it on its first request of each row in a visit. A row that fails the check shows in Coverage as `unread` or `status-<code>`. Its User-Agent names `lawman`, `release_tag` and `release_repo`, and never the repository of the precinct.
- An expert may receive a license identifier or a quote of a clause. It never receives a package name or a path.
- The court sends its brief about a conviction to TypeSafe at `api.typesafe.ai`. The brief states facts about the code in the court's own words.
- The clerk sends one request to the same service for each new precedent file whose list leaves a candidate department out. It holds the rule of the precedent, the court's words from the Verdict and Grounds sections of the ruling, and whether the ruling convicts or acquits. It also holds the names and the Mission sections of the candidate departments outside that list, the precinct's own pages included. The Mission sections of the departments in the list stay. Neither the court nor the clerk sends the body of an issue.

The rows, each with the file that says what it receives:

- [`deps-dev`](../skills/assembly/references/license-sources/deps-dev.md)
- [`pypi-json`](../skills/assembly/references/license-sources/pypi-json.md)
- [`npm-registry`](../skills/assembly/references/license-sources/npm-registry.md)
- [`crates-io`](../skills/assembly/references/license-sources/crates-io.md)
- [`rubygems`](../skills/assembly/references/license-sources/rubygems.md)
- [`nuget-spec`](../skills/assembly/references/license-sources/nuget-spec.md)
- [`packagist`](../skills/assembly/references/license-sources/packagist.md)
- [`hackage`](../skills/assembly/references/license-sources/hackage.md)
- [`crandb`](../skills/assembly/references/license-sources/crandb.md)
- [`metacpan`](../skills/assembly/references/license-sources/metacpan.md)
- [`vcpkg`](../skills/assembly/references/license-sources/vcpkg.md)
- [`luarocks`](../skills/assembly/references/license-sources/luarocks.md)
- [`clojars`](../skills/assembly/references/license-sources/clojars.md)
- [`opam`](../skills/assembly/references/license-sources/opam.md)
- [`elm`](../skills/assembly/references/license-sources/elm.md)
- [`jsr`](../skills/assembly/references/license-sources/jsr.md)
- [`cocoapods`](../skills/assembly/references/license-sources/cocoapods.md)
- [`debian`](../skills/assembly/references/license-sources/debian.md)
- [`ubuntu`](../skills/assembly/references/license-sources/ubuntu.md)
- [`clearly-defined`](../skills/assembly/references/license-sources/clearly-defined.md)
- [`conda-forge`](../skills/assembly/references/license-sources/conda-forge.md)
- [`revision-file`](../skills/assembly/references/license-sources/revision-file.md)
- [`software-heritage`](../skills/assembly/references/license-sources/software-heritage.md)
- [`hex`](../skills/assembly/references/license-sources/hex.md)
- [`homebrew`](../skills/assembly/references/license-sources/homebrew.md)
- [`nimble`](../skills/assembly/references/license-sources/nimble.md)
- [`pub-dev`](../skills/assembly/references/license-sources/pub-dev.md)
- [`conan`](../skills/assembly/references/license-sources/conan.md)

## Who reads it

Ticks read the keys they need.

- The start of every tick reads `law_commit` and `trusted_login`. It stops with `stopped-law-drift` when the law folder holds another commit, and with `stopped-dirty-law` when the folder holds a local change. The journal checks the folder itself when the installation has a `law-version` command, and the role does it otherwise. The tick stops with `stopped-identity-changed` when the account that the host reports differs from `trusted_login`.
- The update reads `law_commit` and `release_repo`.
- The duty desk reads `license_precincts` when it picks the department of a patrol order. The law's page for licenses serves only a precinct with a pair.
- The commands `precedent` and `old-precedent` read `trusted_login`.
- The command `precedent` reads `typesafe` and `typesafe_precincts` for the Jev request. It reads `license_precincts` for the pages it reads.
- The court reads `typesafe`, `typesafe_precincts` and `typesafe_key`. It allows Jev only when `typesafe` is exactly `yes` and the precinct pair is `yes`.
- The clerk applies the same rule through the journal, which reads `typesafe` and `typesafe_precincts` itself. The clerk reads only `typesafe_key`.
- The patrol reads `catalog`, `catalog_precincts` and the precinct's line under `## Dependency reading` in `host.md`. The check runs only when `catalog` is exactly `yes`, the precinct pair is `yes` and the line names a way. Otherwise the tick ends with an ordinary outcome, and its report says that the check did not run.
- The investigation reads `catalog` and `catalog_precincts`. Without consent it sends nothing and leaves the lead's catalog line in Not established.
- The patrol and the investigation read `license_precincts`, the section `## Licenses` of the constitution and the precinct's entry under `## License reading` in `host.md`. A license source is read only when three things hold. The pair is `yes`. The entry agrees the row. The section has no `sources` line, or has one that names the row and is not `none`. Without them the tick ends with an ordinary outcome, and its report says that the check did not run.
- The assembly reads `deliver` when it creates the scheduled jobs.
- The alarms read `progress_checks` every time the journal computes them.
- The role's input reads `jobs`, `harness` and `input_chars` when it builds its group: at `wake` with work, and at `tick input --role`. The start of a tick that takes an order reads `input_chars` and `trusted_login`. `tick input <tick id>` reads `input_chars` when it builds the tick group, and the commands `text` and `clean` read it too. A missing `harness` key, or a value outside `[a-z][a-z0-9-]*`, leaves the harness section to the role. See [the journal](journal.md#the-role-entry).

See [the pipeline](pipeline.md) for the checks that open every tick.

## Source files

- [assembly skill](../skills/assembly/SKILL.md): the key list and the rules for the file.
- [install](../skills/assembly/references/install.md): the steps that write the keys.
- [commands](../skills/assembly/references/commands.md): how the assembly proves and writes a command.
- [precinct](../skills/assembly/references/precinct.md): the commands of a precinct and the move of the old precedents.
- [amend](../skills/assembly/references/amend.md): the steps that update the contract keys.
- [catalog](../skills/assembly/references/catalog.md): the mode that asks the missing catalog answers.
- [law-sync](../journal/src/law-sync.ts): the command that rewrites the sync keys.

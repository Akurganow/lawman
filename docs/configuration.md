# Configuration

An installation keeps its settings in one file, `config.yaml`. The file holds the facts that only your installation knows. They are the harness, the trusted login, the delivery routes and the release that the journal came from.

## Where it lives

`config.yaml` sits in the installation directory. The directory also holds `lawman/`, the link to the plugin folder, `bin/journal`, `host.md`, `configs/` and `shared/`. See [the journal](journal.md).

The file stays in the installation. It never enters a precinct, a pull request, an issue or a commit. Only `host.md` holds such facts beside it.

The file holds plain `key: value` lines. There is one line per key and no nesting.

## The commands

The journal looks for `configs/` and `shared/` in the folder of its database, which is the installation directory.

- `configs/<precinct>/` holds the commands of one precinct and the files they need.
- `shared/` holds the commands of the installation and the files they need.

A command reads only and never writes to the host. The assembly writes each command with your consent. An operation without a command is a step that the role does itself. See [the commands](journal.md#commands-of-the-installation-and-the-precincts).

## What it never holds

`config.yaml` never holds a key or a token value. The key `typesafe_key` says where the TypeSafe API key lives, in words or as a variable name. The assembly never asks for the value, never prints it and never stores it.

## The host notes

`host.md` sits beside `config.yaml`. The assembly writes it in its part Host, and the roles only read it. It holds the facts of this machine about the repository host, and no value of a key or a token.

- The host, the tool that reaches it, the account the host reports for that tool and the place where its credential lives.
- How the host keeps issues and their templates, and anything particular to this host.
- The action record: for each host action that the role skills name, how this machine does it with the chosen tool. That includes handing host data to the journal in its forms. `journal form` prints them.
- The verifier of Lawman's release, or the record that you declined one.
- The section `## Dependency reading`, with one line `- <precinct name>: <words>` for each precinct that said yes to the catalog check. The words say which dependencies to check, where they are listed and by what way they are read, or `none` when the precinct lists no dependencies. You and the assembly agree the line when the precinct joins or when the assembly asks for the missing answer. The way never runs code of the precinct or a tool that the precinct configures. The patrol reads the line and checks only what it names. A precinct that said yes and has no line gets no check. Rewriting the notes in part Host keeps every line of this section.
- The section `## License reading`, with one line `- <precinct name>: <words>` for each precinct that said yes to the license question. Nested lines under it hold the blocks of the agreed license sources, which the assembly copies word for word from the file of each row. You see the whole entry before the assembly writes it. The entry says, for each ecosystem of the precinct, whether its lock records the license and which sources are agreed, in order. It also keeps the rows you refused. It holds `none` when nothing is agreed. Rewriting the notes in part Host keeps every line of this section too.

The menu item "Host" runs the part again, for a change of tool. It never changes `trusted_login`. See [the journal](journal.md#where-it-comes-from).

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
contract_version: 3
amended_law_commit: 0123456789abcdef0123456789abcdef01234567
```

Every value above is a placeholder. `hermes` is the name of the one shipped harness page. The order follows the assembly skill.

One more key is optional. `input_chars` sets the size of one part of a role's input, in Unicode characters. Without it the size is 16 000. The harness page names a size that fits its output limit. A value that is not a whole number above zero makes the role's input exit 1 when the role has work. Nobody writes the key for you. See [the journal](journal.md#the-role-entry).

| Key | Meaning | Written by |
| :-- | :-- | :-- |
| `harness` | The name of the harness page, without `.md`. | The assembly at install |
| `law_commit` | The commit of the plugin folder at install or at the last sync. | The assembly at install, then `law-sync` |
| `release_tag` | The tag of the release that the law and the journal came from. | The assembly at install, then `law-sync` |
| `release_repo` | The `<owner>/<repo>` of that release. | The assembly at install |
| `journal_sha256` | The SHA-256 of `bin/journal`. | The assembly at install, then `law-sync` |
| `trusted_login` | The login that the repository host reports for the chosen tool when the assembly ran. Every role uses this one identity. | The assembly at install |
| `deliver` | The delivery routes for alarms, failures and stops of the law sync or the duty desk, one or several. | The assembly at install |
| `typesafe` | `yes` or `no`. Whether the court may use TypeSafe Jev as evidence for a priority. | The assembly at install |
| `typesafe_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the court may send its brief. | The assembly when it adds a precinct |
| `typesafe_key` | The place where the assembly found the TypeSafe API key, or where you will put it, in words. `none` when TypeSafe is off. Never the value. | The assembly at install, or `law-sync` as a default |
| `catalog` | `yes` or `no`. Whether the patrol may check the dependencies of a precinct against the OSV catalog. An absent key reads as no. | The assembly at install, or when it asks the missing answer |
| `catalog_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the patrol may send the precinct's packages. A precinct with no pair reads as no. | The assembly when it adds a precinct, or when it asks the missing answer |
| `license_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the `licenses` department is in the rotation and may read a license source. A precinct with no pair reads as no. | The assembly when it adds a precinct, or when it asks the missing answer |
| `contract_version` | The constitution contract version that the precinct constitutions stand at. | The assembly at install and at amend |
| `amended_law_commit` | The law commit at which the precinct constitutions were last brought in line. | The assembly at install and at amend, or `law-sync` as a default |

## Who writes it

The assembly writes the file at install. It writes `config.yaml` with the fifteen keys and reads it back. If a key is missing or empty, it stops.

After a plugin update, the next tick of any role completes the update. The role downloads the journal of the new release and verifies it. Then it runs the `law-sync` command of that file. The command writes `law_commit`, `release_tag` and `journal_sha256`. It also fills a missing key from its defaults. In this release the defaults cover `typesafe_key` and `amended_law_commit`. The first becomes `environment variable TYPESAFE_API_KEY` when `typesafe` is `yes`, and `none` otherwise. The second takes the value that `law_commit` held before the update. It does not fill `catalog`, `catalog_precincts` or `license_precincts`. Only the assembly writes them, because only you can consent.

No role replaces `bin/journal` or `config.yaml` by any other means.

The assembly writes `contract_version` and `amended_law_commit` again when it amends the precinct constitutions. If the new law carries another constitution contract version, `law-sync` prints an `ALARM contract-changed` line. Run the assembly to amend. See [constitution](constitution.md).

The assembly sets `typesafe_precincts` per precinct. When `typesafe` is `yes`, it asks whether the court may send its brief about a conviction in that precinct to `api.typesafe.ai`. It writes the pair `<precinct>=<answer>` and replaces any earlier pair of that name.

The assembly sets `catalog_precincts` per precinct in the same way, when `catalog` is `yes`. It then agrees the reading way with you for each precinct that said yes. An installation that predates the keys has neither. Run the assembly: it sees the missing answer and asks only that. A skip writes `no`. A cancel writes nothing, so the question returns at the next start. No role stops for a missing key, and no alarm or chat message goes out.

The assembly sets `license_precincts` per precinct in the same way. It also writes the section `## Licenses` of the constitution. For an existing constitution it opens a pull request from the branch `lawman/licenses-sources`. For a precinct without one, the section goes into the draft of the same pull request. See [constitution](constitution.md).

After an update, the tick that synced the law prints one line, `Licenses: run the Lawman assembly and answer the license question for <precinct names>.` It names each precinct that has weight and no pair in `license_precincts`. A yes or a no removes the line.

## What leaves the machine

Roles read no network. Three exceptions exist: the catalog check of the patrol, the record read of the investigation and the license reading of both. All are off until you say yes.

- The patrol sends the names and versions of the pinned packages of a precinct, with their ecosystems, to the OSV service at `api.osv.dev`. It does so for a private repository too. The paths of your tree do not leave.
- The investigation sends one record identifier to the same service for a lead of the catalog check.
- The service sees the address of the installation that sends.
- The list leaves again at every visit of the department, even when the tree did not change, because the catalog changes without a commit.
- Lawman states nothing about how the service keeps what it receives.
- A license source gets only what the file of its row names, at every visit, and sees the address of the installation. The patrol and the investigation read a license source only when three things hold. The precinct said yes in `license_precincts`. Its entry under `## License reading` agrees the row. Its section `## Licenses` has no `sources` line, or has one that names the row and is not `none`. A `sources` value outside its form reads as `none`. The assembly sends nothing to a source. The patrol finds the way to read it and checks it on its first request of each row in a visit. A row that fails the check shows in Coverage as `unread` or `status-<code>`. Its User-Agent names `lawman`, `release_tag` and `release_repo`, and never the repository of the precinct.
- An expert may receive a license identifier or a quote of a clause. It never receives a package name or a path.

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

- Every role reads `law_commit` and `trusted_login`. A role stops with `stopped-law-drift` when the law folder holds another commit. It stops with `stopped-identity-changed` when the account that the host reports differs from `trusted_login`.
- The court reads `typesafe`, `typesafe_precincts` and `typesafe_key`. It allows Jev only when `typesafe` is exactly `yes` and the precinct pair is `yes`.
- The patrol reads `catalog`, `catalog_precincts` and the precinct's line under `## Dependency reading` in `host.md`. The check runs only when `catalog` is exactly `yes`, the precinct pair is `yes` and the line names a way. Otherwise the tick ends with an ordinary outcome, and its report says that the check did not run.
- The investigation reads `catalog` and `catalog_precincts`. Without consent it sends nothing and leaves the lead's catalog line in Not established.
- The patrol and the investigation read `license_precincts`, the section `## Licenses` of the constitution and the precinct's entry under `## License reading` in `host.md`. A license source is read only when three things hold. The pair is `yes`. The entry agrees the row. The section has no `sources` line, or has one that names the row and is not `none`. Without them the tick ends with an ordinary outcome, and its report says that the check did not run.
- The assembly reads `deliver` when it creates the scheduled jobs.
- The role's input reads `harness` and `input_chars` when the role has work, and `trusted_login` at the start of a tick with an order. A missing `harness` key, or a value outside `[a-z][a-z0-9-]*`, leaves the harness section to the role. See [the journal](journal.md#the-role-entry).

See [the pipeline](pipeline.md) for the checks that open every tick.

## Source files

- [assembly skill](../skills/assembly/SKILL.md): the key list and the rules for the file.
- [install](../skills/assembly/references/install.md): the steps that write the keys.
- [amend](../skills/assembly/references/amend.md): the steps that update the contract keys.
- [catalog](../skills/assembly/references/catalog.md): the mode that asks the missing catalog answers.
- [law-sync](../journal/src/law-sync.ts): the command that rewrites the sync keys.

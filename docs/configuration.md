# Configuration

An installation keeps its settings in one file, `config.yaml`. The file holds the facts that only your installation knows. They are the harness, the trusted login, the delivery routes and the release that the journal came from.

## Where it lives

`config.yaml` sits in the installation directory. The directory also holds `lawman/`, the link to the plugin folder, `bin/journal` and `host.md`. See [the journal](journal.md).

The file stays in the installation. It never enters a precinct, a pull request, an issue or a commit. No other file holds such facts.

The file holds plain `key: value` lines. There is one line per key and no nesting.

## What it never holds

`config.yaml` never holds a key or a token value. The key `typesafe_key` says where the TypeSafe API key lives, in words or as a variable name. The assembly never asks for the value, never prints it and never stores it.

## The host notes

`host.md` sits beside `config.yaml`. The assembly writes it in its part Host, and the roles only read it. It holds the facts of this machine about the repository host, and no value of a key or a token.

- The host, the tool that reaches it, the account the host reports for that tool and the place where its credential lives.
- How the host keeps issues and their templates, and anything particular to this host.
- The action record: for each host action that the role skills name, how this machine does it with the chosen tool. That includes handing host data to the journal in its forms. `journal form` prints them.
- The verifier of Lawman's release, or the record that you declined one.

The menu item "Host" runs the part again, for a change of tool. It never changes `trusted_login`. See [the journal](journal.md#where-it-comes-from).

## The twelve keys

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
contract_version: 1
amended_law_commit: 0123456789abcdef0123456789abcdef01234567
```

Every value above is a placeholder. `hermes` is the name of the one shipped harness page. The order follows the assembly skill.

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
| `contract_version` | The constitution contract version that the precinct constitutions stand at. | The assembly at install and at amend |
| `amended_law_commit` | The law commit at which the precinct constitutions were last brought in line. | The assembly at install and at amend, or `law-sync` as a default |

## Who writes it

The assembly writes the file at install. It writes `config.yaml` with the twelve keys and reads it back. If a key is missing or empty, it stops.

After a plugin update, the next tick of any role completes the update. The role downloads the journal of the new release and verifies it. Then it runs the `law-sync` command of that file. The command writes `law_commit`, `release_tag` and `journal_sha256`. It also fills a missing key from its defaults. In this release the defaults cover `typesafe_key` and `amended_law_commit`. The first becomes `environment variable TYPESAFE_API_KEY` when `typesafe` is `yes`, and `none` otherwise. The second takes the value that `law_commit` held before the update.

No role replaces `bin/journal` or `config.yaml` by any other means.

The assembly writes `contract_version` and `amended_law_commit` again when it amends the precinct constitutions. If the new law carries another constitution contract version, `law-sync` prints an `ALARM contract-changed` line. Run the assembly to amend. See [constitution](constitution.md).

The assembly sets `typesafe_precincts` per precinct. When `typesafe` is `yes`, it asks whether the court may send its brief about a conviction in that precinct to `api.typesafe.ai`. It writes the pair `<precinct>=<answer>` and replaces any earlier pair of that name.

## Who reads it

Ticks read the keys they need.

- Every role reads `law_commit` and `trusted_login`. A role stops with `stopped-law-drift` when the law folder holds another commit. It stops with `stopped-identity-changed` when the account that the host reports differs from `trusted_login`.
- The court reads `typesafe`, `typesafe_precincts` and `typesafe_key`. It allows Jev only when `typesafe` is exactly `yes` and the precinct pair is `yes`.
- The assembly reads `deliver` when it creates the scheduled jobs.

See [the pipeline](pipeline.md) for the checks that open every tick.

## Source files

- [assembly skill](../skills/assembly/SKILL.md): the key list and the rules for the file.
- [install](../skills/assembly/references/install.md): the steps that write the keys.
- [amend](../skills/assembly/references/amend.md): the steps that update the contract keys.
- [law-sync](../journal/src/law-sync.ts): the command that rewrites the sync keys.

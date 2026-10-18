# Configuration

An installation keeps its settings in one file, `config.yaml`. The file holds the facts that only your installation knows. They are the harness, the signed-in login, the delivery platform and the release that the journal came from.

## Where it lives

`config.yaml` sits in the installation directory. The directory also holds `lawman/`, the link to the plugin folder, and `bin/journal`. See [the journal](journal.md).

The file stays in the installation. It never enters a precinct, a pull request, an issue or a commit. No other file holds such facts.

The file holds plain `key: value` lines. There is one line per key and no nesting.

## What it never holds

`config.yaml` never holds a key or a token value. The key `typesafe_key` says where the TypeSafe API key lives, in words or as a variable name. The assembly never asks for the value, never prints it and never stores it.

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
| `trusted_login` | The login that the scheduled session reports. Every role uses this one identity. | The assembly at install |
| `deliver` | The delivery platform for alarms, failures and stops. | The assembly at install |
| `typesafe` | `yes` or `no`. Whether the court may use TypeSafe Jev as evidence for a priority. | The assembly at install |
| `typesafe_precincts` | A list of `<precinct>=<yes\|no>` pairs, or `none`. It sets per precinct whether the court may send its brief. | The assembly when it adds a precinct |
| `typesafe_key` | Where the TypeSafe API key lives, in words or as a variable name, or `none`. Never the value. | The assembly at install, or `law-sync` as a default |
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

- Every role reads `law_commit` and `trusted_login`. A role stops with `stopped-law-drift` when the law folder holds another commit. It stops with `stopped-identity-changed` when the signed-in login differs from `trusted_login`.
- The court reads `typesafe`, `typesafe_precincts` and `typesafe_key`. It allows Jev only when `typesafe` is exactly `yes` and the precinct pair is `yes`.
- The assembly reads `deliver` when it creates the scheduled jobs.

See [the pipeline](pipeline.md) for the checks that open every tick.

## Source files

- [assembly skill](../skills/assembly/SKILL.md): the key list and the rules for the file.
- [install](../skills/assembly/references/install.md): the steps that write the keys.
- [amend](../skills/assembly/references/amend.md): the steps that update the contract keys.
- [law-sync](../journal/src/law-sync.ts): the command that rewrites the sync keys.

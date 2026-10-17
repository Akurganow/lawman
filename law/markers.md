# Marker grammar

Lawman roles record state as HTML-comment markers in GitHub issue bodies, issue comments and pull request comments. Labels carry no state. The journal parses markers deterministically.

This file is the single definition of the grammar. The journal parser checks the fields of `lead` and `return`. For other stages it keeps the values as they are. The test fixture mirrors the examples below.

## Line shape

```
<!-- lawman: role=<role> stage=<stage> at=<UTC> [key=value ...] -->
```

- A marker is one line. It starts with `<!-- lawman: ` and ends with ` -->`.
- Fields sit between them, separated by single spaces. No other whitespace is allowed.
- A field is `key=value`. Fields may appear in any order. Writers use the order shown above.
- `role`, `stage` and `at` are required. Each appears once.
- Split text on `\n`. Drop one trailing `\r` from each line.
- A candidate line matches `^<!-- lawman: K=V( K=V)* -->$`, with `K = [a-z][a-z0-9_]*` and `V = [A-Za-z0-9.:_/%+-]+`.

## Fields

- `role` and `stage` match `[a-z][a-z0-9-]*`.
- `at` is `YYYY-MM-DDThh:mm:ssZ`, in UTC. It is for humans. It never orders markers. The parser checks its shape only.
- A key matches `[a-z][a-z0-9_]*`.
- A duplicate key makes the marker invalid.
- A value is a non-empty token of ASCII letters, digits, `.`, `:`, `_`, `/`, `%`, `+` and `-`.
- The sequence `--` is forbidden in a value. So is the character `>`.
- The sequence `::` is allowed only inside the value of `id`.
- Unknown keys and unknown stages are parsed and kept. They never make a marker invalid.

## The `id` value

`id` has three parts joined by `::`.

```
id=<path>::<symbol>::<kind>
```

- Percent-encode every byte of a part outside `[A-Za-z0-9._/-]`.
- Use uppercase hex digits. Never encode a safe byte.
- A space is `%20`. The symbol `Foo::bar` is `Foo%3A%3Abar`.
- The value matches `^P::P::P$`, with `P = ([A-Za-z0-9._/-]|%[0-9A-F]{2})+`.
- Parsing requires the canonical form. Decode each part to bytes, encode it again, and compare. A difference makes the marker invalid.
- Lowercase hex (`%3a`) and an encoded safe byte (`%41`) are not canonical.
- `-` is a safe byte and stays bare, with one exception: in a run of two or more hyphens, every hyphen after the first is encoded as `%2D`. So `a--b` is written `a-%2Db`, and `a---b` is written `a-%2D%2Db`. This keeps `--` out of every value.
- Canonical form follows the same rule. Decoding `a-%2Db` gives `a--b`, and encoding it again gives `a-%2Db`.

## When a marker counts

A marker counts only when all of these hold:

1. The line starts at column 0. A tab, a space, a `>` or any text before `<!--` disqualifies it.
2. The marker occupies the whole line. Nothing follows ` -->`, not even a space.
3. The line lies outside a fenced block.
4. The line is not indented by 4 or more spaces.
5. The line is not inside a blockquote.
6. The line is in the issue body or in a comment of the trusted author. A comment on a pull request counts under the same rules as a comment on an issue.
7. The marker is valid.

A marker quoted anywhere else counts for nothing. An invalid marker is ignored. It displaces no older marker.

Rules 1, 4 and 5 follow from column 0, so the parser needs no blockquote state. The fixture still tests each case.

The trusted author is the installation's trusted login. Compare logins ignoring ASCII case.

### Fenced blocks

- A fence opens with 3 or more backticks or 3 or more tildes. It may be indented up to 3 spaces.
- A backtick fence has no backtick in its info string. An indent of 4 or more spaces makes a line no fence.
- A fence closes with the same character, at least as many as the opening, indented up to 3 spaces, and only whitespace after.
- An unclosed fence runs to the end of its body or comment. Fence state resets for each carrier.

## Which marker wins

The ordering key of a marker is the triple:

1. The creation time of its carrier, from GitHub.
2. The carrier rank. The issue body has rank 0. Comment number `i` (0-based, in creation order) has rank `1 + i`.
3. The line number within the carrier.

The body's creation time is the issue's. A comment's is its own.

- The newest marker of one role on one issue is the one with the greatest key. It wins over older markers of that role, whatever their stages.
- Nobody edits an old marker. A role writes a new one.
- The lead origin of an issue is the counting marker with `stage=lead` and the smallest key.
- A later marker of another role never displaces the lead origin.

## Defined markers

A stage that leaves the case standing (lead, case, charge, defence, conviction, spec, ready) carries `sha`, 40 lowercase hex digits of the analysed commit, or of the pushed head for `ready`. A closing or returning stage (return, decline, refute, acquittal) carries none. The clerk stages `entry`, `no-entry`, `handoff`, `handed`, `shut`, `settled` and `kept` and the response-unit stages `await` and `out` carry none either.

Each marker is the last line of the issue body or comment that its role writes.

| Role | Stage | Written in | Fields beyond `role`, `stage` and `at` |
| :-- | :-- | :-- | :-- |
| `patrol` | `lead` | the body of the issue patrol files | `department`, `id`, `sha`, and `of` when the defect has returned |
| `investigation` | `case` | the case comment | `sha` |
| `prosecutor` | `charge` | the decision comment | `sha` |
| `prosecutor` | `decline` | the decision comment | none |
| `prosecutor` or `defender` | `return` | the comment that returns a case | `to`, `round` |
| `defender` | `defence` | the defence comment | `sha` |
| `defender` | `refute` | the defence comment | none |
| `court` | `conviction` | the ruling comment | `sha`, `priority` |
| `court` | `acquittal` | the ruling comment | none |
| `response-unit` | `lead` | the lead comment on the issue it takes in | `department`, `id`, `sha` |
| `response-unit` | `await` | the comment that asks the reporter for facts | none |
| `response-unit` | `out` | the comment that sends an issue out of the funnel | `reason` |
| `clerk` | `entry` | the comment after it opens a precedent pull request | none |
| `clerk` | `no-entry` | the comment when the ruling holds no valid precedent line | none |
| `clerk` | `handoff` | the hand-over comment on a pull request | none |
| `clerk` | `handed`, `shut`, `settled` or `kept` | the comment on a source issue after the clerk acts on the pair | `pull`, `issue` |
| `spec-writer` | `spec` | the `Spec` comment on a pull request | `sha` |
| `executor` | `ready` | the `Executor` comment on a pull request | `sha` |

- `priority` is `P0`, `P1`, `P2` or `P3`. A missing or other value reads as `P2`. The parser keeps it as it is.
- `pull` is a positive decimal integer without leading zeros. Otherwise the marker names no pull request. `issue` is `open` or `closed`, the state in which the clerk left the issue.
- `entry` and `no-entry` now follow an acquittal only.
- `department` is a value token. `id` follows "The `id` value".
- `of` is a positive decimal integer without leading zeros. It names the issue closed as completed whose defect has returned.
- `stage=lead` is valid only with `role=patrol` or `role=response-unit`, and all of `department`, `id`, `sha`. Otherwise the marker is invalid.
- The response-unit lead writes `department=-` and `id=<path>::<symbol>::reported`. `-` is a value token.
- `reason` is `feature`, `injection` or `other`. The parser keeps it as it is.
- `to` matches `[a-z][a-z0-9-]*`. `round` is a positive decimal integer without leading zeros.
- `stage=return` is valid only with `to` and `round`. Otherwise the marker is invalid.
- The prosecutor and the defender write `return`, both with `to=investigation` and `round` equal to the round in which it returns.

A stage not defined here is parsed and kept.

## Examples

Labels are stable. The test fixture mirrors them.

Valid. `E1` is a lead: the symbol is `Foo::bar` and the path has a space. `E2` is a return.

```
<!-- lawman: role=patrol stage=lead department=core id=src/my%20file.rs::Foo%3A%3Abar::dead-code sha=0123456789abcdef0123456789abcdef01234567 at=2026-10-14T09:30:00Z of=42 -->
<!-- lawman: role=judge stage=return to=patrol round=2 at=2026-10-14T10:05:00Z -->
```

Invalid, in this order. `E3`: duplicate key `round`. `E4`: `--` in `department`. `E5`: lowercase hex in `id`.

```
<!-- lawman: role=judge stage=return to=patrol round=1 round=2 at=2026-10-14T10:05:00Z -->
<!-- lawman: role=patrol stage=lead department=core--api id=src/a.rs::f::dead-code sha=0123456789abcdef0123456789abcdef01234567 at=2026-10-14T09:30:00Z -->
<!-- lawman: role=patrol stage=lead department=core id=src/a.rs::Foo%3a%3abar::dead-code sha=0123456789abcdef0123456789abcdef01234567 at=2026-10-14T09:30:00Z -->
```

`E6`, invalid, inside a fence. The marker is a valid return, but the fence hides it. The outer fence has four backticks:

````
```
<!-- lawman: role=judge stage=return to=patrol round=1 at=2026-10-14T10:05:00Z -->
```
````

Valid. `E7` is a case, `E8` a charge, `E9` a decline.

```
<!-- lawman: role=investigation stage=case sha=0123456789abcdef0123456789abcdef01234567 at=2026-10-14T11:00:00Z -->
<!-- lawman: role=prosecutor stage=charge sha=0123456789abcdef0123456789abcdef01234567 at=2026-10-14T11:30:00Z -->
<!-- lawman: role=prosecutor stage=decline at=2026-10-14T11:30:00Z -->
```

Valid. `E10` is a defence, `E11` a refute.

```
<!-- lawman: role=defender stage=defence sha=4f1c9a2b7d3e58061a9c4e7b2d0f3a6c8e5b1d94 at=2026-10-15T08:20:00Z -->
<!-- lawman: role=defender stage=refute at=2026-10-15T08:40:00Z -->
```

Valid. `E12` is a conviction, `E13` an acquittal.

```
<!-- lawman: role=court stage=conviction sha=7e3a91c5d0b842f6a1e9c37d58b20f4a6c1e9d37 at=2026-10-16T10:00:00Z -->
<!-- lawman: role=court stage=acquittal at=2026-10-16T10:30:00Z -->
```

Valid. `E14` is an entry, `E15` a no-entry.

```
<!-- lawman: role=clerk stage=entry at=2026-10-16T10:45:00Z -->
<!-- lawman: role=clerk stage=no-entry at=2026-10-16T11:00:00Z -->
```

Valid. `E16` is a response-unit lead, `E17` an await, `E18` an out.

```
<!-- lawman: role=response-unit stage=lead department=- id=src/a.rs::run::reported sha=0123456789abcdef0123456789abcdef01234567 at=2026-10-16T12:00:00Z -->
<!-- lawman: role=response-unit stage=await at=2026-10-16T12:10:00Z -->
<!-- lawman: role=response-unit stage=out reason=feature at=2026-10-16T12:20:00Z -->
```

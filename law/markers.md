# Marker grammar

Lawman roles record state as HTML-comment markers in GitHub issue bodies and comments. Labels carry no state. The journal parses markers deterministically.

This file is the single definition of the grammar. The journal parser and its test fixture match it exactly.

## Line shape

```
<!-- lawman: role=<role> stage=<stage> at=<UTC> [key=value ...] -->
```

- A marker is one line. It starts with `<!-- lawman: ` and ends with ` -->`.
- Fields sit between them, separated by single spaces. No other whitespace is allowed.
- A field is `key=value`. Fields may appear in any order. Writers use the order shown above.
- `role`, `stage` and `at` are required. Each appears once.
- The whole line is at most 1024 bytes, without the line terminator.
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
6. The line is in the issue body or in a comment of the trusted author.
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

This release defines exactly two markers.

Patrol lead, the last line of the body of the issue the patrol files:

```
<!-- lawman: role=patrol stage=lead department=<name> id=<path>::<symbol>::<kind> sha=<40 hex> at=<UTC> [of=<issue number>] -->
```

- `department` is a value token. `id` follows "The `id` value". `sha` is 40 lowercase hex digits.
- `of` is a positive decimal integer without leading zeros. It names the issue closed as completed whose defect has returned.
- `stage=lead` is valid only with `role=patrol` and all of `department`, `id`, `sha`. Otherwise the marker is invalid.

Return:

```
<!-- lawman: role=<role> stage=return to=<role> round=<n> at=<UTC> -->
```

- `to` matches `[a-z][a-z0-9-]*`.
- `round` is a positive decimal integer without leading zeros.
- `stage=return` is valid only with `to` and `round`. Otherwise the marker is invalid.

No other stage is reserved. Each future stage arrives with its own release and contract version.

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

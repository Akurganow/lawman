# debian

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

sources.debian.org

## Measured

7 of 10 usable. Read 2026-11-01: `hello 2.10-3` returned the text of `debian/copyright`.

## Limits and terms

Terms read as unclear. The API is described for programs and no terms of use were found. robots.txt answered 403, so its rules are unknown. A User-Agent like a browser's meets a challenge page, and an honest tool name passes. No limit is published.

## Traps

Short names are not SPDX. The role cuts a long file into small files. Some have no machine-readable stanza. The prefix of a `lib` name has four characters, read on `libxml2`. Keep the epoch. `bash-completion 1:2.16.0-8`: kept 200, encoded `1%3A` 200, dropped 404. Largest reply seen: 14 343 bytes.

## Fits when

The tree pins a Debian source version. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: debian. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://sources.debian.org/data/main/{prefix}/{name}/{version}/debian/copyright
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{prefix}` is the first character of the name, or its first four characters when the name starts with `lib` and has a fourth character. The role computes it. `{version}` passes the class `<pin>` and keeps its epoch. The role writes the colon of the epoch as `%3A`.
- Key of the reply: none: the address names the pin
- Take: the whole text
- Reply form: text
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

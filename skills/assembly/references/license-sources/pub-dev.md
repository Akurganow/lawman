# pub-dev

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

pub.dev

## Measured

10 of 10. Read 2026-11-01: `yaml` returned the tags `license:mit`, `license:fsf-libre` and `license:osi-approved`

## Limits and terms

Terms read as unclear. The API page names the endpoint as officially supported. The API terms lead to the Google API terms, which bar permanent copies without the owner's permission, and pub.dev gives none. The policy bars abuse. A User-Agent that names the tool is strongly encouraged. No limit is published

## Traps

A tag, latest only. `fsf-libre` and `osi-approved` are flags and not licenses. `yaml` read `mit` against another source's `bsd-3-clause`. `license:unknown` exists. A missing package answers 404 with an XML body. Largest reply seen: 476 bytes.

## Fits when

`pubspec.lock` pins a package from pub.dev. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: pub-dev. Level: package. A finding rests on it: no.
- Pin carries: name, version. The request sends only the name.
- Request: GET https://pub.dev/api/packages/{name}/score
- Values: `{name}` passes the class `<name>` of a `licenses` line.
- Key of the reply: none: the answer is for the package
- Take: the entries of the list `tags` that start with `license:`, with the prefix cut, except the flags `fsf-libre` and `osi-approved`.
- Reply form: JSON object
- Pace: none stated by the service
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: yaml. Expect: mit. Recorded reply: pub-dev.latest.

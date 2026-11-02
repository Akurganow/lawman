# elm

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

package.elm-lang.org

## Measured

10 of 10, SPDX. Read 2026-11-01: `elm/core 1.0.5` read `BSD-3-Clause`

## Limits and terms

Terms read as unclear: no terms of use and no description of the API for outside clients. The addresses are the ones the Elm compiler uses. The repository of the site is marked "All rights reserved", and that is the code of the site, not its data. robots.txt closes a few old packages and one bot

## Traps

None measured. Largest reply seen: 817 bytes.

## Fits when

`elm.json` pins a version. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: elm. Level: version. A finding rests on it: yes.
- Pin carries: name `<author>/<name>`, version.
- Request: GET https://package.elm-lang.org/packages/{author}/{name}/{version}/elm.json
- Values: `{author}` and `{name}` are the two parts of the name. Each passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: `version`. It must equal the pin.
- Take: the field `license`.
- Reply form: JSON object
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

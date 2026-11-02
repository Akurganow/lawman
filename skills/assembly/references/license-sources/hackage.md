# hackage

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

hackage.haskell.org

## Measured

10 of 10, SPDX

## Limits and terms

Serves JSON, and the API page lists the resources. No terms of use. robots.txt closes the host to a long list of named bots, Claude-Code, Cursor, Code, opencode, Scrapy and Spider among them, so the User-Agent must not match. No limits published

## Traps

A metadata revision can change the answer after publication. Largest reply seen: 3 589 bytes.

## Fits when

A freeze or Stack lock pins a package from Hackage. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: hackage. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://hackage.haskell.org/package/{name}-{version}
- Headers: `Accept: application/json`
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: none. The reply holds no version and the address names the pin.
- Take: the field `license`.
- Reply form: JSON object
- Pace: none stated by the service
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: aeson 1.0.0.0. Expect: BSD-3-Clause. Recorded reply: hackage.old.

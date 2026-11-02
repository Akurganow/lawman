# homebrew

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

formulae.brew.sh

## Measured

10 of 10

## Limits and terms

A JSON API for all packages is described. No terms of use. No limit and no User-Agent rule. Replies are cached for 600 seconds

## Traps

Current formula only. Casks have no license. The version is ignored. Largest reply seen: 9 227 bytes.

## Fits when

`Brewfile.lock.json` pins a formula. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: homebrew. Level: package. A finding rests on it: no.
- Pin carries: name, version. The request sends only the name.
- Request: GET https://formulae.brew.sh/api/formula/{name}.json
- Values: `{name}` passes the class `<name>` of a `licenses` line.
- Key of the reply: `name`. It must equal the name of the formula.
- Take: the field `license`.
- Reply form: JSON object
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: jq. Expect: MIT.

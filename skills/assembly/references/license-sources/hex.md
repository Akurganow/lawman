# hex

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

hex.pm

## Measured

10 of 10

## Limits and terms

The terms allow access through the published API. 100 requests per minute per IP, 500 with a token. A 304 reply does not count, and `X-RateLimit-*` headers show the rest. A User-Agent with the client name and version is required: 400 without. robots.txt closes `/diff/` only

## Traps

The version-level value sits in the tarball, not read here. `hex`, `homebrew` and `nimble` ignore the version. Largest reply seen: 36 975 bytes.

## Fits when

`mix.lock` pins a package from hex.pm. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: hex. Level: package. A finding rests on it: no.
- Pin carries: name, version. The request sends only the name.
- Request: GET https://hex.pm/api/packages/{name}
- Values: `{name}` passes the class `<name>` of a `licenses` line.
- Key of the reply: none: the answer is for the package
- Take: the field `meta.licenses`.
- Reply form: JSON object
- Pace: at most 100 requests per 60 seconds
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: jason. Expect: ["Apache-2.0"].

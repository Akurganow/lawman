# crates-io

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

crates.io

## Measured

One request

## Limits and terms

At most 1 request per second, and a User-Agent that names the application: 403 without one. The Data Access Policy welcomes the API within these limits (read 2026-11-01)

## Traps

The sparse index carries no license field. The policy prefers the index, the CDN and the database dump to the API. The index holds no license. The dump is cheaper for a long list and is not used here. Field path checked on one reply. Largest reply seen: 32 397 bytes.

## Fits when

A pinned crate from the public registry. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: crates-io. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://crates.io/api/v1/crates/{name}/{version}
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: `version.num`. It must equal the pin.
- Take: the field `version.license`.
- Reply form: JSON object
- Pace: at most 1 request per second
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: serde 1.0.0. Expect: MIT/Apache-2.0. Recorded reply: crates-io.old.

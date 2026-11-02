# npm-registry

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

registry.npmjs.org

## Measured

One request

## Limits and terms

The Open Source Terms permit copying registry data through the public APIs. The ban on automated access covers the website npmjs.com. No limit and no User-Agent rule for the registry.

## Traps

The value is a free string: a URL, `BSD`, `Apache` were seen. npm scoped names: use the encoded form `@scope%2Fname`. Largest reply seen: 8 964 bytes.

## Fits when

A pinned npm dependency from the public registry. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: npm-registry. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://registry.npmjs.org/{name}/{version}
- Values: `{name}` passes the class `<name>` of a `licenses` line. A scoped name `@scope/pkg` becomes `@scope%2Fpkg`: the role encodes the slash and keeps the `@`. `{version}` passes the class `<pin>`.
- Key of the reply: `version`. It must equal the pin.
- Take: the field `license`. When it gives no value, the field `type` of each element of the list `licenses`.
- Reply form: JSON object
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

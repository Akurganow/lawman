# pypi-json

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

pypi.org

## Measured

One request

## Limits and terms

JSON API described, no rate limit at the edge. Asks for a User-Agent that identifies the requests, a contact would help. Respect ETag. No thousands of requests in minutes. The PSF decides what is abuse. robots.txt closes `/pypi/*/json` while the API pages describe that address

## Traps

`license_expression` can be empty. Jinja2 has an empty `license`, SciPy holds a full text. When both are empty, the role reads the `License ::` classifiers with the prefix cut. Jinja2 3.1.4 then reads `OSI Approved :: BSD License`. Largest reply seen: 83 524 bytes.

## Fits when

A pinned PyPI dependency from the public registry. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: pypi-json. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://pypi.org/pypi/{name}/{version}/json
- Values: `{name}` passes the class `<name>` of a `licenses` line, as the tree writes it. `{version}` passes the class `<pin>`.
- Key of the reply: `info.version`. It must equal the pin.
- Take: the field `info.license_expression`. When it is empty, the field `info.license`. When that is empty too, the entries of `info.classifiers` that start with `License :: `, with the prefix cut.
- Reply form: JSON object
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

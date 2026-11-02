# conda-forge

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

api.anaconda.org

## Measured

10 of 10. Read 2026-11-01: `numpy 1.26.4` returned 29 builds, each with `BSD-3-Clause`

## Limits and terms

Terms read as unclear. The Anaconda.org terms say that licensing and payment restrictions apply to Anaconda's own channels and not to community channels. They also say that Anaconda.org may not be used, resold or commercially exploited without prior written consent, and they do not explain the sentence. The acceptable use policy bars use beyond reasonable parameters and unauthorised scraping and defines neither. No request limit is published. The mirror prefix.dev bars automated procedures and is not used

## Traps

The reply holds every build of the version, so its size grows with their number. Builds of one version can differ in license, and differing values are an array. `LicenseRef-OTHER` was seen. The PyPI name can differ. Builds of one version can differ only in spelling, as `BSD 3-Clause` and `BSD-3-Clause`. Largest reply seen: 39 954 bytes.

## Fits when

A conda lock pins from conda-forge. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: conda-forge. Level: build. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://api.anaconda.org/release/conda-forge/{name}/{version}
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: the field `version` of each element of the list `distributions`. It must equal the pin. When any element differs, every pin of the reply is `unread`.
- Take: the field `attrs.license` of each element of `distributions`. One value when the builds agree, otherwise the list of the distinct values. An empty `distributions` is `no-record`.
- Reply form: JSON object
- Pace: none stated by the service
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: numpy 1.26.4, 29 builds. Expect: BSD-3-Clause. Recorded reply: conda-forge.old.

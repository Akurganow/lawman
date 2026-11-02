# cocoapods

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

cdn.jsdelivr.net

## Measured

40 of 40. Read 2026-11-01: `Alamofire 5.8.0` read `MIT`

## Limits and terms

Terms read as unclear. The jsDelivr terms call abuse a request for unique files of hundreds of packages that lasts longer than a few minutes. They name no exact threshold. Use is free, personal or commercial, and no request limit is published. The old address cdn.cocoapods.org answers 301 to this host, and the role follows no redirect. Trunk is to become read-only on December 2nd 2026, and its plan keeps the CDN (not verified)

## Traps

A User-Agent must be set: a default one got 403. Free text: `Apache 2.0`, `Mixed`, `Commercial`, `Copyright`. The field is a string or an object. 25 entries of one lockfile had no podspec. jsDelivr itself can answer 301 to raw.githubusercontent.com (`Realm 5.5.1`). The role follows no redirect, so the entry reads `status-301`. Largest reply seen: 4 165 bytes.

## Fits when

`Podfile.lock` pins a trunk pod. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: cocoapods. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://cdn.jsdelivr.net/cocoa/Specs/{d1}/{d2}/{d3}/{name}/{version}/{name}.podspec.json
- Values: `{d1}`, `{d2}` and `{d3}` are the first three hexadecimal digits of the MD5 of the pod name, one digit for each directory. The role computes the MD5. Each digit passes the class `[0-9a-f]`. `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: `version`. It must equal the pin.
- Take: the field `license`. It is a string, or an object whose `type` is a string.
- Reply form: JSON object
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

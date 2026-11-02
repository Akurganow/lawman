# clearly-defined

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

api.clearlydefined.io

## Measured

294 of 787 harvested. 5 and 9 of 33 Swift pins, 3 of 20 actions, 6 of 10 Packagist

## Limits and terms

Data under CC0, no attribution duty. The terms limit no automated access, no organisation size and no commercial use (read 2026-11-01). The documentation allows 2000 requests per minute for GET and 250 per minute for the three POST endpoints, `POST /definitions` among them. A header read `5000;w=300`. Rely on the smaller value. No User-Agent rule found.

## Traps

An unknown coordinate answers empty and queues a harvest. `declared` mixes scan results. `LicenseRef-` values go to `non-standard`. A cold lookup can answer 502 or 524, or take over 120 s with no bytes, and the same request answers later. 100 entries gave 10.9 MB, and one entry can reach megabytes. Cold lookups gave 502 and 524, and the same request later answered. Unknown coordinate: 200 with a zero-score entry and no `declared`. `pod/cocoapods/-/Alamofire/5.8.0` answers with `declared`; a first attempt took over 120 s with no bytes. `debsrc/debian/-/<name>/<version>` answers; `hello 2.10-3` is empty, `mini-httpd 1.30-0.2` has `declared`.

## Fits when

A pin in these ecosystems. A `git` pin only on a github.com address. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: clearly-defined. Level: version. A finding rests on it: yes.
- Pin carries: name, version. A git pin carries the commit hash.
- Request: POST https://api.clearlydefined.io/definitions
- Headers: `Content-Type: application/json`
- Values: the body is a list of coordinates `["{type}/{provider}/{namespace}/{name}/{revision}", ...]`. `{type}/{provider}` follows the ecosystem: npm `npm/npmjs`, PyPI `pypi/pypi`, crates.io `crate/cratesio`, Go `go/golang`, Maven `maven/mavencentral`, NuGet `nuget/nuget`, RubyGems `gem/rubygems`, CocoaPods `pod/cocoapods`, Debian `debsrc/debian`, Packagist `composer/packagist`, git `git/github`. The name passes the class `<name>` of a `licenses` line before the role splits it. `{namespace}` is `-` when the name has none. An npm scope `@scope` is the namespace. A Maven group is the namespace, and the role splits the name at `:`. A Packagist vendor is the namespace. A Go module path up to its last segment is the namespace, and the role writes each slash as `%2f`. A git owner is the namespace, and only github.com fits. `{name}` is the last segment. `{revision}` passes the class `<pin>`. Go adds `v` to the pin. A git pin uses the commit hash.
- Key of the reply: an object keyed by coordinate. The role takes the entry whose key equals the coordinate it asked for.
- Take: the field `licensed.declared`. An entry with neither `described.releaseDate` nor `files` is a coordinate the service met for the first time, queued for a harvest: `no-record`. A known entry without `declared` is `no-field`.
- Reply form: JSON batch
- Batch: up to 100 pins per request.
- Pace: at most 250 requests per minute, the documented limit of the POST endpoints
- Requests per pin: one request carries up to 100 pins.
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: npm lodash 4.17.4. Expect: CC0-1.0 AND MIT. Recorded reply: clearly-defined.old.
- Batch sample: npm lodash 4.17.4 expects CC0-1.0 AND MIT, Debian mini-httpd 1.30-0.2 expects BSD-2-Clause. Recorded reply: clearly-defined.old, clearly-defined.debian-populated.

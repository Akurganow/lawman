# rubygems

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

rubygems.org

## Measured

One request

## Limits and terms

API and website: 10 requests per second, answered with 429 at the balancer. IPs may be blocked in extreme cases. The acceptable use policy bars undue burden through automated means. User-Agent not required

## Traps

A ranked sample of gems held noise. Largest reply seen: 2 570 bytes.

## Fits when

A pinned gem from the public registry. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: rubygems. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://rubygems.org/api/v2/rubygems/{name}/versions/{version}.json
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: `version`. It must equal the pin.
- Take: the list `licenses`.
- Reply form: JSON object
- Pace: at most 10 requests per second
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: rails 4.0.0. Expect: ["MIT"].

# luarocks

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

luarocks.org

## Measured

9 of 10

## Limits and terms

Access to manifests and rockspecs is described. No terms of use. No limit and no User-Agent rule. A rockspec is Lua code and is never run.

## Traps

Lua source: never run. Values such as `MIT/X11`.

## Fits when

A lock pins a rock. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: luarocks. Level: version. A finding rests on it: yes.
- Pin carries: name, rockspec version, for example `2.0.2-6`.
- Request: GET https://luarocks.org/{name}-{version}.rockspec
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: none: the address names the pin.
- Take: the value assigned to `license` in the text of the rockspec.
- Reply form: source text
- Special reading: the text is Lua code. The role reads it as text and never runs it.
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

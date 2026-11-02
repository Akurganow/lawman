# jsr

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

api.jsr.io

## Measured

10 of 13, `null` common. Read 2026-11-01: 4 of 10 versions read `MIT` and 6 read `null`

## Limits and terms

Terms read as unclear. Only the management API holds the field, and its documentation tells tools not to read version metadata through it. The usage policy does not bar reading metadata. Tools should identify themselves with a User-Agent in the form tool name, version, then address. The service may block a tool that misbehaves

## Traps

`null` is common and does not mean no license. deno.land/x is not covered. The metadata file of the registry holds no license field. `@std/path` 1.0.8 has `license: null`, 1.1.6 has `MIT`. The User-Agent made no difference to the body. Largest reply seen: 275 bytes.

## Fits when

A lockfile pins a JSR package. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: jsr. Level: version. A finding rests on it: yes.
- Pin carries: name `@<scope>/<package>`, version.
- Request: GET https://api.jsr.io/scopes/{scope}/packages/{package}/versions/{version}
- Values: `{scope}` is the part of the name between the `@` and the slash. `{package}` is the part after the slash. Both pass the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: `version`. It must equal the pin.
- Take: the field `license`. The value `null` is `no-field`.
- Reply form: JSON object
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

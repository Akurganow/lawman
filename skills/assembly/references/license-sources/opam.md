# opam

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

opam.ocaml.org

## Measured

10 of 10

## Limits and terms

Metadata under CC0 (read 2026-11-01). No duty.

## Traps

Some versions answer 404, cause not checked. Old versions can answer 404.

## Fits when

A lock pins an opam package. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: opam. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://opam.ocaml.org/packages/{name}/{name}.{version}/opam
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: none: the address names the pin.
- Take: the value of the field `license:` of the opam file.
- Reply form: source text
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: lwt 5.0.0. Expect: MIT.

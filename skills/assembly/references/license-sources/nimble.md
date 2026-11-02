# nimble

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

raw.githubusercontent.com

## Measured

10 of 10, 1 wrong

## Limits and terms

Data under CC-BY-4.0: a report names nim-lang/packages as the source. Host terms of raw.githubusercontent.com read as unclear, as for the host of the `vcpkg` row: the acceptable use policy bars excessive automation. No name leaves

## Traps

`cligen` reads MIT against ISC in its repository. A lock with a git revision fits `revision-file` better. The version is ignored. Largest reply seen: 1 029 038 bytes.

## Fits when

A Nim lock or manifest names a package of this list. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: nimble. Level: package. A finding rests on it: no.
- Pin carries: name, version. The request sends neither.
- Request: GET https://raw.githubusercontent.com/nim-lang/packages/master/packages.json
- Values: none. No value enters the address and no name leaves.
- Key of the reply: the element of the list whose `name` equals the name of the pin. No such element is `no-record`.
- Take: the field `license` of that element.
- Reply form: JSON object (a list of packages)
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: not counted for a row of one file. One request serves all pins, and one tick is 1 request.
- User-Agent: <tool name and version>; <project address>
- Attribution: nim-lang/packages (Nimble), CC-BY-4.0

## Live sample

- Sample: terminal_deck, the first package of the list. Expect: MIT.

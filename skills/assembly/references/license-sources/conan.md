# conan

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

center2.conan.io

## Measured

12 of 12. Read 2026-11-01: `zlib/1.3.1` at recipe revision `cac0f6daea041b0ccf42934163defb20` returned a `conanfile.py` with `license = "Zlib"`

## Limits and terms

Terms read as unclear. No terms for the host and no description of its API for outside clients. The terms of conan.io forbid reproduction of that site, which is not the package server. The recipes are under MIT.

## Traps

Python source: never run. `opencv/4.1.2` declares a license its upstream file does not hold. A custom remote does not fit. A pin without a recipe revision does not fit. Largest reply seen: 83 300 bytes.

## Fits when

`conan.lock` pins a recipe revision from Conan Center. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: conan. Level: recipe. A finding rests on it: no.
- Pin carries: name, `<version>#<recipe revision>`. A pin without a recipe revision does not fit.
- Request: GET https://center2.conan.io/v2/conans/{name}/{version}/_/_/revisions/{revision}/files/conanfile.py
- Values: the role cuts the pin at `#` into the version and the recipe revision. `{name}` passes the class `<name>` of a `licenses` line. `{version}` and `{revision}` pass the class `<pin>`.
- Key of the reply: none: the address names the pin.
- Take: the value assigned to `license` in the text of the recipe.
- Reply form: source text
- Special reading: the text is Python code. The role reads it as text and never runs it.
- Pace: none stated by the service
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: zlib 1.3.1 at recipe revision cac0f6daea041b0ccf42934163defb20. Expect: Zlib. Recorded reply: conan.zlib-1.3.1.

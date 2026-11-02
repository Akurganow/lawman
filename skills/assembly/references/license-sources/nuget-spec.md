# nuget-spec

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

api.nuget.org

## Measured

One request

## Limits and terms

The terms allow access through publicly supported interfaces, and the Server API is described for clients. No overload of the servers. No limit and no User-Agent rule published. No robots.txt.

## Traps

Second source to `deps-dev`. A license can be a file reference. A version with capitals answers 404, so the entry says to lowercase it. The version must be lowercased too. The license field has three shapes: `licenseUrl` only, `type="expression"`, `type="file"`.

## Fits when

A lock pins a package from nuget.org. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: nuget-spec. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://api.nuget.org/v3-flatcontainer/{name}/{version}/{name}.nuspec
- Values: `{name}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`. The role puts both in lower case before it fills them in.
- Key of the reply: none: the address names the pin.
- Take: the text of the element `license` that has the attribute `type="expression"`. An element `license` of type `file`, or a `licenseUrl` alone, is no license value: the answer is `no-field`.
- Reply form: XML
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: newtonsoft.json 13.0.4. Expect: MIT.

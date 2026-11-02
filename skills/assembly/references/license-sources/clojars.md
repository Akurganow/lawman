# clojars

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

repo.clojars.org

## Measured

10 of 10

## Limits and terms

A Maven repository and data feeds are described. No terms of use. No limit published. robots.txt closes AdsBot only.

## Traps

Free text license names. Lein shorthand means group equals artifact. Not on Maven Central.

## Fits when

A lock pins a Clojars artifact. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: clojars. Level: version. A finding rests on it: yes.
- Pin carries: name `<group>/<artifact>`, version. A name of one word means the group equals the artifact.
- Request: GET https://repo.clojars.org/{group}/{artifact}/{version}/{artifact}-{version}.pom
- Values: `{group}` is the group with each dot turned into a slash. Each directory of it passes the class `<name>` of a `licenses` line. `{artifact}` passes the class `<name>`. `{version}` passes the class `<pin>`.
- Key of the reply: none: the address names the pin.
- Take: the text of the element `name` of each element `license` under `licenses` in the POM.
- Reply form: XML
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: ring/ring-core 1.15.6. Expect: The MIT License.

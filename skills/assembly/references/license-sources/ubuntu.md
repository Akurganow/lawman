# ubuntu

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

changelogs.ubuntu.com

## Measured

1 of 1. Read 2026-11-01: `hello_2.10-3` in `main` returned the same text as Debian.

## Limits and terms

Terms read as unclear. The Canonical website terms allow download and print of pages for personal, education and non-commercial use only, and the user may be a company. The terms do not say whether they cover this host. robots.txt closes named AI bots, so the User-Agent must not match them. No limit is published.

## Traps

Needs the component. File names are Debian names, not always SPDX. Same traps as Debian: short names are not SPDX, and some files have no machine-readable stanza. Drop the epoch. `bash-completion_2.16.0-8build1`: dropped 200, kept 404, encoded 404. Largest reply seen: 14 343 bytes.

## Fits when

The tree pins an Ubuntu source version and its component. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: ubuntu. Level: version. A finding rests on it: yes.
- Pin carries: name as `<component>/<source>`, version.
- Request: GET https://changelogs.ubuntu.com/changelogs/pool/{component}/{prefix}/{source}/{source}_{version}/copyright
- Values: The name passes the class `<name>` of a `licenses` line. The role cuts it at the slash into `{component}` and `{source}`. `{prefix}` is the first character of the source, or its first four characters when the source starts with `lib` and has a fourth character. The role computes it. `{version}` passes the class `<pin>`. The role cuts the epoch off: the digits and the colon at the start of the version.
- Key of the reply: none: the address names the pin
- Take: the whole text
- Reply form: text
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: main/hello 2.10-3. Expect: 2 264 bytes.

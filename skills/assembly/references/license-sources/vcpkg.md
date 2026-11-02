# vcpkg

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

raw.githubusercontent.com

## Measured

2125 of 2897 ports, 322 `null`, 450 absent

## Limits and terms

Host terms of raw.githubusercontent.com read as unclear: the acceptable use policy bars excessive automation, and limits of raw are not published. The vcpkg repository is under MIT, and the licenses of ports belong to their authors. Read single files by commit, never walk a tree. Wait after a 429

## Traps

Stated as "Microsoft's best understanding". `null` sends the reader to the copyright file. Custom registries do not fit. An old port can have no `license` key, which is absent, not null. Largest reply seen: 17 586 bytes.

## Fits when

`vcpkg.json` names a baseline of the default registry. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: vcpkg. Level: version. A finding rests on it: yes.
- Pin carries: port name, baseline commit hash.
- Request: GET https://raw.githubusercontent.com/microsoft/vcpkg/{baseline}/ports/{name}/vcpkg.json
- Values: `{baseline}` passes the commit hash form of the class `<pin>`. Any other pin does not fit this row. `{name}` passes the class `<name>` of a `licenses` line.
- Key of the reply: `name`. It must equal the port name.
- Take: the field `license`. When it is absent or `null`, the answer is `no-field`.
- Reply form: JSON object
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly. After a 429 the source stops for the tick.
- Requests per pin: 1
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: zlib at the baseline 9a5dfef5d1a0438a7d24856a85bd60f309d355e9. Expect: Zlib.

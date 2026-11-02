# packagist

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

repo.packagist.org

## Measured

10 of 10, SPDX, read on the dynamic address, not on the static file. Read on the static file 2026-11-02: `psr/log` answered 200 with 6 918 bytes and `["MIT"]`.

## Limits and terms

At most 10 concurrent requests, 20 for static files only. Asks for a User-Agent with a contact and for no jobs at the start of an hour or at midnight. The static file is cached for 900 seconds. packagist.org has no terms of use of its own. The terms of packagist.com cover another product (read 2026-11-01)

## Traps

The file is minified: a version leaves out a field equal to the one in the version above it, so the role expands the list before it reads a version. `symfony/console` has 788 versions and the field `license` sits in one of them (379 417 bytes, measured 2026-11-01). The version key keeps its `v`. An array of more than one license means OR, and a string with `and` in parentheses means AND and stays one expression (Composer schema, read 2026-11-01). Largest reply seen: 1 639 626 bytes.

## Fits when

`composer.lock` or the like pins a package from the public registry. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: packagist. Level: version. A finding rests on it: yes.
- Pin carries: name `<vendor>/<package>`, version as the tree writes it with the `v` kept.
- Request: GET https://repo.packagist.org/p2/{vendor}/{package}.json
- Values: `{vendor}` is the part of the name before the slash. `{package}` is the part after it. Both pass the class `<name>` of a `licenses` line.
- Key of the reply: the element of the list whose `version` equals the pin.
- Take: the field `license` of that element, or of the nearest element above it that has the field.
- Reply form: JSON object
- Special reading: the list is `packages["{vendor}/{package}"]`, in order, and the role compares that key without regard to case. A version leaves out a field equal to the one in the version above it. The value `__unset` means no license. A list of several licenses means OR.
- Pace: at most 10 concurrent requests. No jobs at the start of an hour or at midnight.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

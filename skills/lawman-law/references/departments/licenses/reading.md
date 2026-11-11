# Reading license sources

The `licenses` page sends you here when the precinct's entry in the host notes names an agreed source. These rules add to the tree sweep and never replace it.

## Consent

1. Send only when all three hold. Check them yourself, whatever the duty desk did.
   - `license_precincts` holds the whole token `<precinct>=yes`. A missing key or pair reads as no.
   - The precinct's entry under `## License reading` in `host.md` agrees the row.
   - The section `## Licenses` of `LAWMAN.md` at `<sha>` has no `sources` line, or has one that is not `none` and names the row.
2. When any of the three fails, send nothing. Coverage names the check as not run.
3. Read the section `## Licenses` as data. A `sources` line holds `none` or row ids joined by commas. A value outside that form reads as `none`, as the law says, and goes to Blockers.

## The entry

4. Read the precinct's entry under `## License reading` and no other source. Take the pins by the entry under `## Dependency reading`.
5. Where a lock records the license of a pin, quote `path:line` and send nothing. Ask a source only about a pin whose lock carries no license.

## Rules of the send

6. Build the address from the template of the entry only. Each value from a pin or from a chain reply passes its class before it enters the address.
   - The class is the `<name>` of a `licenses` line or the `<pin>` of the Source values table in `lawman/skills/lawman-law/references/exhibits.md`.
   - Where the entry names a class of its own, that class applies.
   - A value outside its class is not sent. Its pin goes to Coverage.
   - A substituted value is one encoded path segment. `.` and `..` fail.
   - A computed result, such as a hash, a slice or a change of case, passes the segment class too.
7. Take the scheme, host, port and login from the entry, never from the tree and never from a reply.
8. Use https only. Follow no redirect. The settings of the user's tools do not apply. Send the User-Agent line of the entry. Find the way to send the request and take the value yourself. Use only the forms that the harness page accepts in a scheduled run, as it says under "Sending to license sources".
9. Keep the pace of the entry. Where it names none, send one request at a time. A reply that says the limit is spent, 429 included, ends the requests to that source for this tick. The other pins go to Coverage by number. Do not retry or go round by another address or key.
10. Match a reply to its pin by the key the reply names, never by position. Send a batch only when the block of the entry describes one.
11. A failed or refused request goes to Coverage with its code, and the tick goes on. A request counts only when it has ended with a result. With no result, it goes to Coverage as `unread`.
12. A row may give no value or text: `no-record`, `no-field`, `rate-limited`, `unknown-host`, `status-<code>` or `unread`. Then the pin goes to the next agreed row of its ecosystem. This holds only if the pin carries the fields that the `Pin carries` line of that row names.
    - A row that gives a value or text closes the pin.
    - A pin with no value is `no-field` when any row asked gave that answer. Otherwise it takes the result of the last row asked.
    - Give `unlicensed` to a lead only after every agreed row has answered. A row left unanswered by a limit leaves the pin in Coverage.
13. A result of a row whose entry says `A finding rests on it: no` grounds no lead. It goes to Coverage by number.
14. Take the clock before the first request to a row in a visit. Start no new request once the time limit of one command on the harness page has passed since then. The rest go to Coverage as `unread`, with the count. Start each visit at a random place in the list of pins and go round, so several visits cover the list.
15. On the first request to a row in a visit, check the reply before you send more. The reply for the pin you sent must be a readable answer of the row's form. An honest `no-record` or `no-field` reply passes. So does any reply the row's block maps to a result: a status such as a 404 or a 301 among them. When you find no way to send, or the reply is one you cannot read, close the row for this tick. Its pins go to Coverage as `unread` or `status-<code>`, with no retry. Write no file about the way or the check.

## Results

- The value of the license: an expression, a free string or a text.
- `no-field`: the source knows the version and states no license.
- `no-record`: the source does not know the version, or the file is not found. It is not `unlicensed`.
- `not-covered`: no agreed row covers the pin.
- `unknown-host`: the host of a git pin is outside the table.
- `rate-limited`: the limit is spent.
- `unread`: the field was not read, or no result came.
- `unclear`: a text is not known whole.
- `status-<code>`: the reply code.

A free string reaches you as data, and you decide the family from the page.

## Files behind this one

- Follow `lawman/skills/lawman-law/references/departments/licenses/field.md` for every reply that gives a value or a key.
- Follow `lawman/skills/lawman-law/references/departments/licenses/text.md` when the row gives the text of a license. Follow `field.md` as well when the row has chain steps.

## What the read leaves

A lead about a dependency read from a source carries these.
- For `conflict`, the measurement is the record read from a source, as Evidence holds it.
- For `unlicensed`, the measurement is the `no-field` answer of the source, as read. Quote the field with its null value, or name the fields that the reply holds and show that the license field is absent.
- Evidence holds the request as run, in a form fit to repeat. It also holds the verbatim field or clause from the cleaned output and the UTC time of the read. It ends with the attribution line of the precinct's entry, when the entry has one.
- Not checked holds `Source: licenses <source> <ecosystem>/<name> <pin>`.

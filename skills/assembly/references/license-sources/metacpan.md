# metacpan

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

fastapi.metacpan.org

## Measured

6 of 6 in one call

## Limits and terms

The only rule is to "be polite". At most 5000 per request. A self-introduction is asked and is not mandatory. robots.txt closes the whole host to crawlers, and the API documentation does not mention it.

## Traps

Slugs such as `perl_5` are not SPDX and go down the text path. `perl_5` means two licenses. Ask with `_source: ["name","license"]`, not `fields`: `fields` gives a reply 190 times larger. Largest reply seen: 1 990 bytes.

## Fits when

`cpanfile.snapshot` pins a distribution. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills only the tool name and version and the project address in the User-Agent line.

- Source: metacpan. Level: version. A finding rests on it: yes.
- Pin carries: distribution name, version.
- Request: POST https://fastapi.metacpan.org/v1/release/_search
- Headers: `Content-Type: application/json`
- Values: the body is `{"query":{"terms":{"name":["{distribution}-{version}", ...]}},"_source":["name","license"],"size":100}`. `{distribution}` passes the class `<name>` of a `licenses` line. `{version}` passes the class `<pin>`.
- Key of the reply: `hits.hits[]._source.name`. It must equal `{distribution}-{version}`. Two hits for one key make the pin `unread`. No hit makes it `no-record`.
- Take: the list of slugs `_source.license`.
- Reply form: JSON batch
- Batch: up to 100 pins per request.
- Pace: none stated by the service. The interval is the time of the request at the live read of the assembly.
- Requests per pin: not counted for a batch row. One request carries up to 100 pins, and one batch is 1 request.
- User-Agent: <tool name and version>; <project address>

## Live sample

- Sample: Try-Tiny 0.31. Expect: ["mit"].
- Batch sample: Try-Tiny 0.31 expects ["mit"], Mojolicious 9.34 expects ["artistic_2"], DBI 1.643 expects ["perl_5"].

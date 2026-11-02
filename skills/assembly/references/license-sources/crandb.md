# crandb

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

crandb.r-pkg.org

## Measured

10 of 10, R codes

## Limits and terms

Named a public API by METACRAN. No terms and no limits found. robots.txt holds no Disallow. Not the official CRAN service

## Traps

`MIT + file LICENSE` is not plain MIT. `GPL (>= 2)` needs reading. `shiny` and `lubridate` changed license between versions. Largest reply seen: 8 819 bytes (`shiny 1.8.0`, read 2026-11-02).

## Fits when

`renv.lock` pins a CRAN package. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: crandb. Level: version. A finding rests on it: yes.
- Pin carries: name, version.
- Request: GET https://crandb.r-pkg.org/{name}/{version}
- Values: `{name}` passes the class `<name>` of a `licenses` line, and its case is kept. `{version}` passes the class `<pin>`.
- Key of the reply: `Version`. It must equal the pin.
- Take: the field `License`.
- Reply form: JSON object
- Pace: none stated by the service.
- Requests per pin: 1
- User-Agent: lawman <release_tag>; <release_repo>

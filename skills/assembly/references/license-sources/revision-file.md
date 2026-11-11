# revision-file

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

The hosts of the host table

## Measured

33 of 33 Swift pins, 20 of 20 actions.

## Limits and terms

Host terms read as unclear, except Gitiles. GitHub: the acceptable use policy bars excessive automation, limits of raw are not published, read single files by commit. GitLab: website terms bar automated collection unless the license of the content permits it. Raw limit 300 per minute per file and 800 per minute for an unauthenticated project. Watch `RateLimit-Remaining` and `Retry-After`. Codeberg: the terms do not bar it, robots.txt closes the raw path. Gitea.com: website terms bar automated collection as GitLab's do, robots.txt closes the raw path, crawl delay 2. Bitbucket: access only through supported interfaces, 60 anonymous requests per hour for API requests with raw not named, robots.txt closes the raw path. Gitiles on googlesource.com: clearly allowed, robots.txt does not close a file at a commit.

## Traps

Monorepo subfolders are not read. Relicensed projects differ by pin: redis, terraform, elasticsearch, grafana. `Apache-2.0` hides the Swift runtime exception unless the text is read. A `binary` Carthage line has no source. gitea.com answers a label with 404, and the role never sends one there.

## Fits when

The tree pins a git address on a table host. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: revision-file. Level: revision for a commit and ref for a label. A finding rests on it: yes.
- Pin carries: the address of the repository as the tree writes it, and a commit hash or a label.
- Request: GET <address of the host table row, once for each file name>
- Values: The host of the address chooses the row of the host table. The host name must equal a table host after the role writes it in lowercase. A host outside the table gets no request: the result is `unknown-host`. The role cuts off a `.git` suffix and trailing slashes. An address with a user name or a password sends nothing, and its pin goes to Coverage as `unknown-host`. An address with a port is `unknown-host`. Each segment of `<owner>`, `<repo>`, `<workspace>` and `<path>` passes the class `<name>` of a `licenses` line. `<path>` has several segments on `gitlab.com` and on `chromium.googlesource.com`. `<rev>` and `<commit>` pass the class `<pin>`. `<file>` is a file name of the list below. The rows of `codeberg.org`, `gitea.com` and `chromium.googlesource.com` take a commit only. A label there is `unknown-host`. A pin with a hash whose host is outside the table goes to the source `software-heritage` when that source is agreed. Run no git, clone nothing and walk no tree. Fetch one file at one commit.
- Key of the reply: none: the address names the pin
- Take: the whole text of the first file found. The role tries the file names in the order of the list and stops at the first reply that holds a file. A 404 moves to the next name. When no name finds a file, the result is `no-record`.
- Reply form: text
- Special reading: The reply of `chromium.googlesource.com` is base64. The role decodes it before it reads the text.
- Host table:

  | Host of the pin | Address of the request |
  | :-- | :-- |
  | github.com | `https://raw.githubusercontent.com/<owner>/<repo>/<rev>/<file>` |
  | gitlab.com | `https://gitlab.com/<path>/-/raw/<rev>/<file>` |
  | codeberg.org | `https://codeberg.org/<owner>/<repo>/raw/commit/<commit>/<file>` |
  | gitea.com | `https://gitea.com/<owner>/<repo>/raw/commit/<commit>/<file>` |
  | bitbucket.org | `https://bitbucket.org/<workspace>/<repo>/raw/<rev>/<file>` |
  | chromium.googlesource.com | `https://chromium.googlesource.com/<path>/+/<commit>/<file>?format=TEXT` |

- File names, up to 12, in this order: `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `License.md`, `COPYING`, `COPYING.md`, `COPYING.txt`, `LICENCE`, `UNLICENSE`, `LICENSE-MIT`, `LICENSE-APACHE`, `MIT-LICENSE`.
- What maps to `revision-file` and what does not:

  | Pin in the tree | Result |
  | :-- | :-- |
  | `Package.resolved`, `remoteSourceControl` | Commit at the location |
  | `Package.resolved`, `registry` | `not-covered` |
  | `Package.resolved`, `localSourceControl` | `unknown-host`. The location is a local path |
  | `Cartfile.resolved`, `github` or `git` | Label or commit |
  | `Cartfile.resolved`, `binary` | `not-covered` |
  | Submodule | Commit at the configured address |
  | `uses:` with a commit | Commit at the host of the workflow |
  | `uses:` with a label such as `@v4` | `ref` |
  | `uses:` with `https://<host>/...` | That host |
  | `uses:` relative on Forgejo or Gitea | `unknown-host`. The tree does not state the instance |
  | `uses: ./path` | Held material in the tree |
  | `uses: docker://` | `not-covered` |
  | GitLab component `<host>/<path>/<name>@<version>` | Commit or label at that host |
  | Git dependency of any language | Commit or label at its address |
  | Julia `git-tree-sha1` | Tree hash, `software-heritage` |

- Pace: none stated by the service. A 429 stops the requests to that host.
- Requests per pin: up to 12
- User-Agent: lawman <release_tag>; <release_repo>

# software-heritage

Measured 2026-10-31, anonymously, on public packages. Terms read 2026-11-01.

## Recipient

archive.softwareheritage.org

## Measured

29 of 33 newest, 33 of 33 older. One Julia tree.

## Limits and terms

Free use of the public API by a program, not for extracting significant parts of the archive (terms of use, read 2026-11-01). 120 anonymous requests, named by a response header. The service may set quotas at any time, and a way around them breaks the terms. The window is not stated in the documentation. Never say that the archive approved the use.

## Traps

New commits can be missing. Three requests per pin. The archive finds licenses automatically and makes no claim of correctness: report a result as found, not as established. The symlink `perms` value in a reply is 40960, not 120000.

## Fits when

A git commit or tree hash stands in the tree. Read 2026-11-01.

## Entry block

Copy this block into the entry of the precinct word for word. The assembly fills `<release_tag>` and `<release_repo>` in the User-Agent line from `config.yaml`.

- Source: software-heritage. Level: revision. A finding rests on it: yes.
- Pin carries: a commit hash (`git`) or a tree hash (`git-tree`), 40 hexadecimal digits.
- Request: GET https://archive.softwareheritage.org/api/1/revision/{hash}/
- Values: `{hash}` passes the class `<pin>` and holds 40 hexadecimal digits.
- Key of the reply: none: the address names the pin
- Take: the whole text of step 3
- Reply form: JSON object at step 1, a JSON list of entries at step 2, text at step 3
- Chain: Step 1 is the request above and runs for a commit hash only. Take `directory` from the reply. Step 2 is GET https://archive.softwareheritage.org/api/1/directory/{directory}/. For a tree hash the chain starts here and `{directory}` is the pin. Take `target` from the first entry of the list that has `type` equal to `file` and a `name` equal to a file name. The role tries the names in this order: `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `License.md`, `COPYING`, `COPYING.md`, `COPYING.txt`, `LICENCE`, `UNLICENSE`, `LICENSE-MIT`, `LICENSE-APACHE`, `MIT-LICENSE`. Step 3 is GET https://archive.softwareheritage.org/api/1/content/sha1_git:{target}/raw/. Take the whole text. Each hash taken from a reply passes the class `^[0-9a-f]{40}$` before the role puts it in an address. Otherwise the result is `unread`. A list without a file of those names gives `no-record`.
- Pace: 120 anonymous requests, named by a response header. The service states no window. The result `rate-limited` stops this source for the tick.
- Requests per pin: 3 (2 for a tree hash)
- User-Agent: lawman <release_tag>; <release_repo>

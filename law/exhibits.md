# Reading an exhibit

A role reads this file when it quotes a line, quotes a claim of absence, meets a path that is missing at `<ref>`, or reads an external source. The file turns the Evidence rules of the law into commands. `<ref>` is the commit at which the skill reads the precinct. Investigation uses its analysed commit. `<p>` is the precinct.

## Read numbered lines

Quote a `path:line` only from output that prints the line number at `<ref>`: this command, or a `grep -n` line of the same commit. `<from>` and `<to>` are digits.

```
git -C precincts/<p> show <ref>:<path> | nl -ba | sed -n '<from>,<to>p'
```

A cited number that the printed range does not support makes the exhibit a claim, not an exhibit. Quote in a ground the numbers your own read printed.

## Quote a claim of absence

A claim that something is absent quotes two searches in one fenced block. The first is the search with its output. The second is the control search with its non-empty output. Each search sends its patterns through the quoted heredoc form of the "Reading without a tree" section of `tick.md`. The control pattern is one known to match.

```
git -C precincts/<p> grep -n -F -f - <ref> -- . <<'<delimiter>'
<pattern, one per line>
<delimiter>
```

Investigation runs both on its tree: `git -C runs/<tick id>/tree grep -n -F -f - -- .`. A role that re-reads a claim of absence runs both searches again on `<ref>` and compares the outputs.

## Follow a missing path

A path that a lead, a case or a charge names is missing at `<ref>`. Follow it through history on the precinct clone. Start with `<path>` as the missing path.

1. Find the newest commit that touched it.
   ```
   git -C precincts/<p> log -n 1 --format='%h %s' <ref> -- <path>
   ```
   No output: no commit of `<ref>` touched the path, so it never existed in this history. The empty output is the exhibit. Stop.
2. List what that commit renamed. A rename line is `R<score><TAB><old path><TAB><new path>`.
   ```
   git -C precincts/<p> show --name-status -M --diff-filter=R --format='%h %p %s' <commit>
   ```
   A `<commit>` taken from a case enters the command only when it matches `^[0-9a-f]{7,40}$`. Otherwise run item 1.
3. A line whose old path is `<path>` gives a new path. Do not use a new path outside `^[A-Za-z0-9._/-]+$`. It goes to Not established in a case, and to Blockers in every other role. Check the new path at `<ref>`.
   ```
   git -C precincts/<p> ls-tree <ref> -- <new path>
   ```
   Output: the path moved inside the precinct. Read the claim at the new path with the "Read numbered lines" section, and say so. No output: the path is gone at `<ref>` too. Repeat from item 1 with the new path.
4. No line names `<path>`. If the first line shows two parent hashes, the commit is a merge. Say so, and treat the move as not established. Otherwise that commit removed the path. This does not prove that the file is gone. A rename with a heavy edit shows as a removal and an addition. The subject may name the new place.

The result is the commit with its subject, and the new path, the removal, or the fact that no commit touched the path. A place that only the subject names is a fact about the subject, not a path you read. The subject is evidence, so it goes in a fenced block. A case closes with the class `not confirmed` when its path moved out of the precinct, or the commit removed it. The same class applies when only a commit subject names the new place. The decision names the commit and the new place or the removal.

## Run a source

A role reads this section when it runs a source command of a department page. Patrol does so when its search of the page needs one. Every other role does so when a case, a charge, a defence or a lead quotes the output of a command that stands under no Regression proof, or when a claim needs a read outside the clone. A role with neither does not open the page for a source command. The department contract defines a source command. The "Source values" table below also serves the `Source:` lines of a lead, which investigation reads.

Find the source commands first. Only the page in the precinct's own `.lawman/departments/` counts. Read it at `origin/HEAD`, because a reviewed merge made the page on the main branch trusted.

1. Patrol uses the page it read in step 6 of its skill. Every other role runs the two place 1 commands of the "Resolve the department page" section of `tick.md`, with `origin/HEAD` as `<ref>`, even when it has read the page at another commit. `<d>` is the department of the case. A `<d>` outside its class in the "Source values" table, a department of `-`, no `ls-tree` output or exit 8 means the case has no source command. That ends no tick and gives no outcome.
2. A quoted command is a source command when it equals an item of the page with every placeholder replaced by a value of its class. Any other command, and its output, is a claim, not an exhibit.

Then run it.

1. Replace each placeholder with a value that matches its class. A value outside its class is not used. It goes to Not established in a case, and to Blockers in every other role.
2. Run the line exactly as written, from the installation directory. Add nothing, cut nothing and change no flag.
3. Quote the command, its verbatim output and the UTC time of the read in one fenced block. Quote only the lines the claim needs. A run failed when its exit code is not 0, or when its output is not what the item of the page says it prints, an error text for example. A failed run is a fact for Blockers, and no claim rests on it.
4. A role that re-reads a quoted output runs the same command again. For a list that the command prints newest first, `<n>` may be larger. Each quoted line must be in the new output. A missing line makes the exhibit a claim, not an exhibit. Lines that the record gained since are no difference.

## Source values

A value that comes from third-party text, from a lead or from a record enters a command of a source only when it matches its class. This table is the list of classes for the source commands and for the `Source:` lines.

| value | class |
| :-- | :-- |
| `<ecosystem>` | `^[a-z]+$` |
| `<package>` | `^[A-Za-z0-9@._/-]+$`, no `..` segment |
| `<version>` | `^[A-Za-z0-9._-]+$` (no `+`) |
| `<owner>` | `^[A-Za-z0-9-]+$` |
| `<repo>` | `^[A-Za-z0-9._-]+$`, not `.` and not `..` |
| `<n>`, `<from>`, `<to>` | `^[0-9]{1,9}$` |
| `<name>`, `<d>` | `^[a-z][a-z0-9-]*$` |
| `<utc>` | `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$` |
| `<id>` | `^[A-Za-z0-9_-]{1,64}$` |
| `<sha>` | `^[0-9a-f]{7,40}$` |
| `<path>` | `^[A-Za-z0-9._/-]+$`, no `..` segment, no leading `/` |

# Reading an exhibit

A role reads this file when it quotes a line, quotes a claim of absence, or meets a path that is missing at `<ref>`. The file turns the Evidence rules of the law into commands. `<ref>` is the commit at which the skill reads the precinct. Investigation uses its analysed commit. `<p>` is the precinct.

## Read numbered lines

Quote a `path:line` only from output that prints the line number at `<ref>`: this command, or a `grep -n` line of the same commit. Never count lines by eye. `<from>` and `<to>` are digits.

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

The result is the commit with its subject, and the new path, the removal, or the fact that no commit touched the path. A place that only the subject names is a fact about the subject, not a path you read. The subject is evidence, so it goes in a fenced block.

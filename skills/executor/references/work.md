# Executor recipes: tree, merge, work

Read this file at step 6 of the executor skill. It holds the recipes of steps 6 to 8.

`<delimiter>` is the heredoc delimiter of the tick file. Every `gh` command takes `-R <owner/repo>`. `<default>` is the default branch from step 2. A failed command ends the tick with `failed`, unless a step names another token.

## Tree

1. Check the values of the pull request. The first failed check ends the tick with `failed`. Blockers names the check, never the value.
   ```
   git -C precincts/<p> check-ref-format --branch <headRefName>
   ```
   - `headRefName` is in its class, the command above exits 0, and it differs from `<default>`.
   - `baseRefName` equals `<default>`.
   - `isCrossRepository` is `false`.
   - `headRefOid` matches `^[0-9a-f]{40}$`.
2. Compare the remote head with the head that the pull request reported. When they differ, or the commit is unknown, fetch again, read `headRefOid` again, and run the checks of step 1 on the new value.
   ```
   git -C precincts/<p> rev-parse origin/<headRefName>
   git -C precincts/<p> fetch origin --prune
   gh pr view <m> -R <owner/repo> --json state,headRefName,headRefOid
   ```
3. Create the tree on `headRefOid`. The second command must print it.
   ```
   git -C precincts/<p> worktree add --detach ../../runs/<tick id>/tree <headRefOid>
   git -C runs/<tick id>/tree rev-parse HEAD
   ```
   The path is relative to the clone, so `../../` leads back to the installation.
4. Run this only when `isDraft` is `false`. The read-back must print `true`. Anything else gives `stopped-readback`.
   ```
   gh pr ready <m> -R <owner/repo> --undo
   gh pr view <m> -R <owner/repo> --json state,isDraft --jq .isDraft
   ```

## Merge path

Run it when `mergeable` is `CONFLICTING`.

1. Merge the default branch. Take the message from the commit rules of the Read first and Executor loads files.
   ```
   git -C runs/<tick id>/tree merge -m "<message>" origin/HEAD
   ```
   A conflict makes the command exit 1. That is no failure. A merge with no conflict commits itself. Push it, as the "Commit and push" recipe says, and skip the rest of this recipe.
2. List the conflicted paths.
   ```
   git -C runs/<tick id>/tree diff --name-only --diff-filter=U
   ```
3. Resolve each conflicted path other than `LAWMAN.md` yourself. Stage it by name.
4. When `LAWMAN.md` is conflicted, let the journal resolve it. Write the three stages to files in the run directory, not in the tree.
   ```
   git -C runs/<tick id>/tree show :1:LAWMAN.md > runs/<tick id>/base.md
   git -C runs/<tick id>/tree show :2:LAWMAN.md > runs/<tick id>/ours.md
   git -C runs/<tick id>/tree show :3:LAWMAN.md > runs/<tick id>/theirs.md
   bin/journal precedent-merge --base runs/<tick id>/base.md --ours runs/<tick id>/ours.md --theirs runs/<tick id>/theirs.md --out runs/<tick id>/merged.md
   ```
   - A stage that `show` cannot print, or any other `LAWMAN.md` state, is no merge. Abort the merge and end the tick with `skipped-merge-conflict`.
   - `unresolved<TAB><reason>`: abort the merge and end the tick with `skipped-merge-conflict`. Blockers names the reason.
   - `merged<TAB>#<old>->#<new>[,...]`: copy `merged.md` over `LAWMAN.md` in the tree and stage it. Keep the pairs for `## Change`. Never count the numbers yourself.
     ```
     cp runs/<tick id>/merged.md runs/<tick id>/tree/LAWMAN.md
     git -C runs/<tick id>/tree add -- LAWMAN.md
     ```
   - A non-zero exit of `precedent-merge`: abort the merge and end the tick with `failed`.
   - To abort a merge, run:
     ```
     git -C runs/<tick id>/tree merge --abort
     ```
5. Run the "Leak check" recipe. Finish the merge with a commit. The message flag opens no editor. Push it, as the "Commit and push" recipe says.
   ```
   git -C runs/<tick id>/tree commit -m "<message>"
   ```

## Leak check

Run it before each commit, on the staged diff and on the message. Run it again on the comment text before its lint. The installation directory is the working directory of the tick, `$PWD`. The home directory is `$HOME`. Both are fixed strings.

Count the matches in the added lines of each staged file. A count above zero ends the tick with `failed`. Push nothing from the current part. Parts pushed earlier stay. Blockers holds the path and the count, never the value.

```
bash -c 'git -C runs/<tick id>/tree diff --cached --name-only -z | while IFS= read -r -d "" f; do n=$(git -C runs/<tick id>/tree diff --cached -U0 -- "$f" | grep -a "^+" | grep -a -c -F -e "$PWD" -e "$HOME"); if [ "$n" -gt 0 ]; then printf "%s\t%s\n" "$f" "$n"; fi; done'
```

No output means a clean diff. Check the commit message and the comment text the same way:

```
grep -c -F -e "$PWD" -e "$HOME" <<'<delimiter>'
<commit message or comment text>
<delimiter>
```

The output must be `0`.

## Work

- Keep the plan in your context. Write no plan file. Write no spec file.
- Write the documentation by the rules of the loaded files, in the same commits as the code. The loaded files name the documents. This skill does not.
- Run a tool in a subshell. Quote its output only as evidence.
  ```
  (cd runs/<tick id>/tree && <command>); echo "exit $?"
  ```
- Read the diff the branch already holds against the default branch, to find old spec or plan files.
  ```
  git -C runs/<tick id>/tree diff --name-only origin/HEAD...HEAD
  ```
  A file that holds the old spec or plan of the work is removed with `rm -- <path>` and named in the comment.

## Commit and push

1. Read the changed paths.
   ```
   git -C runs/<tick id>/tree status --porcelain
   ```
2. Stage each path of the work by name. Leave out build output and anything the work did not mean to change.
   ```
   git -C runs/<tick id>/tree add -- <named paths>
   ```
3. Run the "Leak check" recipe on the staged diff and on the message.
4. Commit. The message follows the commit rules of the loaded files.
   ```
   git -C runs/<tick id>/tree commit -m "<message>"
   ```
5. Push the finished part. A refusal, such as non-fast-forward, ends the tick with `failed`. Blockers holds the git error line. The next tick continues from the new head. Push as often as parts finish.
   ```
   git -C runs/<tick id>/tree push origin HEAD:refs/heads/<headRefName>
   ```
6. Keep the pushed head.
   ```
   git -C runs/<tick id>/tree rev-parse HEAD
   ```

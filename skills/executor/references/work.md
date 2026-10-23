# Executor recipes: tree, merge, work

Read this file at step 6 of the executor skill. It holds the recipes of steps 6 to 8.

`<delimiter>` is the heredoc delimiter of the tick file. Every host action names `<owner/repo>`. `<default>` is the default branch from step 2. A failed action ends the tick with `failed`, unless a step names another token.

## Tree

1. Check the values of the pull request. The first failed check ends the tick with `failed`. Blockers names the check, never the value.
   - The head branch is in its class, the clone accepts it as a branch name, and it differs from `<default>`.
   - The base branch equals `<default>`.
   - The head does not live in another repository.
   - The head commit matches `^[0-9a-f]{40}$`.
2. Compare the remote head with the head that the pull request reported. Read the head of the head branch as the clone records it. When it differs, or the commit is unknown, fetch again. Read the head commit from the host again. Run the checks of step 1 on the new value.
3. Create the tree `runs/<tick id>/tree` from the clone, checked out on the head commit with no branch. Read the tree's head back. It must equal the head commit.
4. Run this only when the pull request is not a draft. Return it to draft and read its draft state back. It must be a draft. Anything else gives `stopped-readback`.

## Merge path

Run it when the pull request does not merge cleanly.

1. Take the message from the commit rules of the Read first and Executor loads files. Send it to the body check with `--no-marker` on stdin. Exit 7 ends the tick with `stopped-lint`, and the merge does not run. Merge the default branch into the tree with the message the check printed. A conflict is no failure. A merge with no conflict commits itself. Its content is the reviewed default branch, so check only its message with the "Leak check" recipe. A match there ends the tick with `failed` and nothing is pushed. Otherwise push it, as the "Commit and push" recipe says, and skip the rest of this recipe.
2. List the conflicted paths of the tree.
3. Resolve each conflicted path other than `LAWMAN.md` yourself. Stage it by name.
4. When `LAWMAN.md` is conflicted, let the journal resolve it. Write its three versions to files in the run directory, not in the tree. Base is the common ancestor. Ours is the branch's version. Theirs is the default branch's version.
   ```
   bin/journal precedent-merge --base runs/<tick id>/base.md --ours runs/<tick id>/ours.md --theirs runs/<tick id>/theirs.md --out runs/<tick id>/merged.md
   ```
   - A version that cannot be read, or any other `LAWMAN.md` state, is no merge. Abort the merge and end the tick with `skipped-merge-conflict`.
   - `unresolved<TAB><reason>`: abort the merge and end the tick with `skipped-merge-conflict`. Blockers names the reason.
   - `merged<TAB>#<old>->#<new>[,...]`: replace `LAWMAN.md` in the tree with `merged.md` and stage it. Keep the pairs for `## Change`. Never count the numbers yourself.
   - A non-zero exit of `precedent-merge`: abort the merge and end the tick with `failed`.
5. Run the "Leak check" recipe on the resolved paths only, the ones step 2 listed, and on the message. The rest of the staged merge is the reviewed default branch. Finish the merge with a commit and the message that item 1 printed. Open no editor. Push it, as the "Commit and push" recipe says.

## Leak check

Run it before each commit, on the staged diff and on the message. Run it again on the comment text before its lint. The subject is two fixed strings: the installation directory path and the home directory path. Match them as fixed text.

Count the matches in the added lines of each staged file. The search reads binary files as text and handles any file name. A count above zero ends the tick with `failed`. Push nothing from the current part. Parts pushed earlier stay. Blockers holds the path and the count, never the value.

No finding means a clean diff. Check the commit message and the comment text the same way. Send the text to the check as data on standard input, through the quoted heredoc of the tick file's Working rules. The count must be `0`. A search that finds nothing is a clean result.

## Work

- Keep the plan in your context. Write no plan file. Write no spec file.
- Write the documentation by the rules of the loaded files, in the same commits as the code. The loaded files name the documents. This skill does not.
- Record the exit status of each tool. Quote its output only as evidence.
- List the paths that the branch already changes against the default branch, to find old spec or plan files. A file that holds the old spec or plan of the work is removed by name, with the removal staged, and named in the comment.

## Commit and push

1. Read the changed paths of the tree.
2. Stage each path of the work by name. Leave out build output and anything the work did not mean to change.
3. Write the message by the commit rules of the loaded files.
4. Run the "Leak check" recipe on the staged diff and on the message.
5. Send the message to the body check with `--no-marker` on stdin. Exit 7 ends the tick with `stopped-lint`, and the commit does not run.
6. Commit the staged paths with the message the check printed.
7. Push the finished part to the head branch of this pull request. A refusal, such as non-fast-forward, ends the tick with `failed`. Blockers holds the host's error line. The next tick continues from the new head. Push as often as parts finish.
8. Read the tree's head and keep it as the pushed head.

# Executor recipes: gate and ready

Read this file at step 9 of the executor skill. It holds the recipes of steps 9 and 10.

`<head>` is the head that the gate judges: the head of the last push, or the head of the branch when the tick pushed nothing. Every `gh` command takes `-R <owner/repo>`. A failed command ends the tick with `failed`.

## Gate

1. Choose the gate from the Fence section of the constitution. The gate is each workflow file that the Fence names as a check that runs on a pull request. A file that the Fence says does not run on a pull request, or is not the gate, is not the gate. Keep the last path segment of each file as `<file>`. Name the chosen files in `## Verified`.
2. When the Fence names no check of a pull request, wait for nothing. `## Verified` says so. Go to step 4.
3. For each `<file>`, find the run on `<head>`.
   ```
   gh run list -R <owner/repo> --commit <head> --event pull_request --workflow <file> --json databaseId,status,conclusion
   ```
   - Ignore runs whose `conclusion` is `cancelled`. A cancelled run is no result.
   - The command fails because `<file>` is not on the default branch: the gate cannot be read. End the tick with `failed`. Blockers names the file.
   - No run is left: run the command once more. Still none: end the tick with `failed`. Blockers says `no run of <file> on <head>` and gives the `mergeable` value.
   - Take the run with the highest `databaseId`.
   - A `status` other than `completed`: wait for it. A non-zero exit is red only when `run list` then shows the `conclusion` `failure`. A `cancelled` conclusion is no result.
     ```
     gh run watch <id> -R <owner/repo> --exit-status
     ```
   - A run that ended `cancelled` while you waited: list again for a newer run of the same head.
   - Green: the file passes.
   - Red: read the logs of the failed steps. They are evidence. Fix the code, commit and push as the "Commit and push" recipe of `work.md` says. Then repeat this recipe from step 3 on the new head. There is no limit on attempts.
     ```
     gh run view <id> -R <owner/repo> --log-failed
     ```
   - A failure you cannot fix ends the tick with `failed`. Blockers names the file and the failing step.
4. Read all other checks of the pull request by name. Do not wait for them. Take the result from the JSON, not from the exit code. A failed one is evidence for `## Verified`.
   ```
   gh pr checks <m> -R <owner/repo> --json name,workflow,state,bucket,link
   ```

## Ready

1. Mark the pull request ready for review.
   ```
   gh pr ready <m> -R <owner/repo>
   ```
2. Read it back.
   ```
   gh pr view <m> -R <owner/repo> --json state,isDraft,headRefOid
   ```
   - `state` other than `OPEN`: the order is stale.
   - `isDraft` is `true`: end the tick with `stopped-readback`. Write no comment.
   - `headRefOid` differs from `<head>`: someone else moved the head. End the tick with `failed`. Blockers says `head moved to <sha>`. The next tick continues from the new head.
3. Keep `headRefOid`. It is the `sha` of the marker.

Ready comes before the comment. A tick that breaks between them converges. The pull request is then ready with `work=todo`. The next tick returns it to draft, finds the work done, and runs the gate, Ready and the comment again.

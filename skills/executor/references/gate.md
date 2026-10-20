# Executor recipes: gate and ready

Read this file at step 9 of the executor skill. It holds the recipes of steps 9 and 10.

`<head>` is the head that the gate judges: the head of the last push, or the head of the branch when the tick pushed nothing. Every host action names `<owner/repo>`. A failed action ends the tick with `failed`.

## Gate

1. Choose the gate from the Fence section of the constitution. The gate is each workflow file that the Fence names as a check that runs on a pull request. A file that the Fence says does not run on a pull request, or is not the gate, is not the gate. Keep the last path segment of each file as `<file>`. Name the chosen files in `## Verified`.
2. When the Fence names no check of a pull request, wait for nothing. `## Verified` says so. Go to step 4.
3. For each `<file>`, find the runs that a pull request started for `<head>` and `<file>`.
   - Ignore runs whose conclusion is cancelled. A cancelled run is no result.
   - The host reports that `<file>` is not on the default branch: the gate cannot be read. End the tick with `failed`. Blockers names the file.
   - No run is left: look once more. Still none: end the tick with `failed`. Blockers says `no run of <file> on <head>` and gives the merge state of the pull request.
   - Take the run with the highest id.
   - A status other than completed: wait for the run to finish. A wait that reports failure is red only when a fresh read of the run then shows the conclusion failure. A cancelled conclusion is no result.
   - A run that ended cancelled while you waited: look again for a newer run of the same head.
   - Green: the file passes.
   - Red: read the logs of the failed steps. They are evidence. Fix the code, commit and push as the "Commit and push" recipe of `work.md` says. Then repeat this recipe from step 3 on the new head. There is no limit on attempts.
   - A failure you cannot fix ends the tick with `failed`. Blockers names the file and the failing step.
4. Read all other checks of the pull request. Do not wait for them. Take the result from the data you read, never from the status of the read. A failed one is evidence for `## Verified`.

## Ready

1. Mark the pull request ready for review.
2. Read it back: its state, whether it is a draft, and its head commit.
   - The state is not open: the order is stale.
   - It is still a draft: end the tick with `stopped-readback`. Write no comment.
   - The head commit differs from `<head>`: someone else moved the head. End the tick with `failed`. Blockers says `head moved to <sha>`. The next tick continues from the new head.
3. Keep the head commit you read back. It is the `sha` of the marker.

Ready comes before the comment. A tick that breaks between them converges. The pull request is then ready with `work=todo`. The next tick returns it to draft, finds the work done, and runs the gate, Ready and the comment again.

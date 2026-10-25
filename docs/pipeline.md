# The pipeline

Lawman watches software repositories with ten roles. A repository under watch is a precinct. Each role is a Markdown skill that runs on the scheduler of your agent harness.

The roles form a funnel. Patrol sweeps a whole subject cheaply and files draft leads. Later roles test, argue, rule and build. Each stage costs more per case and sees fewer cases than the stage before it.

This page summarises the law and links the files that bind each part. Where this page and the law differ, the law wins. The law is [LAW.md](../skills/lawman-law/references/LAW.md).

## The roles

| Role | Takes | Leaves |
| :-- | :-- | :-- |
| Duty desk | The journal and the synced trackers of every precinct with a weight above zero | At most one order per role. No issue and no comment. |
| Patrol | An order that names a precinct and a department | At most the cap of draft leads, each an issue with a `lead` marker |
| Response unit | An order on an issue that a human wrote | One comment: a lead, a question or an out. For a feature request sent out, at most one label |
| Investigation | An order on an issue with a lead | A `Case` comment with facts only |
| Prosecutor | An order on an issue with a case | A `Decision` comment: charge, return or decline |
| Defender | An order on a charged case | A `Defence` comment: defence, return or refute |
| Court | An order on a defended case | A `Ruling` comment: a conviction with a priority, or an acquittal that closes the issue |
| Clerk | An order for one job on an issue | A draft pull request, a hand-over comment, a close or a reopen, and a marker comment |
| Spec writer | An order on a pull request that needs a spec | One `Spec` comment |
| Executor | An order on a pull request with an approved spec | Pushed commits, a pull request ready for review and one `Executor` comment |

The duty desk, the clerk, the spec writer and the executor are not stages of the funnel. Every role does one unit of work per tick and exits.

## Each role in short

### Duty desk

The duty desk runs its own tick. It computes the alarms, syncs the tracker and the pull requests of each precinct with a weight above zero, and writes orders. It writes at most one order per role per tick. It files nothing and comments on nothing. It leaves no marker.

### Patrol

Patrol takes an order that names a precinct and a department. It sweeps that department's subject at one commit. It files at most as many leads as the cap allows. A lead is an issue titled `[Lead] <department>: <symbol>: <what>`. Its last line is a marker with `role=patrol stage=lead`. Patrol never comments and never closes an issue.

The cap shrinks as the backlog grows. A department with up to 2 open leads on the precinct allows 3 filings per tick. With 3 or 4 open leads it allows 1. With 5 or more it allows none. At cap 0 the tick ends `capped`.

A live secret raises an alarm instead of a lead. Patrol prints an `ALARM sweep` line and writes nothing to the tracker. A run that files nothing is a success. In a healthy precinct it is the common outcome.

The department `vulnerabilities` works differently, because the finding is a match and not a guess. Patrol takes the list of the precinct's pinned dependencies by the way that the assembly agreed with you and hands it to the journal. The journal cuts the list into parts and prints each request. Patrol sends it with the send form of the harness page and hands each reply back unread. The journal compares every match with its cache and prints which matches are new. Patrol files them within the cap and raises no alarm. The check runs at every visit, because the catalog changes without a commit. See [the journal](journal.md#the-catalog-check).

- It runs only for a precinct that gave consent and has an agreed way. Otherwise the tick ends with an ordinary outcome, and the report says that the check did not run.
- It runs on any harness whose page carries a send form. Hermes carries one today. On a harness without one the tick ends the same way.
- A reply that cannot be read, or that is partial, is a failed read and never an empty result. The matches of the other parts still count. The failure goes to Blockers.
- The report gives the number of entries sent. It names the entries that were not sent because no version was resolved.

### Response unit

The response unit takes an order on an issue that a human wrote. It reads the issue and its comments as evidence. It leaves one comment with one marker:

- A `Lead` comment turns the issue into a lead. The marker is `stage=lead` with `department=-`.
- A `Question` comment asks the reporter one question. The marker is `stage=await`.
- A `Not processed` comment sends the issue out of the funnel. The marker is `stage=out` with the reason `feature`, `injection` or `other`. For `feature`, the response unit also prints one `ALARM feature` line and applies the constitution's owner-attention label to the issue, when the constitution names one.

### Investigation

Investigation takes an order on an issue with a lead. It tests the lead against the tree at one commit. It leaves a `Case` comment that holds facts and no opinion, severity or fix. The marker is `stage=case` with the commit `sha`. For a lead of the catalog check, it also reads one fresh catalog record by its identifier, through the journal, and quotes it. It does so only with consent, and a response-unit lead triggers no read.

### Prosecutor

The prosecutor takes an order on an issue with a case and decides. A charge carries `stage=charge` and leaves the issue open. A return puts one question to investigation and carries `stage=return`. A decline carries `stage=decline` and closes the issue with a closure class. The comment is headed `Decision`.

### Defender

The defender takes an order on a charged case and argues against the charge. A defence carries `stage=defence`. A return carries `stage=return`. A refute carries `stage=refute` and closes the issue with a closure class. The comment is headed `Defence`.

### Court

The court takes an order on a defended case and rules once, in a `Ruling` comment.

- A conviction carries `stage=conviction`, the commit `sha` and a priority. The issue stays open.
- An acquittal carries `stage=acquittal` and closes the issue with a closure class.

The court never returns a case. Its doubt is an acquittal. The court names one priority. P0 is a live secret, a vulnerability or a serious violation. P1 is harm to users or maintainers now. P2 is the default. P3 is cosmetic or of small value. At P0 the court prints an `ALARM case` line in the same tick. It may ask an outside model for evidence about the priority when the installation and the precinct allow it. See [configuration](configuration.md).

### Clerk

The clerk takes an order for one job on an issue. The journal names the job. The clerk is the only role that opens a pull request and the only role that links an issue to its pull request.

- For a conviction it opens a draft pull request from a new branch.
- It takes up an open pull request of the trusted login.
- It carries a decider's close or reopen to the other side of the pair.
- It settles a merged or closed pull request.
- It records a precedent.

After a job the clerk leaves a marker comment. The stages are `handed`, `shut`, `settled`, `kept`, `entry` and `no-entry`. A hand-over comment on the pull request carries `stage=handoff`. The clerk never merges, never reviews and never reacts.

### Spec writer

The spec writer takes an order on a pull request. It reads the pull request and every source issue in full, as evidence. It writes one `Spec` comment with the sections Problem, Change, Acceptance and Out of scope. The marker is `stage=spec` with the tip `sha`. It never edits a spec. A revision is a new comment. Specs go out back to back, so a pending vote blocks nothing.

### Executor

The executor takes an order on a pull request whose newest spec a decider approved and whose work is not done. In one tick it plans and writes the code and the documentation in a copy of the branch. It pushes each finished part to the head branch of the pull request. When the gate runs of its last push are green, it sets the pull request ready for review. It leaves one `Executor` comment with the marker `stage=ready` and the pushed head. A tick that breaks off continues from the pushed commits. The executor never merges, never force-pushes, never reviews and never reacts.

## Returns and rounds

A stage that doubts a case returns it with one precise question for investigation. Only the prosecutor and the defender return, and each returns at most once per issue.

A round is the number of returns plus one. A return is possible in rounds 1 and 2. In round 3 nobody returns, so no case has a fourth round. The prosecutor then declines instead, and the defender writes a defence or refutes.

A stop is different. It comes from an external cause, such as a failed credential or a rate limit. It ends the tick and never the case.

## Stages and markers

State lives in markers. A marker is one HTML-comment line at the end of an issue body or a comment. Labels carry no state. Only the issue body and the comments of the trusted login count. The grammar is in [markers.md](../skills/lawman-law/references/markers.md).

The newest marker of a role on an issue wins. Nobody edits an old marker. A role writes a new one.

A case runs in this order: lead, case, charge, defence, ruling, then the clerk's pull request. The journal reads the markers and names the next role. `bin/journal case <precinct> <issue>` prints `need=` with `investigation`, `prosecutor`, `defender`, `court`, `clerk` or `none`. An issue whose newest clerk marker names a pull request has left the funnel.

A pull request has its own stage. `bin/journal pull <precinct> <pull request>` prints `need=` with `spec-writer`, `executor` or `none`. A pull request needs a spec when it has none or when the newest spec drew a 👎. It needs the executor when the newest spec has a 👍 and its `work` is `todo` or `returned`. Only a pull request that the clerk handed, in a precinct with a weight above zero, gets an order.

## How ticks are scheduled and taken

No daemon runs. The harness scheduler starts a role, the role does one unit of work and exits. Each role has its own job, schedule, model and interval, so roles never wait for each other.

### The wave

The duty desk runs first.

- It computes the alarms.
- It syncs each precinct with a weight above zero.
- It asks the journal what investigation, the prosecutor, the defender, the court and the clerk are due.
- It asks the same for the spec writer and the executor.
- It picks one precinct by weight and one department by rotation, and writes the patrol order. See [departments](departments.md).

The response unit gets an order when a human-written issue still waits for a lead, a question or an out. Priority orders the queues of the clerk, the spec writer and the executor, P0 first.

Each role then starts on its own clock. It takes the oldest open order of its role with `bin/journal dispatch take`. An empty answer ends the tick as `silent`. The tick closes the order with its outcome. A taken order that nobody finishes becomes takeable again after 24 hours.

A role sees only orders that the duty desk already wrote. So a case moves one stage per duty desk run. A case that nobody returns passes eight stages and takes eight duty desk runs. Two steps wait for a person: the vote on the spec and the review of the pull request. The journal raises the alarm `decision-waiting` for each of them.

### Every tick

Every tick starts with the same checks. It syncs the law after a plugin update, then checks the journal schema, the law commit and its cleanliness, and the trusted login. A mismatch ends the tick with a `stopped-*` outcome.

The journal records the start and the end of every tick. A tick without an end record is unfinished, not successful. Every tick is idempotent under catch-up runs. The journal rejects a repeated order with exit code 2, and the role treats that as silence.

### The schedule

The assembly creates one scheduled job per role. It offers three plans: every day, economy and custom. In the economy plan the weekly roles run on successive weekdays in stage order.

The duty desk starts first. The other roles start 15 to 135 minutes later. Late stages run first, because they finish cases already started. Patrol runs last, because it starts new ones.

### Run gates

A run gate skips a session that has nothing to do. The harness runs a small file before the job. The file runs `bin/journal wake --role <role>`.

- The journal prints `idle` when the role has no order it can take.
- Otherwise it prints one `order <id>` line per takeable order and a `day <date>` line.
- When the output matches the last run, the harness skips the session.

The first run of a gated role always starts a session. A gate check counts as activity for the `role-silent` alarm. The duty desk takes no order and never gets a gate. The assembly writes the gates. See [the journal](journal.md).

## What reaches the developer

Silence is the default. A tick that succeeds, skips or stops answers only the silence form of the harness, and the harness delivers nothing. Only alarms and failures reach you, and a stop of the law sync or of the duty desk.

### Alarms

The journal computes the first six alarms below. The `case` and `sweep` alarms name a path and a line, never a value.

| Alarm | Raised when |
| :-- | :-- |
| `order-untaken` | An order stays open longer than the larger of 48 hours and the role's interval plus 24 hours. A taken order adds 24 hours. |
| `tick-hung` | A tick has no end record 2 hours after its start. |
| `role-silent` | A role that ended a tick before shows no tick start and no gate check for three intervals. |
| `tick-failing` | The last three ticks of a role on a precinct stopped, skipped or failed. |
| `broken-lead` | An open issue has the `[Lead]` title prefix and no lead marker. |
| `decision-waiting` | A handed pull request has a newest spec with no decider's vote, or finished work that waits for a decider. |
| `contract-changed` | After an update, the constitution contract differs from the version in `config.yaml`. Run the assembly to amend. |
| `case` | A role meets a live secret, a vulnerability or a serious violation in a case. A match with a catalog record is not a critical condition by itself. Only the court's P0 raises an alarm for it. |
| `sweep` | Patrol finds a live secret in the tree or the history. |
| `feature` | The response unit sends an issue out of the funnel as a feature request. |

The tick that finds an alarm prints it first in its reply. The `case`, `sweep` and `feature` lines read `ALARM case <precinct>#<issue> <one line>`, `ALARM sweep <precinct> <path>:<line> <one line>` and `ALARM feature <precinct>#<issue> <one line>`. An alarm line defeats the silence form, so the reply is delivered.

The journal marks a new alarm as notified. Later the duty desk repeats it once a day while the condition holds. A condition that disappears clears its alarm. Nothing repeats a `case` or a `feature` alarm. A `decision-waiting` alarm clears when a decider votes on the spec or when the pull request merges or closes. It also clears when the work returns or a newer spec replaces it. An approving review and a 👍 on the finished work do not clear it. A `sweep` alarm repeats at every patrol visit of a department with an alarm check while the secret stays.

### Failures and stops

A tick that ends `failed` means the role could not finish and no external cause explains it. A tick that ends `stopped-*` means an external cause stopped it. Examples are a failed login, a failed fetch, a rate limit and a drifted installation. A failed tick delivers its report. A stopped tick delivers nothing, unless the stop comes from the law sync or the duty desk. Those stop every role, and the duty desk prints the alarms, so nothing else would tell you.

A tick that ends `skipped-*` means the precinct or the department cannot be worked now, for example `skipped-no-constitution`. It delivers nothing. Three stopped, skipped or failed ticks in a row, of one role on one precinct, raise `tick-failing`.

### Reports

The full report of every tick lives in the journal. `bin/journal tick list` prints ticks with their reports. `bin/journal status` prints the open orders, the last tick of each role, the open alarms and the lead counts.

## What the maintainer does

The funnel runs without you until a decision needs a person. On a pull request, only a decider's reaction, close or reopen counts as a decision. A decider is a login that may write to the precinct's repository, access inherited from a group included.

- **Close a lead to decline it.** Any closure other than completed counts as declined. Patrol does not file the same finding again.
- **Vote on a spec.** React with 👍 or 👎 to the newest `Spec` comment. A 👎 wins, even beside a 👍. A reaction from a login that is no decider counts for nothing. A 👍 approves exactly the text that was read, because a spec is never edited.
- **Send finished work back.** React with 👎 to the newest `Executor` comment, or submit a Request changes review after it. Approvals, dismissed reviews and bot remarks return nothing.
- **Review and merge the pull request.** No role merges. After your merge the clerk closes the source issues as completed.
- **Close a pull request to decline it.** The clerk then closes its open source issues as not planned.
- **Reopen an issue or a pull request.** The clerk reopens the other side of the pair. A close or reopen by someone who is no decider is recorded and changes nothing.
- **Merge constitution pull requests.** The assembly drafts the constitution and its amendments, and the clerk opens precedent pull requests. A precedent binds the roles only after you merge it. See [constitution](constitution.md).

## Where the rules live

- [LAW.md](../skills/lawman-law/references/LAW.md): the law that binds every role.
- [tick.md](../skills/lawman-law/references/tick.md): the steps that nine roles share.
- [markers.md](../skills/lawman-law/references/markers.md): the marker grammar.
- [exhibits.md](../skills/lawman-law/references/exhibits.md): how a role quotes evidence.
- `skills/<role>/SKILL.md`: one skill per role, such as [the duty desk](../skills/duty-desk/SKILL.md) and [the executor](../skills/executor/SKILL.md).

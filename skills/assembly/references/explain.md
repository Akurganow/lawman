# Explanations

The assembly reads one section of this file only when the developer asks for that topic.

## Roles

1. Say: "The tiers are advice. No comparison between models is measured yet."
2. Show the guide:

| Role | What it solves | Tier | Why |
| :-- | :-- | :-- | :-- |
| Duty desk | Syncs the trackers and writes at most one order per role | light | A fixed chain of journal commands. It analyses nothing. |
| Response unit | Turns one issue a person wrote into a lead, a question or an out | medium | Classifies one issue and writes to people. |
| Patrol | Sweeps one department of one repository and files at most the cap | medium | Cheap and broad by design. Raise the tier when false leads are many. |
| Investigation | Tests one lead against the code, facts only | medium | Long reading with a structured result that the prosecutor attacks. |
| Prosecutor | Charges, returns or declines the case | strong | Adversarial judgement. |
| Defender | Defends, returns or refutes the charge | strong | Argues the other side. |
| Court | Convicts with a priority or acquits | strong | Rules once. Doubt means acquittal. |
| Clerk | Does the one job the journal names | light | Bookkeeping with git and GitHub. |
| Spec writer | Writes one spec on a pull request for your vote | medium | Reasoned design text that a person reads. |
| Executor | Writes the code of an approved spec and passes CI | strong | Writes code and waits for CI in its run. |

## Models

1. State these facts of "Models", as the page gives them:
    - Whether a command lists models.
    - How a name is written, and that the harness stores it unchecked.
    - That the provider is a separate flag.
    - How a job resolves its model at run time.
2. State that a job with its own model leaves the fallback chain when "Models" says so. State that `default` keeps the chain.

## Tiers

1. Say the sentence of the tier:

| Tier | Say |
| :-- | :-- |
| light | "The duty desk and the clerk run fixed commands that the journal names. They judge nothing." |
| medium | "The response unit, investigation, spec writer and patrol read and write long structured texts. A later stage checks them, or a person votes on them. If patrol files many false leads, raise its tier." |
| strong | "The prosecutor, defender, court and executor decide what is charged, ruled or built." |

## Schedule

1. Run the time zone read command from "Schedule forms and time zone", and show the zone.
2. Tell the developer:

> Lawman works in waves. A wave starts with the duty desk. It reads every repository that has a weight above zero and finds what each role should do next. It writes at most one order per role. Then each role starts on its own clock. It takes its order, does the work, leaves the result on GitHub and exits. Roles never wait for each other.
>
> A role sees only orders the duty desk already wrote. So a case moves one stage per duty desk run. Patrol files a lead. The next run orders the investigation. The run after that orders the prosecutor. A case that nobody returns passes eight stages: patrol, investigation, prosecutor, defender, court, clerk, spec writer and executor. That takes eight duty desk runs. Two steps wait for you: the vote on the spec and the review of the pull request.

3. Add the facts of the harness page. Give the time zone from item 1 and the schedule forms of "Schedule forms and time zone". Give the overlap of same-minute jobs from "Order and overlap". Give the catch-up rule of the page's catch-up section.

## Plans

1. Tell the developer about the economy plan:

> The weekly roles run on successive weekdays in stage order, and Thursday stays free for the clerk. A case charged on Monday is ruled on Wednesday. The clerk opens its pull request on Thursday, and the spec follows on Friday. The executor runs on Monday, after your vote. Each weekly role takes one case a week, so a queue grows when the stage before it delivers more.

## Clock order

1. Tell the developer:

> The duty desk runs first. A role that starts before it finishes takes its order at its next run. After the duty desk, the clock order of the roles does not make a case faster. It decides who spends your model budget first if the budget runs out. The late stages run first, because they finish cases already started. Patrol runs last, because it starts new ones.

## Lower frequency of a role

1. Tell the developer:

> How often a role runs is how many cases it takes: one per run. A role that runs weekly takes one case a week. An order may wait for its role. If you close the issue meanwhile, most roles end that run as stale. A run with no order still costs a short session. The run gate removes that cost.
>
> Lawman warns you when an order waits too long, and when a role stops running. Those limits follow the schedule you choose.

| Role | What a lower frequency changes |
| :-- | :-- |
| Duty desk | Every role waits for its order, so every case moves one stage per run of the desk. |
| Response unit | Issues that people write wait longer for a lead, a question or an out. |
| Patrol | Fewer new leads arrive, so less work enters the chain. |
| Investigation | Each run tests one lead, so leads wait longer for a case. |
| Prosecutor | Each run decides one case, so cases wait longer for a charge. |
| Defender | Each run answers one charge, so charged cases wait longer. |
| Court | Each run rules on one case, so defended cases wait longer for a verdict. |
| Clerk | Verdicts wait longer for a pull request. The clerk is cheap, so limit it only if you want to. |
| Spec writer | Each run writes one spec, so pull requests wait longer for their spec. |
| Executor | Each run builds one approved spec, so approved specs wait longer. |

## Run gate

1. Tell the developer:

> A run gate is a small file the harness runs before a role's job. It asks the journal whether the role has an order it can take now. When the answer is the same as last time, the harness skips the session, and the run costs nothing. The first scheduled run of a gated role always starts a session once. After each stretch of work, one empty run follows, because the answer changes back to idle. The files live in the harness's scripts directory, outside the installation. They stay there after you remove Lawman.

2. Tell the developer:

> Roles that only take work a person or an earlier stage made gain the most: response unit, prosecutor, defender, court, clerk, spec writer, executor. The duty desk takes no order and never gets a gate.

## Gate file

1. Tell the developer:

> The gate file is `lawman-<role>.sh` in the harness's scripts directory. The extension makes the harness run it with `bash`. The harness ignores the interpreter line, which stays for readers. The file holds two lines. The first is `#!/bin/bash`. The second is `exec bin/journal wake --role <role>`. It has no pipe, no `grep` and no `|| true`. The journal's exit status is the file's status.

## The sections of a constitution

| Section | Holds | Read by |
| :-- | :-- | :-- |
| Read first | Files every role reads before work | patrol, response unit, spec writer, executor |
| Fence | What CI already rejects | patrol, executor |
| Regression proof | Commands that prove no regression | investigation, prosecutor, defender, court, spec writer |
| Not judged | Pathspecs that no department judges | patrol |
| Execution | Where a role may run the tree's code | investigation, executor |
| Executor loads | Skills and rules the executor loads before it changes code | executor |
| Precedents | Settled questions | patrol, response unit, investigation, prosecutor, defender, court, spec writer |

## The weight

A weight is a share of patrol slots. A precinct with a weight and no merged constitution wastes its slot, because its tick ends `skipped-no-constitution`. The precinct starts at weight 0.

## The own department

A repository may have its own department, a special police for rules only that repository has. It can live in the repository itself or in your installation. It joins the rotation next to the shared departments.

The 'Add a department' job runs after the constitution's pull request merges, because it reads `LAWMAN.md` from the main branch.

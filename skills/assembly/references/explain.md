# Explanations

## Roles

1. Say: "The tiers are advice. No comparison between models is measured yet."
2. Show the guide:

| Role | What it solves | Tier | Why |
| :-- | :-- | :-- | :-- |
| Duty desk | Syncs the trackers and writes one order for every case, pull request, waiting issue and patrol visit that needs a role | light | A fixed chain of journal commands. It analyses nothing. |
| Response unit | Turns one issue a person wrote into a lead, a question or an out | medium | Classifies one issue and writes to people. |
| Patrol | Sweeps one department of one repository and files at most the cap | medium | Cheap and broad by design. Raise the tier when false leads are many. |
| Investigation | Tests one lead against the code, facts only | medium | Long reading with a structured result that the prosecutor attacks. |
| Prosecutor | Charges, returns or declines the case | strong | Adversarial judgement. |
| Defender | Defends, returns or refutes the charge | strong | Argues the other side. |
| Court | Convicts with a priority, acquits, or refers a requirement to a person | strong | Rules once, and again after a person answers a referral. Doubt on a defect means acquittal. |
| Clerk | Does the one job the journal names | light | Bookkeeping on the repository host. |
| Spec writer | Writes one spec on a pull request for your vote | medium | Reasoned design text that a person reads. |
| Executor | Writes the code of an approved spec and passes CI | strong | Writes code and waits for CI in its run. |

## Models

1. State these facts of "Models", as the page gives them:
    - Whether a command lists models.
    - How a name is written, with its provider where the page names one, and what the page says about a check of the name.
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

> Lawman works in waves. A wave starts with the duty desk. It reads every repository that has a weight above zero and finds what each role should do next. It writes an order for every case, pull request, waiting issue and patrol visit that needs a role. Then each role starts on its own clock. It takes its orders, up to the number of jobs set for the role. It does the work, leaves the result on the repository host and exits. Roles never wait for each other.
>
> A role sees only orders the duty desk already wrote. So a case moves one stage per duty desk run. Patrol files a lead. The next run orders the investigation. The run after that orders the prosecutor. A case that nobody returns passes eight stages: patrol, investigation, prosecutor, defender, court, clerk, spec writer and executor. That takes eight duty desk runs. Two steps wait for you: the vote on the spec and the review of the pull request.

3. Add the facts of the harness page. Give the time zone from item 1 and the schedule forms of "Schedule forms and time zone". Give the overlap of same-minute jobs from "Order and overlap". Give the catch-up rule of the page's catch-up section.

## Plans

1. Tell the developer about the economy plan:

> The plan's roles run in stage order, one after another, and one slot stays free for the clerk. A case charged at the first stage is ruled two stages later. The clerk opens its pull request at its stage, and the spec follows. The executor runs last, after your vote. Each role of the plan takes one case a run, so a queue grows when the stage before it delivers more.

## Clock order

1. Tell the developer:

> The duty desk runs first. A role that starts before it finishes takes its order at its next run. After the duty desk, the clock order of the roles does not make a case faster. It decides who spends your model budget first if the budget runs out. The late stages run first, because they finish cases already started. Patrol runs last, because it starts new ones.

## Lower frequency of a role

1. Tell the developer:

> How often a role runs sets how many cases it takes. It takes up to its number of jobs in each run, and most roles take one by default. A role that runs less often still takes that many cases each time it runs. An order may wait for its role. If you close the issue meanwhile, most roles end that run as stale. A run with no order still costs a short session. The role entry removes that cost.
>
> Lawman warns you when an order waits too long, and when a role stops running.

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

## Role entry

1. Tell the developer:

> The role entry is a small program the harness runs before a role's job. It asks the journal whether the role has an order it can take now. A role that has an order gets its input at once, with the law it reads, so it needs no first call of its own. A role with no order costs no session, because the harness skips it until an order comes. The duty desk always has work, so its entry always gives its input.

2. Name the entry of each role as the harness page names it under "Role entry". Say where it lives and, when it lies outside the installation, that it stays after you remove Lawman. Then tell the developer:

> The entry has no filter and no fallback. A journal that fails makes the entry fail. Every job the assembly creates uses it.

3. Only when the page names an older mode of the entry, tell the developer:

> A job created by an earlier release may run the entry in an older mode of the harness. The page of your harness says what that mode costs. The Roles part of the menu moves such a job to the new mode, after you approve the change.

## Commands

1. Tell the developer:

> A command is a small file that the journal runs for one operation. The operations: reading a repository, finding the account, listing issues and pull requests, finding who decides, and reading a file. Other operations: listing files, building a release, checking a release and reading the law version. The assembly proves each command on a throwaway database before it writes it. An operation with no file stays a step of the role.

## Limits

1. Tell the developer:

> Two numbers are yours to set. The number of jobs of a role is how many orders one session of it takes. The number of progress checks is how many checks in a row may find an order and take none before the alarm `no-progress` rises. The size of one part of a role's input is a fact of your harness, and the assembly only shows it.

## Delivery check

1. Tell the developer:

> At the end of the install the assembly can run two short one-off jobs on the route you chose. One sends a line that says it is a check, not an alarm. The other runs silently. Each run is a paid run of the harness's default model. You say whether each message arrived. The jobs are removed afterwards.

## Old precedents

1. Tell the developer:

> A precedent is now a file under `.lawman/precedents`, and the roles are bound by those files. A numbered line under `## Precedents` in `LAWMAN.md` binds no role. The assembly can move such lines to files in a pull request that the owner merges. The lines you leave stay as notes in the margin.

## The sections of a constitution

| Section | Holds | Read by |
| :-- | :-- | :-- |
| Read first | Files every role reads before work | patrol, response unit, spec writer, executor |
| Fence | What CI already rejects | patrol, executor |
| Regression proof | Commands that prove no regression | investigation, prosecutor, defender, court, spec writer |
| Not judged | Pathspecs that no department judges | patrol |
| Execution | Where a role may run the tree's code | investigation, executor |
| Executor loads | Skills and rules the executor loads before it changes code | executor |
| Labels | Labels that mean something to a person or to a role | court |

## The weight

A weight is a share of patrol visits. The duty desk does not cover a precinct of weight 0: no role gets an order there and no patrol visits it. A precinct with a weight and no merged constitution wastes its visit, because the duty desk writes no patrol order there. A precinct with a new draft starts at weight 0. A precinct whose constitution is already in place starts at weight 1.

## The own department

A repository may have its own department, a special police for rules only that repository has. It can live in the repository itself or in your installation. It joins the rotation next to the shared departments.

The 'Add a department' job runs after the constitution's pull request merges, because it reads `LAWMAN.md` from the main branch.

## The license department

The license department checks what licenses say about a project's dependencies and about the texts the project reads. It is new and off. The page `licenses` is the one page that joins a precinct's rotation only when `license_precincts` in `config.yaml` holds the whole token `<precinct>=yes`. You turn it on for one precinct by answering yes to the question that the assembly asks once. No source receives anything without your separate consent for its row. The assembly sends nothing to a source. The patrol finds the way to read it. The answers add an entry under `## License reading` in `host.md`, a section `## Licenses` in `LAWMAN.md` and the key `license_precincts`. Existing data stays as it is: the keys `catalog_*` and `typesafe_*`, the lines under `## Dependency reading` and the closed leads. The assembly asks no question about a migration. Re-check the precinct to change an answer.

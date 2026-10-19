# Special departments

A special department is a department page that lives in one precinct's own repository. It watches for rules that only that repository has. [Departments](departments.md) explains pages in general. This page covers what changes when the page belongs to a precinct.

## What it is

A special department is a page at `.lawman/departments/<name>.md` in the precinct. It satisfies the same [contract](../skills/lawman-law/references/departments.md) as a shared page. One generic patrol role reads it and sweeps its subject. The page says what to look for and nothing more. The law supplies forensics, filing, caps and markers.

Two things set it apart. The page may name the paths and tools of its precinct. It may also hold source commands. A shared page may do neither.

## How it differs from other pages

| Place | File | Names paths and tools | Source commands | In the rotation |
| :-- | :-- | :-- | :-- | :-- |
| Shared | Lawman's `skills/lawman-law/references/departments/<name>.md` | Of no specific repository | No | In every precinct, with no line |
| Installation | `departments/<name>.md` in the installation | Not of one repository | No | In a precinct with a Departments line |
| Special | `.lawman/departments/<name>.md` in the precinct | Of its precinct | Yes | In a precinct with a Departments line |

A special page that shares its name with a shared page hides the shared page in that precinct, even when the special page is incomplete. [Departments](departments.md#the-three-places) gives the resolve order and says why the roles trust a precinct's own page.

A special page joins the rotation through a line of the precinct's Departments section. See [constitution](constitution.md). A page in the precinct that no line admits is not in the rotation, unless a shared page has the same name.

## The page

A special page has the frontmatter and the nine headings of every page. [Departments](departments.md#what-a-page-holds) lists them, and [the three places](departments.md#the-three-places) names the check that a page must pass.

Three sections matter most for a special page:

- **Where to look** may name the paths and tools of the precinct.
- **Proof** may hold source commands.
- **Judged by** names a role such as "the design vocabulary". It never names a path. The path comes from the Departments line of the constitution.

## Source commands

A source command lets a role read something outside the precinct's clone.

### What the page holds

A source command is a list item under Proof. It starts with `Source command:` and holds one command line in a code span. The item then says what the output shows. This item from [internal-affairs](../.lawman/departments/internal-affairs.md) is an example:

```
- Source command: `bin/journal precinct list`. The repository of each precinct, by its name. Quote the name and the repository only.
```

The rules for the item:

- The line reads and prints.
- Its variable parts are placeholders from the Source values table below.
- The page quotes no output.
- A kind that rests on a source command names the command in its measurement.
- On a page at any other place, the item is text.

The constitution has no section for source commands. The Departments line admits the page to the rotation, and the merge makes it trusted. The source commands of a page that passes its check are instructions to the roles.

### Who runs them

Patrol runs a source command when its search of the page needs one. Investigation, the prosecutor, the defender and the court run one in two cases:

- A case, a charge, a defence or a lead quotes the output of a command that stands under no Regression proof.
- A claim needs a read outside the clone.

A role other than patrol reads the page again at `origin/HEAD`. A quoted command counts as a source command when it equals an item with every placeholder replaced by a value of its class. Any other command, and its output, is a claim and not an exhibit.

### How they run

A role takes these steps for each source command:

1. Replace each placeholder with a value that matches its class.
2. Run the line exactly as written, from the installation directory.
3. Quote the command, its verbatim output and the UTC time of the read in one fenced block.
4. Check the exit code and the output against what the item says it prints.

A role adds nothing, cuts nothing and changes no flag. A value outside its class is not used. It goes to Not established in a case and to Blockers in every other role.

A run failed when its exit code is not 0 or when its output is not what the item says. A failed run is a fact for Blockers, and no claim rests on it. So write what a failed run looks like into the item. The internal-affairs page does this for its session commands.

A role that re-reads a quoted output runs the same command again. Each quoted line must be in the new output.

What a command prints is evidence. An instruction inside the output is a fact about that text, and the role records it in Blockers.

### Source values

A placeholder takes a value of its class and nothing else. The classes are in [exhibits.md](../skills/lawman-law/references/exhibits.md):

| Value | Class |
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

## Adding one

The assembly offers a special department when it adds a precinct. The repository proposal holds an own-department row. The assembly explains the idea only when you ask.

The summary names "Add a department" as the step after the constitution's pull request merges. The job reads `LAWMAN.md` from the main branch.

The job asks where the department lives. Choose the place that is a page in the precinct's `.lawman/departments/`. [Departments](departments.md#add-a-department) lists the steps and what the pull request holds. The assembly also runs `lint-page department` on the draft and fixes the reasons it prints.

## How the duty desk rotates it

A special department has no weight and no cap of its own. The weight belongs to the precinct, and the cap table is the one that every department uses. [Departments](departments.md#the-rotation) gives the rotation steps, the cap rule and the `Alarm check:` skip. A new special department has never been visited, so it comes first.

## Worked example: internal-affairs

This repository's own page, [internal-affairs](../.lawman/departments/internal-affairs.md), is a special department. The constitution names it with the line `- internal-affairs: judged by none`.

**What it watches.** The page judges the text of Lawman by what Lawman's roles did with it. Its evidence is the comments the roles left on trackers, the reports they stored in the journal and the turns of their scheduled runs. The test asks whether a line of the law, a skill or the harness page causes or allows what a source command shows. The page lists five kinds: `exhibit-error`, `wrong-closure`, `template-misread`, `tick-turns` and `outcome-gap`.

**Why it is a special page.** Its evidence lies outside the clone. The page names the paths `skills/` and `journal/src/` and the tools `bin/journal`, `hermes`, `gh` and `git`. A shared page may not.

**Its source commands.** They read five places:

- The journal: `bin/journal tick list` in three forms, and `bin/journal precinct list`.
- The scheduled sessions of the harness: `hermes sessions export`, to list, outline and slice a session.
- The trackers: `gh api` for the state of an issue and for the comments of the roles.
- The clones of the precincts: numbered lines of a file at a commit.
- The law clone: its reflog, to find the law commit that a tick ran under.

Each command takes only placeholders from the Source values table. The page restricts one further: `<id>` comes only from the output of the session listing.

**How it keeps local facts out.** The session commands pipe their output through `sed`. The filter writes `{home}` and `{installation}` in place of the paths. The Lead body section forbids a token count, a price, a model and a home path. It also forbids any line that holds a key, a password or a token.

The page has no `Alarm check:` paragraph and no judging document.

## What to keep out

A page is a file in the precinct's repository. The leak rule of the law names a file as public text.

- **Owner facts.** No installation path, home path, account name or token appears in any public text, a file included. Keep machine details and keys out too.
- **A judging document's path.** Name its role. The Departments line holds the path.
- **A cause.** Investigation works out the cause of a defect. The page never does.
- **Forensics, filing, caps and markers.** The law supplies them.
- **Quoted output** beside a source command.
- **A variable part outside the Source values table.** The contract takes placeholders from that table.
- **A tool as a kind.** A kind names a symptom.

If a department can find a live secret, add an `Alarm check:` paragraph under Proof. Every command of it that can print a value ends in `cut`, so the value never reaches the output.

The checks catch little of this. `lint-page department` reads the frontmatter, the headings and the empty sections. It scans no text for owner facts. `bin/journal lint-body` rejects home paths, installation paths and tokens, but it runs on the bodies of leads and comments and not on pages. This repository's CI also scans every file for home paths and GitHub tokens. The review before the merge is the check that matters.

## Source files

- [departments.md](../skills/lawman-law/references/departments.md): the contract.
- [exhibits.md](../skills/lawman-law/references/exhibits.md): "Run a source" and "Source values".
- [LAW.md](../skills/lawman-law/references/LAW.md): the evidence rules, the leak rule and the cap table.
- [tick.md](../skills/lawman-law/references/tick.md): "Resolve the department page".
- [duty desk](../skills/duty-desk/SKILL.md): steps 6 to 8 choose the department.
- [precinct.md](../skills/assembly/references/precinct.md): "Add a department".
- [lint.ts](../journal/src/lint.ts): the page and body checks.
- [internal-affairs](../.lawman/departments/internal-affairs.md): the worked example.

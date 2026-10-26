---
name: lawman-law
description: The shared files of Lawman. They hold the law, the tick steps, the marker grammar, the contracts, the shared department pages and the harness pages. Other Lawman skills read these files by path. Nothing starts this skill on its own.
---

# Lawman law

This skill holds the files that the other Lawman skills share. It has no steps. Nothing starts it on its own.

A role skill reads these files by path from the installation directory. The path is `lawman/skills/lawman-law/references/<file>`.

Files under `references/`:

- `LAW.md`: the law that binds every role.
- `tick.md`: the steps that nine roles share, and the sync of the law.
- `markers.md`: the grammar of the state markers on the tracker.
- `exhibits.md`: how a role reads numbered lines, quotes an absence, follows a missing path, runs a source command and asks an expert.
- `constitution.md`: the contract that a precinct's constitution satisfies.
- `departments.md`: the contract that a department page satisfies.
- `departments/`: the shared department pages.
- `harnesses/`: one page per harness, with what a skill cannot know about it.

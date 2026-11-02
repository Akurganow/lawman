# License update

Use this reference for a precinct that said yes to the license department. It serves every run that reaches the menu and the job "Re-check a precinct". It asks the questions of `references/licenses/questions.md` that the table below names, and no others.

Every such run takes the tip of the default branch for each precinct that said yes. It runs "Agree the reading way" of `references/precinct.md` again and compares the result with the recorded entry. A precinct whose page `licenses` sits in `.lawman/departments/` or in the installation's `departments/` is not updated.

Ask the questions of the table at once. An answer or a skip does not block the menu. Then run "The sources that fit" of `references/licenses/questions.md` on the fitting rows that have no recorded answer. Ask the approval of Apply before "Write the answers".

This table has these rows and no others.

| What happened | What the assembly does |
| :-- | :-- |
| A fitting row has no recorded answer: a new ecosystem, a new row of a release, or a row that the section `sources` names | Ask about these rows only, with the first sentence below. A "Yes" updates the entry and opens a pull request that changes `sources`. When `sources` already names the row, open none |
| The section `## Licenses` of a precinct that said yes has no `use` line at the tip | Ask the use question only, with the sentence below. Write the answer in a pull request. When a pull request of Lawman is open for the section, add the line to its branch |
| The developer asks in "Re-check a precinct" | Offer the fitting rows and the use again, with the original first sentence. The answers replace the entry, and a changed section opens a pull request. This withdraws a consent |
| A pull request of Lawman is open for the section | Open no new pull request. When its section holds the id or the `use` value, show the link. Otherwise add the id or the value to its branch |
| The constitution fails the check | Write nothing, name the reason, and ask the question at the next start |

Rules of the update:

- For a new pull request take the section at the tip of the default branch as the base. For an addition to an open pull request take the section at the head of its branch. A pull request adds or removes only the id or the `use` value that has a new answer. A `sources none` is replaced by the new id, never extended.
- A pull request of Lawman is an open pull request of the trusted login, from the branch `lawman/licenses-sources` or `lawman/constitution`.
- An owner who narrowed `sources`, or changed `use` at the merge, gets no question and no pull request.
- Never remove a recorded answer because the tree or a release changed. Only the row for a request in "Re-check a precinct" replaces answers. A returning ecosystem raises no question.
- An id of `sources` outside the index is rejected and named. A value with no valid id reads as `none`, as the law says.
- "Agree the reading way" asks at an update only about the differences with the record. The answer updates both records, `## Dependency reading` and `## License reading`.
- A precinct that said yes and has no `use` line gets its question once.
- Add no fifth task to the menu.

Replace the first sentence of the first source question with this one when a fitting row has no recorded answer.

> <owner>/<repo> now fits these sources, and you have not answered for them. Which may the patrol ask?

Replace the first sentence of the use question with this one when the section has no `use` line.

> The section `## Licenses` of <owner>/<repo> records no use. Is the project used commercially?

Show this message when a pull request of Lawman already carries the change.

> A pull request of Lawman already carries this change: <link>. No new pull request is opened.

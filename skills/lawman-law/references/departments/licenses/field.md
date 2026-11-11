# Reading a value from a reply

1. Take from the reply only what the precinct's entry names. Pass only that through `bin/journal clean --json` for JSON and through `bin/journal clean` for anything else. Read only the cleaned output.
2. A value outside the form that the `Take` line gives is `unread`.
3. Take the quote from the cleaned output. `clean` removes a placeholder such as `<year>` and can join the lines around it. Quote clauses that hold none.

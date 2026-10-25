# Catalog

Use this reference when an installation lacks an answer about the catalog check. The check is off until the developer says yes. This mode asks only the answers that are missing. It follows the shape in `SKILL.md`.

No role stops for a missing answer. The patrol reads a missing answer as no. This mode sends no alarm, no chat message and no notice.

## Find

1. Read `config.yaml`. Note whether `catalog` and `catalog_precincts` are present.
2. When `catalog` is `yes`, run `bin/journal precinct list`.
3. For each precinct, note whether `catalog_precincts` holds a pair with its name.
4. For each precinct whose pair says yes, note whether `host.md` holds an entry for it under `## Dependency reading`.
5. A precinct whose entry concludes that it lists no dependencies has an answer. Never ask it again.

## Propose

Send one message with a row for each missing answer, with its source (found).

- Catalog: absent. Shown only when `catalog` is absent.
- Consent: the precinct names without a pair. Shown only when `catalog` is `yes`.
- Reading way: the precincts that said yes and have no entry.

## Decide

Ask in the question tool, in one call.

1. When `catalog` is absent, ask the install question of part Catalog in `references/install.md`, with its choices and its why line.
2. When `catalog` is `yes` or the answer to item 1 is yes, ask the consent of each precinct without a pair. Use the quote and the choices of the section "The repository proposal" in `references/precinct.md`. Fill in the repository state as that section does.
3. When `catalog` is `no`, ask no precinct question.
4. Treat a skip or an empty answer as no.
5. For each precinct whose consent is yes, and for each precinct that said yes and has no entry, agree the reading way by the section "Agree the reading way" in `references/precinct.md`.
6. When the developer cancels a question or it times out, end the mode without a write. The question returns at the next start.

## Apply

Ask for one approval. Offer "Apply" (recommended), "Change" and "Skip". Treat a skip, an empty answer, a cancel or a timeout as no, and write nothing.

After the approval, write in this order.

1. Set `catalog` to the answer, when it was absent. When `catalog_precincts` is absent, set it to `none`.
2. Set `<precinct name>=<answer>` in `catalog_precincts` for each consent asked. Replace `none`, replace an existing pair of that name, and never append a second one.
3. Write `config.yaml`, and read it back.
4. Write each agreed reading entry under `## Dependency reading` in `host.md`, by the section "Add the precinct" in `references/precinct.md`.
5. Read `host.md` back. Never write an entry into a repository.

A "No" writes the pair and no entry.

## Summary

Follow "Finish" in `SKILL.md`. Name the answers that were written and the answers still missing.

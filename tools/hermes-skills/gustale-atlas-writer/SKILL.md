---
name: gustale-atlas-writer
description: Research, write and verify one Gustale Atlas entity (a dish page, a food family or a lineage, with its connections) in Gustale's own house style "The Working Record", Atlas edition. Produces a source sheet, a validated JSON record and a verify report, then applies the evidence gate. Use for any Kanban card on the gustale-atlas board titled "research:", "write:" or "verify:", or whenever asked to write or revise Atlas prose, history chapters, connections, families or lineages.
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [gustale, atlas, writing, kanban, evidence]
    category: gustale
    requires_toolsets: [terminal]
---

# Gustale Atlas writer

Paths below were filled in when the skill was installed:

| What | Path |
|---|---|
| Atlas style; §7 is the writer prompt | `__SKILL_DIR__/references/ATLAS-STYLE.md` |
| Source sheet template | `__SKILL_DIR__/templates/source-sheet-atlas.md` |
| Examples (shape only) | `__SKILL_DIR__/examples/{dish-moussaka-greek,family-dumpling,lineage-filled-dough}.json` |
| Checker | `python3 __SKILL_DIR__/scripts/check_atlas.py <record.json> --sources-dir sources/` |
| Queue an entity (three cards) | `bash __SKILL_DIR__/scripts/new-atlas-card.sh <dish\|family\|lineage> <slug>` |

## Write paths

Every row the verifier touches has exactly one sanctioned writer. Use the named one. If a row you need has no
writer below, that is a gap — report it, do not improvise a direct `UPDATE`.

| What | The path | Notes |
|---|---|---|
| Statement status | `public.statement_set_status(p_statement_id uuid, p_to verification_state, p_session_token text)` | The only sanctioned status transition. The current signature is the one in `db/migrations/0047_publish_credential_session_binding.sql` (~L226) — it takes a **session token**, not a plain actor string. An earlier form took an actor; that was dropped. |
| Description sentences (the dish's prose) | `PATCH /api/dishes/:slug` — `apps/api/src/routes/dishes-write.ts` (~L292) | This route writes `description_sentences` **and** inserts the `edit_history` row, in ONE transaction. That is the history-keeping path. `target_type` = `'dish'`, `action` = `'update'`, `diff` = the changed fields. |
| New dish | `POST /api/dishes` (~L205) | |
| Publish a dish | `POST /api/dishes/:slug/publish` (~L438) | Refuses without a matching `edit_history` entry — a publish without one is refused by design. |
| Variants | `POST /api/dishes/:slug/variants` (~L542), `PATCH /api/dishes/:slug/variants/:variantId` (~L619), `DELETE` (~L696) | Each writes its own `edit_history` row. |
| Associations (places) | `apps/api/src/routes/dishes-write.ts` — the association write branch (~L338 onward) | Writes `dish_place_associations` and `edit_history` together. Never delete an association row; the route archives instead. |
| Names (`dish_names`) | `PATCH /api/dishes/:slug` — the names branch | `kind` is CHECK-constrained to `endonym\|exonym\|romanization`. |
| Identities (`dish_identities`) | **none: review only** | There is no API route that writes `dish_identities`, and no writer function in the migrations. Report the proposed identity rows in `diff.md` for Alejandro. |
| Relations (`dish_relations`) | **none: review only** | No write route and no writer function. `relation_types` is a vocabulary *table*, not a CHECK — a new slug needs a row, which is a migration. |
| Families (`dish_families`) | **none: review only** | The family is an approved editorial decision. Never rename or reclassify one. Propose in the report. |
| Lineages (`lineages`, `dish_lineages`) | **none: review only** | No write route and no writer function. |
| Journey chapters and beats | **none: review only** | `dish_journey_beats` / `dish_journey_movements` have no writer path. |
| English sentences → other locales | `python3 scripts/translate_sentences.py` | Reads `description_sentences` (the dish prose) — **not** `recipe_sentences`. This is the only translation pipeline, and it covers the Atlas dish prose. |

**Never delete a row.** The write routes archive (`dish_relations_archive` exists for this reason). Never
overwrite a published sentence outside the `PATCH /api/dishes/:slug` path, because that path is what keeps the
edit history.

## Before anything else

1. Call `kanban_show()`. The title is `research:`, `write:` or `verify:` followed by `<kind> <slug>`. Do only that
   stage.
2. Work only inside the card's workspace folder.
3. Read the card thread. A comment from Alejandro overrides anything here except the hard rules.
4. Finish each stage with `kanban_complete(summary=..., metadata={...})`. Never put secrets, source text or logs in
   the metadata.
5. Follow RULES.md and DATABASE-SAFETY.md for every database read and write.
6. Don't edit this skill, the style file, the schema or the checker on your own. Propose changes to Alejandro in
   the card summary.

## Stage 1 — `research:`

1. Read the **live record** for the entity:
   - **Dish:** names, sentences, statements, associations, journey, relations, identities, family and dimensions.
   - **Family:** the `dish_families` row, its parent and its members.
   - **Lineage:** the `lineages` and `dish_lineages` rows.
   Save it as `live.json`.
2. Read the vocabularies you may use: families, techniques (`preparation_methods`), courses (the facts table's "Served as"), contexts, place relationship
   types, relation types and predicates. Save the values as `vocab.json`.
3. Find sources through the SOURCE-TIER-LIST.md routes. You need at least two independent S1–S5 sources for the
   core. S6 (reference, Wikipedia) is for discovery only.
4. Fill `templates/source-sheet-atlas.md` and save it as `source-sheet.md`. Write the facts as your own short notes,
   with locators.
5. Save each source's own text as `sources/<source-id>.txt`, for the originality check only.
6. If fewer than two independent S1–S5 sources exist, block this card with the reason and stop.
7. `kanban_complete(summary="<kind> <slug>: N sources (tiers …)", metadata={"source_sheet": "source-sheet.md",
   "live": "live.json", "independent_sources": N})`.

## Stage 2 — `write:`

1. Read `references/ATLAS-STYLE.md` in full. §7 is your prompt; follow it exactly.
2. Write `<kind>-<slug>.json`: the complete proposed record, in English.
3. Run `python3 __SKILL_DIR__/scripts/check_atlas.py <kind>-<slug>.json --sources-dir sources/`.
4. Fix every ERROR and run the checker again until it reports PASS. Copied wording is fixed by rewriting from the
   facts.
5. `kanban_complete(summary="<kind> <slug>: PASS, N warnings, proposed <confidence>", metadata={"record": "...",
   "confidence_proposed": "...", "gaps": N})`.

## Stage 3 — `verify:`

1. Check every fact, date, direction and locator against `source-sheet.md`, and against the source wherever the
   sheet is thin. Remove anything unsupported and turn it into a gap.
2. Run the checker again with `--sources-dir sources/`. It must report PASS.
3. Compare the record with `live.json`. Write `diff.md`, listing what would be added, changed and kept. Flag any
   live claim that the record would remove or contradict.
4. Set `agent.confidence` by ATLAS-STYLE.md §6. Write `verify-report.md`: what you checked, what you changed, the
   diff summary, and the confidence with the reason.
5. Delete the `sources/` folder.
6. **Write only through the existing write paths:**
   - statements through `statement_set_status()`
   - sentences through the path that keeps edit history
   - associations, beats, relations and lineage rows through their own routes or scripts.
   Never delete a row. Never overwrite a published sentence outside the history-keeping path.
7. Act on the confidence:
   - **HIGH and no live claim removed or contradicted:** apply the changes through the existing publish gates,
     then queue the English sentences for the existing translation pipeline. Then complete the card. **Exception:**
     the first five records of each kind stop at review (style §9, A5).
   - **MEDIUM, or any live claim removed or contradicted:** request review on this card, with three lines for
     Alejandro: the entity, the confidence, and the main gaps or conflicts. If it comes back with "APPROVED" in
     Alejandro's words, apply the changes and complete it. If it comes back with changes, make them and re-verify.
   - **LOW:** block the card with the reason. Write nothing.

## Hard rules (all stages)

- Invent nothing. A gap is named, never filled.
- Wording follows the evidence label. Origin words only with an anchored origin statement.
- A family is a classification. Never rename or reclassify a family.
- Connections: resemblance carries no history; directional types carry a source and the true direction.
- Vocabulary is fixed. Propose new values, never create them.
- Wording is Gustale's own: never share 8 or more words with a source.
- Never generate an image that looks like a historical record. Families and lineages reuse existing covers.

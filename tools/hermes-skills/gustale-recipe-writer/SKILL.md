---
name: gustale-recipe-writer
description: Research, write and verify one Gustale recipe (gustale.com/recipes) in Gustale's own house style "The Working Record". Produces a source sheet, a validated JSON recipe record and a verify report, then applies the publish gate. Use for any Kanban card on the gustale-recipes board titled "research:", "write:" or "verify:", or whenever asked to write a Gustale recipe.
version: 2.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [gustale, recipes, writing, kanban]
    category: gustale
    requires_toolsets: [terminal]
---

# Gustale recipe writer

Paths below were filled in when the skill was installed:

| What | Path |
|---|---|
| House style; §7 is the writer prompt | `__SKILL_DIR__/references/RECIPE-STYLE.md` |
| Source sheet template | `__SKILL_DIR__/templates/source-sheet.md` |
| Reference record (shape only, don't reuse its sentences) | `__SKILL_DIR__/examples/joulutorttu-pinwheel.json` |
| Checker | `python3 __SKILL_DIR__/scripts/check_recipe.py <record.json> --sources-dir sources/` |
| Queue a dish (three cards) | `bash __SKILL_DIR__/scripts/new-recipe.sh <dish-slug> [recipe-slug] [locales]` |

## The existing pilot recipe — revise it, never duplicate it

There is already a recipe for moussaka in the repo. **A moussaka task must REVISE that recipe, not
create a second one.**

| What | Value |
|---|---|
| Recipe slug | **`moussaka-pilot-recipe`** |
| Atlas dish slug | `moussaka-greek` |
| Seed | `scripts/staging-moussaka-pilot-recipe.sql` — seeds it into **`gustale_staging` only** |
| Notes | `docs/LIVE-APPLY-SEED-MOUSSAKA.md` |
| Difficulty in the seed | `2` (i.e. `moderate`) |

> **The seed is staging-only.** It is not a production recipe. The pilot's job is to produce the
> *record* for `moussaka-pilot-recipe` and stop at review — not to create a `moussaka` slug beside it.
> When you queue the pilot, pass the recipe slug explicitly:
> `bash __SKILL_DIR__/scripts/new-recipe.sh moussaka-greek moussaka-pilot-recipe el,en`.
>
## Write paths

Every row the verifier touches has exactly one sanctioned writer. Use the named one. If a row you need has no
writer below, that is a gap — report it, do not improvise a direct `UPDATE`.

| What | The path | Notes |
|---|---|---|
| Publish a recipe | `public.recipe_auto_publish(p_recipe_id uuid)` — migration `db/migrations/0052_recipes_schema.sql` (defined ~L1778) | The **only** path that may act as the system actor `system:auto-publish`. `EXECUTE` is revoked from `PUBLIC` and granted only to `gustale_migrator`. It checks the kill switch **first** (`recipe_settings.auto_publish_mode`), then computes confidence, then publishes the recipe's statements. |
| The confidence writer | `public.recipe_auto_publish()` writes `recipe_confidence` — **there is no standalone writer** | `public.recipe_compute_confidence(p_recipe_id uuid)` only **returns** a `jsonb`; it does not write. `recipe_confidence` is written by exactly one statement, the `INSERT INTO public.recipe_confidence … ON CONFLICT (recipe_id) DO UPDATE` inside `recipe_auto_publish()`. **Consequence:** a recipe that is never auto-published has no `recipe_confidence` row. Write the proposed level in the record's `agent.confidence` and in `verify-report.md` instead; do not insert the row by hand. |
| Recipe rows | `public.recipes` (slug, title, servings, prep_minutes, cook_minutes, difficulty, status, review_state, is_primary) | `status`/`review_state` are the editorial state: `draft|published|archived` and `unreviewed|in_review|approved|rejected`. |
| Recipe sentences | `public.recipe_sentences` (one row per sentence) | **Language-first.** The original locale's sentence is the row with `is_original = true`; every translation points at it through `source_sentence_id` (ON DELETE RESTRICT). Enforced in the database by `recipe_sentences_language_first_guard()` (0052 ~L484). `field` is currently `step\|note\|intro` — the D4 migration (`0065_recipe_layout_and_sentence_fields.sql`) widens it to nine values: `step`, `note`, `intro`, `precondition`, `key_moment`, `failure`, `variation`, `keeping`, `evidence`. |
| The recipe's shape | `public.recipes.recipe_layout` (jsonb, nullable) — **after D4** | Holds everything that is SHAPE rather than prose: `total_min`, `yield_pieces`, `timeline`, `sections`, `steps` (the per-step time range), `images` (the briefs), `equipment`, `dispute`, `cue_missing`. Its exact shape is RECIPE-STYLE.md §5. It stays NULL for every recipe written before D4 — there is no backfill, because a recipe with no layout is still rendered from the scalar columns alone. |
| Sentence edit history | `public.edit_history` — `target_type` = `'recipe_sentence'`, `target_id` = the sentence id, `action` = `'update'`, `diff` = the changed fields | This is the only path that keeps edit history. There is **no** recipe-sentence PATCH route: `apps/api/src/routes/recipes.ts` has four `GET` routes and no write route. Write the sentence and the `edit_history` row in the same transaction. **Never overwrite a published sentence outside this path.** |
| Statement status | `public.statement_set_status(p_statement_id uuid, p_to verification_state, p_session_token text)` — 0052 ~L1427 | The only sanctioned status transition. The system-actor branch (`system:auto-publish`) is reachable **only** from inside `recipe_auto_publish()`; a direct call with that actor is refused. A human path needs a real publish credential. |
| Recipe claims | `public.recipe_claims` (recipe_sentence_id, statement_id, is_primary) | Scoped by trigger: `recipe_claims_subject_check()` (~L323) and `recipe_claims_statement_guard()` (~L394) refuse a claim that names a statement not about this recipe. |
| Recipe ingredients | `public.recipe_ingredients` (ingredient_id, quantity, unit, preparation_note, position, is_optional, is_key, accepted_forms, cost_weight) | `quantity` and `unit` are **TEXT, by design** (ADR-007 Decision 5): "2½", "a handful" and "to taste" are real quantities, and a numeric column would throw the meaning away. Write the quantity the way the source writes it. `is_key` marks an ingredient that DEFINES the dish — an approximate substitute never rescues it (ADR-008 Decision 5). |
| Substitutes | `public.recipe_ingredient_substitutes` | `suitable` / `approximate` / `not_suitable`. |
| Recipe translations (title/summary) | `public.recipe_translations` (recipe_id, locale, title, description, is_original) | One row per locale; `is_original` marks the dish's own language. |
| English sentences → other locales | **none: review only** | `scripts/translate_sentences.py` reads `description_sentences` — it does **not** read `recipe_sentences`. There is no recipe translation pipeline. Queue the translations for review; do not run that script against recipes. |
| Publish audit | `public.recipe_publish_log` | Written by `recipe_auto_publish()`. `publish_mode` is `auto|manual`; `actor` is the actor string. |

**Never write to `recipes` directly to publish.** A recipe is published when its statements are published and
the `recipe_published` view (migration 0053) admits it — not when a row's `status` is set.

## Before anything else

1. Call `kanban_show()`. The card title starts with `research:`, `write:` or `verify:`. Do only that stage.
2. Work only inside the card's workspace folder, which is your working directory.
3. Read the card thread. A comment from Alejandro overrides anything here except the hard rules.
4. Finish every stage with `kanban_complete(summary=..., metadata={...})`. Never put secrets, raw pages,
   source text or logs in the metadata.
5. Don't edit this skill, the style file, the schema or the checker on your own. If something here blocks
   good work, say so in the card summary and propose the change to Alejandro.

## Stage 1 — `research:`

1. Read the Atlas dish record for the slug in the card body: names, place, definition and the dish's own
   language. If the card's locales are `auto`, use the dish's own language plus `en`.
2. Find at least **two independent sources** that count for Gustale: published cookbooks, culinary
   institutions, established recipe sites and chefs. Find cookbooks through WorldCat or the Library of
   Congress. Independent means not copied from each other; identical wording or the same odd quantities give
   a copy away.
3. Fill `templates/source-sheet.md` and save it as `source-sheet.md`. Write the facts as your own short notes;
   don't paste the sources' sentences into it.
4. Save each source's own method text as `sources/<source-id>.txt`. These files exist only for the
   originality check and are never published.
5. Pick the **base source** (the most complete method) and give the reason in one line.
6. Record the Atlas `ingredient_id` and the `ingredient_translations` name of every ingredient, for each
   target locale. Mark anything missing from the Atlas.
7. If there are fewer than two independent sources, block this card with "only N independent source(s) for
   <dish>" and stop.
8. `kanban_complete(summary="<dish>: N sources, base <id>", metadata={"source_sheet": "source-sheet.md",
   "independent_sources": N, "base_source": "<id>", "locales": [...]})`.

## Stage 2 — `write:`

1. Read the parent handoff and `source-sheet.md`.
2. Read `references/RECIPE-STYLE.md` in full. §7 is your prompt; follow it exactly, including the originality
   rules. Use the example only for its shape.
3. Write `<recipe-slug>.json`: the dish's own language first, then English, then the other locales.
4. Run `python3 __SKILL_DIR__/scripts/check_recipe.py <recipe-slug>.json --sources-dir sources/`.
5. Fix every ERROR and run the checker again until it reports PASS. Copied wording is fixed by rewriting from
   the facts, never by swapping a word or two.
6. `kanban_complete(summary="<recipe>: PASS, N warnings, proposed <confidence>", metadata={"record":
   "<recipe-slug>.json", "checker": "PASS", "confidence_proposed": "<...>", "gaps": N})`.

## Stage 3 — `verify:`

1. Check every quantity, time, temperature, sign, failure, substitute and storage note in the record against
   `source-sheet.md`, and against the source itself wherever the sheet is thin.
   - Remove anything that isn't supported. A removed sign becomes `cue_missing: true`.
2. Run the checker again with `--sources-dir sources/`. It must report PASS.
3. Set `agent.confidence` by RECIPE-STYLE.md §6.
4. Write `verify-report.md`: what you checked, what you changed, the confidence, and why.
5. Delete the `sources/` folder — **but only once the recipe is actually published.** If the record stops at
   review (MEDIUM, LOW, a gap that blocks HIGH, D4 not yet on `main`, or auto-publish off), **keep** `sources/`:
   the gate below asks you to re-run the checks if changes come back, and the originality check needs the captured
   texts. The captures are never published; they go when the recipe is finally published.
   *Corrected 2026-11-21 — see CHANGES.md. The skill's own step 7 required the captures to re-verify, so
   deleting them unconditionally made the record unverifiable.*
6. Until the D4 migration — `db/migrations/0065_recipe_layout_and_sentence_fields.sql`, widening
   `recipe_sentences.field` to nine values and adding `recipes.recipe_layout` — is applied on `main`
   (it needs the `approved-live` label and the owner's merge), **write nothing to the database at all** —
   not the recipe rows, not the sentences, not the ingredients. Request review instead, attaching the
   record and the migration you propose.
   There is no partial path: a recipe written into the existing tables before D4 lands would have to be
   rewritten afterwards, because `timeline`, `sections`, the cue / dispute / cue_missing flags and the image
   briefs have nowhere to go. (`recipe_confidence` is not an exception either — it has no standalone writer;
   see the Write paths table.)
7. Act on the confidence:
   - **HIGH:** publish through the existing Gustale auto-publish path as `system:auto-publish`, but only if
     auto-publish is switched on and today's cap (20) hasn't been reached. Otherwise treat the recipe as
     MEDIUM. Queue the image briefs where `reuse_atlas_image` is false with the existing Gustale image
     pipeline. Then complete the card.
   - **MEDIUM:** request review on this card, with three lines for Alejandro: the recipe, the confidence and
     the main gaps. If the card comes back with "APPROVED" in Alejandro's words, publish and complete it. If it
     comes back with changes, make them and run steps 2–4 again.
   - **LOW:** block the card with the reason. Never publish.

## Hard rules (all stages)

- Invent nothing: no quantity, time, temperature, sign, failure or substitution without a source.
- Never average sources. Numbers come from the base source; differences become disputes.
- Wording is Gustale's own. Never share a run of 8 or more words with a source, and never imitate another
  site's style, labels or devices.
- No ratings, nutrition, prices, pairings or history.
- Never publish MEDIUM without Alejandro's approval. Never publish LOW.

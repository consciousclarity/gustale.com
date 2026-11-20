# CHANGES — gustale-recipe-writer

Reconciliation against the repository at `origin/main` (`6e851eb`), 2026-11-20.

Rule 6 of the work order: facts about the repo may be fixed (vocabulary values, table names, write
paths, script bugs). **Voice, evidence rules, originality rules and budgets are unchanged.**

---

## 2026-11-20 — Reconciliation with the repo and with live

### 1. New section: "Write paths" in `SKILL.md`

Every table the verifier writes, with the exact function, route or script. Where no history-keeping
path exists, the entry says **"none: review only"**.

| What | The path |
|---|---|
| Publish a recipe | `public.recipe_auto_publish(p_recipe_id uuid)` — 0052 ~L1778 |
| The confidence writer | `public.recipe_auto_publish()` — **there is no standalone writer** |
| Recipe rows | `public.recipes` |
| Recipe sentences | `public.recipe_sentences` (language-first, enforced by a trigger) |
| Sentence edit history | `public.edit_history` — `target_type = 'recipe_sentence'` |
| Statement status | `public.statement_set_status(...)` — 0052 ~L1427 |
| Recipe claims | `public.recipe_claims` |
| Recipe ingredients | `public.recipe_ingredients` |
| Substitutes | `public.recipe_ingredient_substitutes` |
| Recipe translations | `public.recipe_translations` |
| English sentences → other locales | **none: review only** |
| Publish audit | `public.recipe_publish_log` |

### 2. The D4 rule in step 6 contradicted itself

**The bug.** Step 6 read:

> "write nothing to the database. Request review instead … **Write through the existing recipe
> tables listed in §5, `recipe_confidence` included.**"

"Write nothing to the database" and "write through the existing recipe tables" are opposites. A
worker reading it could reasonably either stop at review or write the recipe anyway.

**The fix.** Step 6 now says plainly: **write nothing to the database at all** — not the recipe rows,
not the sentences, not the ingredients — and explains why there is no partial path (a recipe written
before D4 lands would have to be rewritten, because `timeline`, `sections`, the cue / dispute /
cue_missing flags and the image briefs have nowhere to go). The `recipe_confidence` clause is gone:
it is not an exception either, because it has no standalone writer.

### 3. The `recipe_confidence` writer — there is only one, and it is the publish path

Worth stating because the work order asks for "the `recipe_confidence` writer" by name:

- `public.recipe_compute_confidence(p_recipe_id uuid)` **only RETURNS a `jsonb`.** It writes nothing.
- The **only** code that writes `recipe_confidence` is the `INSERT … ON CONFLICT (recipe_id) DO
  UPDATE` **inside `recipe_auto_publish()`**.

**Consequence:** a recipe that is never auto-published has **no** `recipe_confidence` row. The
proposed level belongs in the record's `agent.confidence` and in `verify-report.md`, not in a
hand-written row.

### 4. `recipe_confidence.level` — the record is UPPER case, the column is lower case

The record's `agent.confidence` is `HIGH` / `MEDIUM` / `LOW` (the schema enum). The column has
`CHECK (level IN ('high','medium','low'))` (0052 L784-785). Lower-case it on write or the insert is
refused. Documented in both the SKILL Write paths table and RECIPE-STYLE §5.

### 5. RECIPE-STYLE §5 — the `quantity` rule contradicted the database

**The bug.** §5 said:

> "`quantity` is a decimal number ("2.5", never "2½")" … "If `recipe_ingredients.quantity` on `main`
> is still free text, write numerals only, so a scaler can parse them later."

and the §5 table said:

> "`quantity` is text: write numerals only ("2.5") so a scaler can parse them."

**The truth.** `recipe_ingredients.quantity` and `unit` are **TEXT by design** — ADR-007 Decision 5:
*"Quantity and unit are TEXT, not numeric columns: "2½", "a handful" and "to taste" are real
quantities, and a numeric column would throw the meaning away."*

The rule was telling the writer to flatten a column that was deliberately left free to carry a
source's own wording.

**The fix.** §5 now separates the two things that were conflated: the **JSON record** uses a
decimal number and a fixed unit list (unchanged — that is the record's own contract), and the
**database column** is free text by design and must carry the quantity as the source writes it.
The SKILL Write paths row was corrected the same way.

### 6. RECIPE-STYLE §5 — `difficulty` is a skill decision, not a database fact

ADR-007 declares `difficulty integer` and **nothing else** — there is no CHECK constraint, and no
scale anywhere in the schema or the migrations. The scale `simple / moderate / demanding = 1 / 2 / 3`
is **D6, the skill's own decision** (RECIPE-STYLE §10, "defaults in force until Alejandro changes
them"), and the staging pilot recipe uses `difficulty = 2`.

§5 now says so explicitly, so that a future reader does not go looking for a database constraint
that does not exist. The mapping itself is **unchanged** — it was correct.

### 7. New section: "The existing pilot recipe — revise it, never duplicate it"

The work order requires the pilot to revise the existing moussaka recipe, not create a duplicate.
Recorded in `SKILL.md`:

| What | Value |
|---|---|
| Recipe slug | **`moussaka-pilot-recipe`** |
| Atlas dish slug | `moussaka-greek` |
| Seed | `scripts/staging-moussaka-pilot-recipe.sql` — **`gustale_staging` only** |
| Notes | `docs/LIVE-APPLY-SEED-MOUSSAKA.md` |
| Difficulty in the seed | `2` (i.e. `moderate`) |

The section states that the seed is **staging-only** — it is not a production recipe — and gives
the exact queue command with the recipe slug passed explicitly.

### 8. Checked and left alone

- The record's `difficulty` enum (`simple` / `moderate` / `demanding`) matches D6 and the example
  (`demanding`). ✓
- The recipe example still passes `check_recipe.py --only-locale en` with **0 errors**. ✓
- `recipe_sentences.field` is still `('step','note','intro')` — the D4 migration widens it. ✓
- `apps/api/src/routes/recipes.ts` has four `GET` routes and **no write route** — so the edit-history
  path is the only one, and there is no HTTP route to point a writer at. ✓
- The unit list, the `accepted_forms` and `cost_weight` vocabularies, the originality thresholds
  (D5), the image credit rule (D3), the "agree" tolerance (D2) and the metric rule (D1) are
  **unchanged**. ✓

### 9. Not changed, on purpose

- **The voice** of §7 (the writer prompt) — untouched.
- **The evidence rules** — the HIGH-confidence conditions, the anchor requirements, the
  originality thresholds — untouched.
- **The budgets** — the word budgets per locale, and the rule that they are errors in `en` and
  warnings elsewhere — untouched.
- **D1–D6** — unchanged, including the decision list's existing order (D1, D2, D3, D4, D6, D5).
  The order is odd, but it is the skill's own list and reordering it is not a factual fix.

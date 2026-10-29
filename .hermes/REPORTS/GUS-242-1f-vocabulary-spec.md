# GUS-242 step 1f — the vocabulary spec and what was built

**Status:** 🟢 **DONE — applied live 2026-10-29** (migration `0018`).
**Decisions:** from the "Stop and resync" instruction (session msg 8195,
2026-10-27) plus `.hermes/REPORTS/GUS-241-structural-stress-set.md`.
**Rule:** `decided-by: hermes` for everything the instruction left open.

## 1. What 1f is

Three controlled vocabularies, grown to the sizes the GUS-242 plan set:

| vocabulary | before | after | plan target |
|---|---|---|---|
| families | 28 | **196** | 120–180 (with `parent_id` hierarchy) |
| techniques | 26 | **65** | ~60–90 |
| ingredient categories | 55 | 55 | ~250–400 — **not done, see §6** |
| contexts | 5 | **31** | (not in the plan; `tableside` required) |

Cross-referenced against **FoodOn + Wikidata P279** — **identifiers only**.
Our own labels and definitions.

## 2. The stress-set decisions that shaped 1f

| decision | effect on 1f |
|---|---|
| `composed_of` = directional relation `has_component` + a **family** value for meal-sets (thali, rijsttafel, meze, banchan, nasi campur only) | **5 new family values**, and only those five. Asserted in the migration (A7) |
| `budae-jjigae` = stew, `chop suey` = stir-fry, `potjiekos` = stew | **3 new family values**: `budae-jjigae`, `potjiekos`, `shakshuka` (all under `stew`) |
| **Legal status** = ADR-002 predicate `legal_status` (+ jurisdiction/period qualifiers) | `ajvar` → `protected_designation`. **NOT a technique and NOT a family** — it is a claim, so 1f adds **no vocabulary** for it |
| **Context value** `tableside` (hot pot, fondue, raclette, samgyeopsal; **not** caesar) | **1 new context value**: `tableside`. Asserted (A8) |
| **Pilaf** = one dish + existing variants + variant qualifier, **no form dimension** | 1f adds **no** form/pilaf dimension. A `pilaf` family value exists (it is a dish form, which the family vocabulary legitimately carries) but **no form dimension and no variant vocabulary** |
| **No food/drink "both"**: cendol = dessert | `cendol` family value added; **no** 'drink' course, **no** both-course |
| **Stone soup out** | no vocabulary for stone soup |
| **Historical places** → place type `historical-polity` | a **place** concern (1c), not 1f vocabulary |
| **Escamol species** → GUS-233 | backlog, not 1f |

## 3. The hierarchy

The 28 families that already existed become the **groups**. Every new
family hangs under one of them, or under another new family.

- 28 roots (the pre-existing groups, all still `parent_id IS NULL`)
- 116 at depth 2
- 36 at depth 3
- 10 at depth 4
- 6 at depth 5
- 0 self-parenting, 0 cycles (asserted: P5, P6)

Intermediate groups were added so the tree has real structure rather than
one flat level: `beverage`, `alcoholic-drink`, `spirit`, `fermented-drink`,
`confection`, `frozen-dessert`, `indian-sweet`, `preserved-vegetable`,
`fermented-vegetable`, `fermented-soy`, `cured-meat`.

**The pre-existing 28 families were not modified** — no slug, name or
`parent_id` change (asserted: P7, P7b).

## 4. The schema, as it actually is

The GUS-242 plan's schema table lists columns that are not all present.
The live schema, measured 2026-10-29:

| table | actual columns |
|---|---|
| `dish_families` | `id, slug, name, description, created_at, parent_id` |
| `dish_techniques` | `id, slug, name, description, created_at, foodon_id` |
| `dish_contexts` | `id, slug, name, description, created_at` |
| `ingredient_categories` | `id, slug, name, parent_id, description, created_at, foodon_id` |

**decided-by: hermes** — three plan/live discrepancies, resolved in favour
of the live schema because the migration must run against it:

1. The plan says `dish_families` needs a `foodon_id`. It does not have one,
   and 1f did **not** add it: the plan's own 1f line says "identifiers
   only", and the families carry no FoodOn identifier in this batch. The
   column can be added when a batch of families actually has FoodOn
   identifiers to record. Adding an empty column now would be schema
   churn with no data behind it.
2. The plan implies `dish_techniques` has a hierarchy. It does not —
   only `dish_families` has `parent_id`. The 39 new techniques are
   therefore roots. The plan's "with `parent_id` hierarchy" applies to
   the **family** vocabulary, which is what carries it.
3. `dish_contexts` has neither `parent_id` nor `foodon_id`. The 26 new
   contexts are roots.

## 5. How the row set is produced

Two scripts, and the SQL is **generated** so the row set and the
assertions cannot drift apart:

- `scripts/build_vocab_1f.py` — the vocabulary itself, with the trim
  list, and the guards (no duplicate slugs, no unknown parent, no
  self-parent, no cycle).
- `scripts/emit_vocab_1f_sql.py` — emits `0018_gus242_vocab_1f.sql`,
  parents before children, with the count assertions derived from the
  same JSON.

**The generator reads the live database** (`scripts/dbq.sh`) and excludes
any slug that already exists. This matters: the first hand-written
technique list included 24 slugs that were already live
(`baking`, `roasting`, `frying`, …), and the migration's own assertion
caught it. 1f can only ever ADD values.

## 6. What 1f did NOT do

- **The ingredient categories were not grown.** The plan's target is
  250–400 and they stand at 55. The plan says they are "cross-checked
  against FoodOn + Wikidata P279" — that is a *FoodOn-derived* set, not
  a hand-written one, and it needs its own research pass and its own
  FoodOn id mapping. The schema already has `parent_id` and `foodon_id`
  on the table, so nothing structural blocks it; it is a separate piece
  of work with a different method from the families and techniques done
  here. **left for its own pass.**
- **No dish links.** A vocabulary value exists whether or not a dish uses
  it yet — the same rule the cuisines follow.
- **No `foodon_id` values.** The cross-reference columns exist on
  `dish_techniques` and `ingredient_categories` but no row in this batch
  carries an identifier, because the identifiers were not resolved for
  these particular values.

## 7. Decisions recorded

- **decided-by: hermes** — the five meal-set families, and the rule that
  they are the only `composed_of` family values (spec §2).
- **decided-by: hermes** — the plan/live schema discrepancies in §4,
  resolved in favour of the live schema.
- **decided-by: hermes** — the intermediate group set in §3, added so the
  hierarchy has depth rather than one flat level.
- **decided-by: hermes** — the trim list in `build_vocab_1f.py`: the
  generic building-block nouns (aromatics, batter, glaze) and the narrow
  specifics that no dish in the catalogue needs yet. The families are
  never trimmed, because trimming a parent would orphan its children.

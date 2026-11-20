# CHANGES — gustale-atlas-writer

Reconciliation against the repository at `origin/main` (`6e851eb`), 2026-11-20.

Rule 6 of the work order: facts about the repo may be fixed (vocabulary values, table names, write
paths, script bugs). **Voice, evidence rules, originality rules and budgets are unchanged.**

---

## 2026-11-20 — Reconciliation with the repo and with live

### 1. New file: `references/vocabulary-snapshot.md`

The work order asks for a dated snapshot of every value the writer may use, and for the schema
enums, the checker sets and ATLAS-STYLE.md to match it. The snapshot records, with file and line
for each:

- the 11 seeded predicates, split into the four statement-anchored ones and the seven dimension ones
- the 17 live `relation_types` slugs, with direction and group
- the `dish_place_associations.relationship_type` values
- the `dish_names.kind` values
- the `dish_identities.identity_kind` values
- the `dish_families` listed set, with class and parent
- techniques (`preparation_methods`), courses, contexts and `dish_traditions`
- the `citations.target_type` values usable for families and lineages

### 2. The relation-type vocabulary was wrong in the schema — five slugs missing

**The bug.** The schema enum (`scripts/atlas-record.schema.json`) listed **12** connection types.
The live vocabulary is **17**. The five missing slugs were:

`shared_ingredient`, `similar-serving`, `similar_serving`, `regional-cousin`, `shared-method`

**How it was found.** Three independent sources in the repo were compared:

1. the `relation_types` table rows (`0036` L380 + `gus-224` L54),
2. the renderer's grammar map (`apps/web/src/lib/relationship-grammar.ts` L57),
3. the public-kind module (`apps/web/src/lib/public-relationship.ts` L88).

Their union is 17 slugs; the schema enum was a strict subset of it. Nothing in the schema was
*extra* — the enum was simply missing five.

**The fix.** All five slugs added to the schema enum. The enum now matches the live set exactly.

### 3. The checker's `RESEMBLANCE` set was missing the same five

`scripts/check_atlas.py` L61 had the same 5-item gap. Fixed, and the comment now records the
hyphen/underscore spelling rule with a pointer to `relationship-grammar.ts`, which is where the
repo already explains it.

### 4. ATLAS-STYLE.md §4 — the Resembles row listed 4 of the 9 undirected types

The row named `similar_form`, `similar_technique`, `often_compared_with`, `shared-ingredient`.
The live undirected set is nine. The row now names all nine, and a paragraph below the table states
the spelling rule: **the vocabulary spells itself two ways and the live data uses both.** Do not
normalise — an earlier renderer that used only the underscore spelling silently dropped the
hyphenated edges from the legend and the map.

### 5. ATLAS-STYLE.md — the predicate list was wrong

The style said *"the predicates are … `created_by`, `named_after`, `originated_at`, `originated_in`"*,
presented as the complete vocabulary. The repo seeds **11** predicates:

- statement-anchored (4): `originated_in`, `originated_at`, `created_by`, `named_after`
- dimension (7): `is_a`, `belongs_to_cuisine`, `served_as_course`, `cooked_by`,
  `contains_ingredient`, `part_of_tradition`, `eaten_in_context`

The four are an origin-style **subset**, not the whole set. Corrected to say so, and to name the
seven dimension predicates and where they live.

The schema's `predicate` description repeated the same incomplete list; corrected there too.

### 6. New section: "Write paths" in `SKILL.md`

For every table the verifier writes, the exact function, route or script. Where no history-keeping
path exists, the entry says **"none: review only"** — the English-sentence translation path is one
of these (`scripts/translate_sentences.py` reads `description_sentences`, not `recipe_sentences`).

### 7. Checked and left alone

- `dish_names.kind` = `('endonym','exonym','romanization')` — the schema already matched. ✓
- `dish_identities.identity_kind` = `('shared_dish','regional_variant','historically_related')` —
  the schema already matched. ✓
- "Served as" = the course facet (`served_as_course`) — confirmed correct, left as is. ✓
- `citations.target_type` is **unconstrained free text** — no CHECK, no seeded rows. The snapshot
  records it as such rather than inventing a list. ✓

### 8. Proposed, NOT applied — needs Alejandro's approval

**The checker does not fire on "named after" wording.** `check_atlas.py` L59 defines `ORIGIN_WORDS`
and L60 defines `ORIGIN_PREDICATES = {"originated_in", "originated_at", "created_by"}`. The regex
matches origin / naming / creator / date wording, but a sentence that names a dish after something
will only be anchored if the record uses one of those three predicates.

`named_after` **is** a live predicate and ATLAS-STYLE says it needs a statement, but the checker
cannot tell that a sentence is a naming claim. Closing the gap means **widening the wording
regex**, which changes what the writer is asked to anchor — that is an evidence-rule change, and
rule 6 puts it behind Alejandro's approval. **Left open, not fixed.**

### 9. Self-tests

All three bundled examples still pass with 0 errors after every change above:

```
dish-moussaka-greek.json   PASS: 0 error(s), 5 warning(s)
family-dumpling.json       PASS: 0 error(s), 2 warning(s)
lineage-filled-dough.json  PASS: 0 error(s), 3 warning(s)
```

(The warnings are the expected "originality: run with --sources-dir" notice, plus the
confidence-is-proposed warning. The examples ship without their sources folder.)

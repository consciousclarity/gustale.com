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

---

## Round 3 — the pilot entities (2026-11-21)

### The lineage slug `fried-rice` collided with the family slug

Nasi goreng's family is **`fried-rice`** (class `FORM`, migration 0051 L231) and there is no
`nasi-goreng` family row. The Atlas trio for nasi goreng is therefore the dish `nasi-goreng`, the
family `fried-rice`, and a lineage.

The lineage was first queued as **`fried-rice`** too. That is a **different entity kind** — the
`lineages` table has its own `slug` column, unique within `lineages`, so there is no database
collision — but a family and a lineage that share a slug read as the same thing on two pages,
and the style file is explicit that a lineage "names the idea, not a nation" while a family is
"a classification". Two different things, one slug, is a trap for the next writer.

Re-queued as **`fried-rice-spread`** (cards `t_6aceaef2` / `t_693bf002` / `t_44df13d5`); the
first trio was archived.

### The vocabulary snapshot gained a lineage section

The snapshot had no section for the lineage record's own vocabularies — `confidence_level`,
`historical_forces`, `members[].role` and `changedElement`. It now has **§12**, which records
all four, plus the `family_class` values.

These are enforced by the skill's schema, not by the database: the `lineages` and `dish_lineages`
tables have **no writer path** ("none: review only"), so there was no database vocabulary to read
and nothing to reconcile against. The section exists so the next writer knows the values are
fixed and cannot be invented.

### The write-path table was wrong about `dish_names`

The table said `PATCH /api/dishes/:slug` — the names branch. **There is no names branch.**
`patchDishSchema` (`apps/api/src/routes/dishes-write.ts` ~L66) accepts `canonicalName`,
`shortDescription`, `longDescription`, `status`, `origin`, `originDateEarliest`,
`originDateLatest`, `categories`, `tagIds` and `comment`, and nothing else. Nothing in
`apps/api` writes `dish_names` — only the data migrations (0024, 0033) do.

Found by the pilot's write stage, and confirmed by reading the route myself. The row now
says **none: review only**, like the identities and relations rows beside it. A proposed name
row needs a migration or an owner-applied statement, not an API call.

### A repo-level contradiction the pilot surfaced — NOT changed here

Migration 0023 (ADR-003 layer 2) defines the name kinds:

```
'endonym'       - the name in the language it belongs to
'exonym'       - the name in another language
```

Migration 0033 (`0033_gus239_english_names.sql`) then inserts, for **every** dish with a
`canonical_name`, a row with `kind = 'endonym'` — and its own comment says why:

> The `kind` is 'endonym' for a name that is the dish's own name in English, and 'exonym' is
> deliberately NOT used: an exonym is a name a language gives to something from elsewhere, and
> this is the dish's name in the language the catalogue is written in.

For an English dish the two agree. For a **Greek** dish they do not: the English "Moussaka" is
a name in another language, which 0023 calls an exonym, and 0033 calls an endonym. The pilot's
dish record follows 0023 and marks it an exonym; the live row says endonym.

**This is an owner decision and it is not a skill bug.** The vocabulary snapshot records the
0023 definition because that is the definition of the CHECK-constrained values, and the pilot
followed it. Changing the skill to match 0033 instead would flip every non-English dish's
name kind. Both readings are recorded; the conflict is raised, not resolved.

The same mismatch is why the pilot records all 12 of the dish's other-language names as
exonyms and corrects the Arabic-script `مسقعة` from `ar`/`endonym`/primary to
`tr`/`exonym`: the form is Ottoman Turkish, and a Turkish-language name cannot be the primary
name for a Greek dish.

### Two more write-path rows were wrong — the same class of error

The pilot's verify stage checked the write-path table against the repo and the live server and
found it wrong for **three** rows, not one. I checked each one myself.

**`description_sentences`.** The table said `PATCH /api/dishes/:slug` writes the sentences "and
inserts the `edit_history` row, in ONE transaction. That is the history-keeping path."

The route writes the **`dishes.long_description` / `dishes.short_description` columns** and the
`edit_history` row. It contains **no reference to `description_sentences`**, and nothing in
`apps/api` inserts that table — only the API's own tests do.

The sentences are written by a **different path**: `scripts/populate_description_sentences.py`.
It reads the columns, splits them with `scripts/split_sentences.py` (the ONE splitter), asserts
the concatenation equals the source byte-for-byte **before** writing, writes through a temporary
table in a single statement, and sets `dishes.sentence_managed = true`. After that the
`description_sentences_guard_short_description_trg` trigger **rejects** a direct
`short_description` write that does not match the rendered sentences, so the column can no
longer be edited freely. It needs `--apply` and the live opt-in.

It is a **batch** path: it re-derives every published dish, not one. The row now says so.

**`dish_place_associations`.** The table named "the association write branch (~L338 onward)" in
`dishes-write.ts`. There is no such branch: that file contains no reference to the table, and
nothing in `apps/api` writes it. The row now says **none: review only**.

**The rows that are RIGHT, checked the same way.** `statement_set_status` — the signature in
migration 0047 is `(p_statement_id uuid, p_to verification_state, p_session_token text)`, the
session-token form the row claims. `POST /api/dishes` at L205, `PATCH` at L292, `publish` at
L438, the three variant routes at L542 / L619 / L696 — every line reference in the table matches
the file. `scripts/translate_sentences.py` exists.

**What this means for the pilot.** The dish record could not be applied even with approval:
there is no path to write the prose, the names or the associations. That is an API change, not a
skill fix, so it is raised for Alejandro and not fixed here.

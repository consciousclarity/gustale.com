# GUS-014 — Pilot pass/fail spec: canonical dimension assignment

**Task:** GUS-014 (EPIC 02) · **ADR:** `.hermes/REPORTS/ADR-001-canonical-entity-model.md` (CLOSED 2026-10-26) · **Scope:** the 3 reference dishes only
**Status:** 🟡 **SPEC — awaiting Alejandro's go. Not run. No schema migration written.**
**Date:** 2026-10-26

---

## 0. Purpose and rules of this spec

This is the **exact expected end state** for the pilot migration, written **before** the migration exists, so it can be used as a pass/fail oracle. It is derived entirely from the decisions recorded in ADR-001 (D1–D7 + D3b–D3f + D5b + D6b + D7b).

**Three rules govern every cell of this document:**

1. **All 7 dimensions are specified for every dish.** No dimension is omitted. Where a dimension has no value, the literal token **`unset`** is written. `unset` is a *deliberate, asserted state* — not "we didn't think about it" and not "empty string".
2. **Only controlled-vocabulary values appear.** Every non-`unset` cell is a value drawn **verbatim** from the controlled vocabulary declared in §1 below. No free text, no parentheticals, no modifiers, no compound values. If a needed value is not in the vocabulary, that is a **failure of the vocabulary**, not a license to invent a value — the pilot must stop and the vocabulary must be amended explicitly first.
3. **Facts that are not dimension values belong to claims.** Anything that qualifies a dimension value (e.g. rendang's braise being *dry*) is an assertable fact (D6) and belongs in a `claim` with a source anchor. It must not appear in a dimension cell.

**The pilot passes only if all 7 dimensions × 3 dishes = 21 dimension cells match the expected values exactly**, plus the side-effects in §5 hold.

---

## 1. Controlled vocabularies (the 7 dimensions)

These are the vocabularies the pilot validates against. A value not listed here is invalid.

### 1.1 `dish_family` — single-valued (D7b)

Nouns naming a family of preparations.

`bread` · `curry` · `stew` · `dumpling` · `noodle-soup` · `kebab` · `taco` · `rice-dish` · `sausage` · `roast` · `casserole` · `fermented-dish` · `egg-dish` · `legume-dish` · `meatball` · `offal-dish` · `seafood-stew` · `stuffed-vegetable` · `flatbread` · `fritter` · `pie` · `pudding` · `dessert` · `soup` · `salad` · `sauce` · `flat-dough` · `doughnut` · `biscuit` · `cheese` · `drink` · `coffee` · `tea`

> `taco` is a family value per D3b. `kebab` remains in the vocabulary (it is a legitimate family for dishes like satay) but is **not** used for `tacos-al-pastor`.

### 1.2 `dish_cuisine` — single-valued (D7b)

`indonesian` · `mexican` · `indian` · `pakistani` · `british` · `chinese` · `japanese` · `filipino` · `thai` · `vietnamese` · `korean` · `french` · `italian` · `spanish` · `greek` · `turkish` · `lebanese` · `ethiopian` · `nigerian` · `ghanaian` · `moroccan` · `brazilian` · `argentine` · `peruvian` · `colombian` · `caribbean` · `australian` · `canadian` · `american` · `austrian` · `goan` · `bahian`

> The live `categories` table currently stores cuisines as `"Indonesian cuisine"`, `"Mexican cuisine"` etc. The dimension vocabulary drops the ` cuisine` suffix — **normalization, not a value change.** `indonesian` ← `"Indonesian cuisine"`.
> `minangkabau` is **deliberately absent**: the cuisine hierarchy is an **open follow-up**, not a decision (ADR §4). Minangkabau specificity is carried by `origin` (place) and claims.

### 1.3 `dish_course` — single-valued (D7b)

**Primary meal role** (D3f). Secondary/situational uses → `dish_context`.

`main-course` · `appetizer` · `dessert` · `side` · `soup` · `breakfast` · `snack` · `drink` · `condiment`

### 1.4 `dish_technique` — multi-valued (D7b)

Gerunds — *how it is made*.

`stewing` · `braising` · `simmering` · `grilling` · `skewering` · `spit-roasting` · `baking` · `frying` · `roasting` · `boiling` · `steaming` · `blanching` · `curing` · `fermenting` · `smoking` · `pickling` · `mashing` · `kneading` · `whisking` · `tempering` · `emulsifying` · `poaching` · `sautéing` · `stir-frying` · `deep-frying` · `enjoying`

> `dry-braising` is **not** in the vocabulary (D3e). Rendang's dry braise is expressed as technique `braising` + a claim recording the dryness.
> `grilling` and `simmering` are both present (D3c) — the two-stage CTM method needs both.

### 1.5 `ingredient_category` — multi-valued (D7b)

Applied **per ingredient**, not per dish. The dish-level cell in §3 records whether the dish has any ingredient rows in this dimension, and which categories those ingredients fall into.

`meat` · `poultry` · `seafood` · `fish` · `shellfish` · `game` · `offal` · `legume` · `grain` · `rice` · `noodle` · `bread` · `vegetable` · `leafy-green` · `root-vegetable` · `allium` · `fruit` · `citrus` · `herb` · `spice` · `aromatic-base` · `chili` · `paste` · `fat` · `oil` · `dairy` · `egg` · `nut` · `seed` · `sweetener` · `sugar` · `fermented` · `salt` · `beverage` · `liquid` · `broth` · `sauce` · `vinegar` · `wrapper` · `dough` · `pickle` · `cheese` · `stock` · `fumigation` · `sweet` · `savoury`

### 1.6 `dish_tradition` — multi-valued (D7b)

Cultural (not geographic) traditions — the cultural layer the ROADMAP's entity model requires. `tags` folds into this dimension (ADR §2.2).

`minangkabau` · `glasgow-muslim` · `indonesian-national` · `mexican-national` · `british-national` · `south-asian` · `ramadan` · `eid` · `imani` · `malay` · `peranakan` · `chinese-national` · `japanese-national` · `filipino-national` · `mediterranean` · `levantine` · `maghrebi` · `west-african` · `andean` · `latine` · `cajun` · `creole` · `sundanese` · `balinese` · `javanese` · `batak` · `aceh` · `bali` · `wedding-feast` · `communal-feast` · `harvest` · `street-vendor` · `night-market` · `home-cooking` · `restaurant-culture` · `street-food-culture`

> `minangkabau` is a **tradition**, not a cuisine (per the open cuisine-hierarchy follow-up). This is the one dish where the tradition is known and evidenced: rendang is the canonical Minangkabau dish.

### 1.7 `dish_context` — multi-valued (D7/D7b)

Flat 5 values, **no qualifiers**. `market` ≠ `street-food`.

`street-food` · `home` · `festival/ceremonial` · `restaurant` · `market`

---

## 2. Vocabulary coverage check

Every value used in §3 appears in §1. Verified mechanically before the pilot runs (see §6, check V1).

---

## 3. The pass/fail spec — all 7 dimensions × 3 dishes

### 3.1 `rendang`

| dimension | cardinality | expected value | controlled-vocab source |
|---|---|---|---|
| `dish_family` | single | `curry` | §1.1 |
| `dish_cuisine` | single | `indonesian` | §1.2 |
| `dish_course` | single | `main-course` | §1.3 |
| `dish_technique` | multi | `braising` | §1.4 |
| `ingredient_category` | multi | `unset` | §1.5 — the dish has **zero** ingredient rows today; this dimension is per-ingredient and nothing to assign |
| `dish_tradition` | multi | `minangkabau` | §1.6 |
| `dish_context` | multi | `home`, `festival/ceremonial`, `restaurant` | §1.7 — D3d |

**Dimension cells: 7. Expected values: 7.**

**NOT a dimension value (must be a claim):** the braise is **dry**. Per D3e this is an assertable fact → a `claim` with predicate `technique-qualifier` / value `dry`, source-anchored. It must not appear as `braising (dry)` in the technique cell.

**Side effects:**
- The `stew` category is **dropped** from rendang (D3). It remains a valid `dish_family` *value* in the vocabulary (§1.1) but rendang does not carry it.
- `kebab`/`curry` are removed from the `dish_technique` vocabulary — rendang's technique is `braising`, never `curry`.

### 3.2 `chicken-tikka-masala`

| dimension | cardinality | expected value | controlled-vocab source |
|---|---|---|---|
| `dish_family` | single | `curry` | §1.1 |
| `dish_cuisine` | single | `unset` | §1.2 — **the Glasgow dispute.** The migration must NOT resolve it. Leaving it unset and recording the dispute as competing claims is the correct end state, not a failure. |
| `dish_course` | single | `main-course` | §1.3 |
| `dish_technique` | multi | `grilling`, `simmering` | §1.4 — D3c |
| `ingredient_category` | multi | `unset` | §1.5 — zero ingredient rows today |
| `dish_tradition` | multi | `unset` | §1.6 — no evidenced tradition for CTM; the Glasgow/Muslim-British question is an **origin/cuisine dispute**, not a tradition assignment |
| `dish_context` | multi | `restaurant` | §1.7 |

**Dimension cells: 7. Expected values: 7.**

**NOT a dimension value (must be a claim):** the competing origin claims — "originated in Glasgow" and "originated in the Indian subcontinent". These are `claims` with `claim_class: disputed`, each with its own citations (one supporting, one refuting). They are **not** a cuisine value, and the migration must not pick a winner.

### 3.3 `tacos-al-pastor`

| dimension | cardinality | expected value | controlled-vocab source |
|---|---|---|---|
| `dish_family` | single | `taco` | §1.1 — D3b |
| `dish_cuisine` | single | `mexican` | §1.2 |
| `dish_course` | single | `main-course` | §1.3 — **primary meal role** (D3f). Its street-food usage is the *context*, not a second course. |
| `dish_technique` | multi | `spit-roasting` | §1.4 — D5b (vertical spit ≠ horizontal skewering) |
| `ingredient_category` | multi | `unset` | §1.5 — zero ingredient rows today |
| `dish_tradition` | multi | `unset` | §1.6 — no evidenced tradition |
| `dish_context` | multi | `street-food` | §1.7 |

**Dimension cells: 7. Expected values: 7.**

**NOT a dimension value (must be a typed relation):** the Lebanese `shawarma` → Mexican `al pastor` lineage → `dish_relations(target = shawarma, type = derived-from)`. Per D3b this is a **relation**, not a family assignment. The family cell must read `taco` and only `taco`.

---

## 4. Roll-up expectations

| metric | rendang | chicken-tikka-masala | tacos-al-pastor |
|---|---|---|---|
| dimensions with ≥1 value | 5 of 7 | 4 of 7 | 5 of 7 |
| `unset` dimensions | `ingredient_category` | `dish_cuisine`, `ingredient_category`, `dish_tradition` | `ingredient_category`, `dish_tradition` |
| dimension values written | 8 | 5 | 5 |

> **Note on `dish_tradition` for rendang:** it is **assigned** (`minangkabau`), not `unset` — rendang is the canonical Minangkabau dish and the tradition is evidenced. `ingredient_category` is `unset` for rendang only because the dish has **zero ingredient rows** — the dimension is per-ingredient, so there is nothing to categorise. That is a different kind of `unset` from CTM's `dish_cuisine`, which is unset because of an **unresolved dispute**. Both are written as `unset` in the spec; they mean different things and the migration must not conflate them.
| relations written | 0 | 0 | 1 (`derived-from` → shawarma) |
| claims required (not dimension values) | 1 (dry braise) + 2 disputed origin claims for CTM → **3 total across pilot** | 2 (disputed origin) | 0 |
| **evidence coverage** | `null` | `null` | `null` |
| **corroboration** | `null` | `null` | `null` |

**Coverage/corroboration are `null` for all three pilot dishes** because **all three have empty `longDescription`** — there are zero factual sentences to cover. Per the D6b amendment, `null` means *not measurable*, distinct from `0%` (*measurable and unsourced*). The pilot must therefore report `null`, and a reported `0%` is a **fail**.

> This is the point of the pilot: it proves the dimensions migrate correctly **before** descriptions and claims exist. The `claims` work (GUS-027/028) then populates the prose and the metrics become measurable.

---

## 5. Side-effect and integrity checks (all must hold)

| # | check | expected |
|---|---|---|
| I1 | Every one of the 21 dimension cells matches §3 exactly | pass |
| I2 | No cell contains a value absent from §1 | pass |
| I3 | No cell contains free text, a parenthetical, or a modifier | pass |
| I4 | `rendang` no longer carries `stew` | pass |
| I5 | `tacos-al-pastor` family is `taco`, and no `kebab` family row | pass |
| I6 | `tacos-al-pastor` has exactly one `dish_relations` row, type `derived-from`, target `shawarma` | pass |
| I7 | `chicken-tikka-masala` `dish_cuisine` is **unset** — no cuisine value written, no "winner" implied | pass |
| I8 | `chicken-tikka-masala` technique has exactly 2 values: `grilling`, `simmering` | pass |
| I9 | `rendang` context has exactly 3 values: `home`, `festival/ceremonial`, `restaurant` | pass |
| I10 | `rendang` technique cell contains exactly `braising` — no `dry` anywhere in the cell | pass |
| I11 | `ingredient_category` is `unset` for all three (zero ingredient rows) | pass |
| I12 | `dish_tradition` = `minangkabau` for rendang; `unset` for the other two | pass |
| I13 | Slugs, ids, names, and URLs are unchanged for all 3 dishes | pass |
| I14 | `edit_history` gains exactly one `update` row per dish, with comment naming the ADR-001 pilot | pass |
| I15 | All other dishes (118) are byte-identical before/after | pass |
| I16 | Rollback restores the pre-pilot state exactly (verified by snapshot diff) | pass |
| I17 | Coverage/corroboration report `null`, not `0%`, for all 3 dishes | pass |

---

## 6. Pre-flight gates (must all be true before the pilot runs)

| # | gate | state |
|---|---|---|
| V1 | A script validates every value in §3 against §1 and exits non-zero on any unknown value | ✅ **done** — `scripts/hermes/validate-pilot-spec.py`, passing (exit 0, 21/21 cells) |
| V2 | The exact expected end state for all 3 dishes is written down (this document) | ✅ done |
| V3 | A **snapshot** of the pre-pilot DB state for the 3 pilot dishes (plus the 118-dish comparison baseline) exists and is restorable | **to create** |
| V4 | A **rollback** path is written and **test** (not just assumed) | **to write + test** |
| V5 | Alejandro has given the explicit go for the pilot | ⏳ **pending** |

---

## 7. Out of scope for the pilot

- **The full 118-dish run** — only after Alejandro's explicit go, after the pilot passes.
- **Description writing and claim population** — separate workstream (GUS-027 source registry, GUS-028 claim-level citations). The pilot proves the dimension migration; it does not make coverage measurable.
- **The `recipes` subtree** — GUS-015/016.
- **The cuisine hierarchy** — open follow-up, recorded in ADR §4 Consequences. The pilot uses the flat vocabulary in §1.2.
- **Resolving the Glasgow dispute** — explicitly never. It is recorded as competing claims and nothing else.

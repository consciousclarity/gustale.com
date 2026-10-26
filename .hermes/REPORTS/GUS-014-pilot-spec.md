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

**STORED VALUES (leaves only)** — these are what a dish's `ingredient_category` cell may contain:

`meat` · `beef` · `pork` · `poultry` · `chicken` · `seafood` · `fish` · `shellfish` · `game` · `offal` · `legume` · `grain` · `rice` · `noodle` · `bread` · `vegetable` · `leafy-green` · `root-vegetable` · `allium` · `fruit` · `citrus` · `coconut` · `herb` · `spice` · `aromatic-base` · `chili` · `paste` · `fat` · `oil` · `dairy` · `egg` · `nut` · `seed` · `sweetener` · `sugar` · `fermented` · `salt` · `beverage` · `liquid` · `broth` · `sauce` · `vinegar` · `wrapper` · `dough` · `pickle` · `cheese` · `stock` · `fumigation` · `sweet` · `savoury`

**PARENT VALUES (derived — never stored on a dish):**

`red-meat` (parent of `beef`, `pork`, `game`, `offal`) · `white-meat` (parent of `poultry`, `seafood`, `fish`, `shellfish`) · `produce` (parent of `vegetable`, `fruit`, `herb`, `nut`, `seed`, `legume`) · `dairy` (parent of `cheese`, `egg`)

> **Leaf-only storage (Alejandro, 2026-10-26).** A dish's `ingredient_category` cell stores **leaf values only**. Parent categories are **derived**, not stored:
>
> | stored leaf | derived parent(s) |
> |---|---|
> | `beef`, `pork`, `game`, `offal` | `red-meat` |
> | `chicken`, `poultry` | `white-meat` |
> | `fish`, `shellfish`, `seafood` | `white-meat` |
> | `vegetable`, `fruit`, `herb`, `nut`, `seed`, `legume` | `produce` |
> | `cheese`, `egg` | `dairy` |
>
> **Why:** storing both a leaf and its parent double-counts. A dish with `beef` would carry `beef` **and** `red-meat`, and a query for "how many dishes use red meat" would return the same dish twice under two rows, while a query for "how many distinct categories does this dish have" would be inflated. The parent is a **query-time derivation** over the leaf set, not a stored fact.
>
> **Consequence for the pilot:** `rendang` stores `beef`, `coconut` — **not** `red-meat`. `chicken-tikka-masala` stores `chicken`, `dairy` — **not** `poultry`. `tacos-al-pastor` stores `pork` — **not** `red-meat`. Derived parents are reported by the query layer, never written.
>
> **Exception — `dairy` is a leaf here.** Dairy has no more specific evidence-backed leaf in these three dishes (the claim says "dairy base", not "cream" or "yoghurt"), so `dairy` is stored as the most specific evidenced value. The `dairy → cheese, egg` parent row above is future vocabulary, not a claim that these pilot dishes are `cheese` or `egg`.

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
| `ingredient_category` | multi | `beef`, `coconut` | §1.5 — from the D6 claims: protein = beef (→ `beef`), medium = coconut milk (→ `coconut`). Derived parent `red-meat` is **not stored** (leaf-only) |
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
| `ingredient_category` | multi | `chicken`, `dairy` | §1.5 — from the D6 claims: protein = chicken (→ `chicken`), the sauce's dairy base (yoghurt/cream) (→ `dairy`). Derived parent `white-meat` is **not stored** (leaf-only) |
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
| `ingredient_category` | multi | `pork` | §1.5 — from the D6 claims: protein = pork (→ `pork`). Derived parent `red-meat` is **not stored** (leaf-only) |
| `dish_tradition` | multi | `unset` | §1.6 — no evidenced tradition |
| `dish_context` | multi | `street-food` | §1.7 |

**Dimension cells: 7. Expected values: 7.**

**NOT a dimension value (must be a typed relation):** the Lebanese `shawarma` → Mexican `al pastor` lineage → a `dish_relations` row. Per D3b this is a **relation**, not a family assignment. The family cell must read `taco` and only `taco`.

**Relation type = `ancestor`** (not `derived-from`). Verified against the live table 2026-10-26:

| live `relation_type` | uses | example (`from` → `to`) |
|---|---|---|
| `ancestor` | 4 | `bacalhau-a-bras` → `vindaloo`, *"Portuguese carne de vinha d'alhos is the direct ancestor of vindaloo"* (strength 5) |
| `diaspora` | 4 | `shawarma` → `hamburger-american`, *"Doner kebab's diaspora to Berlin inspired the hamburger-among-immigrants"* (strength 2) |
| `family` | 104 | `chicken-tikka-masala` → `biryani-hyderabadi` |
| `regional-cousin` | 30 | — |
| `shared-method` | 28 | — |
| `similar-serving` | 14 | — |
| `shared-ingredient` | 6 | — |

`dish_relations.relation_type` is **free text** (no CHECK constraint), so `derived-from` *would* have been accepted by the DB — but it would have been an inconsistent 8th type in a vocabulary that already carries the right word.

### Direction convention — source = ancestor (CORRECTED 2026-10-26)

**`from_dish_id` is the ANCESTOR; `to_dish_id` is the descendant.** This is the opposite of what an earlier draft of this spec asserted, and the earlier draft was **wrong**.

The evidence, read from the live rows' own `reason` text:

| row | reason | source is… |
|---|---|---|
| `bacalhau-a-bras → vindaloo` | *"…is the direct **ancestor of** vindaloo"* | **the ancestor** |
| `biryani-hyderabadi → jollof-rice` | *"Biryani's … tradition is the documented **ancestor of** jollof"* | **the ancestor** |
| `shawarma → hamburger-american` | *"Doner kebab's **diaspora to** Berlin inspired…"* | the diaspora source |

`from_dish_id` is always the **subject** of the relation and `to_dish_id` the **object** — the same convention as `family` (`chicken-tikka-masala → biryani-hyderabadi`, *"Both pillars of…"*).

### The relation rows the pilot writes — TWO, not one

**Every relation in the live table is stored bidirectionally.** Verified across all 190 rows:

| `relation_type` | rows | with reverse row | without |
|---|---|---|---|
| `family` | 104 | 104 | 0 |
| `regional-cousin` | 30 | 30 | 0 |
| `shared-method` | 28 | 28 | 0 |
| `shared-ingredient` | 6 | 6 | 0 |
| `similar-serving` | 14 | 14 | 0 |
| `diaspora` | 4 | 4 | 0 |
| `ancestor` | 4 | 4 | 0 |

**190 rows = 95 pairs, zero unpaired.** Writing one row would make `tacos-al-pastor` the only dish with a one-sided relation in the entire catalog.

The pilot therefore writes **two rows**:

| column | row 1 | row 2 |
|---|---|---|
| `from_dish_id` | **`shawarma`** (the ancestor) | `tacos-al-pastor` |
| `to_dish_id` | `tacos-al-pastor` | **`shawarma`** |
| `relation_type` | `ancestor` | `ancestor` |
| `reason` | *"Al pastor derives from Levantine shawarma, adapted in Mexico with achiote and a vertical spit"* | same reason (the live reverse rows carry the identical reason) |
| `strength` | `4` | `4` |

> The live reverse rows carry the **same `reason` string** as their forward pair (e.g. both `bacalhau-a-bras → vindaloo` and `vindaloo → bacalhau-a-bras` carry *"Portuguese carne de vinha d'alhos is the direct ancestor of vindaloo"*). The pilot copies that pattern exactly.
>
> `tacos-al-pastor` currently has **0 relations** — the ADR's finding is confirmed live, and this pilot writes its **first** relations.

---

## 3.4 D6 claim → `ingredient_category` mapping

`ingredient_category` is filled **from the claims**, not from ingredient rows (the dishes have zero ingredient rows today). Each D6 claim that asserts a protein or a cooking medium contributes specific controlled-vocabulary values.

| dish | D6 claim (predicate → value) | → `ingredient_category` values (leaf only) | derived parent (NOT stored) | rationale |
|---|---|---|---|---|
| `rendang` | protein → beef | `beef` | `red-meat` | `beef` is the most specific evidenced leaf. `red-meat` is **derived** at query time, not stored. |
| `rendang` | medium → coconut milk | `coconut` | `produce` | coconut milk is the cooking medium; `coconut` is the ingredient category it falls into. |
| `chicken-tikka-masala` | protein → chicken | `chicken` | `white-meat` | `chicken` is the leaf. `poultry` is a **parent** in this vocabulary and is not stored; `white-meat` is derived. |
| `chicken-tikka-masala` | sauce base → yoghurt/cream | `dairy` | — | the sauce's dairy component is what makes CTM a curry rather than a grilled-meat-with-tomato dish. `dairy` is the most specific evidenced leaf (the claim says "dairy base", not "cream" or "yoghurt"). |
| `tacos-al-pastor` | protein → pork | `pork` | `red-meat` | al pastor is marinated pork; `pork` is the leaf. |
| `chicken-tikka-masala` | origin → Glasgow | — | — | **no `ingredient_category` contribution** — origin is not an ingredient fact. The two competing origin claims contribute nothing to this dimension. |

**Rules:**
- A claim contributes to `ingredient_category` only if its predicate asserts an **ingredient, protein, or cooking medium**. Claims about origin, family, technique, duration, or context contribute **nothing**.
- A claim that is **disputed** contributes **nothing** to the dimension — CTM's origin claims are disputed and are not ingredient facts anyway. A disputed *ingredient* claim would be excluded and flagged.
- The cell lists **every** category contributed by the evidenced claims. It is not a single "primary" category.

**Vocabulary used by these mappings** (all verbatim from §1.5): `beef`, `coconut`, `chicken`, `dairy`, `pork`.

**Parents are never written.** `red-meat`, `white-meat`, `produce` are derived from the stored leaves by the query layer. See §1.5 for the parent→child derivation table.

---

## 4. Roll-up expectations

| metric | rendang | chicken-tikka-masala | tacos-al-pastor |
|---|---|---|---|
| dimensions with ≥1 value | **7 of 7** | **5 of 7** | **6 of 7** |
| `unset` dimensions | **none** | `dish_cuisine`, `dish_tradition` | `dish_tradition` |
| dimension values written | **10** | **7** | **6** |

> **Note on `dish_tradition` for rendang:** it is **assigned** (`minangkabau`), not `unset` — rendang is the canonical Minangkabau dish and the tradition is evidenced.
>
> **`ingredient_category` is now populated for all three dishes** (from the D6 claims, per Alejandro's amendment 2026-10-26). It was previously `unset` because the dishes have zero *ingredient rows* in the live DB — but the dimension is filled from **claims**, not from ingredient rows, so the claims supply it directly. This is why rendang now has **7 of 7** dimensions assigned and **no** `unset` cells.
>
> **The two kinds of `unset` are different and must not be conflated:** CTM's `dish_cuisine` is unset because of an **unresolved dispute** (the Glasgow question — the migration must not resolve it), and the two remaining `dish_tradition` cells are unset because **no tradition is evidenced** for those dishes. A migration that treats "unset" as "use a default" would silently resolve the Glasgow dispute.
| relations written | 0 | 0 | **2** (bidirectional `ancestor` pair with `shawarma`, strength 4) |
| claims required (not dimension values) | 6 (D6: origin, family, protein, technique, medium, duration) — of which the **dry-braise qualifier** is one | 2 (disputed origin) + protein/dairy claims feeding `ingredient_category` | 1 (pork protein claim) |
| **claims total across pilot** | **6** | **4** | **1** → **11 claims** |
| **evidence coverage** | **0%** | **0%** | **0%** |
| **corroboration** | **0%** | **0%** | **0%** |

### CORRECTION (2026-10-26) — coverage is measurable, not `null`

**The earlier draft of this spec said coverage = `null` for all three dishes, reasoning that `long_description` is empty.** That was based on the wrong column. The live schema has **both**:

- `dishes.long_description` — empty for all three pilot dishes (and for 100 of 122 catalog dishes)
- `dishes.short_description` — **populated** for all three pilot dishes (149–206 chars)

**`short_description` is the authored prose that carries the claims.** Each pilot dish's short description is a single compound factual sentence:

| dish | `short_description` (the factual sentence) |
|---|---|
| `rendang` | *"A West Sumatran dry curry of beef slow-cooked for hours in coconut milk and a paste of ginger, galangal, turmeric, chili, lemongrass, garlic, and shallots until the sauce fully reduces and the meat darkens."* |
| `chicken-tikka-masala` | *"A dish of roasted marinated chicken chunks (chicken tikka) in a spiced, creamy tomato sauce. Often considered a British national dish due to its invention in Glasgow."* |
| `tacos-al-pastor` | *"Mexican tacos of marinated pork cooked on a vertical spit, shaved onto small corn tortillas, and finished with onion, cilantro, salsa, and pineapple."* |

Rendang's short description is **verbatim the D6 worked example** — the sentence D6 decomposes into 6 claims (origin / family / protein / technique / medium / duration). The dimension values in §3 are *derived from* this sentence, which is exactly the D4 "authored prose + claim anchors" model working as designed.

**Therefore:**
- **Each pilot dish has ≥ 1 factual sentence** → coverage is **measurable**, not `null`.
- **Expected coverage = `0%`** — measurable, and *nothing is anchored yet* (no claim rows exist; the claims work is GUS-027/028). `0%` is distinct from `null`: `null` = not measurable, `0%` = measurable and unsourced.
- **Expected corroboration = `0%`** — no claim has ≥2 independent sources, because no claims exist yet.

**This is a fail-fast signal, not a formality.** A pilot that reports `null` would mean the metric is looking at the wrong column; a pilot that reports `0%` proves the metric is correctly wired and correctly reports an unsourced catalog. The catalog-wide baseline is the same: **121/121 dishes are Wikipedia-only** (GUS-011), so the honest starting number is `0%` coverage / `0%` corroboration across the board.

> The ADR's original statement — *"all three have empty `longDescription`"* — remains **true** and is not contradicted. The correction is that `short_description` also exists, is populated, and is the prose the claims attach to. ADR-001 §3 and the spec are amended accordingly (see ADR §5, D4a).

---

## 5. Side-effect and integrity checks (all must hold)

| # | check | expected |
|---|---|---|
| I1 | Every one of the 21 dimension cells matches §3 exactly | pass |
| I2 | No cell contains a value absent from §1 | pass |
| I2b | No `ingredient_category` cell contains a **parent** value (`red-meat`, `white-meat`, `produce`) — leaf-only storage | pass |
| I3 | No cell contains free text, a parenthetical, or a modifier | pass |
| I4 | `rendang` no longer carries `stew` | pass |
| I5 | `tacos-al-pastor` family is `taco`, and no `kebab` family row | pass |
| I6 | `tacos-al-pastor` has exactly **2** `dish_relations` rows forming a bidirectional `ancestor` pair with `shawarma`: `shawarma → tacos-al-pastor` and `tacos-al-pastor → shawarma`, both `strength = 4`, both carrying the same `reason`. **Source = ancestor.** This matches all 95 existing relation pairs in the catalog, every one of which is bidirectionally paired | pass |
| I7 | `chicken-tikka-masala` `dish_cuisine` is **unset** — no cuisine value written, no "winner" implied | pass |
| I8 | `chicken-tikka-masala` technique has exactly 2 values: `grilling`, `simmering` | pass |
| I9 | `rendang` context has exactly 3 values: `home`, `festival/ceremonial`, `restaurant` | pass |
| I10 | `rendang` technique cell contains exactly `braising` — no `dry` anywhere in the cell | pass |
| I11 | `ingredient_category` is `unset` for all three (zero ingredient rows) | pass |
| I12 | `dish_tradition` = `minangkabau` for rendang; `unset` for the other two | pass |
| I13 | Slugs, ids, names, and URLs are unchanged for all 3 dishes | pass |
| I14 | `edit_history` gains exactly one `update` row per **touched** dish — the 3 pilot dishes **plus `shawarma`** (the ancestor side of the relation pair) = **4 rows** — with comment exactly **`GUS-014 pilot`**, and `dishes.updated_at` is bumped on every pilot write | pass |
| I15 | **All other dishes (119 non-pilot) are unchanged**, where "unchanged" = byte-identical digest **OR** changed with every change explained by an `edit_history` row written **inside the pilot window** | pass |
| I16 | Rollback restores the pre-pilot state exactly (verified by snapshot diff) | pass |
| I17 | Coverage and corroboration report **`0%`** (not `null`) for all 3 dishes — the metric reads `short_description`, which is populated, so coverage is *measurable* | pass |

### I15 in detail — the "other dishes unchanged" check, and why it tolerates concurrent writes

**The rule:** every dish outside the 3-dish pilot set must be unchanged, where "unchanged" means either:

- **(a) byte-identical** to the pre-pilot content digest, or
- **(b) changed, with every change explained by an `edit_history` row written inside the pilot window** (the window opens at the snapshot's `edit_history` high-water mark).

**Why (b) is allowed.** The pilot does not run in a vacuum — other agents and scripts may write to the same catalog. Demanding literal byte-identity across the whole catalog would fail the check for reasons unrelated to the pilot's correctness, and it could mask a genuine pilot defect by forcing someone to "clean up" the noise before the check could run at all. An unexplained change is still a hard FAIL; a change with an in-window `edit_history` row is a **concurrent legitimate write** and is reported, not failed.

**Why bot writes are NOT paused.** Checked 2026-10-26:
- `hermes cron list` → **no scheduled jobs**.
- `crontab -l` → **empty**.
- No content-bot process is running.
- The only timers are `gustale-rebuild-web.timer` (reads the live API, rebuilds web images — **read-only** for the DB) and `gustale-backup.timer` (dumps the DB — **read-only** for the DB).
- Last `edit_history` write was **2026-10-17 05:36** — 9 days before the pilot window.

There is no bot write to pause. Pausing would be theatre, and it would remove the guarantee that a concurrent write during the window is *detected* rather than *prevented*. The `edit_history`-window approach is strictly stronger: it handles the case that pausing cannot (a write that starts before the pause and lands after it).

**The checker is itself tested** — `scripts/hermes/test-i15-checker.sh` proves it (a) passes on an unmodified copy, (b) **FAILS** on a change with no `edit_history` row, (c) passes on a change with one, and (d) leaves the live DB untouched. A checker that cannot fail proves nothing.

### The `shawarma` side-effect — a 4th dish is touched by the pilot

The dry-run caught this: the pilot writes a `dish_relations` row whose `from_dish_id` is **`shawarma`**. A relation is part of a dish's content digest (I15 hashes `rel:` entries), so **shawarma's digest changes** — and shawarma is not one of the 3 pilot dishes.

The I15 checker correctly **FAILED** on this, reporting `shawarma` as an unexplained change.

**Resolution — shawarma gets its own `edit_history` row.** The pilot writes **4** `edit_history` rows, not 3:

| dish | `edit_history` row | why |
|---|---|---|
| `rendang` | ✅ | pilot dish — dimensions assigned |
| `chicken-tikka-masala` | ✅ | pilot dish — dimensions assigned |
| `tacos-al-pastor` | ✅ | pilot dish — dimensions assigned + relation pair |
| **`shawarma`** | ✅ | **touched as the ancestor side of the relation pair** — its content genuinely changed |

Without this, I15 would fail on every run and the check would have to be weakened to accept an unexplained change — which is exactly what the checker is designed to prevent. A relation that changes a dish's content **is** an edit to that dish, and it must be logged as one.

**This does not weaken I15.** The other **118** dishes must still be completely untouched. The pilot touches **4** dishes, and **all 4** are accounted for with an `edit_history` row.

> **Updated I15 wording:** *all dishes outside the pilot set are unchanged, except `shawarma`, whose change (the ancestor side of the relation pair) is logged in `edit_history` like any other edit.*

---

## 5a. V3/V4 tooling

| script | purpose | tests |
|---|---|---|
| `scripts/hermes/gus-014-pilot-snapshot.sh` | `snapshot` / `restore` / `verify`. Restores are blocked from targeting the live DB or any production-looking name. `verify` is read-only. | `test-restore-guard.sh` — 11 tests |
| `scripts/hermes/gus-014-rollback-test.sh` | The V4 proof: restore → mutate → **observe divergence** → restore → identical → confirm live untouched | itself (5 assertions) |
| `scripts/hermes/gus-014-check-other-dishes.py` | The I15 check: 119 non-pilot dishes unchanged, or changed only via an in-window `edit_history` row | `test-i15-checker.sh` — 4 tests |
| `scripts/hermes/validate-pilot-spec.py` | Gate V1: every spec cell validated against its controlled vocabulary | `test-validate-pilot-spec.py` — 10 tests |

**Why the rollback test has a "mutation must be observable" step.** Without it, the final identity check could pass simply because the mutation never landed — the test would prove nothing. This is not theoretical: the test **caught a real bug** during development (the mutation heredoc was missing `docker exec -i`, so stdin never reached `psql` and the mutation silently no-oped). The test failed, which is exactly its job. The mutation is now also asserted explicitly (3 descriptions mutated, 1 relation row) rather than trusting an exit code.

**Why every checker has a negative test.** A validator that cannot fail is not a validator. Each of the four test suites exercises at least one case that must be *rejected*, so a green run means something.

---

## 6. Pre-flight gates (must all be true before the pilot runs)

| # | gate | state |
|---|---|---|
| V1 | A script validates every value in §3 against §1 and exits non-zero on any unknown value | ✅ **done** — `scripts/hermes/validate-pilot-spec.py`, passing (exit 0, 21/21 cells) |
| V2 | The exact expected end state for all 3 dishes is written down (this document) | ✅ done |
| V3 | A **snapshot** of the pre-pilot DB state for the 3 pilot dishes (plus the full 122-dish comparison baseline) exists and is restorable | ✅ **done** — `scripts/hermes/gus-014-pilot-snapshot.sh snapshot`; 472K `db.dump` + schema + 3-dish baseline + 122-dish digest baseline + SHA256SUMS + `edit_history` high-water mark. **Snapshot on disk:** `.hermes/snapshots/gus-014/20261026T040610Z/` (gitignored — a binary dump does not belong in git; the *tooling* is committed, the *artifact* lives on disk and on the VPS backup) |
| V4 | A **rollback** path is written and **test** (not just assumed) | ✅ **done and TESTED** — `scripts/hermes/gus-014-rollback-test.sh`: restore → mutate → **observe divergence** → restore → identical. The mutation-observability step is what makes the test meaningful. Plus 11 passing restore-guard tests (`test-restore-guard.sh`) proving the live DB can never be a restore target |
| V5 | Alejandro has given the explicit go for the pilot | ⏳ **pending** — **STOP HERE** |

---

## 7. Out of scope for the pilot

- **The full 118-dish run** — only after Alejandro's explicit go, after the pilot passes.
- **Description writing and claim population** — separate workstream (GUS-027 source registry, GUS-028 claim-level citations). The pilot proves the dimension migration; it does not make coverage measurable.
- **The `recipes` subtree** — GUS-015/016.
- **The cuisine hierarchy** — open follow-up, recorded in ADR §4 Consequences. The pilot uses the flat vocabulary in §1.2.
- **Resolving the Glasgow dispute** — explicitly never. It is recorded as competing claims and nothing else.

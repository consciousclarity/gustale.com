# The 50-association pilot — the full list

**Sampled 25 of each `entity_kind`** from the 2,713 rows in
`dish_place_associations`, so both the resolving `place` rows and
the dangling `community` rows are represented.

**Nothing was written.** These are *proposed* verdicts, produced
by the mechanical rule below. The `review_state` column was not
updated and no row was inserted.

**Measured against the live database**, 2026-11-05.

---

## The confidence rule

First match wins:

| label | condition |
|---|---|
| **HIGH** | the entity resolves to a real `geo_entities` row, AND ≥1 source row supports the dish/place pair, AND the `relationship_type` is substantive (not `legacy_unreviewed`) |
| **MEDIUM** | the entity resolves, but no source row supports the pair |
| **LOW** | the `entity_id` is dangling — it resolves to no row |

**Proposed `review_state`:** HIGH → `accepted`; MEDIUM →
`in_review`; LOW → `in_review` if the value is recoverable from
`legacy_value` / `qualifiers->>'legacyCuisine'`, else `rejected`.

## The result

| confidence | count |
|---|---|
| LOW | **25** |
| MEDIUM | **25** |

| proposed review_state | count |
|---|---|
| `in_review` | **50** |

**No association reaches HIGH, and not one has a source.** Every
`place` row is `legacy_unreviewed` with `provenance =
`legacy_origin_geo_id` — a migration from the dish's origin
country, which is *discovery data*, not a reviewed historical
claim. The `explanation` on those rows says so explicitly.

---

## Rows 1–25 — `place` (the entity resolves)

| # | Dish | Place | Type | ISO | Wikidata | Relationship | Provenance | Evidence | Sources | Confidence | Proposed |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Moussaka | Greece (GR) Q41 | country | GR | Q41 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 2 | Taco al pastor | Mexico (MX) Q96 | country | MX | Q96 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 3 | Arook | Iraq (IQ) Q796 | country | IQ | Q796 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 4 | seven-layer salad | United States (US) Q30 | country | US | Q30 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 5 | krówki | Poland (PL) Q36 | country | PL | Q36 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 6 | corn fritter | Indonesia (ID) Q252 | country | ID | Q252 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 7 | Revuelto Gramajo | Argentina (AR) Q414 | country | AR | Q414 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 8 | cabbage stew a la Székely | Hungary (HU) Q28 | country | HU | Q28 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 9 | Udon | Japan (JP) Q17 | country | JP | Q17 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 10 | Unnakai | India (IN) Q668 | country | IN | Q668 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 11 | Struffoli | Italy (IT) Q38 | country | IT | Q38 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 12 | Pizzarello | Italy (IT) Q38 | country | IT | Q38 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 13 | Putu piring | Singapore (SG) Q334 | country | SG | Q334 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 14 | aletria | Portugal (PT) Q45 | country | PT | Q45 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 15 | serviettenknödel | Austria (AT) Q40 | country | AT | Q40 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 16 | Pasta con le sarde | Italy (IT) Q38 | country | IT | Q38 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 17 | Focaccia | Italy (IT) Q38 | country | IT | Q38 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 18 | karedok | Indonesia (ID) Q252 | country | ID | Q252 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 19 | lawar | Indonesia (ID) Q252 | country | ID | Q252 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 20 | tablet | Scotland (GB-SCT) Q22 | region | GB-SCT | Q22 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 21 | Taktouka | Morocco (MA) Q1028 | country | MA | Q1028 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 22 | Ming'oko | Tanzania (TZ) Q924 | country | TZ | Q924 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 23 | Loco moco | United States (US) Q30 | country | US | Q30 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 24 | Hawawshi | Egypt (EG) Q79 | country | EG | Q79 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |
| 25 | hamburger | Germany (DE) Q183 | country | DE | Q183 | `legacy_unreviewed` | `legacy_origin_geo_id` | unevidenced | 0 | **MEDIUM** | `in_review` |

### Row detail

**1. Moussaka** (`moussaka-greek`) → Greece (GR) Q41

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**2. Taco al pastor** (`al-pastor`) → Mexico (MX) Q96

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**3. Arook** (`arook`) → Iraq (IQ) Q796

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**4. seven-layer salad** (`seven-layer-salad`) → United States (US) Q30

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**5. krówki** (`krowki`) → Poland (PL) Q36

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**6. corn fritter** (`corn-fritter`) → Indonesia (ID) Q252

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**7. Revuelto Gramajo** (`revuelto-gramajo`) → Argentina (AR) Q414

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**8. cabbage stew a la Székely** (`szekelykaposzta`) → Hungary (HU) Q28

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**9. Udon** (`udon`) → Japan (JP) Q17

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**10. Unnakai** (`unnakai`) → India (IN) Q668

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**11. Struffoli** (`struffoli`) → Italy (IT) Q38

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**12. Pizzarello** (`pizzarello-food`) → Italy (IT) Q38

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**13. Putu piring** (`putu-piring`) → Singapore (SG) Q334

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**14. aletria** (`aletria`) → Portugal (PT) Q45

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**15. serviettenknödel** (`serviettenknodel`) → Austria (AT) Q40

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**16. Pasta con le sarde** (`pasta-con-le-sarde`) → Italy (IT) Q38

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**17. Focaccia** (`focaccia`) → Italy (IT) Q38

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**18. karedok** (`karedok`) → Indonesia (ID) Q252

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**19. lawar** (`lawar-food`) → Indonesia (ID) Q252

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**20. tablet** (`tablet-confectionery`) → Scotland (GB-SCT) Q22

- entity: `place` / region / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**21. Taktouka** (`taktouka`) → Morocco (MA) Q1028

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**22. Ming'oko** (`ming-oko`) → Tanzania (TZ) Q924

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**23. Loco moco** (`loco-moco`) → United States (US) Q30

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**24. Hawawshi** (`hawawshi`) → Egypt (EG) Q79

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

**25. hamburger** (`hamburger`) → Germany (DE) Q183

- entity: `place` / country / status active
- relationship: `legacy_unreviewed`
- provenance: `legacy_origin_geo_id`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: MEDIUM** → proposed `in_review`
- why: entity resolves, but the relationship type is legacy_unreviewed
- note: Migrated from the legacy origin_geo_id. This is the Wikidata 'country of origin' value — DISCOVERY DATA, not a reviewed historical claim. It is not promoted to historical_emergence because no qualifying source supports that specific claim. The original value is preserved in legacy_value.

---

## Rows 26–50 — `community` (the entity is dangling)

Every one of these has an `entity_id` that resolves to **no row**
in `geo_entities`, `food_regions` or `categories`. The readable
value survives only in `legacy_value` and
`qualifiers->>'legacyCuisine'`.

| # | Dish | Legacy value | Relationship | Provenance | Evidence | Sources | Confidence | Proposed |
|---|---|---|---|---|---|---|---|---|
| 26 | Moussaka | `greek` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 27 | Taco al pastor | `mexican` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 28 | Arook | `iraqi` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 29 | krówki | `polish` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 30 | corn fritter | `indonesian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 31 | Revuelto Gramajo | `argentine` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 32 | cabbage stew a la Székely | `hungarian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 33 | Udon | `japanese` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 34 | Unnakai | `indian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 35 | Struffoli | `italian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 36 | Pizzarello | `italian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 37 | Putu piring | `singaporean` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 38 | aletria | `portuguese` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 39 | serviettenknödel | `austrian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 40 | Pasta con le sarde | `italian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 41 | Focaccia | `italian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 42 | karedok | `indonesian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 43 | lawar | `indonesian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 44 | tablet | `british` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 45 | Ming'oko | `tanzanian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 46 | Hawawshi | `egyptian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 47 | hamburger | `german` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 48 | Kampot fish sauce | `cambodian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 49 | Mazamorra | `spanish` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |
| 50 | Kemplang | `indonesian` | `established_tradition` | `legacy_dish_cuisines` | unevidenced | 0 | **LOW** | `in_review` |

### Row detail

**26. Moussaka** (`moussaka-greek`) → community `greek`

- entity_id: `1133bbcb…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `greek`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "greek", "legacyIsPrimary": true, "legacyProvenance": "preparation"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**27. Taco al pastor** (`al-pastor`) → community `mexican`

- entity_id: `0a9fc578…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `mexican`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "mexican", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**28. Arook** (`arook`) → community `iraqi`

- entity_id: `df5d514c…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `iraqi`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "iraqi", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**29. krówki** (`krowki`) → community `polish`

- entity_id: `193beb7a…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `polish`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "polish", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**30. corn fritter** (`corn-fritter`) → community `indonesian`

- entity_id: `5b79c745…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `indonesian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "indonesian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**31. Revuelto Gramajo** (`revuelto-gramajo`) → community `argentine`

- entity_id: `73aca6db…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `argentine`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "argentine", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**32. cabbage stew a la Székely** (`szekelykaposzta`) → community `hungarian`

- entity_id: `0c28a25b…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `hungarian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "hungarian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**33. Udon** (`udon`) → community `japanese`

- entity_id: `1c1512bb…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `japanese`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "japanese", "legacyIsPrimary": false, "legacyProvenance": "preparation"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**34. Unnakai** (`unnakai`) → community `indian`

- entity_id: `304c9499…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `indian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "indian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**35. Struffoli** (`struffoli`) → community `italian`

- entity_id: `cd77a0ad…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `italian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "italian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**36. Pizzarello** (`pizzarello-food`) → community `italian`

- entity_id: `271fc9ba…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `italian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "italian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**37. Putu piring** (`putu-piring`) → community `singaporean`

- entity_id: `37d5ccef…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `singaporean`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "singaporean", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**38. aletria** (`aletria`) → community `portuguese`

- entity_id: `d460c969…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `portuguese`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "portuguese", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**39. serviettenknödel** (`serviettenknodel`) → community `austrian`

- entity_id: `611211e3…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `austrian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "austrian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**40. Pasta con le sarde** (`pasta-con-le-sarde`) → community `italian`

- entity_id: `ad0c0557…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `italian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "italian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**41. Focaccia** (`focaccia`) → community `italian`

- entity_id: `9170f328…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `italian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "italian", "legacyIsPrimary": false, "legacyProvenance": "preparation"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**42. karedok** (`karedok`) → community `indonesian`

- entity_id: `3f70504b…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `indonesian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "indonesian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**43. lawar** (`lawar-food`) → community `indonesian`

- entity_id: `b0b5a532…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `indonesian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "indonesian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**44. tablet** (`tablet-confectionery`) → community `british`

- entity_id: `388afdd7…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `british`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "british", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**45. Ming'oko** (`ming-oko`) → community `tanzanian`

- entity_id: `244e4696…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `tanzanian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "tanzanian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**46. Hawawshi** (`hawawshi`) → community `egyptian`

- entity_id: `21a78a04…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `egyptian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "egyptian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**47. hamburger** (`hamburger`) → community `german`

- entity_id: `4b450814…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `german`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "german", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**48. Kampot fish sauce** (`kampot-fish-sauce`) → community `cambodian`

- entity_id: `f1496295…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `cambodian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "cambodian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**49. Mazamorra** (`mazamorra`) → community `spanish`

- entity_id: `8f381a0a…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `spanish`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "spanish", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

**50. Kemplang** (`kemplang`) → community `indonesian`

- entity_id: `026a586a…` — **resolves to no row**
- relationship: `established_tradition`
- provenance: `legacy_dish_cuisines`
- legacy_value: `indonesian`
- qualifiers: `{"legacyStatus": "active", "legacyCuisine": "indonesian", "legacyIsPrimary": true, "legacyProvenance": "wikidata-country-of-origin"}`
- evidence_status: `unevidenced`  ·  current review_state: `unreviewed`
- sources: 0 (none)
- **confidence: LOW** → proposed `in_review`
- why: the entity_id is DANGLING (resolves to no row), but the value survives as legacy_value/legacyCuisine and can be re-pointed
- note: Migrated from the legacy dish_cuisines assignment. The cuisine '<cuisine>' has a matching tradition row '<tradition>'; the original cuisine value is preserved in legacy_value.

---

## What the pilot shows

1. **Nothing is sourced.** 0 of 50 have a source row. The tables
   that would carry one — `dish_region_sources`,
   `dish_location_sources`, `food_region_sources` — are all
   **empty**, and the only source link in the database
   (`citations`, 121 rows) points only at dishes.
2. **The `place` half is discovery data.** All 25 are
   `legacy_unreviewed` from `legacy_origin_geo_id` — the dish's
   origin country. The rows say so themselves: *"DISCOVERY DATA,
   not a reviewed historical claim."*
3. **The `community` half is dangling.** All 25 have an
   `entity_id` that resolves to nothing, because
   `dish_place_associations.entity_id` has no foreign key.
   The values are recoverable from `legacy_value`.
4. **So the review's real job** is to promote a
   `legacy_unreviewed` origin into a substantive
   `relationship_type` with a source behind it — and to
   re-point the dangling half. Both need somewhere to record
   what was found, which is what
   `docs/ASSOCIATION-REVIEW-PROPOSAL.md` proposes.

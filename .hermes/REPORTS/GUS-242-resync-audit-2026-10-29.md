# Resync audit — live DB state vs the "Stop and resync" instruction

- **Audited:** 2026-10-29, against the live `gustale` database on
  `shared-postgres` (127.0.0.1:5432) on this host.
- **Method:** read-only SQL only (`scripts/dbq.sh`). No writes, no migrations.
- **Instruction audited against:** session message 8195 ("Stop and resync"),
  2026-10-27.
- **Decision:** `decided-by: hermes` — audit first, then fix (per RULES.md §5.1).

## Headline

| Item | Instruction expected | Live DB now | Status |
|---|---|---|---|
| Countries | 250 (ISO 3166-1 249 + XK) | **259** | 9 extras present, **all unreferenced** |
| Regions without Q-id | 46, each with a recorded name source | **46** | present, but **no column to record the source** |
| Subdivision type stored | yes | **no column** | schema gap |
| ISO version recorded | yes | **no column** | schema gap |
| P576 dissolved filter | confirmed | **no column** | schema gap |
| `same_as_entity_id` | region row → country row | **no column** | schema gap |
| Cuisines | one per ISO country (→250), demonym from P1549 | **191** (185 distinct countries, 5 with null `country_code`) | needs ~59 new + 5 fixes |
| `Tunisian`, `Nepali`, `Puerto Rican` | must exist | Tunisian ✅ (TN), Puerto Rican ✅ (null cc), **Nepali ✅ exists but null cc** | exists; `country_code` null |
| `south-indian` → tradition | reclassify | still a cuisine (4 dishes linked) | needs move |
| `northern-cyprus` → tradition | reclassify | still a cuisine (0 dishes) | needs move |

## Fix (1) — countries: 259 → 250

The 9 extras are **exceptionally-reserved / transitional / withdrawn** ISO
codes, not countries:

| iso_code | name | wikidata_id | why it is not a country |
|---|---|---|---|
| AC | Ascension | Q31890709 | exceptionally reserved (SH dependency) |
| AN | Netherlands Antilles | Q25227 | withdrawn 2010 (dissolved into CW/SX/BQ) |
| CP | Clipperton Island | Q161258 | exceptionally reserved (FR dependency) |
| CQ | Sark | Q3405693 | exceptionally reserved (dependency of ISO 3166-2) |
| DD | East Germany | Q16957 | withdrawn 1990 (historical) |
| DG | Diego Garcia | Q184851 | exceptionally reserved (IO dependency) |
| PC | Trust Territory of the Pacific Islands | Q129237 | withdrawn 1994 (historical) |
| TA | Tristan da Cunha | Q34625512 | exceptionally reserved (SH dependency) |
| YU | Yugoslavia | Q36704 | withdrawn 2003 (historical) |

**Reference check (read-only):** all 9 are referenced by **zero** rows.

| referencing table | rows |
|---|---|
| `geo_entities.parent_id` | 0 |
| `dish_cuisines.country_code` | 0 |
| `dish_locations.country_code` | 0 |
| `food_regions.country_codes` | 0 |

XK (Kosovo) is **kept** — it is the explicitly sanctioned addition, not an
extra. 249 official + XK = 250.

## Fix (2) — region name sources (46 rows)

All 46 regions lacking a Wikidata Q-id, by ISO 3166-2 code:

| code | name | parent |
|---|---|---|
| BQ-BO | Bonaire | BQ |
| BQ-SA | Saba | BQ |
| BR-PE | Pernambuco | BR |
| BR-TO | Tocantins | BR |
| CG-BZV | Brazzaville | CG |
| CN-HK | Hong Kong SAR | CN |
| CN-MO | Macao SAR | CN |
| DO-33 | Cibao Nordeste | DO |
| DO-34 | Cibao Noroeste | DO |
| DO-35 | Cibao Norte | DO |
| DO-36 | Cibao Sur | DO |
| DO-37 | El Valle | DO |
| DO-38 | Enriquillo | DO |
| DO-39 | Higuamo | DO |
| DO-42 | Yuma | DO |
| FI-01 | Landskapet Åland | FI |
| FR-971 | Guadeloupe | FR |
| FR-972 | Martinique | FR |
| FR-973 | Guyane (française) | FR |
| FR-974 | La Réunion | FR |
| FR-976 | Mayotte | FR |
| FR-BL | Saint-Barthélemy | FR |
| FR-CP | Clipperton | FR |
| FR-MF | Saint-Martin | FR |
| FR-NC | Nouvelle-Calédonie | FR |
| FR-PF | Polynésie française | FR |
| FR-PM | Saint-Pierre-et-Miquelon | FR |
| FR-TF | Terres australes françaises | FR |
| FR-WF | Wallis-et-Futuna | FR |
| IQ-KR | Iqlīm Kūrdistān | IQ |
| NL-AW | Aruba | NL |
| NL-BQ3 | Sint Eustatius | NL |
| NL-CW | Curaçao | NL |
| NL-SX | Sint Maarten | NL |
| NP-P4 | Gandaki | NP |
| PH-40 | Calabarzon (Region IV-A) | PH |
| PH-41 | Mimaropa (Region IV-B) | PH |
| SH-AC | Ascension | SH |
| SH-TA | Tristan da Cunha | SH |
| SO-SA | Sanaag | SO |
| US-AS | American Samoa | US |
| US-GU | Guam | US |
| US-MP | Northern Mariana Islands | US |
| US-PR | Puerto Rico | US |
| US-UM | United States Minor Outlying Islands | US |
| US-VI | Virgin Islands, U.S. | US |

**Schema gap:** `geo_entities` has **no** column for a per-row name source,
no subdivision type, no ISO version, and no dissolved flag. The 1c
conditions ("record source per row", "subdivision type stored", "ISO version
recorded", "confirm P576 dissolved filter") therefore need a small schema
addition before the data can be fixed retroactively.

## Fix (3) — dual places and `same_as_entity_id`

20 region rows share a name with a country row. Split by kind:

**True dual places (14)** — the territory is genuinely both a country in
ISO 3166-1 and a subdivision of another country:

| region row | region name | country twin | parent (the subdivision's parent) |
|---|---|---|---|
| US-AS | American Samoa | AS | US |
| NL-AW | Aruba | AW | NL |
| SH-AC | Ascension | AC | SH |
| NL-CW | Curaçao | CW | NL |
| FR-971 | Guadeloupe | GP | FR |
| US-GU | Guam | GU | US |
| FR-972 | Martinique | MQ | FR |
| FR-976 | Mayotte | YT | FR |
| US-MP | Northern Mariana Islands | MP | US |
| US-PR | Puerto Rico | PR | US |
| FR-MF | Saint-Martin | MF | FR |
| NL-SX | Sint Maarten | SX | NL |
| SH-TA | Tristan da Cunha | TA | SH |
| US-UM | United States Minor Outlying Islands | UM | US |

**Name collisions, NOT dual places (6)** — distinct real places, proven by
their **different Wikidata IDs**:

| region row | region name | region Q-id | country twin | country Q-id |
|---|---|---|---|---|
| US-GA | Georgia | Q1428 (US state) | GE | Q230 (country) |
| BZ-BZ | Belize | Q506056 | BZ | Q242 |
| DJ-DJ | Djibouti | Q3604 | DJ | Q977 |
| GT-01 | Guatemala | Q695660 | GT | Q774 |
| LU-LU | Luxembourg | Q691741 | LU | Q32 |
| NG-NI | Niger | Q503932 (Niger State) | NE | Q1032 (country) |

**Structural relationship (verified):** the 14 true dual places are exactly
the subset of the 46 no-Q-id regions that have a country twin. The other 32
no-Q-id regions are ordinary subdivisions.

**No breakage from fix (1):** all 14 dual-place regions point at their
*parent* country (FR / NL / SH / US) via `parent_id`, **not** at the
country twin. Archiving AC and TA does not orphan any region. The
`same_as_entity_id` link to the twin is a **new, separate column** — exactly
what "Option B" describes — and it can point at a country row that is
itself archived, so the archive must retain the row (not delete it) for the
link to stay resolvable.

**Schema gap:** there is **no `same_as_entity_id`** column anywhere in the
database. Fix (3) needs the column added.

**Also noted:** `dish_regions` and `dish_locations` are both **empty** — the
122 dishes do not yet reference `geo_entities` at all. "Dishes reference the
country row" is therefore a forward-looking requirement, not a retroactive
repair; there is no dish→region link to redirect yet.

## Fix (4) — cuisines

- 191 cuisine rows, 185 distinct `country_code`, 5 rows with `country_code`
  NULL.
- Every non-null `country_code` resolves to a real `country` row (0 orphans).

The 5 NULL rows and their required treatment:

| cuisine | slug | dishes | required treatment |
|---|---|---|---|
| Nepalese | nepali | 0 | `country_code` → NP (mapping bug) |
| Puerto Rican | puerto-rican | 0 | `country_code` → PR (mapping bug) |
| Singaporean | singaporean | 2 | `country_code` → SG (mapping bug) |
| South Indian | south-indian | 4 | move to `dish_traditions`, not a cuisine |
| Northern Cyprus | northern-cyprus | 0 | move to `dish_traditions`, not a cuisine |

Target is **one cuisine value per ISO country = 250**. Current coverage is
191, so **59 cuisines are missing** (one per country not yet represented).
Demonyms come from Wikidata P1549 per the instruction.

## Ordered plan (decisions recorded)

- **decided-by: hermes** — archive the 9 extras rather than delete them.
  Reason: a hard delete is on the "ask Alejandro" list, and the rows are
  unreferenced, so an archive preserves the audit trail at zero risk.
  *Requires a status column on `geo_entities` — to be added in the same
  schema step as the fix-(2)/(3) columns.*
- **decided-by: hermes** — add the schema columns the 1c conditions require
  (`name_source`, `subdivision_type`, `iso_version`, `dissolved`, and
  `same_as_entity_id`) in **one** migration, then fix the data. Reason: the
  1c conditions explicitly say "fix retroactively if not", which is
  impossible without the columns. One migration, one backup, one rollback.
- **decided-by: hermes** — the two reclassifications (South Indian, Northern
  Cyprus) move to `dish_traditions`, matching the instruction, and are
  removed from `dish_cuisines` only after the tradition row exists.
- **decided-by: hermes** — 59 new cuisines are created in one batch, demonym
  from Wikidata P1549, `country_code` set, and **no dish links**: a cuisine
  with zero dishes is the intended "geographic frame" state under the
  0-members rule being dropped.

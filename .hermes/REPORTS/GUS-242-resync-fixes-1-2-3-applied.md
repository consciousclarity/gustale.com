# GUS-242 resync — fixes (1), (2), (3) applied live

- **Applied:** 2026-10-29, live `gustale` DB on `shared-postgres`.
- **Decisions:** `decided-by: hermes` (RULES.md §2 — none of these needed
  Alejandro: no money, no DNS, no licensing, no hard delete, nothing outside
  gustale, and no genuinely ambiguous call).
- **Gate (RULES.md §3):** backup SUCCESS → snapshot → dry-run on a copy →
  count assertions → apply → verify → rollback plan. All six steps done.

## Gate evidence

| Step | Evidence |
|---|---|
| Backup | `/home/deploy/gustale.com/backups/gustale_pre_0014_20261029T040642Z.dump` (812 KB), verified with `pg_restore -l` → 64 TABLE DATA entries |
| Snapshot | pre-migration row counts: geo_entities 3,849 · dish_cuisines 191 · dish_dish_cuisines 117 · dish_traditions 38 · geo_entity_names 338 · dishes 122 |
| Dry run | fresh DB `gustale_dryrun_0014` restored from live; 0014 + 0015 applied → COMMIT, all assertions green |
| Assertions | 5 pre-assertions (A1–A5) + 6 post-assertions (B1–B5); **abort path tested** — a deliberately wrong expected count raised `A1 failed` and rolled back with zero partial writes |
| Apply | `0014_geo_entity_provenance.sql` then `0015_gus242_resync.sql` on live → COMMIT |
| Verify | see below |

## Live verification

```
active countries      : 250     (was 259)
archived countries    : 9
regions w/ provenance : 46      (name_source + subdivision_type + iso_version all set)
dual-place links      : 14
total geo_entities    : 3849    (rows lost: 0)
```

## What changed

### Migration 0014 — schema

`geo_entities` gains the columns the 1c conditions require (they did not
exist, so the data fixes were impossible without them):

| column | purpose |
|---|---|
| `status` | `'active'` \| `'archived'` — **not** a delete, so `same_as_entity_id` can still resolve AC and TA (both extras *and* country twins) |
| `name_source` | where `name` came from — required for the 46 rows with no Q-id to cite |
| `subdivision_type` | `'first-level'` \| `'second-level'` — the ISO 3166-2 subdivision level |
| `iso_version` | the ISO 3166 edition the code and name came from (`ISO 3166-2:2020`) |
| `dissolved` | Wikidata **P576** as a DATE; NULL = in existence |
| `same_as_entity_id` | dual-place link, region row → country row (**Option B**) |

Plus two indexes and a `same_as_entity_id <> id` check constraint. All
columns nullable/additive; no existing row was modified by the DDL.

### Fix (1) — countries 259 → 250

The 9 extras archived (all exceptionally-reserved or withdrawn ISO codes,
all referenced by **zero** rows):

| iso_code | name | why not a country |
|---|---|---|
| AC | Ascension | exceptionally reserved (SH dependency) |
| AN | Netherlands Antilles | withdrawn 2010 |
| CP | Clipperton Island | exceptionally reserved (FR dependency) |
| CQ | Sark | exceptionally reserved |
| DD | East Germany | withdrawn 1990 |
| DG | Diego Garcia | exceptionally reserved (IO dependency) |
| PC | Trust Territory of the Pacific Islands | withdrawn 1994 |
| TA | Tristan da Cunha | exceptionally reserved (SH dependency) |
| YU | Yugoslavia | withdrawn 2003 |

**XK (Kosovo) is kept** — it is the sanctioned addition, not an extra.
249 official + XK = 250.

### Fix (2) — region name sources (46 rows)

All 46 regions without a Q-id now carry a recorded source. The full ISO
3166-2 list is a paid product, so the **public** ISO 3166-2 subset is the
base source and each row records the cross-check used:

| source | rows | cross-check |
|---|---|---|
| ISO 3166-2 (public subset) | all 46 | — |
| `+ national statistical office` | FI, NL, CN, SH, IQ, NP, BQ | — |
| `+ INSEE (fr:INSEE)` | FR | — |
| `+ US Census Bureau` | US | — |
| `+ ONE Dominican Republic` | DO | — |
| `+ IBGE Brasil` | BR | — |
| `+ PSA Philippines` | PH | — |
| `+ UN M49` | SO, CG | — |

`subdivision_type` is derived from the ISO 3166-2 code structure:
`^[A-Z]{2}-[A-Z0-9]{1,3}-[A-Z0-9]{1,3}$` → second-level, else first-level.
`iso_version` = `ISO 3166-2:2020`. The **P576 dissolved filter** was applied
explicitly: all 46 are in existence, so `dissolved` is NULL on every one.

### Fix (3) — dual places (Option B)

14 region rows now link to the country row for the **same real place**
(`same_as_entity_id`, region → country):

FR-971 Guadeloupe→GP · FR-972 Martinique→MQ · FR-976 Mayotte→YT ·
FR-MF Saint-Martin→MF · NL-AW Aruba→AW · NL-CW Curaçao→CW ·
NL-SX Sint Maarten→SX · SH-AC Ascension→AC · SH-TA Tristan da Cunha→TA ·
US-AS American Samoa→AS · US-GU Guam→GU · US-MP Northern Mariana Islands→MP ·
US-PR Puerto Rico→PR · US-UM US Minor Outlying Islands→UM

**The other 6 name matches are NOT dual places** — proven by their different
Wikidata IDs: US-GA Georgia (Q1428 US state vs Q230 country), BZ-BZ Belize
(Q506056 vs Q242), DJ-DJ Djibouti (Q3604 vs Q977), GT-01 Guatemala (Q695660
vs Q774), LU-LU Luxembourg (Q691741 vs Q32), NG-NI Niger (Q503932 = Niger
State, vs Q1032 = the country).

The link is one-directional; the country row stays canonical and **dishes
reference the country row**.

## Not yet done

- **Fix (4) — cuisines.** 191 rows / 185 distinct countries / 5 with null
  `country_code`; 59 more needed to reach one-per-ISO-country (250).
  The 5: `Nepali`→NP, `Puerto Rican`→PR, `Singaporean`→SG (mapping bugs),
  and `South Indian` + `Northern Cyprus` → move to `dish_traditions`.
- **Dishes → country row.** `dish_regions` and `dish_locations` are both
  still empty, so there is no dish→region link to redirect yet. The
  `same_as_entity_id` column is in place for when that data lands.

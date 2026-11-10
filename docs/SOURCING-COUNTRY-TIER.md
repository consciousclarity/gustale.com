# The country tier: 302 rows, and what the extra 53 are

**Measured:** 2026-11-11 · **Source:** the live `geo_entities` table, read-only

## The short answer

The 302 is not "ISO's 249 plus 53 more countries". It is three
different populations added together, and only **249** of them are ISO
3166-1 countries:

| the population | rows | used by a dish | what it is |
|---|---|---|---|
| **ISO 3166-1 officially assigned** | **249** | 122 | real countries |
| a code that is **not** an ISO country | 10 | **0** | Kosovo (active) + 9 archived former states |
| **no ISO code, and not a country** | 42 | **42** | regions, historical states, dish entities |
| no ISO code, but a real country | 1 | 1 | **Netherlands** — a duplicate of `NL` |
| **total** | **302** | 165 | |

**Every one of the 249 ISO countries is present — zero are missing.**
The difference is entirely in what was *added* on top.

## The 10 rows with a non-ISO code

None is used by any dish. Nine are archived former states or
dependencies; one is a real country ISO has never assigned a code to.

| code | name | status | why it is here |
|---|---|---|---|
| `XK` | Kosovo | **active** | user-assigned; ISO has never assigned it a code, and it is a real country |
| `AC` | Ascension | archived | a dependency, not a country |
| `AN` | Netherlands Antilles | archived | dissolved 2010 |
| `CP` | Clipperton Island | archived | an uninhabited French island |
| `CQ` | Sark | archived | a Channel Island, not a country |
| `DD` | East Germany | archived | dissolved 1990 |
| `DG` | Diego Garcia | archived | an island territory |
| `PC` | Trust Territory of the Pacific Islands | archived | dissolved 1994 |
| `TA` | Tristan da Cunha | archived | a dependency |
| `YU` | Yugoslavia | archived | dissolved 1992 |

**Kosovo is the one that matters** and it is the only one marked
active. It is a country and it is in the tier.

## The 42 rows that are not countries at all

These have **no ISO code**, and all 42 are used by a dish — so they
are load-bearing for the dishes, they are just not countries.

**Continents and world regions (16)** — Americas · Asia · North
America · Latin America · Balkans · Central Europe · Eastern Europe ·
Indian subcontinent · Levant · Low Countries · Maghreb · Mesoamerica ·
North Africa · Occitania · New England

**Historical states and empires (15)** — Acadia · Ancient Greece ·
British Hong Kong · British Raj · Duchy of Savoy · Goryeo · Kingdom of
Hungary · Moldavia · Ottoman Empire · Qajar Iran · Qing dynasty ·
Republic of China · Roman Empire · Soviet Union · Swabia

**Regions and present-day entities that are not sovereign countries (8)**
— Bohemia · China · Korea · Kurdistan · Palestine · Republic of Artsakh
· Taiwan Island · Tengchong City

**Not places at all (3)** — **Indûng Kapampángan** (a Filipino
language), **Saint Paul** (the apostle, and the basis of the São Paulo
dish name), **Sultanate of Maguindanao** (a historical polity).

### What this means for sourcing

**A country row is the wrong unit for 42 of the 302.** Sourcing
availability is a fact about a *market*, and these are not markets:
"Roman Empire" has no market, "Asia" is fourteen markets, and "China"
and "Korea" are not the same market as `CN` and `KR`.

The three are worth separating:

- **a region with real markets** (Asia, the Balkans, Latin America) —
  sourcing could be recorded per region, but the source would be
  regional, not national;
- **a historical state** (the Roman Empire, Qing dynasty, Goryeo) —
  **no sourcing row can exist**; there is no market to source from;
- **a dish or language entity** (Indûng Kapampángan, Saint Paul) —
  these are dish origin references, and they are *correct* in
  `geo_entities` as a dish's origin, but they are not sourcing
  geographies.

## The 1 that is a duplicate

**Netherlands** (no ISO code, active, 12 dishes) sits alongside `NL`
**Kingdom of the Netherlands** (active, 0 dishes). The same country,
two rows, and the dishes point at the one without the code.

## The consequence: the sourcing tier is not 302

The brief assumed ~250 countries. The live table has 302 rows. But the
**sourcing** tier — the rows a country could actually have availability
recorded against — is:

| the tier | rows |
|---|---|
| ISO countries, all of them | **249** |
| plus Kosovo, which is a country | **250** |
| plus the Netherlands duplicate, if it is kept as a market | **251** |
| the 9 archived former states | 9 |
| **the regions, historical states and dish entities** | **42** |

**250 is the right number for the sourcing programme**, and it matches
the brief's estimate closely. The 302 is the *geo* tier, which also
serves dish origins and so legitimately contains regions and empires.

**Recommendation.** The sourcing run should cover **250 markets** —
the 249 ISO countries plus Kosovo — and the 42 non-place rows should be
**excluded from sourcing by rule**, not by accident. That exclusion
should be a check, not a convention: an availability row whose
`geo_entity` is one of the 42 should fail, because there is no market
there to source from.

## The arithmetic, restated

- 250 markets × 30 ingredients = **7,500 ingredient × country pairs**
- at 6 pairs per batch = **1,250 batches**
- at 22 rows per batch = **27,500 rows**

See `docs/SOURCING-THROUGHPUT.md` for the measured rate and the
schedule that follows from it.

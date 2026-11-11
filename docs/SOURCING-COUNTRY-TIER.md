# The country tier: 302 rows, and what the extra 53 are

**Measured:** 2026-11-11 · **Source:** the live `geo_entities` table, read-only
**Checked by:** `scripts/check-sourcing-market.py`, run against all 302 live rows

## The short answer

The 302 is not "ISO's 249 plus 53 more countries". It is four
different populations added together, and only **249** of them are ISO
3166-1 countries:

| the population | rows | active | used by a dish | what it is |
|---|---|---|---|---|
| **ISO 3166-1 officially assigned** | **249** | 249 | 122 | real countries |
| a code that is **not** an ISO country | 10 | **1** | **0** | Kosovo (active) + 9 archived former states |
| **no ISO code, and not a country** | **41** | 41 | **41** | regions, historical states, dish entities |
| no ISO code, but a **duplicate** of an ISO country | **2** | 2 | 2 | **China** (also `CN`) · **Palestine** (also `PS`) |
| **total** | **302** | 293 | 165 | |

**302 rows, but 300 distinct names.** `China` and `Palestine` each
appear **twice** — once with an ISO code and once without — so the
row count exceeds the name count by two.

**Every one of the 249 ISO countries is present — zero are missing.**
The difference is entirely in what was *added* on top.

## The sourcing tier is 250 markets

| | rows |
|---|---|
| the 249 ISO 3166-1 officially-assigned countries | 249 |
| Kosovo (`XK`) — a real country ISO has never coded | 1 |
| **the sourceable markets** | **250** |

**250, and not 302.** The **52** names that are not markets: 41
non-place rows, 2 name-duplicates, and 9 archived former states.
They are **54 live rows**, because China and Palestine each have two.

---

## The 10 rows with a non-ISO code

**None is used by any dish.** Nine are archived former states or
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

---

## The 43 rows with no ISO code

**All 43 are used by a dish** — so they are load-bearing for the
dishes, they are just not markets.

### The 2 that duplicate an ISO country

| name | the ISO row it duplicates | dishes |
|---|---|---|
| **China** | `CN` · China | 0 |
| **Palestine** | `PS` · Palestine | 0 |

Both have an ISO-coded twin. The no-code row is the one the dishes
point at, which is why it exists; the sourcing must use the coded
one.

### The 41 that are not countries at all

**Continents and world regions (16)** — Americas · Asia · North
America · Latin America · Balkans · Central Europe · Eastern Europe ·
Indian subcontinent · Levant · Low Countries · Maghreb · Mesoamerica ·
North Africa · Occitania · New England

**Historical states and empires (16)** — Acadia · Ancient Greece ·
Bohemia · British Hong Kong · British Raj · Duchy of Savoy · Goryeo ·
Kingdom of Hungary · Moldavia · Ottoman Empire · Qajar Iran · Qing
dynasty · Republic of China · Roman Empire · Soviet Union · Swabia ·
Tengchong City

**Present-day regions and non-sovereign entities (7)** — Korea ·
Kurdistan · Taiwan Island · Republic of Artsakh · **Netherlands**

**Not places in any sense (3)** — Indûng Kapampángan (a Filipino
language) · Saint Paul (the apostle) · Sultanate of Maguindanao

---

## The rule

`scripts/check-sourcing-market.py` is the check. An availability row
must point at a **market**, and the rule rejects **54** of the 302
live rows — **52** distinct names:

- the **41** non-place rows,
- the **2** name-duplicates (`China`, `Palestine`) — each of which has
  two live rows, so **4** rows,
- and the **1** semantic duplicate: **`Netherlands`** (12 dishes,
  no ISO code) beside `NL` **Kingdom of the Netherlands** (0 dishes).
  The two are the same country under two names, and the sourcing must
  use `NL`.

Plus the **9 archived former states** with a non-ISO code
(Ascension, East Germany, Yugoslavia, …), which are not sourceable
markets either — they are archived, used by no dish, and there is no
market there to source in.

Verified: run against all 302 live rows, it rejects **54** and
accepts the rest.

**The list is a FILE, not a literal.** `scripts/sourcing-not-a-market.txt`
is generated from the live `geo_entities` table — the exact bytes of
the exact rows — so it has one spelling per name and cannot drift
from the database it describes. It was a literal once, and a hand-typed
diacritic differed from the live row by one code point; nothing
caught it until the mutation harness did.

```bash
# the two sets
python3 scripts/check-sourcing-market.py --list

# a market
python3 scripts/check-sourcing-market.py "Germany"
python3 scripts/check-sourcing-market.py "Netherlands"     # rejected
python3 scripts/check-sourcing-market.py "Asia"            # rejected

# an availability row
python3 scripts/check-sourcing-market.py --row '{"country_code":"DE"}'
```

**Why this is a check and not a convention.** All 41 non-place rows
are used by a dish, so they are real dish origins and a reader will
see them in the UI. A row pointing at one of them is **worse than a
missing row**: it looks complete, and it would put a product on a
market that does not exist.

---

## What this changes

| | |
|---|---|
| the sourcing scope | **250 markets**, not 302 |
| 30 ingredients × 250 markets | **7,500 pairs** |
| at 6 pairs per batch | **1,250 batches** |
| the rows that must exist | **27,500** |
| the rule that keeps a row on a real market | `scripts/check-sourcing-market.py` |

The throughput arithmetic is in `docs/SOURCING-THROUGHPUT.md`.

**The archived 9 are excluded too.** They are archived in
`geo_entities`, they are used by no dish, and they are former states
and dependencies — there is no market to source in.

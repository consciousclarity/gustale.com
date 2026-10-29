# GUS-242 step 1e — the tradition vocabulary, as built

**Status:** 🟢 **DONE — applied live 2026-10-29** (migration `0019`).
**Rule:** `decided-by: hermes` for everything the instruction left open.

## 1. The result

| | before | after |
|---|---|---|
| traditions | 40 | **433** |
| with a `definition` | 2 | **433** |
| with a `source` | 2 | **433** |

Plan target: 400–600, each with a definition and a source. **Met.**

## 2. The source, and why it is this one

The plan names "the 1,265 Wikidata Q1778821 items" as the best single
source. Measured on 2026-10-29, that is not quite the right shape:

- **Q1778821 is the concept *cuisine*** ("characteristic style of
  cooking practices and traditions") — a first-order class, not a
  populated tree. Its own `P527` children are *dish*, *food ingredient*
  and *culinary art*, so the tree route returns nothing.
- The route that works is the **instance** route: items that are
  instances of cuisine (directly or by subclass) and carry a country
  (`P17`). That is **991 items** — the shape the plan describes,
  regional and national culinary traditions, one per (cuisine, place).
- The other candidate sources were measured and rejected:
  - **UNESCO intangible heritage** is 676 elements across 140 countries
    **in total**, so it cannot be a backbone for a 400–600 value
    vocabulary. It is a supplement, not a source.
  - **Wikipedia category trees** have no stable ids and no per-item
    definitions, so they cannot supply the definition-and-source pair
    1e requires.

## 3. The curation

The raw 991 items are instances of "cuisine", so they include three
kinds of thing. Only one is a tradition.

| | count | rule |
|---|---|---|
| raw instances | 991 | — |
| dropped — no cuisine description | 597 | the description must say what the item IS (`cuisine of`, `culinary tradition`, …) |
| dropped — dish, drink, venue or holiday | 1 | the description must not say `dish`, `snack`, `cake`, `soup`, `restaurant`, `holiday`, `drink` |
| **kept** | **393** | |

Dropped examples: *Alakena* (a termite dish), *bingka* (a cake),
*Bubur ase* (a porridge), *Cinnamon Roll Day* (a holiday), *Basil & Peas*
(a restaurant), *Baja Med* (a marketing term).

An item with **no English description is dropped**, not given an invented
one: 1e requires a definition AND a source, and an unsourced definition
would break the requirement it is meant to satisfy.

**Checked afterwards:** 0 of the 393 have a dish-like label; 0 have a
missing definition or source; 182 distinct countries.

## 4. The 40 existing traditions

The 40 values already in the database were seeded with a name only —
38 of 40 had no definition and no source. They are **enriched, not
replaced**: their rows, slugs and names are untouched (asserted: P5).

25 got their definition from the matching Wikidata item. **15 could not**,
because Wikidata does not model them at all — diaspora and faith
traditions (`glasgow-muslim`, `latine`, `imani`), occasion traditions
(`eid`, `ramadan`, `harvest`, `wedding-feast`) and service traditions
(`street-vendor`, `home-cooking`, `restaurant-culture`,
`street-food-culture`, `night-market`, `communal-feast`). For those the
definition is the project's own and the source says so:

| source marker | meaning | count |
|---|---|---|
| `wikidata:Q12345` | the Wikidata item; the definition is its English description | 418 |
| `gustale:1e` | a project-written definition, researched in-house | 15 |

**decided-by: hermes** — the two source markers. The point of the
`source` column is to let a reader tell *where* a definition came from.
A marker that pointed at a page that does not exist would be worse than
no marker, so where there is no citation the source says
`gustale:1e` and makes no claim of one. The assertion P4 enforces that
no third form ever appears in the column.

## 5. How the row set is produced

Three scripts, and the SQL is **generated** so the row set and the
assertions cannot drift apart:

- `scripts/fetch_traditions_1e.py` — the SPARQL query and the fetch.
- `scripts/curate_traditions_1e.py` — the filter rules and the slugs.
- `scripts/build_traditions_existing.py` — the definitions for the 40
  existing values, mixing Wikidata descriptions with project-written
  ones.
- `scripts/emit_traditions_1e_sql.py` — emits `0019`.

## 6. Assertions

| | check |
|---|---|
| A1 | 40 existing traditions before the write |
| A2 | no new slug already exists |
| A3 | all 40 existing traditions still present |
| P1 | 433 traditions total |
| P2 | **every** tradition has a definition and a source |
| P3 | no duplicate slugs |
| P4 | every source is `wikidata:Q*` or `gustale:1e`, nothing else |
| P5 | the 40 existing traditions kept their names |

## 7. What 1e did NOT do

- **No dish links.** A tradition exists whether or not a dish uses it
  yet. The 10 existing `dish_dish_traditions` links are untouched.
- **No Wikidata item ids stored.** The Q-id is stored in `source` as
  `wikidata:Q…`. A dedicated `wikidata_id` column would be cleaner, but
  `source` is the column the plan asked to be populated, and adding a
  second id column would duplicate it. **decided-by: hermes** — keep it
  in `source`, because `source` is a string that may hold a citation to
  a page rather than an item, and the two are not the same thing.

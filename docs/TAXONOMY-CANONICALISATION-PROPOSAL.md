# The taxonomy — which one is canonical, and what to do with the descriptions

**Status: proposal. Nothing has been changed.**

## THE RECOMMENDATION

**The dimension tables are canonical.** The legacy `categories` table is a
discovered-data table, not a vocabulary, and the reasons are structural
rather than a matter of taste.

## WHY THE DIMENSION TABLES

1. **They are what the brief's D2 says.** The dimension tables are
   `dish_families`, `dish_techniques`, `dish_courses`,
   `ingredient_categories` and `dish_contexts` — five separate vocabularies,
   each with a `slug`, a `name` and a `description`, and each linked to
   dishes through its own join table (`dish_dish_families`,
   `dish_dish_techniques`, …).

2. **The legacy table is a FLAT, MIXED table.** `categories.kind` takes
   five values, and they mean different things:

   | kind | rows | what it is |
   |---|---|---|
   | `family` | 77 | a food family — a genuine dimension |
   | `cuisine` | 36 | a cuisine — NOT one of the five dimensions |
   | `dish-type` | 28 | the form a dish takes — arguably a family |
   | `course-group` | 11 | where a dish sits in a meal — arguably a course |
   | `technique` | 0 | — |

   So 47 of its 152 rows are CUISINES, and cuisines are not a dimension.
   They are a property of a dish's provenance — which is what
   `dish_place_associations` now models.

3. **The legacy table has no dish links of its own.** Its links are through
   `dish_categories`, a join table with a `kind`-shaped payload in
   `qualifiers`. The dimension tables have first-class join tables with
   `is_primary`, `vocabulary` and a `source` — a richer model.

## THE COUNTS (live, 2026-11-01)

### The legacy `categories` table

| | rows | with a description |
|---|---|---|
| family | 77 | 77 |
| cuisine | 36 | 36 |
| dish-type | 28 | 26 |
| course-group | 11 | 11 |
| **total** | **152** | **150** |

### The dimension tables

| dimension | rows | with a description |
|---|---|---|
| family | 306 | 173 |
| technique | 65 | 40 |
| course | 8 | 0 |
| ingredient_category | 435 | 2 |
| context | 31 | 26 |
| **total** | **845** | **241** |

### The overlap — the number that decides the work

Of the **150** legacy rows that carry a description:

| | count | meaning |
|---|---|---|
| **match a dimension row by slug** | **27** | the description can be copied across |
| match nothing | 128 | they are cuisines, dish-types and course-groups with no dimension counterpart |

Of those **27** matches:

| | count | meaning |
|---|---|---|
| the dimension has NO description | **26** | the legacy prose FILLS A GAP |
| the dimension already has one | 1 | keep the dimension's own |

### The gap that remains

**578 of the 845 dimension rows have no description from any source** —
neither their own column nor a matching legacy row.

That is the honest state of the vocabulary, and it is not a migration
problem. It is a **research** problem: 578 definitions do not exist yet,
and no amount of SQL will invent them.

## THE PROPOSAL

### Part 1 — copy the 26 across (a migration)

For each legacy row whose slug matches a dimension row that has no
description, copy the legacy prose into the dimension's `description`.

**26 rows.** It is idempotent (`WHERE description IS NULL`), it touches
only a column that is empty, and it is reversible (the source is the
legacy table, which stays).

### Part 2 — the 128 unmatched legacy rows

They break into three groups:

| group | count | proposal |
|---|---|---|
| `kind='cuisine'` | 36 | **not a dimension.** These are already modelled as places. Do not migrate them; leave the legacy rows as the record of what the import found. |
| `kind='dish-type'` | 26 with a description | **map to a dimension family where one exists, else queue.** "dumpling" is the example: it is in the legacy table, it is NOT in `dish_families`, and it has 8 published dishes. |
| `kind='course-group'` | 11 with a description | **map to `dish_courses` where one exists, else queue.** `dish_courses` has only 8 rows and NONE has a description. |

For the `dish-type` and `course-group` groups, the proposal is:

1. **Where a dimension row exists with the same slug, or an obviously
   equivalent one, link them** and copy the description. This needs a
   human judgement per row — "dumpling" should become a `dish_families`
   row, but that is an editorial decision, not a string match.
2. **Where there is no equivalent, add an EDITORIAL QUEUE item** — the
   same mechanism the journey-place gap uses (migration 0039). The queue
   already has a `category` constraint that would need one more value.

**No legacy row is deleted.** The legacy table is the record of what the
import found; deleting it would destroy the provenance of every migrated
row.

### Part 3 — the 578 with no description

**They become queue items, or they stay as they are.** I recommend
**staying as they are** for now, with the gap VISIBLE on the page: the
family page already says "The vocabulary does not yet record a rule for
what belongs in this group … That is a gap in the vocabulary, not a
definition."

Turning 578 rows into 578 queue items would flood the queue and bury the
31 journey-place items that are actionable. A better report would list the
dimensions by how many dishes they hold, so the gaps that matter are
visible.

### Part 4 — the family page's "Definition" vs "What is included"

Already fixed in PR #145: the vocabulary has no separate criteria column,
so the endpoint serves one field and the page shows one field. The
duplicated text was the endpoint serving `found.description` twice.

## WHAT I NEED FROM YOU

1. **Part 1** — copy the 26 descriptions across? (a migration, live, with
   the standing gate)
2. **Part 2** — should I map the `dish-type` and `course-group` rows
   myself, with the obvious matches, and queue the rest?
3. **Part 3** — leave the 578 alone, or queue them?

I have NOT written any of it. This is the proposal.

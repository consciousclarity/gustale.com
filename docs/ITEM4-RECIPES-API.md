# Item 4 — the recipes API and the Drizzle schema

The implementation note for card `t_5c002b54` (item 4 of the recipes
task). It records the ONE design decision that is not obvious from the
code, and why it is the way it is.

## What 0052 already gives us (do NOT rebuild)

`db/migrations/0052_recipes_schema.sql` (merged, PR #202, fixed by
PR #203) already creates, in SQL:

| object | line |
|---|---|
| `recipes` | 168 |
| `recipe_ingredients` | 196 |
| `recipe_sentences` (language-first) | 223 |
| `recipe_claims` | 257 |
| `recipe_translations` | 445 |
| `service_accounts` (+ the one `system:auto-publish` row) | 607 |
| `recipe_auto_publish_token` (REVOKE ALL from `gustale`) | 666 |
| `recipe_settings` (kill switch + cap 20, mode `disabled`) | 726 |
| `recipe_confidence` | 782 |
| `recipe_publish_log` | 804 |
| `recipe_level_least()` | 830 |
| `recipe_compute_confidence()` | 905 |
| `statement_set_status()` (system-actor branch) | 1427 |
| `recipe_auto_publish()` | 1778 |
| `recipe_auto_publish_owner()` | 2011 |
| `recipe_publishable` VIEW | 2052 |

So the DB-side publish gate, the kill switch, the daily cap and the
confidence computation are DONE. Item 4 is the **TypeScript half** plus
the **API surface**.

## The gap: `recipes.status` is never set to 'published'

`recipe_auto_publish()` publishes the recipe's STATEMENTS. It does not
touch `recipes.status`. But:

- `recipe_publishable` (0052's view) requires `r.status = 'published'`
  AND `r.review_state = 'approved'`;
- ADR-007-A1 §8.4 says "**It does not update `recipes.status` directly.**
  The recipe becomes published because its statements are published".

Those two are in tension: the view needs `r.status='published'`, and
nothing sets it.

### The resolution

The recipe's PUBLISHED-ness is **DERIVED**, not stored. Migration 0053
adds a view `recipe_published` that joins the recipe to its statements'
published status, and the API reads THAT.

```
dishes.status = 'published'          -- the dish is live
AND recipes.status <> 'archived'     -- not pulled
AND recipes.review_state <> 'rejected'  -- not refused by a human
AND EXISTS (a sentence)              -- it is not an empty shell
AND NOT EXISTS (                      -- and EVERY statement backs it
      a sentence whose statement is missing, unverified, or
      about a DIFFERENT subject
)
```

The last clause is the SCOPE clause, and it is the one that matters: a
recipe sentence may not carry a claim on a statement about anything else.
Without it, a shared Atlas statement about the DISH would make a recipe
look published — and the recipe would then be served with another
subject's evidence.

`recipes.status` stays an EDITORIAL field (draft / published /
archived) that a human sets through the review queue, exactly as
`recipe_publishable` already assumes. The API never writes it.

**This is the decision the owner should look at.** It is a deviation
from `recipe_publishable`'s predicate, and it is deliberate: it resolves
a contradiction between 0052's view and ADR §8.4 without editing an
applied migration.

## The API surface (ADR-007-A1 §5)

| route | what it is |
|---|---|
| `GET /api/recipes` | the FEED — every published recipe, newest first |
| `GET /api/recipes/:slug` | ONE recipe — its sentences, its ingredients, its confidence |
| `GET /api/recipes/settings` | the KILL SWITCH, read-only |
| `GET /api/dishes/:slug/recipes` | the HUB — the dish's recipes, and the derived `empty` flag |

The hub's empty state (§5.2) is DERIVED: 0 published recipes → `noindex`.
So the hub endpoint exposes the published-recipe count, and `empty` is
computed from that count — it cannot drift from the list.

## The constraints carried into the code

- The publish gate is in the DATABASE. The API does NOT re-implement
  the confidence computation — it reads `recipe_confidence`.
- The kill switch is a server-side row. The API does not read it to
  decide whether to publish; only `recipe_auto_publish()` does.
- The API does NOT publish anything by itself. There is no
  `UPDATE recipes SET status='published'` anywhere in it.
- `statements.status` can only change through `statement_set_status()`.
  The API never writes `statements.status`.

## The Drizzle schema

`packages/db/src/schema/index.ts` mirrors 0052's tables column for
column — all eight of them (`recipes`, `recipe_sentences`,
`recipe_claims`, `recipe_ingredients`, `recipe_translations`,
`recipe_confidence`, `recipe_settings`, `recipe_publish_log`).

It was verified against the migrated database: every column in every
recipe table matches the model exactly, and the index names match the
SQL.

`db/schema.sql` is a dump of the LIVE schema. It is NOT regenerated
here: 0052 has not been applied to live yet, so the dump does not
describe it. It must be regenerated after the live apply of 0052 and
0053 — see the PR body.

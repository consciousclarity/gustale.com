# The sitemap — what else should be listed, and what should not

**Status: PROPOSAL. No code written.**

Backlog item: *"the sitemap lists only dishes. Propose adding families,
places and lineage pages (or say why not yet)."*

## The facts

`scripts/generate_sitemaps.mjs` generates the per-locale sitemaps
**from the build output**, not from the database. That is deliberate
and correct — the ADR's rule is that the sitemap lists exactly the
pages that exist, because *a sitemap with a 404 in it is worse than no
sitemap*.

So the question is not "what exists in the database". It is **"which
built pages are indexable, and are they being left out?"**

The generator currently emits two kinds of entry:

- the shared pages (`/`, `/dishes/`)
- one entry per dish, with its `hreflang` alternates

Everything else that the build produces is **not listed**.

**The live sitemap's exact composition** (verified against
`https://gustale.com/sitemap-en.xml`, 1.69 MB): **1,476 URLs — 1,475
dishes and the homepage.** Nothing else. Every family page, every
lineage page, every place and ingredient page is absent.

---

## The finding that changes the answer

**I probed all 152 live family pages. 43 carry dishes. 109 are empty.**

```
probed: 152
  200: 152
  with dish links: 43
  200 but NO dish links: 109
  not 200: 0
```

Every one returns HTTP 200. **109 of them are a heading and nothing
else.**

| kind | categories | with dishes | empty |
|---|---|---|---|
| `family` | 77 | **1** | **76** |
| `cuisine` | 36 | 17 | 19 |
| `dish-type` | 28 | 25 | 3 |
| `course-group` | 11 | **0** | **11** |
| **total** | **152** | **43** | **109** |

**The `family` kind is almost entirely empty** — 76 of 77 have no
dishes at all. This is not a sitemap problem; it is a **content**
problem: the site's food-family taxonomy is populated in the database
but almost not linked to any dish.

The 43 that carry dishes:

```
appetizer, argentine-cuisine, bread, breaded-cutlet, casserole,
chinese-cuisine, colombian-cuisine, curry, dessert, dumpling, egg-dish,
ethiopian-cuisine, filipino-cuisine, french-cuisine, fried-rice,
indian-cuisine, indonesian-cuisine, israeli-cuisine, italian-cuisine,
japanese-cuisine, kebab, korean-cuisine, lebanese-cuisine, main-course,
mexican-cuisine, noodle-soup, pancake, pasta, peruvian-cuisine,
rice-dish, salad, sandwich, sauce, singaporean-cuisine, soup,
south-indian-cuisine, spanish-cuisine, stew, stir-fry, street-snack,
thai-cuisine, turkish-cuisine, vietnamese-cuisine
```

---

## The three you asked about

### Families — **yes, but only the 43 that carry dishes**

**43 pages.** Each is a hub: a definition and a list of dishes.
`/family/dumpling` serves `Filled dough parcels (boiled, steamed,
fried)` and 6–8 dishes. It is linked from the navigation ("Food
families") and currently reachable only by crawling.

**The argument for adding them** is that they are hubs. The dishes are
already listed; the family pages are the structure *above* them, and a
sitemap that lists leaves but not branches describes the forest as a
pile of trees.

**The 109 empty ones should not be listed.** They return 200 with a
heading and no content — and a sitemap that lists them is precisely
the failure ADR-003 was written to prevent. It would also be a
*signal*: 109 URLs in a sitemap that a crawler finds empty is worse for
the site's index quality than not listing them at all.

**This surfaces a bigger problem than the sitemap.** 76 of 77
`family` categories have no dishes. The food-family taxonomy is
largely unpopulated. That is a **backlog item in its own right** and I
have put it at the end of this document — the sitemap is the smaller
problem.

**One caution.** `/family/*` mixes four kinds of category under one
path, and the `cuisine` ones are a **different taxonomy** from the
`family` ones — the same split migration 0043 canonicalised in the
database but not in the URL space. **Adding these URLs to the sitemap
locks that in.** If the taxonomy is going to separate cuisines from
families later, now is the moment to decide the URL shape, not after
the sitemap has published them.

### Places — **not yet, because there are none**

`GET /api/places` on live returns `{"places":[],"count":0}`. There are
no published place associations, so the build emits **zero** place
pages.

**There is nothing to add.** Listing place URLs would require
inventing pages for places with no published dishes — the opposite of
the ADR's rule.

**The place machinery is built and waiting.** The endpoint resolves a
place, the page renders, the API has a contract test — it simply has
no data yet. When the place associations are published, the pages
appear and **the sitemap picks them up automatically**, because it is
generated from the build output. **No sitemap change is needed for
places when the data arrives.** That is the argument for the
build-output design: the coverage problem solves itself.

### Lineages — **yes, add all 14**

**14 pages, each with real prose**, each reachable from the navigation
("History & connections") and from every dish's Atlas section. They are
the most content-rich pages on the site after the dishes themselves.

**But the traffic evidence says the lineages are not being found:**

- 433 requests in the Caddy log mention `/lineages/`
- **392 are our own tooling** (the mock-refresh user agent)
- 15 are named crawlers
- **8 come from a browser — and 3 of those 8 are mine**

So **five genuine human visits in the entire log history.**

**The honest tension.** The lineages are thin on traffic *because*
they are not in the sitemap and are not linked from anywhere except
the navigation and the dish pages. Listing them is a discoverability
intervention, and its expected effect is uncertain — possibly a
handful of visits, possibly none.

**The counter-argument, which I think wins:** the lineages are the
*vocabulary* the map and the search are built from. They are the
taxonomy the whole Atlas hangs on. Burying the site's own taxonomy in a
sitemap is not a traffic decision; it is a statement that these pages
are not part of the site.

**And unlike the family pages, they are not empty.** Each carries
prose and a dish list. `/lineages/flatbread/` returns 200 with real
content.

## Ingredients — **no**

2 pages, both derived from dish details, both thin. The ingredient
*taxonomy* (`ingredient_categories`, 578 items) is a different thing
from the two ingredient pages the build emits. Not worth listing.

## `/regions/` — **no**

A thin index.

---

## What I propose

**Add to the sitemap:**

- `/family/<slug>/` for the **43 category slugs that carry published
  dishes** — the list is in the document above, and the generator
  should decide by the same test the page does (does it have dishes?)
  rather than by a hardcoded list.
- `/lineages/<slug>/` — all 14.

**Do not add:**

- the **109 empty** family pages — they hold no dishes and their pages
  are empty.
- `/place/<slug>/` — there are none, and they will appear by themselves
  when the data exists.
- `/ingredients/<slug>/` — 2 thin pages.
- `/regions/` — a thin index.

**The net change: 1,476 → 1,533 URLs** — 43 families + 14 lineages +
the 1,475 dishes + the homepage. A 4% increase, all of them real pages
with real content.

## The implementation note

The generator already reads the build output, so this is a change to
**which directories it walks** — not new plumbing. It needs:

1. a list of the path prefixes to include (`family/`, `lineages/`)
2. **a content test** — the generator must skip a family page with no
   dishes. It has to read each page anyway to confirm it resolves, so
   this is the same walk.
3. the same `hreflang` alternates the dish entries carry, since these
   pages are locale-scoped too
4. the `<lastmod>` convention the dish entries already use
5. the existing 404 guard, which checks that each generated path
   actually resolves

**One thing to get right:** the generator's dish entries carry
`hreflang` alternates because the same dish has locale variants. The
family and lineage pages are **also** locale-scoped, and if a family
page exists only in English its alternates must not claim otherwise.
The generator should derive the alternates the way it does for dishes
rather than copying them.

**How to decide "has dishes" in the generator:** the build already
knows. The family page's `getStaticPaths` resolves the categories, and
the page itself renders the dishes. The generator can read the built
`index.html` and count the dish links — the same test I ran. That is
reliable and needs no extra data.

## The order

1. **Decide the cuisine/family URL split** — this is the blocker, and
   it is a taxonomy decision, not a sitemap one.
2. Implement the generator change: walk `family/` and `lineages/`,
   apply the content test, carry the alternates.
3. Verify **both directions**: every URL in the sitemap returns 200
   *and* has content, and every built page of an included type is in
   the sitemap.
4. Deploy and watch `sitemap-en.xml` in the Search Console.

## The open question, stated plainly

**Should the 36 `cuisine` categories be in the sitemap at all?**

They are a *different taxonomy* from the 77 families — the same split
migration 0043 canonicalised. They currently share the `/family/`
path prefix, which is the thing to decide. Three ways:

- **(a) Keep `/family/` for both.** Simple, but publishes a URL scheme
  that mixes two taxonomies.
- **(b) Move cuisines to `/cuisine/`.** Clean, but it is a **URL
  change** for those pages, which means 301s — and we have just decided
  not to redirect anything.
- **(c) List what has content now**, and move the cuisines when the
  taxonomy work decides where they live.

**I recommend (c)** — it defers the URL decision without blocking the
sitemap, and it is reversible.

---

## The bigger problem this surfaced

**76 of the 77 `family` categories have no dishes.** 109 of 152 family
pages are empty. The site's food-family taxonomy exists in the
database but is almost entirely unpopulated.

That is a **content** problem, and it is a larger one than the
sitemap. A `/family/dumpling` page with 8 dishes is a useful hub; a
`/family/beef-lamb` page with zero dishes is a dead end that only
hurts.

**I would not list the empty ones, and I would not try to fill them
by hand.** The right fix is upstream: the dishes are classified into
*dimensions* (`dish_families`, `dish_techniques`, `dish_courses`,
`dish_contexts`) and into the legacy `categories` table, and the two
do not agree. Migration 0043 copied 26 descriptions across and mapped
what it could — but that is 26 descriptions, not 76 dish assignments.

**Worth a separate backlog item:** how many published dishes have a
`family` classification, and how many of the 77 `family` categories
should have dishes but do not. I have not counted it; it is the next
question if you want the families to earn a sitemap listing.

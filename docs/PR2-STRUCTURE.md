# PR 2 — One header and search, one link per card, landmarks, branding leak

**Branch:** `fix/pr2-one-header-one-search-one-link-card`
**Base:** `origin/main`
**Status:** open for review. Not merged, not deployed.

---

## What PR 2 is

PR 1 gave the site a focus ring, 24px targets and an axe gate that
*excluded* the four landmark rules with the reason
`"PR 2 — one main landmark"`. PR 2 is that work: it clears the
exclusions, removes the duplicate header/search, makes each card one
link, and stops the other property's name appearing on this one.

## Measured defects (live site, 2026-11-05)

### A. Landmarks — 4 axe violations, on 2 pages

The PR 1 gate parked four rules. Running exactly those rules against
production:

```
=== home /
  [moderate] landmark-main-is-top-level x1
      astro-island[uid="5GjAI"] > main
  [moderate] landmark-no-duplicate-main x1
      body > main
  [moderate] landmark-unique x1
      body > main

=== dish /dishes/moussaka/
  [moderate] landmark-complementary-is-top-level x1
      aside

=== families, family-detail, regions, lineages, about, contribute,
    login, account: clean
```

- **home**: the Layout renders `<main>` around the slot, and
  `GustaleHomeIsland` rendered its own `<main className="gst">` inside
  it. Two nested `<main>` elements — the page announced the main
  landmark twice.
- **dish page**: `<aside className="ing-col">` (the ingredients
  column) sits inside `<div className="rec-body">`, not directly inside
  `<main>`, so it is not a top-level complementary landmark.

### B. One header and one search

The **header** was already right: exactly one `<header>` per page, and
it is a direct child of `<body>` — so it is the one banner landmark.
The `<header class="browse-hero">` on `/families` and the five
`<header class="fam-group__head">` on `/family/<slug>` are section
headers inside `<main>`, which HTML does not treat as banners. **No
change needed.**

The **search** was not. The home page had **four** search controls:

```
home /
  <div role="search" class="gs-container gs-header gs-compact">  194x36  "Search"
  <input type="search" role="combobox" class="gs-input">         146x15  "Search Atlas"
  <input type="search" class="">                                 397x39  "Search dishes"   <- hero
  <input type="search" class="filt-search">                     1280x36  "Search dishes"   <- filter bar
```

The last two are **the same state** — `search` /
`setSearch` in `GustaleHomeIsland` — rendered twice on one page, once
in the hero and once in the filter bar. Two inputs, one value: typing
in one moves the other's text but neither is a "real" second search.

Every other page has the header's global search and at most one page
search:

```
families      3 (header, header input, "Search families or dishes…")
family-detail 2 (header, header input)
about         2 (header, header input)
dish          2 (header, header input)
contribute    2 (header, header input)
login         2 (header, header input)
account       2 (header, header input)
```

### C. One link per card

Measured on the live DOM: **zero nested anchors** anywhere (`a a` →
0 on every page). That failure mode does not exist on this site.

What does exist:

| Page | Cards that ARE one link | Cards with >1 link |
|---|---|---|
| home | 1,474 (`.atl-item`, the dish rows) | 0 |
| families | 22 (`.browse-dir-card`) | 0 |
| family-detail | 10 (`.fam-tile`) | 0 |
| regions | 0 | **21** (`.browse-dir-card--static`) |
| lineages | 14 | **14** (`.lin-card`) |

Two kinds of offender:

1. **`.lin-card` (lineages)** — the card's title is a link *and* the
   card has an "Open the lineage →" link, **both pointing at the same
   URL**. A keyboard user tabs twice to reach the same page. The
   second link is a duplicate of the first.

2. **`.browse-dir-card--static` (regions)** — a country card whose
   dish names are each their own link (up to 5). These are not
   duplicate links — they are genuinely different dishes — but the
   card is not itself a link, so it has no single "card" link and its
   title is a heading with no target.

### D. Branding leak

`gustale.com/about` served:

```
<title>About — gustale.recipes</title>
<h1>About gustale.recipes</h1>
```

The canonical URL was correct (`https://gustale.com/about`) — only
the human-readable name was wrong. `about.astro` was the **only**
page of 14 that hard-coded the other property's name; the other 13
all say "Gustale". The brand wordmark in the Nav is always "Gustale",
with the property shown separately in the switcher, so the leak was
in one page's title and heading.

A second, subtler leak was found by widening the search to the
property's **NAME** ("Gustale Recipes"), not just its domain
("gustale.recipes"):

| Page | Leaked text |
|---|---|
| `/dishes/` | `<p class="browse-eyebrow">Gustale Recipes</p>` |
| `/ingredients/` | `<title>Ingredients — Gustale Recipes</title>` + the same eyebrow |

Both hard-coded the recipes property's name while being served on
gustale.com.

Intentional mentions that **stay**: the header property switcher
("Recipes / gustale.recipes"), the footer's two property links, and
the 404 page's "go to Recipes" button. These are cross-property
navigation, not identity leaks. The verification script classifies them
explicitly rather than just counting string matches.

---

## The fixes

### 1. One main landmark (home)

`GustaleHomeIsland` renders `<div className="gst">` instead of
`<main className="gst">`. The Layout's `<main>` is the page's single
main landmark.

### 2. Complementary landmark (dish page)

Two `<aside>` elements on the dish page were nested inside `<main>` but
not directly inside it, so neither was a top-level complementary
landmark:

- `<aside className="ing-col">` — the ingredients column
- `<aside className="also-explore">` — the "you may also explore" list

The ingredients column becomes a `<section>` (it is a labelled section
of the page, not a tangential aside). `also-explore` becomes a plain
`<div>`, because the dish page's *wrapper* `<section aria-label="You
may also explore">` is the landmark that should carry that name — and
two landmarks with the same accessible name is itself a violation
(`landmark-unique`).

Both keep their CSS class, so the layouts are untouched.

### 3. One search on the home page

The hero search and the filter-bar search were the same value. The
**filter bar** input is kept (it sits with the region/family filters
and is where the filters live), and the **hero** input is removed —
the hero keeps its heading and its counters, and the search lives in
one place.

This is the opposite of what "one search" might suggest (keep the
hero one, drop the toolbar one), and the reason is measurable: the
filter bar's input is the one that is next to the region and family
selects, so it is where a person narrows a result set; the hero input
was a second way to do the same thing, 800px away, with no
relationship to the filters. Removing the hero copy leaves one search
whose behaviour is unambiguous.

### 4. One link per card

**`.lin-card`** (lineages) — the title link stays (it is the card's
name), and the "Open the lineage →" link is removed. The card then has
exactly one link. The call-to-action text is replaced by the same arrow
as a non-interactive affordance, so the card still *looks* actionable.

**`.browse-dir-card--static`** (regions) — the country card had **no
link of its own**: the country name was a bare `<h2>` and the only
links were the dish names below it. So a reader could not get from
"Mexico" to "the dishes from Mexico" — they had to pick one dish.

The fix follows the pattern the **families directory already uses**
(`FamilyDirectory.tsx`): the whole card is ONE link, and the names
inside it are plain text. The country card becomes

```html
<a class="browse-dir-card" href="/dishes?region=Argentina">
  <div class="browse-dir-card__top">
    <h2>Argentina</h2>
    <span class="browse-dir-card__count">4 dishes</span>
  </div>
  <p class="browse-dir-card__meta">Empanada · Asado · Choripán · Humita</p>
  <span class="browse-dir-card__go">Open the dishes <span aria-hidden="true">→</span></span>
</a>
```

The `.browse-dir-card` class already carried the anchor styling
(`display: block; text-decoration: none; color: inherit`), so the card
looks exactly as it did — only its behaviour changed. The
`browse-dir-card--static` modifier (which forced `cursor: default`) and
the now-unused `.browse-dir-dishes` rules are removed.

### 5. Branding leak

`lib/domain.ts` gains two helpers:

- `siteName()` → `gustale.com` for a geo build, `gustale.recipes` for
  a recipes build. `about.astro` uses it for both the `<title>` and the
  `<h1>`.
- `propertyName()` → `Gustale Atlas` for a geo build, `Gustale Recipes`
  for a recipes build. `/dishes/` and `/ingredients/` use it for the
  eyebrow and the title.

---

## Verification

### The axe gate now enforces the landmark rules

PR 1 parked four landmark rules with the reason
`"PR 2 — one main landmark"`. PR 2 removes those exclusions, so the
gate now covers them.

Against **production** (before this PR), the gate fails with:

```
VIOLATION desktop / [landmark-main-is-top-level] (moderate) x1
VIOLATION desktop / [landmark-no-duplicate-main] (moderate) x1
VIOLATION desktop / [landmark-unique] (moderate) x1
VIOLATION desktop /dishes/empanada [landmark-complementary-is-top-level] (moderate) x1
```

Against **this branch's build**, it passes:

```
axe gate: PASSED — 0 violations across 6 pages x 2 viewports.
```

### Structure, measured on the built site (10 pages)

```
ok   home /              main=1 banner=1 aside=0 h1=1 searches=2
ok   about /             main=1 banner=1 aside=0 h1=1 searches=1
ok   families /          main=1 banner=1 aside=0 h1=1 searches=2
ok   family-detail /     main=1 banner=1 aside=0 h1=1 searches=1
ok   regions /           main=1 banner=1 aside=0 h1=1 searches=2
ok   lineages /          main=1 banner=1 aside=0 h1=1 searches=2
ok   dish /              main=1 banner=1 aside=0 h1=1 searches=1
ok   contribute /        main=1 banner=1 aside=0 h1=1 searches=1
ok   login /             main=1 banner=1 aside=0 h1=1 searches=1
ok   account /           main=1 banner=1 aside=0 h1=1 searches=1

ALL PAGES PASS
```

Exactly one `<main>`, exactly one banner `<header>` (a direct child of
`<body>`), no `<aside>` outside a landmark, exactly one `<h1>`.

### One link per card, measured on the built site

```
regions   (.browse-dir-card)  36 cards   0 with 2+ links   0 with a duplicate href
lineages  (.lin-card)         14 cards   0 with 2+ links   0 with a duplicate href
families  (.browse-dir-card)  22 cards   0 with 2+ links   0 with a duplicate href
```

Before this PR, `/lineages` had 14 cards with **two links each** (the
title and "Open the lineage →", both to the same URL) and `/regions`
had 36 cards with **no link of its own**.

### One search

The home page had **three** search inputs before this PR (the header's
typeahead, the hero's, and the filter bar's — the latter two bound to
the same `search` state). It now has **two**: the header typeahead and
the page's filter input.

Measured on the hydrated DOM, before → after:

```
BEFORE (production)
  <main>     : 2 (nested: 1)
  visible search inputs: 3
      [y=   27] type=search placeholder="Search Atlas"                    class="gs-input"
      [y=  813] type=search placeholder="Search dishes — ramen, Japan, …"  class=""
      [y= 1089] type=search placeholder="Search…"                         class="filt-search"

AFTER  (branch build)
  <main>     : 1 (nested: 0)
  visible search inputs: 2
      [y=   27] type=search placeholder="Search Atlas"                    class="gs-input"
      [y= 1005] type=search placeholder="Search dishes — ramen, Japan, …"  class="filt-search"
```

Counting the inputs **inside the hero** specifically:

```
BEFORE {"heroBox":{"top":356,"bottom":977},
        "heroSearchInputs":[{"placeholder":"Search dishes — ramen, Japan, stew…",
                             "aria":"Search dishes","cls":"","y":813,"h":39,"w":397}]}
AFTER  {"heroBox":{"top":356,"bottom":893},
        "heroSearchInputs":[]}
```

The two are different mechanisms and both stay:

| | header typeahead | page filter input |
|---|---|---|
| markup | `role="search"` + `role="combobox"` | plain `<input type="search">` |
| behaviour | live typeahead; Enter navigates to the top hit | filters the list in place |
| scope | the whole site | this page's result set |

Every other page has the header typeahead plus at most one page search
(`/families`, `/regions` and `/lineages` each have one; the dish,
family, about, contribute, login and account pages have none).

> **Note on the screenshots.** The before/after images in this PR were
> checked against the DOM, not read by a vision model — an automated
> caption of these images described a *different site* (a "prompt
> library"), so the images are not reliable evidence on their own.
> The numbers above come from `document.querySelectorAll` against
> production and against this branch's build.

### Branding leak, measured on the built site (15 pages)

```
NO BRANDING LEAKS
```

The check classifies mentions of the *other* property as leaks unless
they sit in a container whose mention is intentional cross-property
navigation (the header switcher, the footer's property links, the 404
page's button). It checks the `<title>`, the `<h1>`, `og:title`, and
every text node in the body.

Before this PR, `/about/` was titled `About — gustale.recipes`,
`/dishes/` carried the eyebrow `Gustale Recipes`, and `/ingredients/`
was titled `Ingredients — Gustale Recipes`.

### Other checks

| Check | Result |
|---|---|
| `pnpm lint` | 574 warnings — one **fewer** than the 575 on `origin/main` (dead CSS removed) |
| `pnpm --filter @gustale/api run typecheck` | pass |
| `pnpm --filter @gustale/db run typecheck` | pass |
| local build (geo, mock API) | 16,373 pages |
| `scripts/test-check-ci-markers.sh` | pass |

### Screenshots

| | Before (production) | After (this branch) |
|---|---|---|
| home | `docs/screenshots/pr2/before/home-1280.png` | `docs/screenshots/pr2/after/home-1280.png` |
| home hero | `docs/screenshots/pr2/before/home-hero-1280.png` | `docs/screenshots/pr2/after/home-hero-1280.png` |
| about | `docs/screenshots/pr2/before/about-1280.png` | `docs/screenshots/pr2/after/about-1280.png` |
| regions | `docs/screenshots/pr2/before/regions-1280.png` | `docs/screenshots/pr2/after/regions-1280.png` |
| lineages | `docs/screenshots/pr2/before/lineages-1280.png` | `docs/screenshots/pr2/after/lineages-1280.png` |
| dish | `docs/screenshots/pr2/before/dish-1280.png` | `docs/screenshots/pr2/after/dish-1280.png` |
| regions cards (close-up) | — | `docs/screenshots/pr2/after/regions-cards-1280.png` |

The home "before" screenshot shows the hero search input; the "after"
screenshot shows the hero without it, with the search in the filter bar
below.

---

## What this PR does NOT change

- The map. PR 4's decision is that the map is out of scope and a text
  list of places is the fallback — that is PR 4, not here.
- The counts and the `family=` filter. Those are PR 3.
- The `image-alt` rule is still excluded in the gate: the dish page's
  alt text in the page language is PR 5.

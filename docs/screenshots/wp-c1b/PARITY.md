# WP-C1b — Home — parity table

**Definition of done:** D21-1. "A UI work package is done only when its PR includes a
parity table: every element of the mockup board marked *matches*, *deviates* (with the
reason) or *deferred* (with the WP it moves to). The table is checked against production
after the deploy, at 1440 and 390 px, with screenshots in `docs/screenshots/<wp>/`."

**What this table is.** Every bullet of WP-C1b in the brief, checked against the live
site and against this branch's build. Each row states the evidence, not a verdict alone.

**Where the "before" comes from.** The `Live` column was read from `https://gustale.com/`
on 2026-11-21, before this branch was built. The `After` column was read from this
branch's build at the two widths D21-1 names.

**Status.** ⬜ **not yet done.** D21-1 requires the table to be re-checked **against
production after the deploy**. The rows below are checked against the branch build; the
production re-check is the remaining step, and it is listed as such in the PR.

---

## The table

| # | WP-C1b requirement | Live (before) | After this branch | Verdict |
|---|---|---|---|---|
| 1 | Hero map caption reads "Mockup basemap: Natural Earth" → the real basemap attribution | `Mockup basemap: Natural Earth` | `Basemap: Natural Earth 1:110m Land (public domain)` | **matches** |
| 2 | Hero markers all show "1" with no names → label them with the place name and the dish count | 8 × `home-map__marker-count`, **0** name labels | 8 named labels under the 8 discs; the count stays in the disc and the caption says whose count it is; 8 numbered rows in a list at 390 px | **matches** |
| 3 | Thread cards: route places as plain chips, without "→" | `Indian subcontinent → Thailand → Japan → Malaysia` (and 2 more) | 12 place chips, **0** arrow routes | **matches** |
| 4 | Dish cards take their intro from the dish | template already reads `dish.shortDescription`; the **text** is wrong (see below) | template unchanged — the text is corrected by C2's migration `0066` | **deferred → WP-C2b / lane C2** |
| 5 | Header: remove the duplicate wordmark and the tagline "Explore the world through food" | tagline **present**; property block present | wordmark only, desktop **and** mobile drawer; no property block | **matches** |
| 6 | Footer on every page: How we handle evidence · Sources · Contribute · About · language switcher (published locales only, D21-9) | no `foot-locales` element; no language switcher | switcher on every page; How we handle evidence · Contribute · About present; **Sources deferred** | **partly deferred → lane E3** |

---

## Row 1 — the basemap attribution

**Live:** `Mockup basemap: Natural Earth`.

**Now:** `Basemap: Natural Earth 1:110m Land (public domain)`.

**Why the wording is what it is.** The old caption called the live basemap a "mockup",
which is mockup copy that shipped into the page, and it left the dataset's scale
unstated. The new caption names the dataset the map actually is.

**The dataset is not an assumption.** The asset was committed by `81145d1` with the
provenance "Natural Earth 1:110m land (public domain), pre-projected and committed", and
the generator `scripts/hermes/gen-hero-density-map.py` names the file it was made from:

```
nvkelso/natural-earth-vector/geojson/ne_110m_land.geojson
```

The committed SVG is a single `<path>` because the land outline is pre-projected and
rasterised into one shape. That is the generator working as intended, not a different
dataset.

**What is NOT claimed.** The blueprint (§5, Visual system) says "the mockup basemap is a
Natural Earth stand-in", and the site runs the real OSM/CARTO stack elsewhere. This
caption credits **this asset** — the hero's own basemap — and does not describe the
production map stack.

---

## Row 2 — the marker labels

**Live:** eight discs, each carrying "1", and no name anywhere.

**Now:** each marker carries its place's name. The number stays in the disc.

### The count is the thread's count, not the place's

This is the important part of the wording. The map shows the thread's places, and the
number on each is how many of **this thread's** dishes are there. On the live thread
that number is 1 at every place — and it is correct: the "Curry and Spiced Stew" thread
has one dish at each of its eight places. But a bare "1" next to "Indonesia", a place
that holds **193** dishes in the archive, reads as a claim about Indonesia. It is not
one.

So the figure's caption now says it, once, where a caption belongs:

> Each marker carries the number of this thread's dishes at that place.

### The label is the name only — and why

The first version of this put the count under every name, as "1 dish of this thread".
That was a mistake, and it was found by rendering the page and reading it rather than by
reasoning about it.

The count line is 21 characters wide — about 105 px — against place names of 20 to
73 px. The count line, not the name, was what made the labels collide. Measured against
the live map's eight marker positions, the wide count line overlapped **three** times:
Glasgow × Hungary, Portugal × Hungary, Portugal × Morocco. Portugal and Morocco are
10.9 px apart horizontally.

The first fix pushed overlapping labels apart **vertically**. It cleared every overlap
and was still wrong: a vertical push separates the label from the disc it labels.
"South Asia" ended up **162 px** below its own disc and "Hungary" **235 px** below —
roughly half the height of the map panel, with no leader line. Reading the rendered
screenshot confirmed it: the names were stacked in the lower half of the map with no way
to tell which name belonged to which pin.

The fix that works is to make the label **the place's name only**. The count is already
in the disc. With the name alone, the eight live names **do not overlap at all**, and
every label stays directly under its own pin.

The count's scope is not lost — it moved to the caption, where it is said once instead
of eight times.

### What is left in place, and what would break it

The component still has a **safety net**: if a future thread's names *do* collide, the
later label is nudged sideways by the minimum amount that clears, and a leader line is
drawn from the disc to the offset label. Sideways only — a label never runs away from
its pin.

The screenshot script checks both failure modes, so neither can come back unnoticed:

- **overlap** — two label boxes intersecting, and
- **drift** — a label further than 2.5 disc-radii from the nearest pin.

The drift check is the one that matters. The vertical-push version produced no overlap
at all, so an overlap check alone would have passed it.

### At 390 px the labels could not work at all

The map's SVG is 1000 units wide and scales to the container. At 390 px that is a
factor of 0.31, so a 12 px label renders at about 4 px — illegible, and the markers are
close enough that the names also collided. Rendering the page at 390 px and reading the
result confirmed it.

So below 640 px (the breakpoint the rest of the site already uses) the map keeps its
shape and its route and **stops trying to carry the names**:

- the SVG's name labels are hidden,
- the disc shows the marker's **index** instead of its count, and the pin is scaled 1.45×
  so the digit is a digit rather than a smudge,
- the names and counts appear as **real text** in a list under the map, at a size a phone
  can read.

The list is always in the DOM, so a screen reader gets the names as real text rather
than having to parse them out of the SVG's `aria-label`. The screenshot script asserts
that the names are presented in **exactly one** readable way at each width — both hidden
(names appear nowhere) and both visible (the names appear twice, and the unreadable copy
is still on the phone) are failures.

---

## Row 3 — the thread cards

**Live,** three thread cards:

```
Indian subcontinent → Thailand → Japan → Malaysia
East Asia → Central Asia → Mediterranean basin → Northern China
Persia → Mughal India → Mediterranean → West Africa
```

**Now:** the same places, as chips, with no arrow.

**Why.** ATLAS_STYLE §1: a movement needs a record. An arrow between two places is a
transmission claim, and these strings are not one. The route was built by joining the
thread's origin region to its **cousin** regions — a thread is a network of cousins, not
a family tree, and cousin membership says nothing about direction. "India → Thailand →
Japan → Malaysia" therefore asserts a journey the data does not support.

**What is NOT changed.** The map's own route line, its numbered stops, and the
sourced-direction arrows in Connections are untouched. Only the thread card's summary
line changes, because only it was fabricating a chain.

**Also not changed.** The thread URLs are still `/lineages/<slug>`. D21-5 moves them to
`/threads/<slug>` with 301s inside **WP-C4**, which is lane E1.

---

## Row 4 — the dish card intro (deferred)

**Live:** two dish cards carry intros that break the content gate:

- `…baked until golden. Considered the national dish of Greece.` (moussaka-greek)
- `…Often considered a British national dish due to its invention in Glasgow.`
  (chicken-tikka-masala)

**The template is not the problem.** `index.astro` already renders `dish.shortDescription`
for the card intro. The wrong text is in the **data**.

**Where it is fixed.** Lane C2, in migration `0066_c2_content_batch.sql`, which
rewrites the moussaka's short description sentence and re-renders the column from the
sentences. That migration is drafted in PR #288.

**One case is still open, and this branch does not claim it.** `0066` covers
`moussaka-greek` and `biryani-hyderabadi` among its six records. The **Chicken Tikka
Masala** "national dish … due to its invention in Glasgow" sentence is **not** in
`0066`. It is a `status-word` violation in the content gate's baseline
(`scripts/content_gate_baseline.json`, 151 violations over 1,474 published dishes) and
it is one of the two cases the brief (§6) names explicitly.

It needs an evidence-checked rewrite rather than a mechanical one — the sentence makes a
claim about Glasgow that the site's own thread page treats as disputed — so it goes
through the atlas pipeline with its sources, not through a second data-only migration.

**This row is therefore DEFERRED, not done.** The table will not mark WP-C1b ✅ while
that sentence is still live.

---

## Row 5 — the header

**Live:** the header rendered the wordmark **and** a property block repeating "Gustale",
plus the tagline "Explore the world through food".

**Now:** the wordmark alone, in both the desktop header and the mobile drawer. The
property block, its label, its description and the tagline are gone, along with the CSS
that styled them.

The desktop and the mobile drawer both carried the duplication; both are fixed.

---

## Row 6 — the footer (partly deferred)

**Live:** the footer had no language switcher on any page, and no `foot-locales`
element at all.

**Now:**

- The language switcher renders on **every** page, not only on dish pages.
- Links: **How we handle evidence** → `/about/evidence`, **Contribute** → `/contribute`,
  **About** → `/about`, plus the existing Atlas · Dishes · Families · Ingredients ·
  History · Recipes.
- The switcher lists only locales that have a **published** page, per D21-9. On the home
  page that is English alone — `/es/` and the other locale prefixes have no published
  route, so offering them would be a link to a 404. On a dish page the dish's own
  published locale URLs are used when the page has them.
- The current locale is rendered as text, not as a link to itself.

**Sources is deferred, deliberately.** The brief (§7) puts `/sources` in its own work
package — "an index of every source cited on Gustale … It is built from `sources` and
`claim_citations`, and it is the target of the footer link. **Do it after C4.**" — and
§2 of the brief notes "/sources returns 404 today; see section 7."

So the footer link is **not** added here. A link to a 404 is worse than no link: it
sends the reader to a broken page and, once the 404 is indexed, creates a search result
for a page that does not exist. The link ships with lane **E3**, in the same PR that
creates `/sources`, so the link and the page arrive together.

---

## Verification

Every claim in the table above was produced by running the code, not by reading it.

| Check | Result |
|---|---|
| `pnpm --filter @gustale/web run build` | **BUILD_RC=0** — 110 pages |
| `node --test --experimental-strip-types "src/**/*.test.ts"` | **370 / 370 pass**, 0 fail |
| `pnpm -r run typecheck` | **TC_RC=0**, 0 errors |
| `node scripts/run-lint.mjs` | **LINT_RC=0** — 759 warnings, **0 errors** — identical to the exact base `8d694fd`, so this branch introduces none |
| `node scripts/hermes/axe-accessibility-gate.mjs` | **AXE_RC=0** — 0 violations across 7 pages × 2 viewports |
| `node scripts/hermes/wp-c1b-home-screenshots.cjs` | **SHOT_RC=0** — 2 viewports, 0 problems, 0 console errors |

The screenshot script is the parity table's executable form. It asserts the caption, the
named markers, the count wording, the absence of the property block, the presence of the
language switcher, the footer links, the absence of an arrow route, and the
exactly-one-readable-way rule for the names at each width. It exits non-zero on any of
them, so the table cannot drift from the page without the script failing.

**The label geometry is measured, not eyeballed.** The script reads each label's and
each disc's box from the rendered page and fails if two labels overlap, or if a label
sits further than 2.5 disc-radii from its nearest pin. Both failure modes matter, and
the second is the one that catches the mistake this branch actually made — the version
that pushed labels apart vertically produced **no overlap at all** and was still
unreadable, because "South Asia" ended up 162 px below its own pin. An overlap check
alone would have passed it.

The measurements on the final build, against the live thread's eight markers:

| | |
|---|---|
| label/pin horizontal offset, worst case | **0.50 px** |
| label/pin vertical offset | **2.20 px** (the designed gap) |
| overlapping label pairs | **0** |

**One tooling fix came out of this.** The axe gate navigated with
`waitUntil: "networkidle"`. The pages fetch from the API at run time — in the browser
`API_BASE` is empty, so those requests go to the same origin as the page — and the
gate's own static server has no API behind it, so the requests never settled and the
navigation timed out. It looked random: one run timed out on `/`, the next on `/about`
and `/families`. Ten of the fourteen combinations passed every time. The gate now waits
for `domcontentloaded`, which is what a server-rendered Astro page guarantees, and all
fourteen pass deterministically. That fix is its own commit (`d596344`) so it can be
reviewed separately from this work.

**Base comparison.** The branch is built on the exact implementation base
`8d694fd16b0400cb457599b8aa1e926d915c4276`. The lint warning count is compared against
that base, not against an assumed zero.

The comparison is a measurement, not a claim: the base was checked out into its own
worktree at `8d694fd` and linted with the same Biome binary and the same config. The
base is **759 warnings, 70 infos**; this branch is **759 warnings, 70 infos**, and
**0 errors** on both. The per-file counts were compared too, because a total can hide a
regression behind an unrelated improvement:

| File | Base | Branch |
|---|---|---|
| `Nav.astro` | 9 | 8 |
| `LocaleSwitcher.astro` | 4 | 3 |
| `HomeThreadMap.astro` | 2 | 5 |
| `Layout.astro` | 13 | 13 |
| `index.astro` | 29 | 29 |
| `locales.ts` | 0 | 0 |

The `HomeThreadMap` figure is worth a word. Biome does not parse Astro's `---`
frontmatter fence, so it reads the frontmatter as top-level script and reports the
component's own constants as "unused variables" — `labelBand`, `label`, `routePoints`,
`countText`. All four are used in the template, which Biome cannot see. The base file
has the same class of false positive, and so does every `.astro` file in this repo; the
count is the number of such flags, not the number of dead code.

## Screenshots

`docs/screenshots/wp-c1b/`, at the two widths D21-1 names.

| File | What it shows |
|---|---|
| `desktop-1440-map.png` | the hero map with named markers |
| `desktop-1440-hero.png` | the whole hero |
| `desktop-1440-header.png` | the wordmark-only header |
| `desktop-1440-footer.png` | the footer with the language switcher |
| `desktop-1440-full.png` | the page at 1440 px |
| `mobile-390-map.png` | the map with the numbered pins and the list of places |
| `mobile-390-hero.png` | the whole hero at 390 px |
| `mobile-390-header.png` | the mobile drawer trigger |
| `mobile-390-footer.png` | the footer at 390 px |
| `mobile-390-full.png` | the page at 390 px |

## What is still open

1. **The production re-check.** D21-1 wants the table checked against production after
   the deploy, at 1440 and 390 px. That cannot happen before the merge. The rows above
   are checked against the branch build.
2. **The Chicken Tikka Masala intro** (row 4). Live, named in the brief, and not yet
   rewritten.
3. **`/sources`** (row 6). Lane E3.
4. **The `Sources` footer link** (row 6). Ships with lane E3, in the same PR as the page.

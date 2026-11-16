# WP-A3 — six sections, one footer, one search

**Baseline:** `origin/main` @ `cb853daf` (WP-A2 merged) · **Branch:** `feature/navigation-six-sections`
**Date:** 2026-11-16 · **Package:** WP-A3 of the 2026-11-15 blueprint

---

## The problem

The site carried **four** copies of its navigation, and they had drifted:

| where | what it said |
| --- | --- |
| the header | Explore / Dish origins / Food families / History & connections / About |
| the mobile drawer | the same five |
| the footer | Atlas / Recipes / Food families / **Lineages** / About |
| the search's fallback links | Globe / Places / Food families / History & connections / Browse recipes |

A reader who opened the search and then looked at the header saw two
different names for the same pages. One of the footer's links said
"Lineages", a concept the blueprint retires.

The header also carried a **two-cell Atlas/Recipes switch**, and the
footer carried a second copy of it. The blueprint wants ONE site
(decision D1) with six sections, and a switch is a message that there
are two sites.

## What this PR does

### 1. One definition of the six sections

`apps/web/src/lib/sections.ts` names the six sections and their paths,
their descriptions, and which of them live on the recipes host until
WP-D1 ships the single build.

The blueprint's decision D2:

| section | path | what it is |
| --- | --- | --- |
| Atlas | `/` | the map, the places, the whole thing |
| Dishes | `/dishes` | the dishes themselves |
| Families | `/families` | what shape a dish has |
| Ingredients | `/ingredients` | what it is made of |
| History | `/lineages` | threads, influences, connections |
| Recipes | `/recipes` | how to cook it |

"Explore" and "Dish origins" are gone: the first named nothing in
particular, and the second named a field the blueprint stops presenting
as an origin (D7).

The module deliberately has **no `import.meta.env` dependency**, so the
navigation's rules can be asserted directly on every host, without a
build step. 25 table-driven tests in `sections.test.ts`.

### 2. The header, the drawer and the footer read that one list

- The **host switch is gone** from the header. The two sections that
  still live on the recipes host are marked as leaving the site, which
  says the same thing without a switch.
- The **mobile drawer** shows the same six, each with its description.
- The **footer** shows the same six, plus About and the new Evidence
  page.
- The **search's fallback links** show the same six, with the same
  labels — they were the fourth copy.

### 3. The redirects, declared but not emitted until their target exists

`apps/web/src/lib/redirects.ts` is the blueprint's redirect map:

| old | new | released by |
| --- | --- | --- |
| `/map` | `/atlas` | WP-C1 |
| `/regions` | `/places` | WP-C3 |
| `/lineages/*` | `/history/*` | WP-C4 |
| `/family/*` | `/families/*` | WP-C1 |
| `/place/*` | `/places/*` | WP-C3 |

**Every one of those targets is a 404 today.** `/places`, `/history`,
`/atlas` and `/ingredients` do not exist yet — `/places` and `/history`
are built by WP-C3 and WP-C4, and the plural `/families/<slug>` detail
page does not exist at all (`/family/curry` is the live URL, and it
returns 200 with real content).

A 301 to a 404 is worse than no redirect: it tells a search engine the
page is gone and gives the reader a dead end. So each rule carries the
package that builds its target, and **only the rules whose target
exists are emitted** into `apps/web/nginx.conf`. The day WP-C3 lands
`/places`, the redirect starts working with no second edit — the map
says what the answer is.

`apps/web/scripts/generate-redirect-rules.mjs` writes the nginx block
from the map, so there is one answer rather than two. `--check` verifies
the config carries every active rule and names the held ones.

The `nginx.conf` block itself says what is held and why:

```
# HELD: the target does not exist yet, and a 301 to a 404 is
# worse than no redirect at all.
#   /lineages -> /history   (WP-C4)
#   /family -> /families   (WP-C1)
#   /place -> /places   (WP-C3)
#   /regions -> /places   (WP-C3)
#   /map -> /atlas   (WP-C1)
```

### 4. The build's validator asserts the new navigation

`validate-build.mjs` asserted the OLD navigation — "Dish origins →
/regions", "History & connections → /lineages" — so it would have
passed a build that had silently lost the six sections. It now asserts
all six labels, that the host switch is gone, that no nav link wrongly
claims to be current, and that the current page's link does.

## The two accessibility fixes that came with it

### The locale switcher's target size

The axe gate found a `target-size` violation on the Hindi locale link
at `/dishes/empanada`: **46.8px by 16px**, against the 24×24 minimum
(WCAG 2.2 SC 2.5.8). The locale links are 13px text with no minimum
size.

The fix uses the repo's own `--target-min` token as an inline-block box
with a 24px line-height, so the row's baseline alignment and its 10px
gap are unchanged and only the hit area grows.

### The `aria-current` check

The old validator checked that the "Dish origins" link carried
`aria-current="page"` on `/regions`. `/regions` is no longer a nav
section — the blueprint's six do not include a Places section, because
that becomes `/places` in WP-C3. The check now asserts the two things
that are actually true: the current page's link carries the attribute,
and no other link does.

## Verification

```
node --test --experimental-strip-types src/lib/sections.test.ts
# tests 25 · pass 25 · fail 0

node --test --experimental-strip-types src/lib/redirects.test.ts
# tests 9 · pass 9 · fail 0

node --test --experimental-strip-types scripts/test-search-nav.mjs
# tests 12 · pass 12 · fail 0

npm test                                    # the whole web suite
# 200 tests · 200 pass · 0 fail

pnpm lint                                   # RC 0
pnpm --filter @gustale/web run build:geo    # BUILD_RC 0, validate-build all pass

node scripts/hermes/wp-a3-navigation-gate.mjs --base http://127.0.0.1:4321
# PASSED — the six sections on both widths, the host switch gone,
# no header link 404s, the mobile menu reachable and operable BY
# KEYBOARD, the footer lists the six

node scripts/hermes/axe-accessibility-gate.mjs
# PASSED — 0 violations across 6 pages x 2 viewports

node apps/web/scripts/generate-redirect-rules.mjs --check
# nginx.conf carries every active redirect.
# Held back until their target exists:
#   /lineages -> /history   (WP-C4)
#   /family -> /families   (WP-C1)
#   /place -> /places   (WP-C3)
#   /regions -> /places   (WP-C3)
#   /map -> /atlas   (WP-C1)
```

## Screenshots

`docs/screenshots/wp-a3/` — the header with the six sections at 1440 px
and 390 px, the open mobile drawer, and the footer.

## Still to do, stated plainly

- **No redirect is live yet**, because no target exists. The map is
  ready and the generator emits the rules the day their targets
  land; that is WP-C1, WP-C3 and WP-C4's job, not this PR's.
- **The `/places` section is not in the navigation.** The blueprint's
  six do not include Places — the places directory is a destination
  inside the Atlas, and the country directory is `/regions` today. The
  navigation names "Atlas" for the whole thing.
- **The `History` section's path is still `/lineages`.** The public
  word is "History"; the path moves in WP-E1.
- **The search's index still searches the same types it did before.**
  The blueprint's "search across types" needs the API's search route
  to return the new sections' types; that is API work and is not in
  this PR.

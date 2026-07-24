# Gustale — Competitive Roadmap

> **Purpose.** Make `gustale.com` clearly better than tourism blogs (Explore),
> recipe/story sites (The World on a Plate), and as *legible* as crop-origin
> science (Khoury et al. 2016) — without becoming a meal planner or a travel
> agency. Gustale’s lane: **the open atlas of how food moved**.
>
> **References reviewed 2026-07-22**
> - https://www.explore.co.uk/blog/food-origins-from-across-the-world
> - https://www.theworldonaplate.co.uk/
> - https://royalsocietypublishing.org/doi/10.1098/rspb.2016.0792 (Khoury et al.)
>
> **Status legend:** `todo` · `in_progress` · `blocked` · `done`
> **Owner:** leave `unassigned` until claimed. Prefer one owner per item.
> **Priority:** P0 = trust/polish that blocks credibility · P1 = differentiators
> that make Gustale stand out · P2 = depth that keeps people · P3 = moat /
> long-game.

---

## North-star positioning (do not dilute)

Gustale is **not**:
- another recipe homepage with country boards
- a “10 surprising foods” blog
- a meal planner / calorie calculator

Gustale **is**:
- an open culinary encyclopedia with provenance
- a geographic + lineage atlas (form, place, journey, confidence)
- a place where every claim can be cited, and uncertainty is marked

**One-line brand test:** after removing the nav, the first viewport still
reads as *Gustale — atlas of how food moved*, not a generic food site.

---

## Competitive gap summary

| Competitor strength | Gustale today | Gap to close |
|---------------------|---------------|--------------|
| Explore: surprise journeys (Scotch egg, vindaloo, chilli/tomato) | Facts exist on some dish pages; map is a pin | Journey UI + editorial “surprising origins” surface |
| World on a Plate: story → cook; country guides; companions | Atlas/Recipes split; thin prep; flat `/regions` | Region guides + Atlas→Recipes CTA + light companions |
| Khoury: crop primary regions + country connectivity (~69% foreign) | Dish dots; `food_geography` Phase 2A empty | Ingredient origins + connectivity viz |
| All: polished first impression | Homepage SSR flashes **0 dishes** | Never show empty atlas stats |
| Gustale advantage already | Lineages + confidence + citations | **Lean into this** on homepage + dish pages |

---

# P0 — Credibility & first impression

## P0-1 · Homepage never shows zeros before hydration
**Status:** `done` · **Owner:** Cursor Cloud Agent · **PR:** #31 (merged 2026-07-23 via origin/main `fc1f9e0`) — AtlasHeroKpi.astro ships SSR real counts (`60 dishes / 32 origins / 18 families / 14 lineages`) above the fold.

**Problem.** Live homepage SSR still emits “0 dishes / 0 families / 0 origins”
before the island hydrates. Competitors never look empty. It undercuts the
atlas claim in the first second.

**Scope.**
- Server-render real counts (or bake from mock/API at SSG time) into the
  hero / atlas band so the HTML source contains non-zero stats.
- Keep client island for interactive filters; do not wait on hydration for
  headline numbers.
- Smoke: `curl -s https://gustale.com/ | grep -E '[1-9][0-9]* dishes'` finds
  a real count in the raw HTML.

**Done means.** View-source of `/` shows non-zero dish/family/origin counts
with JS disabled; hydrated UI matches.

---

## P0-2 · Dish cover / media reliability
**Status:** `done` · **Owner:** Cursor Cloud Agent · **PR:** #29 (media-first Phase A) + #33 (Greptile P1 cover/gallery duplicate fix + P2 duplicate CSS cleanup) — both merged 2026-07-23.

**Problem.** Dish pages still show “Loading cover…” / empty hero states;
gallery depends on signed URLs. Empty heroes make encyclopedia pages feel
unfinished next to recipe sites with always-on food photography.

**Scope.**
- Ensure every published dish has at least one cover media attachment (seed
  or curated upload).
- SSR a stable public or long-lived cover URL where policy allows; fall back
  to a tasteful origin/flag/typography composition — never a broken image or
  infinite “Loading…”.
- Cap signed-URL expiry UX: show credit + license even when URL refreshes.

**Done means.** Spot-check 20 random dish pages: zero “Loading cover…” with
network idle; every published dish has a non-empty hero treatment.

---

## P0-3 · Global search that actually finds things
**Status:** `done` · **Owner:** Cursor Cloud Agent · **PR:** #32 (merged 2026-07-23 via origin/main `b07ac4b` + follow-up `db8c30c` lowering pg_trgm threshold to 0.15 and dropping invalid `lineages.status` filter). Header `GlobalSearch` island ships with grouped results (dish/region/lineage/ingredient), keyboard nav, empty-state suggestions, fuzzy tolerance.

**Problem.** Discovery today is browse-heavy (families / regions / lineages).
Explore and World on a Plate both lead with search + story. Nav search must
return dishes, regions, lineages, and (later) ingredients in one grouped UI.

**Scope.**
- `GET /api/search?q=` (or extend dishes search) returning typed results:
  `dish | region | lineage | ingredient | family`.
- Header `NavSearch` island: grouped results, keyboard nav, empty-state
  suggestions (“try vindaloo, filled dough, Japan”).
- Fuzzy tolerance (`pg_trgm`) for typos.

**Done means.** Typing “vinda” finds Vindaloo; “dumpling” surfaces the
filled-dough lineage + dumpling family; mobile drawer search works.

---

## P0-4 · Finish auth + email verification (trust loop)
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS “Re-enable email verification”

**Problem.** Contribute / moderation story is live, but email verification
is OFF awaiting Resend. Competitive encyclopedia products need a real
account loop.

**Scope.** Resend + `hello@gustale.com` (or `noreply@`), flip
`requireEmailVerification` in `apps/api/src/auth.ts`, transactional templates
for verify + password reset.

**Done means.** New signup receives verify email; unverified users cannot
publish; smoke on staging/prod.

---

## P0-5 · U0-C browse/list usability (verified, pending merge)
**Status:** `verified · pending merge` · **Owner:** Hermes (Telegram) · **PR:** #37 (`feat/u0c-browse-usability` @ `2ea9df95f95e67b35bfba2a97b4728f434a286db`, open in draft, awaiting human review/merge). Independently verified PASS on 2026-07-24.

**Scope (practical list-page portion of U1-2 + U1-3).** `/dishes` (Recipes-only) gains SSR-first list with paginated Load more beyond the first 24, URL/filter state with Back/Forward + refresh restoration, Clear all, friendly empty/failure/Retry, human search placeholder (no more developer-style `origin:Italy` syntax). `/families` becomes a family directory (one card per family) instead of a chip wall. `/regions` keeps the `/regions` route but public language becomes "Countries" with a find field + alphabetical jump. `/lineages` keeps cards + confidence + detail links; advanced filters move into one disclosure with removable chips and Clear all. Shared sticky browse toolbar 68px below the site header, mobile-first search, ~44px filter control, aria-live status, Escape/focus restoration, reduced-motion safe, useful with JS disabled via SSR islands. Recipes build loses `/map`; Geo build loses `/dishes/new`, `/ingredients/`, edit pages — domain contract preserved.

**Verification totals (recorded in `TASKS.md` Done list 2026-07-24):**
- `node --test test-search-nav.mjs` — 12/12 pass
- `node --test test-browse.mjs` — 17/17 pass (history restore, append/dedupe, exact country, filter→page 1, late-page family fixture)
- `pnpm -r exec tsc --noEmit` — clean (5 pre-existing errors in untouched `api.ts:39`, `auth.ts:20`, `middleware.ts:32,55,55`)
- `pnpm exec astro check` — 1 pre-existing `AtlasHeroKpi.astro` error only (bit-identical SHA `cd12d37…7f` to origin/main; same `Type 'false' is not assignable to type 'true'` since 2026-07-22)
- `build:recipes` (repository mock on `:8742`) — **50 passed, 0 failed** validators
- `build:geo` (repository mock on `:8742`) — **53 passed, 0 failed** validators
- `/family/dumpling/` and `/family/late-page-family/` present in both dists (late-page-family validators preserved and pass)
- Browser evidence at `/home/alex/workspace/u0c-verify-evidence/`:
  - API unique total = 60
  - Pagination sequence: 24 → 48 → 60 (all 60 slugs unique, Load more absent at 60)
  - Back: 60 → 48 → 24, Forward: 24 → 48 → 60
  - Refresh `?page=3` restores 60
  - popstate does not create extra history entries (loadMorePushCount: 2, backDoesNotGrow: true)
  - Search "sushi" from `?page=3` resets URL to `?q=sushi` (no `page=`)
  - Later-page failure retains 48 cards with friendly Retry → 60
  - Mock country matching is exact case-insensitive (`country=united states` → 1, `country=United` → 0)
  - Mobile 320×720: zero horizontal overflow on /dishes /families /lineages, controls visible

**Done means (for the U0-C entry to close).** PR #37 merged, CI deploy green, production smoke confirms the same behaviors live (i.e. the new `/dishes`, `/families`, `/regions` Countries UI, `/lineages` disclosure, sticky toolbar are serving from `gustale.com` + `gustale.recipes`). Move this entry to status `done` and promote the related U1 items (U1-2 browse simplification, U1-3 empty/error states, U1-4 mobile find) to status `in_progress` or `done` per what the merged PR covers.

**Next action.** Mark PR #37 ready for review → review → merge → production smoke (live `/dishes` 24→60 via Load more, Back/Forward, mobile 320px, no AuthMenu 404 noise regressions). Do NOT auto-merge. Do NOT deploy without human approval.

---

# P1 — Differentiators (make Gustale stand out)

## P1-1 · Dish Journey UI (timeline + map path)
**Status:** `todo` · **Owner:** unassigned  
**Beats:** Explore’s “surprising origins” posts

**Problem.** Explore wins with narrative journeys. Gustale stores origin as
a single lat/lng pin and puts movement mostly on `/lineages`. On a dish page
the *journey* is not visible.

**Product.**
On every dish detail page, a **Journey** section:
1. Short 2–4 beat timeline (origin → key adaptations → where it’s iconic now).
2. Map overlay: polyline / animated path between beats (not just one marker).
3. Confidence badge per beat (`documented` / `likely` / `possible` /
   `parallel`) — Gustale’s scholarly edge over tourism blogs.
4. CTA into the parent lineage entity when one exists.

**Data.**
- New structured field or table, e.g. `dish_journey_beats`
  `(dish_id, sequence, place_name, lat, lng, year_approx, label, confidence, source_id)`.
- Seed 10–15 flagship dishes first (vindaloo, bánh mì, pizza margherita,
  chicken tikka masala, ceviche, sushi, pho, poutine, jollof, rendang…).
- Fallback: if no beats, hide the section (don’t invent).

**Done means.** `/dishes/vindaloo` shows Portugal → Goa → British curry-house
path with citations; map path renders on desktop + mobile; dishes without
beats omit the section cleanly.

---

## P1-2 · Ingredient origins layer (crop primary regions)
**Status:** `todo` · **Owner:** unassigned  
**Beats:** Khoury et al. / Explore ingredient bullets  
**Depends on:** Phase 2A `food_geography` tables (already deployed, empty)

**Problem.** Chilli → India and tomato → Italy are the classic “origins”
stories, and they are *ingredient* stories. Gustale is dish-first; crop
geography is unused.

**Product.**
- `/ingredients` index + `/ingredients/[slug]` detail.
- Each ingredient page: short description, **primary region of diversity**,
  map of origin region, list of Gustale dishes that use it, citations.
- Dish page module: “Key crops in this dish” with origin chips linking out.
- Optional homepage rail: “Ingredients that remade cuisines” (chilli, tomato,
  potato, coffee, wheat, rice, cacao…).

**Data.**
- Populate `food_geography` / ingredient tables with ~30–50 core crops first
  (not the full FAO list).
- Source primary regions from Khoury / CGIAR-style references; cite them.
- Wire dish↔ingredient edges (enrich beyond the current ~4 published
  ingredients noted in TASKS).

**Done means.** `/ingredients/tomato` and `/ingredients/chilli-pepper` live
with origin maps; at least 20 published dishes show ≥1 crop chip; mock API
updated so SSG builds ingredient pages.

---

## P1-3 · Country / region guides (not just filters)
**Status:** `todo` · **Owner:** unassigned  
**Beats:** World on a Plate country boards

**Problem.** `/regions` is a flat filter of dish cards. Competitors teach a
cuisine when you land on “Italy” or “Indonesia”.

**Product.** Each region page (`/regions/[slug]` or deepen current routes):
- 120–200 word editorial intro (techniques, staples, historical forces).
- Signature ingredients (links into P1-2).
- “Start here” 5 dishes.
- Lineages that entered / left this region.
- Optional: one “surprising import” callout (e.g. chilli in Goan food).

**Content ops.** Write guides for top 12 regions by dish count first
(Indonesia, Italy, China, India, Japan, Korea, Thailand, …). Keep tone
encyclopedia, not travel brochure.

**Done means.** Top 12 regions have non-empty guides; region page passes
the brand test (feels like Gustale, not a trip advert); dishes still list
below.

---

## P1-4 · Stories layer (editorial discovery on top of the atlas)
**Status:** `todo` · **Owner:** unassigned  
**Beats:** Explore blog + World on a Plate “food stories”

**Problem.** Gustale is almost pure database UI. Discovery blogs use articles
as the top of funnel; the atlas never gets those entrances.

**Product.**
- `/stories` index + `/stories/[slug]` MDX/Astro content collections.
- Every story is a thin editorial layer that **only links into** dishes,
  lineages, ingredients, regions — never a dead-end essay.
- Launch set (5–8):
  1. Dishes that aren’t from where you think
  2. Columbian Exchange on your plate
  3. Filled dough across Eurasia (reuse lineage)
  4. How empire remade the sandwich (bánh mì, etc.)
  5. Parallel inventions: dumplings without a single parent
  6. What “national dish” actually means
- Homepage: one Stories rail below the atlas hero (not inside hero).

**Rules.** No detached promo chips on hero media. One job per section.
Mark confidence; link sources.

**Done means.** `/stories` live with ≥5 pieces; each piece has ≥3 deep links
into atlas entities; homepage rail ships.

---

## P1-5 · Surface scholarly confidence on the homepage
**Status:** `todo` · **Owner:** unassigned

**Problem.** Lineages already encode `documented / likely / possible /
parallel`, but the homepage doesn’t advertise this honesty. Soft blogs
state journeys as fact; Gustale should win on trust.

**Scope.**
- Homepage one-liner + small legend: “We mark what’s documented vs possible.”
- Dish journey + lineage cards always show confidence chips.
- About page short section on epistemology / citation rules.

**Done means.** A new visitor sees the confidence promise above the fold
or in the first scroll section; About explains it.

---

## P1-6 · Atlas → Recipes bridge (without becoming a recipe site)
**Status:** `todo` · **Owner:** unassigned  
**Beats:** World on a Plate “story then cook”

**Problem.** Domain switcher to `gustale.recipes` exists, but dish pages
often have thin/empty preparation. Curiosity dies at “No detailed steps.”

**Scope.**
- Every published dish: either a cited traditional method summary
  (time, yield, key steps) **or** an explicit “Method coming — contribute”
  state with Contribute CTA (never a blank void).
- Persistent “Cook this on Gustale Recipes →” CTA when a recipe twin exists;
  “Request a recipe” otherwise.
- Do **not** build meal planner / calorie calculator (out of scope; that’s
  their product, not ours).

**Done means.** Audit of all 60 dishes: zero blank prep sections; ≥N dishes
deep-link to recipes domain.

---

# P2 — Depth that keeps people coming back

## P2-1 · “Also on the table” companions
**Status:** `todo` · **Owner:** unassigned  
**Inspired by:** World on a Plate bakery / cheese / wine / beer — **lighter**

**Scope.** Relation type `served-with` / `accompanies` between dishes (and
later ingredients). Dish page module: 2–4 companions with one-line why
(e.g. naan ↔ curry; pickles ↔ bánh mì). No separate wine encyclopedia
unless content capacity appears.

**Done means.** ≥30 companion edges seeded; module renders on dish pages
when edges exist.

---

## P2-2 · Connectivity / “foreign food” visualization
**Status:** `todo` · **Owner:** unassigned  
**Beats:** Khoury chord / CIAT interactive explorer  
**Depends on:** P1-2 ingredient origins

**Product.** `/atlas/connections` (or map mode toggle):
- For a selected country, show where its iconic dishes’ **key crops**
  originated (flows / chord / arc diagram).
- Headline insight framed carefully (not a clone of the 68.7% FAO claim
  unless we recompute with cited data): “Italian classics lean on New World
  crops” etc., always with sources.

**Done means.** Interactive page works for ≥10 countries; mobile has a
simplified list fallback; citations visible.

---

## P2-3 · Seed enrichment pass (content density)
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS “Seed-data enrichment pass”

**Problem.** ~60 dishes; dangling relation graph; thin ingredients; orphan
`DISH_LINEAGES` keys; 13+ referenced dishes missing from `DISHES`.

**Scope (one coordinated pass).**
- Add the missing high-value dishes named by relations (samosa, idli,
  focaccia, pita, baba-ganoush, tonkatsu, …) — prioritize ones that unlock
  journeys + lineages.
- Fix moussaka variant slug inconsistencies.
- Enrich ingredients + dish_ingredients.
- Re-seed idempotently; regenerate `mock-api-data.json` with correct shape
  `{ generatedFrom, list, map, details }` (**never** a raw list dump).
- Optional cleanup: drop or fulfill 13 orphan `DISH_LINEAGES` keys.

**Done means.** Relation seed reports 0 skipped edges; mock blob correct
shape; CI green; dish count meaningfully up (target ≥90 published).

---

## P2-4 · Moderation queue UI
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS P1 moderation

**Scope.** `/moderation` for moderator+: pending drafts, diff, approve/reject
with required note, edit_history timeline.

**Done means.** End-to-end contribute → review → publish on staging.

---

## P2-5 · Image upload UI + licensing hygiene
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS P2 image upload

**Scope.** Drag-drop upload in edit wizard; alt, license, credit; wire to
existing `POST /api/media/upload` + attach endpoints. Prefer CC-licensed
photography; never hotlink random web images without rights.

**Done means.** Contributor can attach a cover without SSH/MinIO console.

---

## P2-6 · OG / Twitter cards + JSON-LD
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS P3 OG + JSON-LD

**Scope.**
- Per-page Open Graph (dish hero as `og:image` when available).
- JSON-LD: `Article` / `Dataset`-like for encyclopedia entries; optional
  `Recipe` only when method is complete enough — don’t fake recipe schema.

**Done means.** Facebook/Twitter debuggers show correct previews for `/`,
a dish, a story, a lineage.

---

## P2-7 · MapLibre CSS only on map routes
**Status:** `done` · **Owner:** Cursor Cloud Agent · **PR:** #30 (merged 2026-07-23 via origin/main `bd2bcca`). MapLibre CSS import moved from `apps/web/src/styles/global.css` to per-route side-effect imports in `apps/web/src/pages/map.astro` + `apps/web/src/pages/dishes/[slug].astro`. ~70 KB saved on every non-map, non-dish page load.

**Scope.** Remove MapLibre CSS from global; import only on `/map` and dish
map islands as needed.

**Done means.** Non-map pages don’t load MapLibre CSS; `/map` still correct.

---

# P3 — Moat & long game

## P3-1 · Nearby / geolocation discovery
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS Phase 9a (`ST_DWithin`)

**Scope.** `/near` + `GET /api/dishes/nearby`; map click → 10 nearest dishes.

---

## P3-2 · Public read API for third parties
**Status:** `todo` · **Owner:** unassigned

**Scope.** Versioned public API, API keys, rate limits, attribution license
(data dump). Makes Gustale infrastructure for others — hard for blogs to copy.

---

## P3-3 · i18n (names + UI)
**Status:** `todo` · **Owner:** unassigned

**Scope.** Local names already partially modeled; ship UI language packs
starting with EN + one Romance language; preserve local dish names always.

---

## P3-4 · Brand / handle lock-in (non-engineering)
**Status:** `todo` · **Owner:** human

**Scope.** `@gustale` on IG/TikTok/X/YouTube/GitHub; `hello@gustale.com`;
defensive domains; trademark search/file in primary market. See prior
Cursor session notes on naming lock-in.

---

## P3-5 · Real linting in CI
**Status:** `todo` · **Owner:** unassigned  
**Related:** TASKS P1 Biome

**Scope.** Replace stub `lint ui` with Biome (or chosen tool) across packages.

---

# Suggested sequencing (execution order)

```
Wave A — Trust (1–2 PRs)
  P0-1 Homepage counts               [done — PR #31]
  P0-2 Cover reliability             [done — PR #29 + PR #33]
  P2-7 MapLibre CSS scope            [done — PR #30]
  P0-4 Email verification (ops + small code)
  P0-5 U0-C browse/list usability    [verified, pending merge — PR #37 @ 2ea9df9]

Wave B — Stand-out core (the competitive bet)
  P1-1 Dish Journey UI + seed 10–15 flagships
  P1-5 Confidence on homepage / About
  P1-4 Stories (launch 5) + homepage rail
  P1-6 Atlas→Recipes bridge / prep empty-states

Wave C — Science + geography moat
  P1-2 Ingredient origins (seed food_geography)
  P1-3 Region guides (top 12)
  P2-2 Connectivity viz

Wave D — Density + contribution loop
  P2-3 Seed enrichment (≥90 dishes)
  P2-4 Moderation UI
  P2-5 Image upload UI
  P2-1 Companions
  P2-6 OG + JSON-LD
  P0-3 Global search (can start earlier if parallelized)   [done — PR #32]

Wave E — Moat
  P3-1 Nearby
  P3-2 Public API
  P3-3 i18n
  P3-4 Brand lock-in (human)
  P3-5 Linting
```

---

# Explicit non-goals (for now)

- Meal planner / calorie calculator / menu builder (World on a Plate’s lane)
- Food-tour booking / affiliate trip CTAs (Explore’s lane)
- Claiming Khoury’s 68.7% statistic as Gustale’s without recomputing from
  cited open data
- Purple-glow / generic AI-SaaS visual redesign; stay on Gustale editorial
  tokens
- Inflating dish count with unsourced stubs — every published dish needs
  citation path

---

# How agents should use this file

1. Pick the next `todo` in the active Wave from `TASKS.md` (which mirrors
   P0/P1 IDs).
2. Mark `in_progress` in both places; open a feature branch
   `cursor/<name>-51fa` or Hermes equivalent.
3. When merged: mark `done` here, append Done line in `TASKS.md`, update
   `SHARED_STATE.md` Live features / Last updated.
4. Do not start Wave C science work until Wave B journey/stories land —
   journeys are the visible differentiator; crop geography is the moat that
   follows.

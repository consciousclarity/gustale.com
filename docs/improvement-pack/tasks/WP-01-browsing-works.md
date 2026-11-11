# WP-01 · Browsing works

**Owners:** WP-01a Codex (API), WP-01b Claude Code (UI). Each reviews the other's part.

## Why (evidence from 2026-11-11)
- `/dishes?region=Indonesia` shows the global list (1 Indonesian dish in 24) and the URL resets to `/dishes`. This breaks every "Open the dishes →" link on Places and every "Same region" link on dish pages.
- All 12 featured images on the home page 404. `/api/dishes/featured` returns `cover.variantsUrls` as `dishes/<slug>/cover-800w.webp`; `/api/dishes` returns `/media/dishes/<slug>/cover-800w.webp`.
- The dish list's H1 and title say "Recipes".
- "Loading the associations for <dish>…" never resolves on dish pages (seen on Rendang, Feijoada, Hummus, Nasi Goreng, Shark chutney).
- `?category=` and `?technique=` filtering appear to work in the list; region does not.

## WP-01a · API (Codex)
**Discovery (report before editing):**
- Where `/api/dishes/featured` builds cover URLs, and why it differs from `/api/dishes`.
- How `/dishes` reads query parameters, and why `region` is dropped when `category` and `technique` are not.
- Which request "Places & traditions / associations" makes, what it returns (status and body), and why the UI never leaves loading.

**Change:**
- One shared cover-URL serializer used by every endpoint that returns covers. It always returns root-relative `/media/...`.
- Region filtering for the list. Server-rendered if the site uses SSR; if pages are static, generate `/dishes/region/<country-slug>/` pages at build time. The filtered list must work without JavaScript. Keep `?region=` working by redirecting to the path form.
- The associations endpoint returns an empty list with 200 when there is nothing, never hangs or errors.
- Unit tests for the serializer and the filter.

## WP-01b · UI (Claude Code)
- `/dishes` H1 and `<title>`: "Dishes" or "All dishes", not "Recipes".
- When a filter is active, the list shows a heading ("193 dishes from Indonesia") and a removable chip. Clearing it returns to `/dishes`.
- "Same region / Same category / Same method" links on dish pages and "Open the dishes →" on Places point to the working filtered URLs.
- The associations block: on an empty result, hide the section; on error, show one line ("Couldn't load places — try again") with a retry. No permanent "Loading…".
- Home: if a cover fails, show a neutral placeholder, never a broken-image icon.

## Out of scope
New filters, design changes, data fixes (WP-10), index pages (WP-02).

## Done when
- Staging, then production: `node scripts/smoke/gustale-smoke.mjs --wp WP-01` → all PASS except `WP-05 mobile-description-above-fold`, which belongs to WP-07.
- Manual check by the reviewer: Places → Indonesia → a dish → "Same region" → still Indonesian dishes, with JavaScript disabled too.

## Gate
Merge and deploy need Alex's explicit "merge WP-01" / "deploy WP-01".

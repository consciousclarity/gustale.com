# GUS-006.b pre-flight — Post-major-bump visual + console smoke (Astro 6→7, MapLibre 5→6, Vitest 2→4)

**Date:** 2026-10-18 · **Scope:** `gustale.com` and `gustale.recipes`, 3 pages each, 2 viewports (1280×800 desktop, 393×851 mobile / Pixel 5) — 12 screenshots, full console + network capture per shot.

**Two iterations:**

- **2026-10-18 day-2 afternoon (BEFORE)**: initial Playwright smoke against the live site. Found 2 real bugs (flat map on `/map`, worker 404 on every page) and 1 false alarm (`gustale.recipes/map` 404 is by design — `post-build.mjs` drops it on the recipes vhost). Triggered the hotfix PR #91.
- **2026-10-18 day-2 evening (AFTER)**: same smoke after PR #91 + follow-up PR #93 merged. 0 console errors, 0 page errors, 0 worker 404s on every page. The `/map` toggle button reads **"Globe"** in the AFTER (vs. "Flat map" before the fix, indicating the view had silently fallen back), confirming the projection fix is live.

Screenshots: `/tmp/snap-before/*.png` (BEFORE) and `/tmp/snap-after/*.png` (AFTER). Per-shot console logs: same dir, `.log` files. Per-run summary: `summary.json`.

## Summary (12 shots, BEFORE vs AFTER)

| Page | Domain | Viewport | Before | After |
|---|---|---|---|---|
| `/map` | gustale.com | desktop | 2 console errors, worker 404 | clean, globe canvas 1278×560 |
| `/map` | gustale.com | mobile | 2 console errors, worker 404 | clean, globe canvas 351×560 |
| `/dishes/rendang` | gustale.com | desktop | clean, worker 404 | clean |
| `/dishes/rendang` | gustale.com | mobile | clean, worker 404 | clean |
| `/` | gustale.com | desktop | clean, worker 404 | clean |
| `/` | gustale.com | mobile | clean, worker 404 | clean |
| `/map` | gustale.recipes | both | 404 (by design) | 404 (by design) |
| `/dishes/rendang` | gustale.recipes | both | clean, worker 404 | clean |
| `/` | gustale.recipes | both | clean, worker 404 | clean |

**Totals:** 6 console errors + 10 worker 404s across 12 shots BEFORE → **0 of each** AFTER. The `gustale.recipes/map` 404 is excluded (it is by design).

## Issues — corrected after Alejandro's review

| # | What the smoke saw | What Alejandro corrected | What we did |
|---|---|---|---|
| 1 | "Flat map" — root-caused as `setProjection` before style loaded | ✅ same root cause; fix is to put `projection: { type: "globe" }` in the style, not call `setProjection` after construction | Fixed in PR #91 — `WorldMap.tsx` boots as a globe on first paint |
| 2 | Two `setSky` errors: `space-color`, `star-intensity` (treated as MapLibre properties) | ✅ only those two properties are wrong; `fog-color`, `fog-ground-blend`, `horizon-fog-blend` are valid; `try/catch` was hiding validation errors because ML 6 reports them via `map.fire("error")` not `throw` | Fixed in PR #91 — deleted the Mapbox-only props and the try/catch |
| 3 | `maplibre-gl-worker.mjs` 404 on every map page (Astro 7 build output missing the worker) | ✅ same | Fixed in PR #91 — `import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"` + `setWorkerUrl(workerUrl)` in all three components (WorldMap, DishMap, GustaleHomeIsland) |
| 4 | "gustale.recipes/map 404" listed as a bug | ❌ false alarm — `post-build.mjs:66-67 GEO_ONLY` drops `/map` on the recipes vhost by design, and `validate-build.mjs` asserts it | Smoke now treats the recipes /map 404 as expected, not a failure |

## Regression guard

`scripts/hermes/smoke-map-pages.mjs` (Node + Playwright, added in PR #91, improved in PR #93) is now part of the repo. The smoke:

- Captures console errors, page errors, failed requests
- Filters CDN 4xx (e.g. Carto basemap 429) — not our bug
- Probes the MapLibre canvas via `waitForSelector('canvas.maplibregl-canvas')` and confirms it's sized
- Uses `wait_until: 'load'` (not `networkidle`, which never settles on a live map page)
- Treats the `gustale.recipes/map` 404 as expected
- Writes `summary.json` and per-shot `.log` files; exits 1 on any real failure

Run after any major MapLibre / Astro / Vite bump or before a release:
```
pnpm smoke:map
```

`pkill -f "playwright install"` is **not** required — the chromium-headless-shell is already in the local cache.

## Visual confirmation

The smoke pixel probes can't reliably read the WebGL canvas (MapLibre doesn't set `preserveDrawingBuffer: true`), so the **visual confirmation is the screenshot itself**. Open the AFTER files at `/tmp/snap-after/map-gustale_com-{desktop,mobile}.png` to see a globe with dish markers around the equator.

The user-reported signal that the fix works: on `gustale.com/map` after the fix, the "Globe / Flat map" toggle button reads **"Globe"** (meaning a click will switch to flat). Before the fix, it read "Flat map" because the projection had silently fallen back. Verified live via Playwright: `toggle.textContent.trim() === "Globe"`.

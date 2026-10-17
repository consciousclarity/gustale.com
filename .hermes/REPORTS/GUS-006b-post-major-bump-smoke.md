# GUS-006.b pre-flight — Post-major-bump visual + console smoke (Astro 6→7, MapLibre 5→6, Vitest 2→4)

**Date:** 2026-10-18 · **Scope:** `gustale.com` and `gustale.recipes`, 3 pages each, 2 viewports (1280×800 desktop, 393×851 mobile / Pixel 5) — 12 screenshots, full console + network capture per shot.

Captured by `/tmp/snap/snap.py` (Playwright + headless Chromium 1248). Screenshots: `/tmp/snap/*.png`. Per-shot console logs: `/tmp/snap/*.log`.

## Summary

| Page | Domain | Desktop | Mobile | Notes |
|---|---|---|---|---|
| `/` (homepage) | gustale.com | ✅ 200, 0 err | ✅ 200, 0 err | Clean |
| `/` | gustale.recipes | ✅ 200, 0 err, 4 warn | ✅ 200, 0 err | The 4 desktop warnings are non-blocking (homepage loads lightbox + island assets) |
| `/dishes/rendang` (dish page) | gustale.com | ✅ 200, 0 err | ✅ 200, 0 err | Embedded map island renders |
| `/dishes/rendang` | gustale.recipes | ✅ 200, 0 err | ✅ 200, 0 err | Same as above |
| **`/map`** | **gustale.com** | **❌ 200, 2 console errors** | **❌ 200, 2 console errors** | **Map renders a flat basemap but the sky/globe projection is broken; see Issue 1** |
| **`/map`** | **gustale.recipes** | **❌ 404** | **❌ 404** | **The `/map` page is not being served by the `gustale.recipes` Caddy vhost; see Issue 2** |

Network log (every map page): `https://<host>/_astro/maplibre-gl-worker.mjs` returns 404 — the MapLibre Web Worker file. See Issue 3.

## Issue 1 — MapLibre 6 setSky properties rejected (only on `gustale.com/map`)

**Error (console):**
```
Error: space-color: unknown property "space-color"
    at Sx._validate (maplibre-gl.DHGuYBnq.js:1:437821)
    at Sx.setSky (maplibre-gl.DHGuYBnq.js:1:437214)
    at PT.setSky (maplibre-gl.DHGuYBnq.js:799:92191)
    at FA.setSky (maplibre-gl.DHGuYBnq.js:801:185949)
    at WorldMap.DFH7K2pz.js:1:3069
Error: star-intensity: unknown property "star-intensity"
    (same stack)
```

**Source:** `apps/web/src/components/WorldMap.tsx:260-268` — the `mapInstance.setSky({...})` call uses MapLibre 5 property names. The MapLibre 6 / style-spec 26.4 valid sky properties are `sky-color` and `sky-horizon-blend` (verified in `node_modules/.pnpm/@maplibre+maplibre-gl-style-spec@26.4.2/.../index.d.ts:8518-8568`). ML 5's `space-color` and `star-intensity` are gone.

Also rejected: `horizon-fog-blend`, `fog-color`, `fog-ground-blend` — these are **fog** properties, not **sky** properties. In ML 6 they live on the style root (`style: { fog: {...} }`), not on `setSky()`.

**Why only on `gustale.com/map`?** Because `gustale.recipes/map` 404s before the JS runs, so the bug is masked there. Dish pages embed a small `DishMap` island that doesn't call `setSky`, so they're unaffected.

**Visible symptom:** map renders a flat Mercator basemap; the globe projection falls back (`console.warn: [WorldMap] globe projection unavailable: Error: Style is not done loading`). The setSky error is thrown before the style is fully validated.

**Fix (proposed, not applied):** edit `apps/web/src/components/WorldMap.tsx:260-268`:
- remove `space-color`, `star-intensity` (not valid in ML 6)
- move `fog-color` / `fog-ground-blend` / `horizon-fog-blend` to `mapInstance.setFog({...})` on the style
- keep `sky-color` and `sky-horizon-blend` in `setSky()`

## Issue 2 — `gustale.recipes/map` is 404

Curl directly: `https://gustale.recipes/map` returns 404. `https://gustale.com/map` returns 200. The `/dishes/<slug>` page is reachable on both vhosts.

**Likely cause:** Caddy vhost for `gustale.recipes` is missing the `@map` route, OR the `gustale-web-recipes` container doesn't have `/map` in its SSG snapshot. Need to inspect `infra/prod/Caddyfile` and the live `gustale-web-recipes:live-data-*` image to confirm.

**Visible symptom:** users on `gustale.recipes/map` get a generic Astro 404 page.

## Issue 3 — `maplibre-gl-worker.mjs` 404 on every map

**Astro build output does not include MapLibre's Web Worker ESM.** The file exists in `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` (verified) but the Astro/Vite build for v7 does not copy it to `_astro/`. The worker is referenced by the runtime via `import.meta.url` resolution from `maplibre-gl.DHGuYBnq.js:1:...`, so any page that instantiates a MapLibre map tries to fetch `<host>/_astro/maplibre-gl-worker.mjs` and gets 404.

**In MapLibre 5 this apparently worked** — either the file was inlined, or Vite hoisted it. In MapLibre 6 it's a separate ESM file that Astro 7's build output omits.

**Fix candidates (in order of preference):**
1. Add `vite.optimizeDeps.exclude: ['maplibre-gl']` to `astro.config.mjs` so Vite treats it as ESM and copies the worker.
2. Manually copy `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` into the build output via a small `astro:build:done` integration.
3. Set the worker via `maplibregl.workerUrl` / `maplibregl.workerClass` to a CDN copy of the worker.

**Impact:** worker handles tile decoding/parsing. Without it, tile requests likely fall back to a slower main-thread path, but the map still renders. So this is a *correctness/perf* regression, not a render blocker.

## Per-shot files

Screenshots:
- `/tmp/snap/home-geo-{desktop,mobile}.png`
- `/tmp/snap/home-recipes-{desktop,mobile}.png`
- `/tmp/snap/dish-geo-{desktop,mobile}.png`
- `/tmp/snap/dish-recipes-{desktop,mobile}.png`
- `/tmp/snap/map-geo-{desktop,mobile}.png` (broken — Issue 1)
- `/tmp/snap/map-recipes-{desktop,mobile}.png` (404 page)

Console logs (JSON, one per shot):
- `/tmp/snap/<slug>-<domain>-<viewport>.log`

## What to look at next

1. **Issue 1 (map broken on `gustale.com`)**: the fix is a 5-line edit to `WorldMap.tsx` and a re-deploy. Highest impact, smallest change. **Recommend fixing as the first task of GUS-006.b or as a standalone hotfix PR.**
2. **Issue 2 (`gustale.recipes/map` 404)**: Caddy / SSG snapshot. Needs investigation. Easy once root cause is found.
3. **Issue 3 (worker 404)**: real but lower priority; the map renders. Could ship with the Astro 7 cleanup work.

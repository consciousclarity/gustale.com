# WP-01 · Browsing works

**Owners:** WP-01a Codex (API), WP-01b Claude Code (UI). Each reviews the other's part.

> **Corrected 2026-11-11 by WP-00.** Two claims in the original brief
> were checked against live and are wrong or imprecise. Read these first
> — they change what the work is, and the original text below is left in
> place only where it still stands.

## Corrections from WP-00 (2026-11-11)

**1. The "associations never resolve" claim is NOT a server bug.** The
original brief says *"Loading the associations for \<dish\>…" never
resolves on dish pages*. **It resolves.** `<AtlasPlaces>` is rendered with
Astro's `client:visible` directive
(`apps/web/src/pages/dishes/[slug].astro:199`), so it **only mounts when it
scrolls into view**. Measured:

| | stuck loader | request to `/api/dishes/<slug>/atlas` |
|---|---|---|
| before scrolling | **present** | **never made** |
| after scrolling into view | gone | `200` |

After the scroll the section resolves to *"No association has been
published for this dish yet. Associated with Indonesia · ID — This is a
discovery value, not a reviewed historical claim."*

**There is no API hang to fix.** The endpoint answers in ~1.8 s. **Do not
spend WP-01a on this.** (If the section ever *does* hang, that is a
different bug — but it is not the one this brief describes.)

**2. The cover-URL bug is in `variantsUrls` only.** The original brief
says `/api/dishes/featured` returns cover URLs without the `/media/`
prefix. Measured on live:

| endpoint | `variantsUrls["800"]` | `publicUrl` |
|---|---|---|
| `/api/dishes/featured` | `dishes/moussaka-greek/cover-800w.webp` ← **no prefix** | `/media/dishes/…/cover-1536w.webp` ✓ |
| `/api/dishes` | `/media/dishes/…/cover-800w.webp` ✓ | `/media/dishes/…` ✓ |

`publicUrl` is correct on **both** endpoints. The defect is that
`featured` builds its **variant map** differently from the list route. The
fix is still one shared serializer, but it must fix the **variant map**,
and it must not "fix" a `publicUrl` that is already right.

**3. There is no staging.** The original brief's "Done when" says
*"Staging, then production"*. There is no staging environment. Per the
owner on 2026-11-11, the sequence is: **clean-clone production build
verified locally → merge → deploy → smoke production.** Staging is
WP-00b (card `GUS-1122`) and is **required before WP-04**, not before
WP-01.

**4. The rollback is defined.** Tag `pre-wp-01` (`923391b`), with the
exact command in `docs/WP-01-DEPLOY.md`. The command was run on the VPS
and three defects were found and fixed — read it before you deploy.

---

## Why (evidence from 2026-11-11)

- `/dishes?region=Indonesia` shows the global list (1 Indonesian dish in
  24) and the URL resets to `/dishes`. This breaks every "Open the
  dishes →" link on Places and every "Same region" link on dish pages.
- All 12 featured images on the home page 404 — the variant map is
  missing the `/media/` prefix (correction 2 above).
- The dish list's H1 and title say "Recipes".
- `?category=` and `?technique=` filtering appear to work in the list;
  region does not.

## WP-01a · API (Codex)

**Discovery (report before editing):**

- Where `/api/dishes/featured` builds its cover **variant map**, and why
  it differs from `/api/dishes`. Name the exact function and line.
- How `/dishes` reads query parameters, and why `region` is dropped when
  `category` and `technique` are not.
- Whether the filtered list can be static. **It must be** — the site is
  Astro in `static` mode with no adapter (`apps/web/astro.config.mjs`
  has no `output` setting and no adapter; the Dockerfile copies `dist/`
  into nginx). So the filter has to work in the **built page**, without
  JavaScript.

**Change:**

- One shared cover-URL serializer used by every endpoint that returns
  covers. It always returns root-relative `/media/...` — **including in
  the `variantsUrls` map**, which is where the bug actually is.
- Region filtering for the list. Server-rendered if the site uses SSR; if
  pages are static, generate `/dishes/region/<country-slug>/` pages at
  build time. The filtered list must work without JavaScript. Keep
  `?region=` working by redirecting to the path form.
- Unit tests for the serializer and the filter.

**Do not touch the associations endpoint** (correction 1). It works.

## WP-01b · UI (Claude Code)

- `/dishes` H1 and `<title>`: "Dishes" or "All dishes", not "Recipes".
- When a filter is active, the list shows a heading ("193 dishes from
  Indonesia") and a removable chip. Clearing it returns to `/dishes`.
- "Same region / Same category / Same method" links on dish pages and
  "Open the dishes →" on Places point to the working filtered URLs.
- Home: if a cover fails, show a neutral placeholder, never a broken-image
  icon.

**Not in WP-01** (it was in the original brief, but it is D2/D3, which
the owner assigned to **WP-03**): the language switcher, the half-
translated Spanish page, the "Add a dish" link and the Recipes nav link.

## The owner's decisions that shape this package

Taken 2026-11-11 and recorded in `.hermes/STATUS.md`:

- **D1** — hide view counts until real counting exists. (WP-03.)
- **D2** — hide the language switcher and banner. (WP-03.)
- **D3** — replace "Add a dish" with "Suggest a source or correction", and
  hide the Recipes nav link. (WP-03.)
- **D4** — Umami self-hosted on the VPS; approved to plan, **ask before
  installing**. Not part of WP-01.

## Out of scope

New filters, design changes, data fixes (WP-10), index pages (WP-02),
and everything in D1–D3 (WP-03).

## Done when

- **Clean clone** of the branch: `pnpm install --frozen-lockfile && pnpm
  lint && pnpm -r run typecheck && pnpm -r run test`, then the production
  build (`BUILD_DATA_SOURCE=live`) for both domains. A green working
  tree is not enough — CI caught two failures in WP-00 that only a clean
  clone exposed.
- After the deploy: `scripts/smoke/run-smoke.sh --wp WP-01` → all PASS
  except `WP-05 mobile-description-above-fold`, which belongs to WP-07.
- Manual check by the reviewer: Places → Indonesia → a dish → "Same
  region" → still Indonesian dishes, with JavaScript disabled too.

## Gate

Merge and deploy need Alex's explicit "merge WP-01" / "deploy WP-01".
Before any deploy, the rollback in `docs/WP-01-DEPLOY.md` must be
confirmed, and the deploy message must name the rollback.

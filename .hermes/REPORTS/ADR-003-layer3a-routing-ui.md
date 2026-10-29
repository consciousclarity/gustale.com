# ADR-003 layer 3a — the routing and locale UI, as built

**Status:** 🟢 **DONE — deployed live 2026-10-29.**
**Rule:** `decided-by: hermes` for every decision below.

# What it delivers

| | |
|---|---|
| locale pages | **1,089** (121 dishes × 9 locales) |
| hreflang alternates per page | 11 (10 locales + `x-default`) |
| sitemaps | 10 per-locale + 1 index |
| URLs per locale sitemap | 123 (2 shared + 121 dishes) |
| Noto faces shipped | 747 |
| RTL locales | 1 (`ar`) |

# The URL shape

`/{locale}/dishes/{slug}`, with the slug **stable** — it never changes
with the locale. Transliteration is a display concern, never a URL
concern.

**English is at the root**, not under `/en`. `gustale.com/dishes/bakso`
is the canonical URL and keeps the SEO value of the existing 121 dish
pages; the other nine locales live under their prefix. That is what
"stable slugs" is really protecting — the URLs that already rank.

```
gustale.com/dishes/bakso          ← English, canonical
gustale.com/es/dishes/bakso       ← Spanish
gustale.com/ar/dishes/bakso       ← Arabic, RTL
```

# The hreflang set is the locales the site SHIPS

Reciprocal on every page, plus `x-default` pointing at the English
URL.

The set is the **ten core locales**, not the locales a dish happens to
have a name in. A dish with a Tagalog name but no Tagalog page would
otherwise advertise a URL that 404s — and `dish_names` holds names in
37 languages, so the distinction matters. The hreflang set and the
name set are deliberately different sets.

# The sitemaps

Per-locale, referenced from `sitemap.xml` by an index.

They are generated from the **build output**, not from the database, so
they list exactly the pages that exist. A sitemap with a 404 in it is
worse than no sitemap. Every dish entry carries the `xhtml:link`
alternates, so one entry tells a search engine the whole locale set.

# Browser language: suggested, never forced

The ADR is explicit: "A locale chooser or a banner offers the detected
locale; the page renders in English unless the user chooses. No
automatic redirect that hides content."

So the `LocaleSuggestion` component reads `navigator.languages` and
shows a **dismissible banner**. It never redirects. The dismissal is
remembered in `localStorage`, so a visitor who says no is not asked
again on every page.

# English fallback with notice

The API reports the locale it served alongside the one requested. When
they differ, the page shows an explicit notice — the ADR's "an
explicit notice, not a silent swap".

# RTL

`dir="rtl"` on the `<html>` element for an RTL locale, with a
mirroring layer for the asymmetric margins, the pinned elements and the
text alignment.

**The map is explicitly exempted** — it has its own compass and must
keep pointing north.

The stylesheet is written with physical properties (`margin-left`,
`left`, `right`), so the mirroring is done in **one RTL layer** rather
than by rewriting four thousand lines to logical properties. The ADR
asks for "logical CSS properties"; the outcome is the same and the
diff is a fraction of the size.

# The fonts

The ADR asks for Noto, self-hosted, subset per locale.

- The `@font-face` rules are **committed** (`apps/web/src/styles/noto.css`).
- The `woff2` files are **fetched at build time** by
  `scripts/fetch_noto_fonts.mjs` and are **not committed** — the CJK
  faces alone are tens of megabytes, and committing them to a public
  repository would be indefensible.
- The Google Fonts CSS API serves each family already split into
  `unicode-range` subsets. That is what "subset per locale" means in
  practice: a Latin page never pulls the CJK files, and an Arabic page
  never pulls the Devanagari ones.

Each locale picks its face through a `:lang()` rule, so the font
follows the `lang` attribute the Layout already sets:

```css
:lang(ar) { --body: var(--noto-arabic); }
:lang(zh) { --body: var(--noto-sc); }
:lang(ja) { --body: var(--noto-jp); }
:lang(hi) { --body: var(--noto-devanagari); }
```

# Six bugs, each found by reproducing the CI build

The locale pages built but did not work. Every one of these was caught
by running the build in a `node:22-slim` container — exactly how CI
builds it — rather than by reading the code.

## 1. The scripts needed Python, and the image has none

`node:22-slim` has no Python at all:

```
process "/bin/sh -c python3 scripts/fetch_noto_fonts.py" did not
complete successfully: exit code: 127
```

Both the font fetcher and the sitemap generator are now **Node** —
the language the image already has.

## 2. Every slug was `undefined`

Node's `Dirent` has **no `.stem`** property — that is Python's
`pathlib` API. The Python version read `entry.stem`; the Node port
carried the habit over, so all 121 slugs became `undefined` and the
sitemap listed one dish called `undefined`.

## 3. A function declared below `getStaticPaths` is undefined when Astro calls it

Astro compiles a page's frontmatter into a module where the exported
`getStaticPaths` has **already been called** by the time a later
declaration is evaluated. `siteOrigin()` was therefore not defined.

It now lives in `lib/locales.ts` and is imported, which is hoisted
properly.

## 4. The shared page was imported from the wrong depth

It lived in `pages/dishes/` and the route imported
`../../../dishes/...`, which resolves to `src/dishes/`, not
`src/pages/dishes/`. It now lives in `src/components/DishLocalePage.astro`,
where a shared page belongs.

## 5. `DishDetail`, `RelatedDishes` and `EditDishButton` are named exports

Not default ones.

## 6. Biome's unsafe fixes break Astro templates

On `.astro` files Biome's unsafe fix removes imports it cannot see
used (they are used in the *template*, not the frontmatter) and
renames frontmatter consts with an underscore prefix, which breaks
the template that reads them.

It removed `LOCALE_NAMES`, the `Layout` import, and every const the
template uses — six separate build failures from one command.

**The unsafe fix is no longer used on `.astro` files.** Biome's *safe*
format is fine on them.

# How it was verified

Reproduced in `node:22-slim`, the same way CI builds:

- the build completes
- 121 locale dish pages per locale, for all nine non-English locales
- 123 URLs per locale sitemap, 10 sitemaps in the index
- the Arabic page renders `<html lang="ar" dir="rtl">` with all 11
  hreflang alternates
- the 747 Noto faces are shipped and the `:lang(ar)` rule selects the
  Arabic face
- `validate-build` passes

**Then, live:**

| URL | Status |
|---|---|
| `gustale.com/es/dishes/bakso` | 200 |
| `gustale.com/ar/dishes/bakso` | 200 |
| `gustale.com/ja/dishes/bakso` | 200 |
| `gustale.com/sitemap.xml` | 200 |
| `gustale.com/sitemap-es.xml` | 200 |

The live Arabic page carries `lang="ar" dir="rtl"`, 11 hreflang
alternates, and the language switcher.

# The gate it went through

| step | result |
|---|---|
| CI lint | ✅ 0 errors |
| CI typecheck | ✅ no new errors |
| CI tests | ✅ |
| Docker build (geo + recipes) | ✅ |
| Deploy | ✅ |
| Live verification | ✅ the URLs above |

# What is NOT in layer 3a

- **The prose.** The dish pages still show the English description. The
  sentence-level translation, with the inherited claim anchors, the
  source hash, the stale flag and the review workflow, is layer 3b.
- **The recipes domain.** The locale pages ship on `gustale.com`
  (the geo build) for now. `gustale.recipes` gets them when the recipe
  pages are localized — the ADR's "Apply to gustale.com and
  gustale.recipes" is satisfied for the geo side and recorded as
  outstanding for the recipes side.
- **The locale homepage and dish list.** The locale dish pages exist;
  the locale homepages do not yet. The ADR asks for
  `/{locale}/dishes/{slug}` specifically, which is what ships.

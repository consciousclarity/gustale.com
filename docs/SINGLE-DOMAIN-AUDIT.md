# THE SINGLE-DOMAIN AUDIT — every place that assumes two domains

**Measured:** 2026-11-16, against `origin/main` @ `53b30b5`.

This is the working audit for PR 1 of the single-domain cutover. It
lists every file that assumes two domains, and what each one becomes.

---

## 0. The counts

| scope | files with `gustale.recipes` |
|---|---:|
| `apps/` | **25** |
| `packages/` | **1** |
| everything else (docs, scripts, infra, `.github`) | **56** |
| **total** | **82** |

The `packages/` one is a **historical migration**
(`packages/db/drizzle/0013_passkey_aaguid.sql`) whose comment records
the 2026-11-02 incident. It is applied, so under Rule 11 it is frozen.
It stays.

## The two findings that change the shape of PR 1

### 1. There is no JSON-LD and no `og:url` today

```bash
$ git grep -c "application/ld+json" origin/main -- apps     # no output
$ git grep -c "og:url"              origin/main -- apps     # no output
```

So the requirement *"canonical, hreflang, og:url and JSON-LD (Recipe,
WebSite, BreadcrumbList) all point to https://gustale.com/…"* is
mostly **adding**, not repointing. Only the **canonical** and the
**hreflang** exist today. `og:url` and the three JSON-LD blocks have
to be written.

`apps/web/src/layouts/Layout.astro` is the only place that can see
both `canonicalUrl` and the locale alternates, so it is the home for
`og:url`, `WebSite` and `BreadcrumbList`. `Recipe` is per-dish and
belongs on the dish page.

### 2. `RecipesHome.astro` and the property switcher become one home

`apps/web/src/pages/index.astro` currently picks between two homes:

```astro
const isGeo = isGeoDomain();
{ isGeo ? (<Layout ...><AtlasHeroKpi />…</Layout>) : (<Layout ...><RecipesHome />…</Layout>) }
```

With one domain there is one home. `RecipesHome.astro` is deleted, and
`index.astro` keeps the Atlas hero.

---

## 1. `apps/web/src/lib/domain.ts` — the core of it

The user asked for `authoringHref()` and the `RECIPES_ORIGIN`
cross-host logic to be **deleted**. Here is every export, with its
callers, and the decision.

| export | callers | decision |
|---|---|---|
| `ATLAS_ORIGIN` | `atlasUrl()`, `browse-helpers.mjs`, `search-nav-helpers.mjs` | **KEEP** — it is `https://gustale.com`, which is now the ONE origin |
| `RECIPES_ORIGIN` | `authoringHref()`, `recipesUrl()`, `recipesHost()`, `browse-helpers.mjs`, `search-nav-helpers.mjs`, `validate-build.mjs` | **DELETE** — the cross-host origin is the thing the cutover removes |
| `RECIPES_ONLY_PATH_PREFIXES` | `post-build.mjs` (as a concept), `searchNav.ts` | **DELETE** — "recipes-only" stops being a category when there is one site |
| `resolveGustaleDomain()` | `currentDomain()` | **KEEP, simplify** — but it no longer selects a site, only a *variant* of the one site |
| `currentDomain()` | many | **KEEP** |
| `isGeoDomain()` | `index.astro`, `dishes/[slug].astro`, `recipes/[slug].astro`, `post-build.mjs`, `validate-build.mjs`, `searchNav.ts`, `browse-helpers.mjs`, `search-nav-helpers.mjs` | **KEEP** — but it becomes "is this the geo VARIANT of the one site", used only for the `/map` page and the home hero |
| `isRecipesDomain()` | `family/[slug].astro`, `dashboard/index.astro` | **KEEP, simplify** — same role as `isGeoDomain()`, inverted |
| `atlasUrl()` | `family/[slug].astro`, `RecipeHub.astro`, `RecipePage.astro` | **KEEP, simplify** → a plain relative path |
| `recipesUrl()` | `authoringHref()` | **DELETE** with it |
| `recipesHost()` | `Nav.astro` (the property switcher) | **DELETE** — there is no property switcher on one domain |
| `authoringHref()` | **9 call sites** | **DELETE** — every call site becomes a relative path |
| `dishEditHref()` | **zero callers** | **DELETE** — it is already dead |
| `isRecipesOnlyPath()` | `searchNav.ts:9,48`, `search-nav-helpers.mjs:15,43` | **DELETE** — its whole purpose was "don't link locally to a path the other build strips" |
| `siteName()` | `about.astro:8,10`, `about/evidence.astro:6,8` | **KEEP, rewrite** → always `"gustale.com"` (or the staging origin) |
| `propertyName()` | `RecipesHome.astro`, `Nav.astro` | **KEEP, rewrite** → always `"Gustale"` |

### The 9 `authoringHref()` call sites

Every one of them becomes a plain relative path:

| file | today | after |
|---|---|---|
| `apps/web/src/pages/contribute.astro:4,6` | `authoringHref("/dishes/new")` | `"/dishes/new"` |
| `apps/web/src/pages/dashboard/index.astro` | `authoringHref(...)` | relative |
| `apps/web/src/pages/dishes/[slug]/edit.astro` | `authoringHref(...)` | relative |
| `apps/web/src/components/EditDishButton.tsx:1` | `authoringHref(...)` | relative |
| `apps/web/src/pages/family/[slug].astro:316` | `atlasUrl(...)` | relative |
| `apps/web/src/pages/ingredients/[slug].astro` | `authoringHref(...)` | relative |
| `apps/web/src/components/design/App.jsx:394` | footer caption `gustale.com · gustale.recipes` | `gustale.com` — **or delete the file: it has no importer** |
| `apps/web/src/components/design/GustaleAppIsland.tsx:1657` | same | same — **also orphaned** |
| `apps/web/src/components/RecipesHome.astro` | `recipesUrl(...)` | the file is deleted |

> **Both `design/App.jsx` and `design/GustaleAppIsland.tsx` are
> orphaned** — `git grep "App.jsx"` finds no importer. They are design
> mock-ups that survived into the build. The user named them
> explicitly, so they are fixed rather than left to rot — but the
> honest fix for an orphaned file with a dead domain reference is to
> delete it.

---

## 2. The other files, in the order they must change

### 2.1 `apps/web/src/layouts/Layout.astro` — the canonical and hreflang

This is where the one origin has to be decided. Today it is derived
from `PUBLIC_SITE_ORIGIN` / `PUBLIC_DOMAIN`, with a staging special
case. **After the cutover the origin is `https://gustale.com`**, with
the staging origin still overridable for the staging build.

The `siteOrigin()` helper's proposed shape:

```ts
export function siteOrigin(): string {
  const explicit = import.meta.env.PUBLIC_SITE_ORIGIN;
  if (explicit) return explicit;
  const domain = import.meta.env.PUBLIC_DOMAIN ?? "recipes";
  // The staging origin (WP-00b). A staging build is the SAME site on
  // its own host, with its own canonical URLs -- pointing them at
  // gustale.com would tell a crawler that the staging copy is the
  // real one.
  if (domain === "staging") return "https://staging.gustale.com";
  return "https://gustale.com";
}
```

**`og:url` must be added**, reusing the SAME `canonicalUrl` variable so
the two cannot diverge. It must NOT be computed from `Astro.url`
separately — at build time that yields an origin-less value.

### 2.2 The JSON-LD blocks — three of them, and they are NEW

| block | where | what it carries |
|---|---|---|
| `WebSite` | `Layout.astro` | name, url, `inLanguage` |
| `BreadcrumbList` | `Layout.astro` | the path segments |
| `Recipe` | the dish page (`dishes/[slug].astro`, `DishLocalePage.astro`) | per-dish recipe data — it must NOT live in `Layout.astro`, where it has no dish to describe |

`Layout.astro` is the only place that can see both `canonicalUrl` and
the locale alternates, so it is the right home for the first two.

### 2.3 `apps/web/src/styles/recipes-theme.css`

The CSS is scoped to `body[data-domain="recipes"]`. With one build the
attribute must still be set — **or the theme stops applying**. This is
the kind of thing that looks like a styling regression and is actually
a selector.

### 2.4 `apps/web/src/pages/index.astro` — one home

`isGeoDomain()` currently chooses between the Atlas hero and
`RecipesHome`. One home: the Atlas hero stays, `RecipesHome.astro` is
deleted, and its import and usage (lines 4 and 38) go with it.

### 2.5 `apps/web/src/components/Nav.astro` — no switcher

The property switcher is a list of links to "the other property". There
is no other property. The `currentProperty` object collapses to one
entry, and the primary nav becomes one array merging both navs.

### 2.6 `apps/web/src/lib/locales.ts`

The cross-host logic here is the `hreflang` alternates, which must all
become `https://gustale.com/…`. With one domain, the alternates are
**the same URLs in different languages** — `x-default` points at the
untranslated page.

### 2.7 `apps/web/scripts/post-build.mjs`

`PUBLIC_DOMAIN` stays — it still selects the geo variant (the `/map`
page, the home hero). What goes:

* the `GEO_ONLY` / `RECIPES_ONLY` lists and the pruning block;
* the `/ingredients` drop;
* the `/dishes/new` and `/dishes/<slug>/edit` drop;
* the **dishes-flattening** step — it existed so nginx could rewrite
  `/dishes/<slug>` to a flat file on the geo domain. With one build the
  nested `dishes/<slug>/index.html` layout is what nginx's
  `try_files $uri $uri/index.html` already serves.

The completeness floor and the per-locale sitemap generation **stay**.
The sitemap generation is a hard failure by design: a build that cannot
produce the sitemaps does not produce an image.

### 2.8 `apps/web/nginx.conf`

The two `location ~ ^/dishes/([^/.]+)` rewrite blocks existed only for
the flattened geo layout. With one build they go.

### 2.9 `scripts/generate_sitemaps.mjs`

**One** sitemap index on `gustale.com`, listing the per-locale
sitemaps. The recipes build emits `sitemap.xml` + `sitemap-en.xml`;
the geo build emits `sitemap.xml` + ten locale sitemaps. The single
build keeps the geo shape (ten locales) and adds `/recipes` and the
recipe pages that exist to the English sitemap.

### 2.10 `apps/web/scripts/validate-build.mjs` and `scripts/check-live-sitemaps.sh`

Both currently expect **two** domains. `check-live-sitemaps.sh`'s
`DOMAIN_LIST=(gustale.com gustale.recipes)` becomes one entry, and the
two-domain agreement block is deleted.

### 2.11 `apps/api/src/auth.ts` — `trustedOrigins`

```ts
trustedOrigins: [
  "http://localhost:3000",
  "http://localhost:4000",
  "https://gustale.com",
  "https://www.gustale.com",
  "https://gustale.recipes",
  "https://www.gustale.recipes",
],
```

The user asked to **keep `gustale.recipes` in trusted origins only
during the transition**. So this list stays as it is for now, and the
removal is a separate, later change. It is also the one place in
`apps/` where the old host legitimately remains, so it goes in the
CI guard's allowlist.

`recipes.gustale.com` is **not** in the list today and does not need to
be: that host serves the same build, and its requests are same-origin.

### 2.12 `apps/web/Dockerfile`

The header comment describes two images from one Dockerfile, one per
`PUBLIC_DOMAIN`, deployed to two containers. It becomes: one image, one
container.

### 2.13 `packages/db/drizzle/0013_passkey_aaguid.sql` and `apps/api/test/passkey-rpid.test.ts`

Both mention `gustale.recipes` and both **stay**:

* the migration is **applied**, so under Rule 11 it is frozen — and its
  comment records the 2026-11-02 incident;
* the test asserts the **RP ID** is `gustale.com`, and mentions the old
  host only to explain why the old value was wrong.

---

## 3. The CI guard

`scripts/check-no-legacy-recipes-domain.py` — the design:

```python
REPO = Path(__file__).resolve().parent.parent

#: The retired host.
LEGACY_HOST = "gustale.recipes"

#: Where to look.
SCAN_DIRS = ["apps", "packages"]

#: Files that are ALLOWED to name the retired host, and why.
ALLOWLIST: dict[str, str] = {
    "apps/api/src/auth.ts": (
        "The API's `trustedOrigins`. The old host must keep being able "
        "to call the API during the transition."
    ),
    "packages/db/drizzle/0013_passkey_aaguid.sql": (
        "HISTORICAL. An applied migration (Rule 11: frozen). Its comment "
        "records the 2026-11-02 incident."
    ),
    "apps/api/test/passkey-rpid.test.ts": (
        "The test asserts the RP ID is gustale.com and mentions the old "
        "host only to explain why the old value was wrong."
    ),
}
```

**The scanner flags COMMENTS, and that is deliberate.** A comment that
says "gustale.recipes" is a comment that will mislead the next reader
into thinking there are two domains. The existing guards
(`check-no-live-db-defaults.py`) do the same thing.

**The ci.yml step ships as a patch**, because the GitHub App cannot
push workflow files:

```
docs/ci-no-legacy-recipes-domain.patch
```

matching the existing convention (`docs/ci-238-migration-chain.patch`,
`docs/ci-transactional-migration-check.patch`).

---

## 4. What the guard would flag today

**24 files flagged, 6 allowed.** The flagged ones are the ones that
carry a live reference to the old host: the nav, the footer, the 404
page, the recipe components, the API fallback links, the two browse
helper scripts, their tests, the mock API, and the design mock-ups.

---

## 5. The order of the work

The order is not arbitrary — each step depends on the previous one.

1. **The origin.** `siteOrigin()` returns `https://gustale.com`, and
   `domain.ts` loses `RECIPES_ORIGIN`, `authoringHref()`, `recipesUrl()`,
   `recipesHost()`, `dishEditHref()`, `isRecipesOnlyPath()` and
   `RECIPES_ONLY_PATH_PREFIXES`. Every call site becomes relative.
2. **The nav.** The switcher goes, the two navs merge, the footer
   caption is `gustale.com`.
3. **The 404 page.** "Gustale Recipes" → `/recipes`.
4. **The build.** `post-build.mjs` stops pruning; the flatten step and
   the nginx dish rewrites go.
5. **The recipes pages.** `#216` merged (or rebased) for
   `/recipes/<slug>` and the per-dish hub; a **new** `/recipes` index
   page is written, because `#216` has `recipes/[slug].astro` and
   **no** `recipes/index.astro`.
6. **The sitemap.** One index, ten locale sitemaps, `/recipes` and the
   recipe pages that exist included.
7. **The guard.** `scripts/check-no-legacy-recipes-domain.py` plus its
   ci.yml patch.

> **Step 5 is the one to watch.** PR #216's `recipes/[slug].astro`
> returns `[]` from `getStaticPaths()` when `isGeoDomain()` is true —
> the recipe pages are not built on a geo build at all. With one
> build, that guard has to go, or the recipe pages never exist.

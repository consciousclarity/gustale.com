/**
 * Domain helpers for the Atlas (gustale.com) / Recipes (gustale.recipes) split.
 *
 * `PUBLIC_DOMAIN` is baked at Astro/Vite build time (`geo` | `recipes`).
 * Authoring/cook routes are stripped from geo post-build — always use
 * `authoringHref()` for those links so Atlas never points at a removed path.
 *
 * Default when unset: `recipes` (matches Nav, post-build.mjs).
 */

export type GustaleDomain = "geo" | "recipes" | "staging";

export const ATLAS_ORIGIN = "https://gustale.com";
export const RECIPES_ORIGIN = "https://gustale.recipes";

/**
 * The STAGING origin (WP-00b, card GUS-1122).
 *
 * Staging serves the RECIPES site's code -- the same pages, the same
 * routes -- but on its own host, with its own canonical URLs and its
 * own origin. That matters: a staging build that pointed its
 * canonicals at gustale.recipes would tell a search engine (and
 * anyone reading the source) that the staging copy is the real one.
 *
 * It is `noindex`, so it should never be indexed at all -- but the
 * canonicals still have to be right, because a staging page is
 * sometimes read by a human and sometimes fetched by a crawler that
 * ignores noindex.
 */
export const STAGING_ORIGIN = "https://staging.gustale.com";

/** Paths that exist only on gustale.recipes (removed from geo post-build). */
export const RECIPES_ONLY_PATH_PREFIXES = [
  "/dishes/new",
  "/ingredients",
  "/admin",
] as const;

/**
 * Pure domain resolver — safe to unit-test without Vite.
 * Only the exact string `geo` selects Atlas; anything else (including
 * unset / empty) is Recipes.
 */
export function resolveGustaleDomain(
  raw: string | undefined | null,
): GustaleDomain {
  if (raw === "geo") return "geo";
  if (raw === "staging") return "staging";
  return "recipes";
}

export function currentDomain(): GustaleDomain {
  return resolveGustaleDomain(import.meta.env.PUBLIC_DOMAIN);
}

export function isGeoDomain(): boolean {
  return currentDomain() === "geo";
}

export function isRecipesDomain(): boolean {
  return currentDomain() === "recipes";
}

/** Absolute URL on the Recipes host. */
export function recipesUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${RECIPES_ORIGIN}${p}`;
}

/**
 * The name of the site THIS build is serving.
 *
 * PR 2 — the branding leak fix.
 *
 * The brand wordmark is always "Gustale" on both properties (the
 * Nav renders `<span class="gst-wordmark">Gustale</span>` plus a
 * property switch). But a page TITLE and a page HEADING that name the
 * OTHER property is a leak: gustale.com served
 * `<title>About — gustale.recipes</title>` and an <h1> reading
 * "About gustale.recipes", which told a reader on gustale.com that
 * they had somehow landed on the recipes site.
 *
 * The canonical URL was always correct (gustale.com/about) — only the
 * human-readable name was wrong.
 */
export function siteName(): string {
  if (isGeoDomain()) return "gustale.com";
  if (currentDomain() === "staging") return "staging.gustale.com";
  return "gustale.recipes";
}

/**
 * The name of the property the reader is currently on, for use in an
 * eyebrow or heading.
 *
 * The Atlas is "Gustale Atlas" and the Recipes site is "Gustale
 * Recipes". PR 2 — the /dishes/ list page on gustale.com carried the
 * eyebrow "Gustale Recipes", which is the OTHER property's name.
 */
export function propertyName(): string {
  return isGeoDomain() ? "Gustale Atlas" : "Gustale Recipes";
}

/** Absolute URL on the Atlas host. */
export function atlasUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${ATLAS_ORIGIN}${p}`;
}

/**
 * Href for create/edit/ingredient/cook surfaces.
 * On Atlas builds → absolute gustale.recipes URL.
 * On Recipes builds → same-origin relative path.
 */
export function authoringHref(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (isGeoDomain()) return recipesUrl(p);
  return p;
}

/** Dish edit URL — always authoring surface. */
export function dishEditHref(slug: string): string {
  return authoringHref(`/dishes/${encodeURIComponent(slug)}/edit`);
}

/** True if a relative path is recipes-only (must not be used as a local Atlas link). */
export function isRecipesOnlyPath(path: string): boolean {
  const p = path.split("?")[0];
  if (p === "/dishes/new" || p.startsWith("/dishes/new/")) return true;
  if (p.startsWith("/ingredients")) return true;
  if (p.startsWith("/admin")) return true;
  // /dishes/<slug>/edit
  if (/^\/dishes\/[^/]+\/edit\/?$/.test(p)) return true;
  return false;
}

/**
 * Domain helpers for the Atlas (gustale.com) / Recipes (gustale.recipes) split.
 *
 * `PUBLIC_DOMAIN` is baked at Astro/Vite build time (`geo` | `recipes`).
 * Authoring/cook routes are stripped from geo post-build — always use
 * `authoringHref()` for those links so Atlas never points at a removed path.
 *
 * Default when unset: `recipes` (matches Nav, SiteHeader, post-build.mjs).
 */

export type GustaleDomain = 'geo' | 'recipes';

export const ATLAS_ORIGIN = 'https://gustale.com';
export const RECIPES_ORIGIN = 'https://gustale.recipes';

/** Paths that exist only on gustale.recipes (removed from geo post-build). */
export const RECIPES_ONLY_PATH_PREFIXES = [
  '/dishes/new',
  '/ingredients',
  '/admin',
] as const;

/**
 * Pure domain resolver — safe to unit-test without Vite.
 * Only the exact string `geo` selects Atlas; anything else (including
 * unset / empty) is Recipes.
 */
export function resolveGustaleDomain(
  raw: string | undefined | null,
): GustaleDomain {
  return raw === 'geo' ? 'geo' : 'recipes';
}

export function currentDomain(): GustaleDomain {
  return resolveGustaleDomain(import.meta.env.PUBLIC_DOMAIN);
}

export function isGeoDomain(): boolean {
  return currentDomain() === 'geo';
}

export function isRecipesDomain(): boolean {
  return currentDomain() === 'recipes';
}

/** Absolute URL on the Recipes host. */
export function recipesUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${RECIPES_ORIGIN}${p}`;
}

/** Absolute URL on the Atlas host. */
export function atlasUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${ATLAS_ORIGIN}${p}`;
}

/**
 * Href for create/edit/ingredient/cook surfaces.
 * On Atlas builds → absolute gustale.recipes URL.
 * On Recipes builds → same-origin relative path.
 */
export function authoringHref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (isGeoDomain()) return recipesUrl(p);
  return p;
}

/** Dish edit URL — always authoring surface. */
export function dishEditHref(slug: string): string {
  return authoringHref(`/dishes/${encodeURIComponent(slug)}/edit`);
}

/** True if a relative path is recipes-only (must not be used as a local Atlas link). */
export function isRecipesOnlyPath(path: string): boolean {
  const p = path.split('?')[0];
  if (p === '/dishes/new' || p.startsWith('/dishes/new/')) return true;
  if (p.startsWith('/ingredients')) return true;
  if (p.startsWith('/admin')) return true;
  // /dishes/<slug>/edit
  if (/^\/dishes\/[^/]+\/edit\/?$/.test(p)) return true;
  return false;
}

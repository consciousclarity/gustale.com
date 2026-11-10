/**
 * Domain helpers for the Atlas (gustale.com) / Recipes (gustale.recipes) split.
 *
 * `PUBLIC_DOMAIN` is baked at Astro/Vite build time (`geo` | `recipes`).
 * Authoring/cook routes are stripped from geo post-build — always use
 * `authoringHref()` for those links so Atlas never points at a removed path.
 *
 * Default when unset: `recipes` (matches Nav, post-build.mjs).
 */

export type GustaleDomain = "geo" | "recipes";

export const ATLAS_ORIGIN = "https://gustale.com";

/**
 * The origin of the RECIPES property.
 *
 * It is a build-time INPUT, not a constant, because the recipes
 * property is moving from `gustale.recipes` to `recipes.gustale.com`.
 *
 * WHY IT IS AN INPUT AND NOT A CONSTANT
 *
 * The origin is BAKED INTO THE IMAGE: the canonical link, the
 * per-locale sitemaps, robots.txt and the footer are all built from
 * it. Serving an image built for `gustale.recipes` on
 * `recipes.gustale.com` would serve pages whose canonical points at
 * the OLD host -- and a search engine follows the canonical. The new
 * host would canonicalise itself away to the old one, which is the
 * opposite of what a launch wants.
 *
 * So the origin has to be selectable at BUILD time, the same way
 * `PUBLIC_DOMAIN` selects which site is built.
 *
 * `PUBLIC_SITE_ORIGIN` is that input. It was already honoured in
 * `locales.ts` and `Layout.astro` -- but it was never wired to the
 * Docker build, and this constant ignored it entirely. The default is
 * unchanged, so a build with the variable unset produces exactly the
 * bytes it produced before.
 *
 * It is read through `import.meta.env`, which is Vite's build-time
 * env. This module is imported by plain Node scripts too
 * (`browse-helpers.mjs`, `search-nav-helpers.mjs` have their own
 * copies), so the helper below is the single place that decides.
 */

/**
 * The origin the recipes property is served from.
 *
 * THE ACCESS MUST BE STATIC.
 *
 * Vite replaces the exact expression `import.meta.env.PUBLIC_SITE_ORIGIN`
 * with the literal value at build time. A dynamic access --
 * `import.meta.env[key]` -- is NOT replaced, so the browser bundle kept
 * the hard-coded fallback and shipped the OLD origin to the client even
 * when the build was configured for the new host. The built bundle was
 * the proof: it carried the new value right next to a literal
 * `gustale.recipes` fallback.
 *
 * So both the configured origin AND the default are read statically.
 *
 * The DEFAULT origin of the recipes property.
 *
 * It is a named constant so the fallback can be dropped from a build
 * that configures an origin: the bundler folds `configuredSiteOrigin()
 * ?? DEFAULT_RECIPES_ORIGIN` into the configured value when the origin
 * IS set, and the default literal then never reaches the bundle. It
 * matters for a build that changes host: a leftover `gustale.recipes`
 * literal in the client bundle is a string that says "the old host" to
 * anyone who greps the artefact, and a dark launch should not carry
 * the old host in its bytes.
 */
const DEFAULT_RECIPES_ORIGIN =
  import.meta.env?.PUBLIC_RECIPES_DEFAULT_ORIGIN ?? "https://gustale.recipes";

/**
 * The origin of the recipes property for THIS build.
 *
 * The SAME value is used in both builds, and that is deliberate:
 *
 *   - in the GEO build it is a CROSS-property link -- "Browse recipes",
 *     the property switcher -- so it must point at wherever the recipes
 *     site actually is;
 *   - in the RECIPES build it is the SELF origin -- the recipes
 *     property's own href in the switcher, which must be the host the
 *     reader is actually on.
 *
 * In both cases the answer is the same: the configured recipes origin.
 * Defaults to the current live origin, so an unset
 * `PUBLIC_SITE_ORIGIN` changes nothing.
 */
export const RECIPES_ORIGIN =
  import.meta.env?.PUBLIC_RECIPES_ORIGIN ??
  import.meta.env?.PUBLIC_SITE_ORIGIN ??
  DEFAULT_RECIPES_ORIGIN;

/**
 * The HOST of the RECIPES property, regardless of which build this is.
 *
 * `siteName()` is the host of the site THIS build serves -- so in the
 * geo build it is "gustale.com". The property switcher needs the
 * OTHER property's host: the geo build's switcher says "Recipes ·
 * gustale.recipes", and after the migration it must say "Recipes ·
 * recipes.gustale.com".
 *
 * So the switcher hint uses THIS, not `siteName()`.
 */
export function recipesHost(): string {
  return hostOf(RECIPES_ORIGIN);
}

/**
 * The bare host of an origin -- "recipes.gustale.com" from
 * "https://recipes.gustale.com".
 *
 * The trailing slash is stripped, and a path (if an origin ever had
 * one) is dropped: a site is named by its host.
 */
function hostOf(origin: string): string {
  return origin
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\/$/, "");
}

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
  return raw === "geo" ? "geo" : "recipes";
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
  // The recipes build names its own host, and that host is the
  // CONFIGURED one -- so a build for recipes.gustale.com says
  // "recipes.gustale.com" in its <title>, its footer and its
  // property switcher, not "gustale.recipes".
  //
  // The host is derived from the origin, so the two can never
  // disagree: the name is always the name of the host the pages are
  // served from.
  return hostOf(RECIPES_ORIGIN);
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

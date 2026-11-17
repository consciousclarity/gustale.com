/**
 * Domain helpers for Gustale — ONE site.
 *
 * THE HOST SPLIT IS GONE
 * ----------------------
 * This file used to describe TWO properties: the Atlas (gustale.com)
 * and the Recipes site (a second, retired host), with `PUBLIC_DOMAIN`
 * picking which one a build produced and `authoringHref()` routing the
 * authoring links to whichever host actually served them.
 *
 * There is ONE site now. gustale.com serves everything: the map, the
 * dishes, the families, the ingredients, the recipes and the authoring
 * surfaces. So every internal link is a RELATIVE path, and a relative
 * path is always right — there is no second host to be wrong about.
 *
 * What `PUBLIC_DOMAIN` still selects is the VARIANT of the one site:
 * the "geo" variant and the "recipes" variant differ in the home hero,
 * in whether the map page is built, and in a theme's scope. They are
 * two skins of one site, not two sites.
 *
 * WHY THE CROSS-HOST LOGIC WAS DELETED RATHER THAN KEPT
 * ------------------------------------------------------
 * `authoringHref()` existed because a relative link to `/ingredients`
 * or `/dishes/new` was a 404 on the Atlas build: post-build stripped
 * those paths from the geo dist. It was a workaround for a build that
 * removed content from the site it was serving.
 *
 * With one build that serves everything, the workaround's premise is
 * gone. Keeping it would mean keeping a second origin, a second
 * canonical, and a rule that says "this link is special" — for a
 * distinction that no longer exists.
 */

export type GustaleDomain = "geo" | "recipes" | "staging";

/**
 * The ONE origin.
 *
 * It is used for the absolute URLs a page must have: the canonical,
 * the `hreflang` alternates, `og:url` and the JSON-LD. A relative
 * path is right for a LINK; it is wrong for a canonical, because a
 * canonical has to be an absolute URL to be a canonical at all.
 *
 * The staging build has its own origin — see `siteOrigin()` in
 * `lib/locales.ts`, which is the resolver that knows about it.
 */
export const SITE_ORIGIN = "https://gustale.com";

/**
 * The STAGING origin (WP-00b, card GUS-1122).
 *
 * Staging serves the SAME site — the same pages, the same routes — but
 * on its own host, with its own canonical URLs and its own origin.
 * That matters: a staging build that pointed its canonicals at
 * gustale.com would tell a search engine (and anyone reading the
 * source) that the staging copy is the real one.
 *
 * It is `noindex`, so it should never be indexed at all — but the
 * canonicals still have to be right, because a staging page is
 * sometimes read by a human and sometimes fetched by a crawler that
 * ignores noindex.
 */
export const STAGING_ORIGIN = "https://staging.gustale.com";

/**
 * Pure domain resolver — safe to unit-test without Vite.
 * Only the exact string `geo` selects the geo variant; anything else
 * (including unset / empty) is the recipes variant.
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

/**
 * Whether this build is the geo VARIANT.
 *
 * It is not "is this a different site". It is "does this build carry
 * the map and the terracotta accent". The /map page and the home hero
 * are the only two things it still decides.
 */
export function isGeoDomain(): boolean {
  return currentDomain() === "geo";
}

/**
 * Whether this build is the recipes VARIANT.
 *
 * The inverse of `isGeoDomain()`, kept because the two are read in
 * different places and the inverse reads better at some of them.
 */
export function isRecipesDomain(): boolean {
  return currentDomain() === "recipes";
}

/**
 * The name of the site THIS build is serving.
 *
 * It was "gustale.com" on the Atlas and the retired host's own name on
 * the Recipes site, and that difference was a bug in disguise: the
 * /dishes/ list page on gustale.com carried the eyebrow "Gustale
 * Recipes", which is the OTHER property's name, on a page that is not
 * the other property.
 *
 * There is one name now.
 */
export function siteName(): string {
  if (currentDomain() === "staging") return "staging.gustale.com";
  return "gustale.com";
}

/**
 * The name of the property the reader is currently on, for an eyebrow
 * or a heading.
 *
 * It was "Gustale Atlas" or "Gustale Recipes" depending on the build.
 * There is one property, and its name is the brand.
 */
export function propertyName(): string {
  return "Gustale";
}

/**
 * A path, normalised to start with a slash.
 *
 * Every internal link goes through here, so that a link can never be
 * written as `"dishes/new"` (which is relative to the CURRENT
 * directory, and breaks on /dishes/bakso) or as an absolute URL to
 * another host.
 *
 * This is the replacement for `authoringHref()`: the one place that
 * decides what a link looks like.
 */
export function href(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

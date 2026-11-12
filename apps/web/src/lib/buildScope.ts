/**
 * The BUILD SCOPE: which locales and how many dishes a build covers.
 *
 * WHY THIS EXISTS
 * ---------------
 * A full production build of the recipes site renders every published
 * dish in every site locale. On 2026-11-12 that was 1,474 dishes x 10
 * locales = 16,589 pages, and it took 141 MINUTES. That is fine for
 * production and useless for a staging environment, where the point is
 * to see a change quickly, not to mirror production page for page.
 *
 * So a build can be SCOPED:
 *
 *   PUBLIC_BUILD_LOCALES=en          -- one locale, not ten
 *   PUBLIC_BUILD_DISH_LIMIT=50       -- the first 50 dishes, not 1,474
 *
 * Both are OPTIONAL. Unset (the default) means the full production
 * build, which is what the production images use. Nothing about the
 * production build path changes.
 *
 * WHY THE DISH LIMIT IS A LIMIT AND NOT A SAMPLE
 * ----------------------------------------------
 * The first N dishes in the API's order. The API's default order is
 * stable, so "the first 50" is the same 50 on every build -- which is
 * what a staging environment needs: a change that breaks one of those
 * 50 dishes is visible on the next staging build.
 *
 * The limit is applied to the SLUG LIST, before the pages are made, so
 * a scoped build does not fetch 1,474 dishes' worth of detail to then
 * throw most of it away. That is where the time actually goes.
 *
 * WHY THE LOCALE SUBSET IS NOT A HARD-CODED LIST
 * ----------------------------------------------
 * A build with PUBLIC_BUILD_LOCALES=en must not emit pages for the
 * other nine locales, and must not emit hreflang alternates pointing
 * at pages that were never built -- a sitemap with a 404 in it is
 * worse than no sitemap. So the subset filters both the page
 * generation AND the alternates.
 */
import { type CoreLocale, SITE_LOCALES } from "./locales";

/**
 * The locales this build covers.
 *
 * Unset -> every site locale (the production build).
 * Set   -> only the listed ones, and only those that are real site
 *          locales (a typo must not silently produce a site with no
 *          pages).
 */
export function buildLocales(): CoreLocale[] {
  const raw = import.meta.env.PUBLIC_BUILD_LOCALES;
  if (!raw || !raw.trim()) return SITE_LOCALES;

  const wanted: string[] = raw
    .split(",")
    .map((l: string) => l.trim())
    .filter(Boolean);

  const valid = wanted.filter((l): l is CoreLocale =>
    (SITE_LOCALES as readonly string[]).includes(l),
  );

  // If NOTHING in the request was a real locale, fall back to the full
  // set rather than building a site with zero pages. A misconfigured
  // build should be loud, not empty.
  if (valid.length === 0) {
    console.warn(
      `[build-scope] PUBLIC_BUILD_LOCALES="${raw}" matched no site locale; building all of them`,
    );
    return SITE_LOCALES;
  }

  if (valid.length !== wanted.length) {
    const unknown = wanted.filter((l) => !valid.includes(l as CoreLocale));
    console.warn(
      `[build-scope] ignoring unknown locale(s): ${unknown.join(", ")}`,
    );
  }

  return valid;
}

/**
 * How many dishes this build covers.
 *
 * Unset or zero -> every dish (the production build).
 * Otherwise     -> the first N of the API's stable order.
 */
export function buildDishLimit(): number | null {
  const raw = import.meta.env.PUBLIC_BUILD_DISH_LIMIT;
  if (!raw || !raw.trim()) return null;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(
      `[build-scope] PUBLIC_BUILD_DISH_LIMIT="${raw}" is not a positive integer; building every dish`,
    );
    return null;
  }
  return n;
}

/**
 * Apply the dish limit to a fetched slug list.
 *
 * The list is already in the API's order, so this is a slice. The
 * total is returned too, so a caller can log how much was left out.
 */
export function applyDishLimit<T>(slugs: T[]): {
  kept: T[];
  limit: number | null;
} {
  const limit = buildDishLimit();
  if (limit === null || slugs.length <= limit) {
    return { kept: slugs, limit };
  }
  return { kept: slugs.slice(0, limit), limit };
}

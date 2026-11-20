/**
 * THE OLD-TO-NEW PATHS — one redirect map.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The blueprint's redirect map (section 6) names the old paths that
 * have to 301 to their new homes:
 *
 *   /map        -> /atlas
 *   /regions    -> /places
 *   /lineages/* -> /history/*
 *   /family/*   -> /families/*
 *   /place/*    -> /places/*
 *
 * Each target is a page that a LATER package builds: `/places` is
 * WP-C3, `/history` is WP-C4. A 301 to a 404 is worse than no 301 at
 * all — it tells a search engine the page is gone AND gives the reader
 * a dead end.
 *
 * So the map is declared here, with the package that creates each
 * target, and the nginx configuration only emits the redirects whose
 * targets exist. The day WP-C3 lands `/places`, the redirect starts
 * working with no second edit — the map says what the answer is.
 *
 * THE RULE
 * --------
 * A redirect is emitted only when:
 *
 *   1. its target is a REAL page on this build, and
 *   2. the target is not the source itself.
 *
 * `/map` and `/regions` are NOT renamed in WP-A3: `/map` is the home
 * page's map and `/regions` is the country directory, and both are
 * still the pages the site actually serves. Their new homes are part
 * of the WP-C1 home rebuild and the WP-C3 atlas rebuild, so they are
 * declared here and turned on when those land.
 *
 * WP-C3 HAS NOW LANDED.
 *
 * The three rules whose target is WP-C3's work are switched on:
 * `/map` → `/atlas`, `/regions` → `/places` and `/place/*` →
 * `/places/*`. The two that are not — `/lineages` → `/history` and
 * `/family/*` → `/families/*` — are still HELD, because their targets
 * do not exist yet. A redirect to a page that is not there is the one
 * outcome this file exists to prevent.
 */

/** A path that has moved, and where it went. */
export interface RedirectRule {
  /** The old path, as a PREFIX. `/family` matches `/family/curry`. */
  readonly from: string;
  /** The new path, as a PREFIX. */
  readonly to: string;
  /** Why this path is being moved. */
  readonly reason: string;
  /**
   * The package that creates the TARGET.
   *
   * The redirect is only emitted once that package has shipped, so
   * there is never a 301 to a 404.
   */
  readonly targetBuiltBy: string;
  /**
   * Whether the target exists on this build RIGHT NOW.
   *
   * This is the switch. It is false for every rule whose target
   * package has not shipped, and the redirect is simply not emitted.
   */
  readonly targetExists: boolean;
}

/**
 * The redirect map.
 *
 * Order matters: the first matching prefix wins, so the more specific
 * rules come first.
 */
export const REDIRECT_RULES: readonly RedirectRule[] = [
  {
    from: "/lineages",
    to: "/history",
    reason:
      "The public concept becomes a thread inside History. The path moves with WP-C4.",
    targetBuiltBy: "WP-C4",
    targetExists: false,
  },
  {
    from: "/family",
    to: "/families",
    reason:
      "The singular family path was a spelling accident; the index is plural.",
    targetBuiltBy: "WP-C1",
    // HELD, even though the INDEX is plural. The DETAIL page is not:
    // `/family/curry` is the live URL for a family and returns 200
    // with real content, while `/families/curry` is a 404 -- there is
    // no `pages/families/[slug].astro`. Redirecting the prefix would
    // turn a working page into a 301 to a 404.
    //
    // The redirect turns on when WP-C1 builds the plural detail page.
    targetExists: false,
  },
  {
    from: "/place",
    to: "/places",
    reason: "The place pages join the places index.",
    targetBuiltBy: "WP-C3",
    targetExists: true,
  },
  {
    from: "/regions",
    to: "/places",
    reason:
      "'Regions' became 'Places' when the country directory became a place directory.",
    targetBuiltBy: "WP-C3",
    targetExists: true,
  },
  {
    from: "/map",
    to: "/atlas",
    reason: "The map is part of the Atlas, not a page of its own.",
    targetBuiltBy: "WP-C3",
    targetExists: true,
  },
];

/**
 * The rules whose targets exist right now.
 *
 * This is what the nginx configuration is generated from.
 */
export function activeRedirects(): RedirectRule[] {
  return REDIRECT_RULES.filter((r) => r.targetExists);
}

/**
 * The redirect for a pathname, if there is one.
 *
 * Returns the new path, or null when the path does not move.
 */
export function redirectFor(pathname: string): string | null {
  for (const rule of activeRedirects()) {
    if (pathname === rule.from) return rule.to;
    if (pathname.startsWith(`${rule.from}/`)) {
      return `${rule.to}${pathname.slice(rule.from.length)}`;
    }
  }
  return null;
}

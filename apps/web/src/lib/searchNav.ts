/**
 * Pure helpers for GlobalSearch + Nav (U0-B).
 * Domain is passed explicitly so Node tests can run without Vite.
 */

import type { GustaleDomain } from "./domain";
import { siteSections } from "./sections";

export type SearchPlacement = "header" | "drawer";

export type BrowseLink = { href: string; label: string };

/** True for the dishes *index* (`/dishes`), not `/dishes/<slug>`. */
export function isDishesIndexPath(path: string): boolean {
  const bare = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return bare === "/dishes";
}

/**
 * Rewrite a search-hit href.
 *
 * IT IS A NO-OP NOW, and that is the point.
 *
 * It used to rewrite a hit's path into an ABSOLUTE url on the recipes
 * host when the hit was a recipes-only path (`/ingredients`,
 * `/dishes/new`) or the dishes *list*, because the geo build stripped
 * those paths and a relative link to them was a 404 there.
 *
 * One build serves everything now, so every hit is already local and
 * every hit is already correct. The function is kept — it is called
 * from the search component and from the Node-side copy in
 * `scripts/search-nav-helpers.mjs` — and it returns the href
 * unchanged.
 *
 * The `domain` argument is kept for the same reason: the callers pass
 * it, and removing it would be a wider change than this cutover needs.
 *
 * Query strings are preserved by returning the href untouched.
 */
export function resolveSearchHitHref(
  href: string,
  _domain: GustaleDomain,
): string {
  return href;
}

/**
 * “See all dish matches” — the local dishes listing.
 *
 * It used to point at the RECIPES HOST on the geo build, because the
 * geo build stripped the dishes list. The dishes list is on this site
 * now, so the link is local on every variant.
 */
export function seeAllDishesHref(
  query: string,
  _domain: GustaleDomain,
): string {
  const qs = `?q=${encodeURIComponent(query)}`;
  return `/dishes${qs}`;
}

/** Stable, placement-scoped option id (header + drawer must not collide). */
export function searchOptionId(
  placement: SearchPlacement,
  groupType: string,
  slug: string,
): string {
  const safeType = groupType.replace(/[^a-z0-9_-]/gi, "");
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, "-") || "item";
  return `gs-opt-${placement}-${safeType}-${safeSlug}`;
}

/** Clamp keyboard active index into [0, count) (or 0 when empty). */
export function clampActiveIndex(activeIdx: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(activeIdx)) return 0;
  if (activeIdx < 0) return 0;
  if (activeIdx >= count) return count - 1;
  return activeIdx;
}

/** Initial/help browse links when query length < 2. */
export function searchHelpLinks(domain: GustaleDomain): BrowseLink[] {
  // THE SIX SECTIONS.
  //
  // This used to carry a FOURTH copy of the navigation, with its own
  // labels again: "Globe", "Places", "Food families", "History &
  // connections", "Browse recipes". A reader who opened the search and
  // read the header would see two different names for the same pages.
  //
  // Now the search names the same six sections as the header and the
  // footer, and the labels come from the same table.
  // Every section is local. There is no section that leaves the site,
  // because there is only one site.
  return siteSections().map((s) => ({
    href: s.path,
    label: s.label,
  }));
}

/** Empty-state alternate browse links. */
export function searchEmptyBrowseLinks(domain: GustaleDomain): BrowseLink[] {
  return searchHelpLinks(domain);
}

/**
 * API/network failure fallback links.
 * Atlas keeps Countries / Food families / Lineages + absolute Browse recipes.
 * Recipes may use local /dishes and /ingredients.
 */
export function searchErrorBrowseLinks(domain: GustaleDomain): BrowseLink[] {
  // The same six sections as the help links, minus the one the reader
  // is already on.
  return searchHelpLinks(domain);
}

/** Aria-live status copy for search panel states. */
export function searchStatusMessage(opts: {
  open: boolean;
  queryLen: number;
  loading: boolean;
  unavailable: boolean;
  resultCount: number | null;
  query: string;
}): string {
  const { open, queryLen, loading, unavailable, resultCount, query } = opts;
  if (!open) return "";
  if (queryLen < 2) {
    return "Type at least two characters to search. Browse links are available below.";
  }
  if (loading) return "Searching…";
  if (unavailable) return "Search is temporarily unavailable.";
  if (resultCount === 0) {
    return `No results for “${query}”.`;
  }
  if (resultCount != null && resultCount > 0) {
    return `${resultCount} result${resultCount === 1 ? "" : "s"} available.`;
  }
  return "";
}

/**
 * Primary-nav active match — mirrors Nav.astro match functions.
 * Used for static aria-current and for tests.
 */
/**
 * Whether a navigation link is the one the reader is on.
 *
 * ONE matcher for the whole site.
 *
 * It used to have two -- the geo branch and the recipes branch -- and
 * they disagreed about `/dishes` and `/ingredients`. The geo branch
 * did not mark them active, because the geo build stripped them and a
 * reader could never be on one.
 *
 * Every path is served here now, so the dishes and the ingredients are
 * as reachable as the families and the lineages, and the matcher says
 * so.
 */
export function isPrimaryNavActive(
  href: string,
  pathname: string,
  _domain: GustaleDomain,
): boolean {
  const p =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname;

  if (href === "/") return p === "/" || p === "";
  if (href === "/places") return p === "/places" || p.startsWith("/places/");
  if (href === "/dishes") {
    return p === "/dishes" || p.startsWith("/dishes/");
  }
  if (href === "/recipes") {
    return p === "/recipes" || p.startsWith("/recipes/");
  }
  if (href === "/ingredients") {
    return p === "/ingredients" || p.startsWith("/ingredients/");
  }
  if (href === "/families") {
    return (
      p === "/families" ||
      p.startsWith("/families/") ||
      p === "/family" ||
      p.startsWith("/family/")
    );
  }
  if (href === "/lineages") {
    return p === "/lineages" || p.startsWith("/lineages/");
  }
  if (href === "/about") return p === "/about" || p.startsWith("/about/");
  return p === href || p.startsWith(`${href}/`);
}

/**
 * Add-a-dish CTA href.
 *
 * It used to point at the RECIPES HOST on the geo build. The authoring
 * form is on this site now, so the link is local on every variant.
 */
export function addDishHref(_domain: GustaleDomain): string {
  return "/dishes/new";
}

/** Whether “/” should focus header search (ignore editable / form fields). */
export function shouldHandleSlashShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (el.isContentEditable) return false;
  if (el.closest('[contenteditable="true"], [contenteditable=""]'))
    return false;
  // Don't steal “/” from focused buttons that might be part of another widget.
  if (tag === "BUTTON" || el.closest("button")) return false;
  return true;
}

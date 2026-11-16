/**
 * ESM twin of src/lib/searchNav.ts for Node tests / validate-build.
 * Keep algorithms in sync with the TypeScript source.
 */

// ONE SITE.
//
// `ATLAS_ORIGIN` and `RECIPES_ORIGIN` are gone: there was one origin
// for the site and another for the recipes property, and there is one
// origin now. `RECIPES_ONLY_PATH_PREFIXES` went with them -- it
// listed the paths the geo build STRIPPED, and nothing is stripped.
export const SITE_ORIGIN = "https://gustale.com";

/**
 * THE SIX SECTIONS — the ESM twin of `src/lib/sections.ts`.
 *
 * Keep in sync with the TypeScript source.
 */
export const SECTION_LABELS = [
  "Atlas",
  "Dishes",
  "Families",
  "Ingredients",
  "History",
  "Recipes",
];

export const SECTION_PATHS = {
  Atlas: "/",
  Dishes: "/dishes",
  Families: "/families",
  Ingredients: "/ingredients",
  History: "/lineages",
  Recipes: "/recipes",
};

// `RECIPES_HOST_SECTIONS` is gone. It listed the two sections that
// lived on the OTHER host, and there is no other host.

/**
 * The six sections, every one of them local.
 *
 * The `external` flag is kept because the footer and the drawer read
 * it -- but it is now always false. There is no section that leaves
 * the site, because there is only one site.
 */
export function siteSections() {
  return SECTION_LABELS.map((label) => ({
    label,
    path: SECTION_PATHS[label],
    external: false,
  }));
}

/**
 * A path, normalised to start with a slash.
 *
 * This replaces `authoringHrefFor()`, which used to return an ABSOLUTE
 * url on the recipes host for the geo build.
 */
export function localHref(path) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function isDishesIndexPath(path) {
  const bare = (path.split("?")[0] ?? path).replace(/\/+$/, "") || "/";
  return bare === "/dishes";
}

/**
 * Rewrite a search-hit href.
 *
 * A NO-OP now, and that is the point: it used to rewrite recipes-only
 * paths into absolute urls on the retired host, because the geo build
 * stripped them. One build serves everything, so every hit is already
 * local and already correct.
 */
export function resolveSearchHitHref(href, _domain) {
  return href;
}

export function seeAllDishesHref(query, _domain) {
  const qs = `?q=${encodeURIComponent(query)}`;
  return `/dishes${qs}`;
}

export function searchOptionId(placement, groupType, slug) {
  const safeType = String(groupType).replace(/[^a-z0-9_-]/gi, "");
  const safeSlug = String(slug).replace(/[^a-z0-9_-]/gi, "-") || "item";
  return `gs-opt-${placement}-${safeType}-${safeSlug}`;
}

export function clampActiveIndex(activeIdx, count) {
  if (count <= 0) return 0;
  if (!Number.isFinite(activeIdx)) return 0;
  if (activeIdx < 0) return 0;
  if (activeIdx >= count) return count - 1;
  return activeIdx;
}

export function searchHelpLinks(domain) {
  // THE SIX SECTIONS — the same list the header and the footer show.
  // This used to be a FOURTH copy of the navigation with its own
  // labels ("Globe", "Places", "Food families", "History & connections").
  // Every section is local. There is no section that leaves the site.
  return siteSections().map((s) => ({
    href: s.path,
    label: s.label,
  }));
}

export function searchErrorBrowseLinks(domain) {
  // The same six sections as the help links, so a reader who lands on
  // a search error sees the same words they would see in the nav.
  return searchHelpLinks(domain);
}

/**
 * Whether a navigation link is the one the reader is on.
 *
 * ONE matcher for the whole site.
 *
 * It used to have two: the geo branch and the recipes branch, and they
 * disagreed about `/dishes` and `/ingredients`. The geo branch did not
 * mark them active, because the geo build stripped them and a reader
 * could never be on one.
 *
 * Now every path is served here, so the dishes and the ingredients are
 * as reachable as the families and the lineages, and the matcher says
 * so.
 */
export function isPrimaryNavActive(href, pathname, _domain) {
  const p =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname;

  if (href === "/") return p === "/" || p === "";
  if (href === "/regions")
    return p === "/regions" || p.startsWith("/regions/");
  if (href === "/dishes") return p === "/dishes" || p.startsWith("/dishes/");
  if (href === "/recipes") return p === "/recipes" || p.startsWith("/recipes/");
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
  if (href === "/lineages")
    return p === "/lineages" || p.startsWith("/lineages/");
  if (href === "/about") return p === "/about" || p.startsWith("/about/");
  return p === href || p.startsWith(`${href}/`);
}

export function addDishHref(_domain) {
  return "/dishes/new";
}

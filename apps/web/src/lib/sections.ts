/**
 * THE SIX SECTIONS — the site's navigation, in one place.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The header, the mobile drawer, the footer and the search's
 * "browse these instead" links all used to carry their own copy of the
 * navigation. Four copies is four chances to drift, and they HAD
 * drifted: the header said "Explore / Dish origins / Food families /
 * History & connections / About" while the footer said "Atlas /
 * Recipes / Food families / Lineages / About" — different labels for
 * the same pages, and one of the footer's links ("Lineages") named a
 * concept the blueprint retires.
 *
 * The blueprint's decision D2 names six sections, and each maps to
 * one entity type:
 *
 *   Atlas       — the map, the places, the whole thing
 *   Dishes      — the dishes themselves
 *   Families    — what shape a dish has
 *   Ingredients — what it is made of
 *   History     — threads, influences, connections
 *   Recipes     — how to cook it
 *
 * "Explore" and "Dish origins" disappear as labels: the first named
 * nothing in particular, and the second named a field the blueprint
 * stops presenting as an origin (D7).
 *
 * THE HOST SWITCH IS GONE
 * -----------------------
 * The header used to carry a two-cell Atlas/Recipes switch, and the
 * footer carried a second copy. The blueprint wants ONE site
 * (gustale.com, decision D1) with six sections, and a switch is a
 * message that there are two sites.
 *
 * WP-D1 HAS NOW LANDED: there is ONE build, on gustale.com, and it
 * serves every section — the ingredients index, the recipes pages and
 * the map alike. The host split is gone, so every section's href is a
 * RELATIVE, same-origin path. There is no cross-host link left in
 * the navigation to get wrong.
 *
 * WHY THIS MODULE HAS NO `domain.ts` IMPORT
 * -----------------------------------------
 * `domain.ts` reads `import.meta.env`, which is a Vite thing and does
 * not exist under Node's test runner. Keeping this module free of it
 * means the navigation's rules can be asserted directly, on every
 * host, without a build step.
 */

/** The six sections' identities, in the blueprint's order. */
export const SECTION_LABELS = [
  "Atlas",
  "Dishes",
  "Families",
  "Ingredients",
  "History",
  "Recipes",
] as const;

export type SectionLabel = (typeof SECTION_LABELS)[number];

/**
 * The section that each label points at, as a PATH.
 *
 * The path is the same on every host, and after the single-domain
 * cutover there is only one host: every path below is served by the
 * ONE build, on gustale.com. The `external` flag is therefore always
 * false — see `SectionLink.external`.
 */
export const SECTION_PATHS: Record<SectionLabel, string> = {
  Atlas: "/",
  Dishes: "/dishes",
  Families: "/families",
  Ingredients: "/ingredients",
  History: "/lineages",
  Recipes: "/recipes",
};

/** One line: what this section is for. Used in the footer. */
export const SECTION_DESCRIPTIONS: Record<SectionLabel, string> = {
  Atlas: "The map, the places, and every dish.",
  Dishes: "Every dish in the archive.",
  Families: "What shape a dish has.",
  Ingredients: "What a dish is made of.",
  History: "Threads, influences and connections.",
  Recipes: "How to cook it.",
};

export interface SectionLink {
  /** The section's name, as it appears in the navigation. */
  readonly label: SectionLabel;
  /** The section's path, on whichever host serves it. */
  readonly path: string;
  /** One line: what this section is for. */
  readonly description: string;
  /**
   * Whether this section lives on the OTHER host.
   *
   * The footer and the mobile drawer mark these, so a reader knows
   * they are leaving the site rather than moving within it.
   *
   * After the single-domain cutover this is ALWAYS false: there is no
   * other host to leave for. The field is kept because the footer's
   * and the drawer's "leaves the site" styling is keyed off it, and
   * deleting the flag would mean deleting that styling — which would
   * be a change of presentation for a change of fact, and not this
   * refactor's business.
   */
  readonly external: boolean;
}

/**
 * The six sections.
 *
 * There is ONE host now (gustale.com, blueprint decision D1) and it
 * serves every section, so every section is LOCAL: `external` is
 * false for all six, and every `path` is a relative, same-origin path
 * that this build actually serves.
 *
 * The argument the split used to need is gone. That is the point of
 * the cutover: the navigation no longer knows which host it is on.
 */
export function siteSections(): SectionLink[] {
  return SECTION_LABELS.map((label) => ({
    label,
    path: SECTION_PATHS[label],
    description: SECTION_DESCRIPTIONS[label],
    external: false,
  }));
}

/**
 * Whether a pathname is inside a section.
 *
 * The matcher is deliberately forgiving about the old paths, because
 * the old paths are still in the wild: a dish page at `/dishes/...`
 * marks "Dishes" active, and a family page at `/family/...` (the
 * singular form) marks "Families" active.
 */
export function isSectionActive(path: string, pathname: string): boolean {
  const p =
    pathname.endsWith("/") && pathname.length > 1
      ? pathname.slice(0, -1)
      : pathname;

  if (path === "/") return p === "/" || p === "";
  if (path === "/dishes") return p === "/dishes" || p.startsWith("/dishes/");
  if (path === "/families") {
    return (
      p === "/families" ||
      p.startsWith("/families/") ||
      p === "/family" ||
      p.startsWith("/family/")
    );
  }
  if (path === "/lineages") {
    // The blueprint retires "lineage" as a public word and calls the
    // concept a thread, but the PATH stays until WP-E1 moves it.
    return p === "/lineages" || p.startsWith("/lineages/");
  }
  if (path === "/ingredients") {
    return p === "/ingredients" || p.startsWith("/ingredients/");
  }
  if (path === "/recipes") {
    return p === "/recipes" || p.startsWith("/recipes/");
  }
  return p === path || p.startsWith(`${path}/`);
}

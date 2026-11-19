/**
 * The dish page's section registry — WP-C2.
 *
 * WHY THIS FILE EXISTS
 *
 * The dish page must read in ONE fixed order, the order the blueprint's
 * mockup sets out:
 *
 *     Overview | Where | History | Connections | Variants | Ingredients | Recipes | Sources
 *
 * But the PRESENCE of each section is data. A dish with no sources has no
 * Sources section; a dish with no variants has no Variants section. And
 * the standing rule from the brief is absolute:
 *
 *     "Every link must reach real content."
 *
 * A nav link pointing at an anchor that is not on the page is a dead end
 * for the reader and for the keyboard. So the nav cannot be a hard-coded
 * list — it has to be BUILT from what the page actually renders.
 *
 * So the order lives here, as data, and the presence flags decide what
 * survives. The result is a pure function with no DOM dependency, which
 * means the whole thing is unit-testable — and the tests are what prove
 * the nav can never point at a missing anchor.
 *
 * WHY NOT JUST A CONSTANT ARRAY
 *
 * Because the order is only half the contract. The other half is the
 * RULE for which sections appear, and that rule is where the bugs live:
 * a section that renders an empty state still counts as present (the
 * reader needs to see "no variants yet" rather than have the section
 * silently vanish), while a section that is not rendered at all must
 * not get a link.
 */

/** The anchor id on the page for each section. */
export interface DishSectionLink {
  /**
   * The anchor id.
   *
   * Typed as the union of the known ids rather than `string`, so a
   * typo in an id is a COMPILE error instead of a nav link that quietly
   * points at nothing.
   */
  id: DishSectionId;
  label: string;
}

/**
 * The anchor ids used on the dish page.
 *
 * These MUST match the ids on the rendered sections. A test asserts the
 * two stay in step, so an id can be renamed on one side without the
 * other and nothing silently breaks.
 */
export const DISH_SECTION_IDS = {
  /** The overview — the facts table. Always rendered. */
  overview: "dish-overview",
  /** The overview's HEADING. The overview block itself is the nav
   *  anchor; its heading needs its own id so `aria-labelledby` points
   *  at a heading and not at the block that contains it. */
  overviewTitle: "dish-overview-title",
  /** "Where it belongs" — the map of the associated places. */
  where: "where-heading",
  /** "History" — the journey beats, rendered as claim rows. */
  history: "history-heading",
  /** "Connections" — the three columns by relationship kind. */
  connections: "connections-heading",
  /** "Variants" — the named forms of this same dish. */
  variants: "variants-heading",
  /** "Ingredients" — the dish's composition. */
  ingredients: "ingredients-heading",
  /** "Recipes" — the published recipes of this dish. */
  recipes: "recipes-heading",
  /** "Sources" — the numbered source list. */
  sources: "sources-heading",
  /**
   * The "Places & traditions" section — the countries, regions and
   * culinary communities a dish is associated with.
   *
   * It is a SUB-SECTION of "Where it belongs" in the mockup: the map and
   * the association list belong together, under one heading. So it keeps
   * its own anchor for the deep link, but it does NOT get its own entry
   * in the nav — the nav would then list two ways to reach the same
   * geography, and the mockup's nav does not.
   */
  places: "atlas-places-heading",
} as const;

/** The union of the known section anchor ids. */
export type DishSectionId =
  (typeof DISH_SECTION_IDS)[keyof typeof DISH_SECTION_IDS];

/**
 * Which sections the page actually renders.
 *
 * Every flag means "the page renders this section", NOT "the section has
 * content". A section that renders an empty state is still rendered: the
 * reader gets an explicit "nothing here yet" instead of a missing
 * heading they cannot explain.
 */
export interface DishSectionAvailability {
  /** The "Where it belongs" section — the map and its legend. */
  hasWhere: boolean;
  /** The "History" section — the journey beats as claim rows. */
  hasHistory: boolean;
  /** The "Connections" section — the three columns by relationship kind. */
  hasConnections: boolean;
  /** The "Variants" section. */
  hasVariants: boolean;
  /** The "Ingredients" section. */
  hasIngredients: boolean;
  /** The "Recipes" section. */
  hasRecipes: boolean;
  /** The "Sources" section. */
  hasSources: boolean;
}

/**
 * The nav, in the order the mockup sets out.
 *
 * "Overview" is first and always present: the page always opens with the
 * title, the facts table and the cover, so the anchor always resolves.
 */
export const DISH_SECTION_ORDER: ReadonlyArray<{
  id: DishSectionId;
  label: string;
}> = [
  { id: DISH_SECTION_IDS.overview, label: "Overview" },
  { id: DISH_SECTION_IDS.where, label: "Where" },
  { id: DISH_SECTION_IDS.history, label: "History" },
  { id: DISH_SECTION_IDS.connections, label: "Connections" },
  { id: DISH_SECTION_IDS.variants, label: "Variants" },
  { id: DISH_SECTION_IDS.ingredients, label: "Ingredients" },
  { id: DISH_SECTION_IDS.recipes, label: "Recipes" },
  { id: DISH_SECTION_IDS.sources, label: "Sources" },
] as const;

/**
 * Which availability flag governs which nav entry.
 *
 * The order is the array's order; this map says what has to be true for
 * each entry to survive. Overview is not here because it is always
 * present.
 */
const SECTION_REQUIREMENT: Partial<
  Record<DishSectionId, keyof DishSectionAvailability>
> = {
  [DISH_SECTION_IDS.where]: "hasWhere",
  [DISH_SECTION_IDS.history]: "hasHistory",
  [DISH_SECTION_IDS.connections]: "hasConnections",
  [DISH_SECTION_IDS.variants]: "hasVariants",
  [DISH_SECTION_IDS.ingredients]: "hasIngredients",
  [DISH_SECTION_IDS.recipes]: "hasRecipes",
  [DISH_SECTION_IDS.sources]: "hasSources",
};

/**
 * Build the nav from what the page actually renders.
 *
 * The order is fixed by the mockup. The MEMBERSHIP is data: a section
 * that is not rendered gets no link, so the nav can never point at an
 * anchor that does not exist.
 */
export function buildSectionLinks(
  available: DishSectionAvailability,
): DishSectionLink[] {
  const links: DishSectionLink[] = [];

  for (const entry of DISH_SECTION_ORDER) {
    // Overview is unconditional: the page always renders it.
    const requirement = SECTION_REQUIREMENT[entry.id];
    if (!requirement) {
      links.push({ id: entry.id, label: entry.label });
      continue;
    }
    if (available[requirement]) {
      links.push({ id: entry.id, label: entry.label });
    }
  }

  return links;
}

// ── The facts table ───────────────────────────────────────────────────────
//
// The mockup's facts table sits directly under the introduction, with no
// heading of its own. It is two columns: a label and a value.
//
// The labels come from the blueprint's mockup, and each maps onto data the
// API already returns. A dimension the dish has NOT got is not dropped —
// it shows "no evidence", because a missing fact and a fact that was
// checked and found unset are different things to a reader.

/** The rows of the facts table, in the mockup's order. */
export const DISH_FACT_KEYS = [
  "associatedWith",
  "family",
  "servedAs",
  "technique",
  "alsoCalled",
] as const;

export type DishFactKey = (typeof DISH_FACT_KEYS)[number];

/** The label each fact row carries in the mockup. */
export const DISH_FACT_LABELS: Record<DishFactKey, string> = {
  associatedWith: "Associated with",
  family: "Family",
  servedAs: "Served as",
  technique: "Technique",
  alsoCalled: "Also called",
};

/**
 * One row of the facts table.
 *
 * `value` is the rendered text. `links` are the values that are real
 * pages — "Greece" links to the place, "Casserole" links to the family.
 * `evidence` is the chip that says how well the row is supported.
 */
export interface DishFactRow {
  key: DishFactKey;
  label: string;
  value: string;
  /** The slug to link to, when the value has a page of its own. */
  href?: string;
  /** The evidence status chip, when the row carries one. */
  evidence?: string;
  /** True when the value is a note rather than a claim. */
  note?: boolean;
}

/**
 * The text shown for a fact that the dish does not have.
 *
 * A1's rule: a dimension that is unset says so. "No evidence" is the
 * honest rendering — the dish was checked and the value was not found,
 * which is not the same as the row being absent.
 */
export const DISH_FACT_MISSING = "No evidence";

/**
 * The three connection columns, in the mockup's order.
 *
 * These are three DIFFERENT axes and must not be collapsed into one:
 *
 *   - "Resembles" is a likeness with no implied history. It needs a
 *     stated reason.
 *   - "Influenced by" is directional: this dish came out of that one.
 *   - "Same family" is TAXONOMIC — a classification, not an ancestry.
 *
 * The mark is the marker the blueprint gives each kind: a dashed grey
 * line for a likeness, a solid terracotta line with an arrowhead for
 * influence.
 */
export const DISH_CONNECTION_COLUMNS = [
  {
    key: "resembles",
    label: "Resembles",
    mark: "dashed" as const,
    /** The relation types that are a likeness. */
    relationTypes: ["similar_form"] as const,
  },
  {
    key: "influencedBy",
    label: "Influenced by",
    mark: "arrow" as const,
    /**
     * `ancestor` is the directional type: the OTHER dish is the one this
     * dish came out of. `descendant` is its inverse and belongs in the
     * "Influenced" direction, never here.
     */
    relationTypes: ["ancestor"] as const,
  },
  {
    key: "sameFamily",
    label: "Same family",
    /**
     * NO MARK. And that is not an omission — it is the point.
     *
     * A2 retired "same family" as a RELATIONSHIP kind: "a family is
     * CLASSIFICATION and not a relationship between two dishes". The
     * two other columns carry a mark because they assert something
     * between two dishes — a likeness (dashed) or a descent (arrow).
     *
     * This column asserts neither. It says the dish belongs to a
     * category. So it gets no line, no arrow and no colour: there is
     * no relationship to draw. The mockup shows the heading in small
     * capitals for exactly this reason — it reads as a label rather
     * than as a kind, and it is the only one of the three that does.
     */
    mark: "none" as const,
    /** `family` is the taxonomic type. It carries no direction. */
    relationTypes: ["family"] as const,
  },
] as const;

export type DishConnectionColumnKey =
  (typeof DISH_CONNECTION_COLUMNS)[number]["key"];

/**
 * How a column heading is written.
 *
 * The mockup writes the two RELATIONSHIP columns in title case and the
 * classification column in small capitals. The difference is not
 * decoration: the capitals are what makes the third column read as a
 * label rather than as a third kind of relationship.
 */
export const DISH_CONNECTION_COLUMN_STYLE: Record<
  DishConnectionColumnKey,
  "title" | "caps"
> = {
  resembles: "title",
  influencedBy: "title",
  sameFamily: "caps",
};

/**
 * One card in a connections column.
 */
export interface DishConnectionEntry {
  slug: string;
  name: string;
  /** The one-line reason. The blueprint requires one for a likeness. */
  reason?: string;
  /** The related dish's place, when it has one. */
  placeName?: string;
  /** The related dish's place code, when it has one. */
  placeIso?: string;
  /** The related dish's short description. */
  description?: string;
  /** The evidence status chip. */
  evidence?: string;
}

/**
 * Map a relation type onto the column it belongs in.
 *
 * Returns `null` for a type that belongs in none of the three columns —
 * `shared-ingredient`, `shared-method`, `similar-serving`, `diaspora` and
 * `descendant`. Those are real relations, but they are not what the
 * mockup's three columns mean, and forcing them in would misname them.
 */
export function connectionColumnFor(
  relationType: string,
): DishConnectionColumnKey | null {
  for (const column of DISH_CONNECTION_COLUMNS) {
    if ((column.relationTypes as readonly string[]).includes(relationType)) {
      return column.key;
    }
  }
  return null;
}

/**
 * The relation types that are DIRECTIONAL — they point from one dish to
 * another, and the direction is the claim.
 *
 * Used to decide whether a relation may be shown as "Influenced by", where
 * the direction is what the column asserts.
 */
export function isDirectionalRelation(relationType: string): boolean {
  return relationType === "ancestor" || relationType === "descendant";
}

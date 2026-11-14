/**
 * Which sections appear in the dish-page section nav.
 *
 * The rule from the brief: "Every link must reach real content." So the
 * nav is built from what the page ACTUALLY renders — a section that is
 * not on the page gets no link. A nav link to a missing anchor is a
 * dead end for the reader and for the keyboard.
 *
 * Pure and separate from the component so it can be unit-tested without
 * a DOM.
 */

export interface DishSectionLink {
  id: string;
  label: string;
}

export interface DishSectionAvailability {
  hasJourney: boolean;
  hasIngredients: boolean;
  hasVariants: boolean;
  hasPreparation: boolean;
  hasSources: boolean;
}

/**
 * The anchor ids used on the dish page.
 *
 * These MUST match the ids on the rendered sections. The journey
 * heading is `journey-heading`, the lineage block sits inside the
 * journey section and is reached through the same section, and the
 * ingredient list keeps its existing id.
 */
export const DISH_SECTION_IDS = {
  journey: "journey-heading",
  ingredients: "ingredients-heading",
  variants: "variants-heading",
  preparation: "preparation-heading",
  sources: "sources-heading",
  /**
   * The "Places & traditions" section — the countries, regions and
   * culinary communities a dish is associated with.
   *
   * It is rendered on every dish page, so the nav always reaches it.
   *
   * The label is the section's own heading rather than "Countries",
   * because a place association can be a country, a region, a
   * cross-border area OR A COMMUNITY — a people or a practice. "Israeli
   * cuisine" is not a country and "Minangkabau" is a people, so
   * "Countries" would misname most of the section's own rows.
   */
  places: "atlas-places-heading",
} as const;

/**
 * Build the nav, Journey first, then the other populated sections.
 *
 * Journey is always present when this function is called: the page
 * renders a Journey section in every state — populated, research gap,
 * or unavailable — so the reader always has an anchor to the history.
 */
export function buildSectionLinks(
  available: DishSectionAvailability,
): DishSectionLink[] {
  const links: DishSectionLink[] = [];

  if (available.hasJourney) {
    links.push({ id: DISH_SECTION_IDS.journey, label: "Journey" });
  }
  if (available.hasIngredients) {
    links.push({ id: DISH_SECTION_IDS.ingredients, label: "Ingredients" });
  }
  if (available.hasVariants) {
    links.push({ id: DISH_SECTION_IDS.variants, label: "Variations" });
  }
  if (available.hasPreparation) {
    links.push({ id: DISH_SECTION_IDS.preparation, label: "Preparation" });
  }
  if (available.hasSources) {
    links.push({ id: DISH_SECTION_IDS.sources, label: "Sources" });
  }
  // The places & traditions section is on every dish page, so the link
  // is always present. It comes last because it is the section a
  // reader reaches for when they want the geography, not the history.
  links.push({ id: DISH_SECTION_IDS.places, label: "Places & traditions" });

  return links;
}

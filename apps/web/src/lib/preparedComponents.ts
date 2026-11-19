/**
 * Prepared components, and the technique of a dish.
 *
 * WHY "PREPARED COMPONENTS" IS NOT "THE PREPARATION METHOD"
 *
 * The dish page has two different things that both look like "how the
 * dish is made":
 *
 *   A COMPONENT is something the dish is built FROM that is itself
 *   made: the béchamel in a moussaka, the pastry in a mille-feuille,
 *   the dough in a samosa. It is an INGREDIENT, and it appears in the
 *   ingredient list.
 *
 *   A METHOD is how the dish is cooked: "Fried & topped", "Baked",
 *   "Steamed & custard". It is a technique, and it belongs under
 *   Technique.
 *
 * The page had them mixed up. The "Prepared components" list was fed
 * the preparation rows, so it printed the METHOD ("Fried & topped")
 * under a heading that promises components -- and the components
 * themselves (the béchamel) were nowhere to be seen, even though they
 * were in the ingredient list.
 *
 * The rule, then:
 *
 *   "Prepared components" lists the INGREDIENTS that are themselves
 *   prepared, and the preparation METHOD goes into the Technique row of
 *   the facts table.
 *
 * Which ingredients count as prepared is a property of the ingredient,
 * not of the dish: the taxonomy category says it. "Béchamel sauce" is
 * in `savoury-sauces`, and a sauce is made before it is used.
 */

/**
 * The taxonomy categories that are PREPARED COMPONENTS.
 *
 * A component is an ingredient that is itself made before it goes into
 * the dish: a sauce, a stock, a dough, a pastry, a filling.
 *
 * These are the categories the taxonomy uses for those. A category that
 * is not on this list is a RAW ingredient, however the dish uses it --
 * an onion is an onion, even in a dish that cooks it for an hour.
 */
export const PREPARED_COMPONENT_CATEGORIES = [
  // Sauces.
  "savoury-sauces",
  "savoury-sauce-dry-preparation",
  "seasoning-sauces-and-condiments",
  "fruit-sauce",
  "chocolate-sauce",
  "alcoholic-sweet-sauce",
  "fudge-sauce",
  "sauce",
  // Doughs and pastry.
  "dough",
  "raw-doughs-and-pre-mixes",
  "pastry-based-on-laminated-dough",
  "choux-pastry",
  "various-pastry",
  "yeast-leavened-pastry",
  "shortcrust-pies-tarts",
  // Stocks and broths.
  "stock",
  "broth",
  "stock-cubes-or-granulate-bouillon-base",
  // Pastes and purées.
  "paste",
  "vegetable-puree-or-paste",
  // Cream-based preparations.
  "cream-and-cream-products",
  "sour-cream-products",
  // Syrups.
  "syrups-molasses-and-other-syrups",
] as const;

/**
 * True when the ingredient is a prepared component.
 *
 * The category is matched exactly, because a category is a controlled
 * value from the taxonomy and "savoury-sauces-something-else" is a
 * different category, not a near miss.
 */
export function isPreparedComponent(ingredient: {
  category?: string | null;
}): boolean {
  const category = ingredient.category?.trim().toLowerCase();
  if (!category) return false;
  return (PREPARED_COMPONENT_CATEGORIES as readonly string[]).includes(
    category,
  );
}

/**
 * The prepared components of a dish, in the dish's own ingredient order.
 */
export function preparedComponents<T extends { category?: string | null }>(
  ingredients: readonly T[],
): T[] {
  return ingredients.filter(isPreparedComponent);
}

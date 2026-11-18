/**
 * THE RECIPES BLOCK — the recipes for one dish, as a SECTION.
 *
 * WHY NOT THE RECIPE HUB
 *
 * `RecipeHub.astro` was built for the two-host era: it was a PAGE with
 * an `<h1>`, its own dish header and a link out to the Atlas for the
 * history. The cutover made the Atlas the one host, so that page is
 * redundant — and the mockup asks for something different anyway.
 *
 * The mockup puts Recipes BESIDE Ingredients, in the same horizontal
 * row, as a section of the dish page. It is a block, not a page.
 *
 * WHY IT IS AN ISLAND
 *
 * Two reasons, and both matter.
 *
 * The first is the empty state. There are ZERO published recipes today,
 * so every dish page renders this block's empty state. A reader who
 * never scrolls to it pays nothing for it.
 *
 * The second is the build. The recipe feed is fetched ONCE for the whole
 * build and grouped by dish, so the data costs one request rather than
 * one per page. The block receives its rows as props and renders them
 * on the server — there is no second fetch from the browser.
 *
 * THE EMPTY STATE IS THE DELIVERABLE RIGHT NOW
 *
 * It says two true things: nobody has written a recipe for this dish
 * yet, and the dish itself is documented above. It does NOT apologise
 * and it does NOT link to a page that does not exist. The mockup's own
 * wording is the model: "No recipe yet."
 */

import type { RecipeSummary } from "../lib/recipes";

export interface DishRecipesBlockProps {
  /** The dish's recipes. Empty today. */
  recipes: RecipeSummary[];
  /** The dish name, for the empty state's sentence. */
  dishName: string;
}

/** "45 min prep · 90 min cooking", with only the parts that exist. */
export function recipeTiming(recipe: RecipeSummary): string | null {
  const parts: string[] = [];
  if (recipe.servings != null) parts.push(`Serves ${recipe.servings}`);
  if (recipe.prepMinutes != null) parts.push(`${recipe.prepMinutes} min prep`);
  if (recipe.cookMinutes != null)
    parts.push(`${recipe.cookMinutes} min cooking`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function DishRecipesBlock({ recipes, dishName }: DishRecipesBlockProps) {
  if (recipes.length === 0) {
    return (
      <div className="dish-recipes__empty" role="status">
        <p className="dish-recipes__emptytitle">No recipe yet.</p>
        <p className="dish-recipes__emptybody">
          Nobody has written a recipe for {dishName} yet. The dish itself is
          documented above.
        </p>
      </div>
    );
  }

  return (
    <ul className="dish-recipes__list">
      {recipes.map((recipe) => {
        const timing = recipeTiming(recipe);
        return (
          <li key={recipe.id} className="dish-recipes__card">
            <a className="dish-recipes__title" href={`/recipes/${recipe.slug}`}>
              {recipe.title}
            </a>
            {timing ? <p className="dish-recipes__timing">{timing}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default DishRecipesBlock;

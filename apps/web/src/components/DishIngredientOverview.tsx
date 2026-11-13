import { authoringHref } from "../lib/domain";
import type { DishIngredient } from "../types/dish";

export interface DishIngredientOverviewProps {
  dishName: string;
  ingredients: DishIngredient[];
  /** The detailed ingredient explorer's anchor, when there is one. */
  explorerId?: string;
  /**
   * The heading, which names the dish's FORM: "In the bowl", "In the
   * bake", "At the table", "On the plate", "On the platter". The
   * reference uses the form rather than a generic word, because the
   * form is part of what the reader is being told.
   */
  ingredientHeading?: string;
}

/**
 * A visible ingredient overview, placed near the introduction.
 *
 * The reference design shows the dish's representative ingredients as
 * cards a reader can see immediately — no hover, no accordion, no
 * hotspot hunt — each card opening the detailed ingredient explorer.
 *
 * This is a PRESENTATION of the dish's existing ingredient rows, not a
 * second content model: the same `DishIngredient` records the page
 * already lists, rendered as cards. Nothing is invented here and no
 * ingredient is added.
 *
 * The copy is deliberately bounded: a dish's ingredient list varies by
 * style and by cook, so the cards say "a representative preparation"
 * rather than "the ingredients".
 */
export function DishIngredientOverview({
  dishName,
  ingredients,
  explorerId = "ingredients-heading",
  ingredientHeading = "In the bowl",
}: DishIngredientOverviewProps) {
  if (ingredients.length === 0) return null;

  return (
    <section className="dio" aria-labelledby="dio-heading">
      <div className="dio__head">
        <h2 className="dio__title" id="dio-heading">
          {ingredientHeading}
        </h2>
        <p className="dio__sub">
          A representative preparation of {dishName}. Ingredients vary by style
          and by cook.
        </p>
      </div>

      <ul className="dio__grid">
        {ingredients.map((ing) => (
          <li className="dio__card" key={ing.ingredientId}>
            <a
              className="dio__link"
              href={authoringHref(`/ingredients/${ing.slug}`)}
            >
              <span className="dio__name">{ing.name}</span>
              {ing.preparationNote && (
                <span className="dio__note">{ing.preparationNote}</span>
              )}
              {ing.isOptional && (
                <span className="dio__optional">optional</span>
              )}
              <span className="dio__arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p className="dio__more">
        <a href={`#${explorerId}`}>See the full ingredient list</a>
      </p>
    </section>
  );
}

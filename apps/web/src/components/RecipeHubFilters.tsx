import { useState } from "react";
import type { RecipeSummary } from "../lib/recipes";
import { listDishRecipes } from "../lib/recipes";

/**
 * The hub's filter toolbar and its recipe list.
 *
 * WHY THIS IS AN ISLAND
 * ---------------------
 * The hub is a STATIC page (SSG), so a `?content_type=` link cannot
 * filter it: the HTML is already baked, and the query string is not part
 * of the file. A link that looks like a filter and does nothing is worse
 * than no filter — it teaches the reader that the page lies.
 *
 * So the filtering happens in the browser, against the same API the page
 * was built from: `GET /api/dishes/:slug/recipes?content_type=…`.
 *
 * THE FETCH IS ON DEMAND, NOT ON MOUNT
 * ------------------------------------
 * The island fetches nothing until a chip is clicked. That matters for
 * two reasons:
 *
 *   1. A page that fetches on mount makes a request for a page the
 *      reader may never interact with — and it fails loudly when the
 *      API is not behind the static site (a local preview, a screenshot
 *      harness), which shows up as a console error on a page that is
 *      otherwise perfect.
 *   2. The server-rendered list IS the initial state. Astro SSRs the
 *      island, so the list is in the static HTML and a crawler sees the
 *      recipes without running any JavaScript.
 *
 * WHICH FILTERS EXIST
 * -------------------
 * `content_type` is the only facet the item-4 hub endpoint accepts. The
 * time / region / diet filters ADR-007-A1 §5.1 names are NOT here,
 * because the API does not expose the fields they would filter on. The
 * page says so in prose rather than offering controls that cannot work.
 */

export interface RecipeHubFiltersProps {
  /** The dish whose recipes are listed. */
  slug: string;
  /** The recipes, as the server rendered them. */
  initialRecipes: RecipeSummary[];
  /** The TOTAL that matched — not the page's length. */
  initialTotal: number;
  /** The content types offered as filters. */
  contentTypes: { value: string; label: string }[];
}

export function RecipeHubFilters({
  slug,
  initialRecipes,
  initialTotal,
  contentTypes,
}: RecipeHubFiltersProps) {
  const [active, setActive] = useState("");
  const [recipes, setRecipes] = useState<RecipeSummary[]>(initialRecipes);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function select(value: string) {
    if (value === active) return;
    setActive(value);
    setLoading(true);
    setFailed(null);
    try {
      const res = await listDishRecipes(slug, {
        ...(value
          ? { contentType: value as RecipeSummary["contentType"] }
          : {}),
        limit: 100,
      });
      setRecipes(res.recipes);
      setTotal(res.total);
    } catch (err) {
      // The previously shown list stays on the page, and the failure is
      // stated — a filter that silently does nothing is worse than one
      // that says it failed.
      setFailed(
        err instanceof Error ? err.message : "The filter could not be applied.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="recipe-hub__filters">
      <div
        className="recipe-hub__toolbar"
        role="group"
        aria-label="Filter recipes"
      >
        <span className="recipe-hub__toolbarlabel">Kind</span>
        {contentTypes.map((ct) => {
          const isActive = ct.value === active;
          return (
            <button
              key={ct.value || "all"}
              type="button"
              className="recipe-hub__chip"
              aria-current={isActive ? "true" : undefined}
              disabled={loading}
              onClick={() => {
                void select(ct.value);
              }}
            >
              {ct.label}
            </button>
          );
        })}
      </div>

      {failed && (
        <p className="recipe-hub__filtererror" role="status">
          {failed}
        </p>
      )}

      <p className="recipe-hub__count" aria-live="polite">
        <b>{total}</b>{" "}
        <span>{total === 1 ? "published recipe" : "published recipes"}</span>
      </p>

      <ul className="recipe-hub__list">
        {recipes.map((r) => (
          <li className="recipe-hub__card" key={r.id}>
            <a href={`/recipes/${r.slug}`} className="recipe-hub__cardlink">
              <span className="recipe-hub__cardtitle">{r.title}</span>
              <span className="recipe-hub__cardmeta">
                {r.contentType !== "recipe" && (
                  <span className="recipe-hub__kind">{r.contentType}</span>
                )}
                {r.servings != null && (
                  <span className="recipe-hub__fact">serves {r.servings}</span>
                )}
                {r.prepMinutes != null && (
                  <span className="recipe-hub__fact">
                    prep {r.prepMinutes} min
                  </span>
                )}
                {r.cookMinutes != null && (
                  <span className="recipe-hub__fact">
                    cook {r.cookMinutes} min
                  </span>
                )}
                {r.confidence && (
                  <span
                    className={`recipe-hub__confidence recipe-hub__confidence--${r.confidence}`}
                  >
                    {r.confidence} confidence
                  </span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RecipeHubFilters;

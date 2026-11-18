/**
 * THE CONTENT SECTIONS — the dish page, in the mockup's order.
 *
 * WHY THIS IS A SEPARATE COMPONENT FROM `DishDetail`
 *
 * Because the blueprint's dish page reads in ONE order:
 *
 *     Where it belongs → History → Connections → Variants →
 *     Ingredients + Recipes → Sources
 *
 * and "Where it belongs" is the map, which is its own lazy island. If
 * the overview island (`DishDetail`) also owned the sections that come
 * AFTER the map, the map would have to be inside it — and then the map
 * would ship in the overview's JavaScript bundle instead of being
 * fetched when it scrolls into view.
 *
 * So the two are split by what they are, not by where they sit:
 *
 *   - `DishDetail` is the OVERVIEW island: cover, breadcrumb, title,
 *     the facts table, the section nav. It hydrates on load.
 *   - `DishContentSections` is the BODY: the sections, rendered to
 *     static HTML by the server. It costs no JavaScript at all.
 *   - the map stays its own `client:visible` island, between them.
 *
 * The page assembles them in the order the blueprint sets out.
 *
 * WHY THE SECTIONS ARE STATIC
 *
 * Because a section that claims something has to be the same for every
 * reader, and a section that needs no JavaScript cannot be half-loaded
 * when a reader arrives. Everything here renders on the server from the
 * data the build already fetched.
 */

import type { DishJourneyBeat, DishJourneyMovement } from "../lib/api";
import type { RelationLike } from "../lib/dishConnections";
import {
  buildConnectionColumns,
  populatedColumns,
} from "../lib/dishConnections";
import { DISH_SECTION_IDS } from "../lib/dishSections";
import type { RecipeSummary } from "../lib/recipes";
import type {
  DishCategory,
  DishCitation,
  DishDetailCore,
  DishIngredient,
  DishPreparation,
  DishVariant,
} from "../types/dish";
import { DishConnections } from "./DishConnections";
import { DishHistory } from "./DishHistory";
import { DishRecipesBlock } from "./DishRecipesBlock";

export interface DishContentSectionsProps {
  dish: DishDetailCore;
  /** The dish's relations, grouped by kind. */
  relations?: RelationLike[] | null;
  variants?: DishVariant[];
  preparations?: DishPreparation[];
  ingredients?: DishIngredient[];
  sources?: DishCitation[];
  categories?: DishCategory[];
  recipes?: RecipeSummary[];
  journeyBeats?: DishJourneyBeat[];
  journeyMovements?: DishJourneyMovement[];
  /** The journey's state: `history`, `gap` or `unavailable`. */
  journeyStatus?: "history" | "gap" | "unavailable";
  /** True when the dish is published but its claims are not evidenced. */
  unevidenced?: boolean;
}

export function DishContentSections({
  dish,
  relations = null,
  variants = [],
  preparations = [],
  ingredients = [],
  sources = [],
  recipes = [],
  journeyBeats = [],
  journeyStatus = "gap",
  unevidenced = false,
}: DishContentSectionsProps) {
  // ── History ─────────────────────────────────────────────────────────────
  //
  // The journey beats, as claim rows. A beat with no source still gets a
  // row, and the row carries an Unverified chip — because a claim that
  // nobody has checked must not appear, but a reader looking for the
  // history must be told that it is missing and why.
  const hasHistory = journeyStatus === "history" && journeyBeats.length > 0;

  // ── Connections ─────────────────────────────────────────────────────────
  const connectionColumns = relations
    ? populatedColumns(buildConnectionColumns(relations))
    : [];

  // ── Variants ────────────────────────────────────────────────────────────
  const hasVariants = variants.length > 0;

  // ── Ingredients + Recipes ───────────────────────────────────────────────
  const hasIngredients = ingredients.length > 0;

  // ── Sources ─────────────────────────────────────────────────────────────
  const hasSources = sources.length > 0;

  return (
    <>
      {/* ─── History ──────────────────────────────────────────────────── */}
      <section className="dish-content__section dish-history-block">
        <DishHistory
          dishName={dish.name}
          beats={journeyBeats}
          empty={!hasHistory}
        />
      </section>

      {/* ─── Connections ──────────────────────────────────────────────── */}
      {connectionColumns.length > 0 && (
        <section
          className="dish-content__section dish-connections-block"
          aria-labelledby={DISH_SECTION_IDS.connections}
        >
          <h2 id={DISH_SECTION_IDS.connections}>Connections</h2>
          <p className="dish-connections-block__lede">
            Each column is a different kind of relationship. A likeness is not a
            shared history, and a family is a classification rather than a link
            between two dishes.
          </p>
          <DishConnections columns={connectionColumns} dishName={dish.name} />
        </section>
      )}

      {/* ─── Variants ─────────────────────────────────────────────────── */}
      {hasVariants && (
        <section
          className="dish-content__section dish-variants-block"
          aria-labelledby={DISH_SECTION_IDS.variants}
        >
          <h2 id={DISH_SECTION_IDS.variants}>Variants</h2>
          <p className="dish-variants-block__lede">
            Named forms of the same dish, told differently across regions and
            traditions.
          </p>
          <div className="world-list">
            {variants.map((v) => (
              <a key={v.id} href={`/dishes/${v.slug}`} className="world-item">
                <span className="pin" />
                <span className="wnm">{v.name}</span>
                <span className="wrg">
                  {v.creatorName ?? v.description ?? ""}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ─── Ingredients + Recipes, side by side ─────────────────────── */}
      {/* The mockup puts these two headings in ONE horizontal row. The
          grid does it: the two sections are siblings in a two-column
          grid, and on a narrow screen they stack. */}
      <div className="dish-content__pair">
        {hasIngredients && (
          <section
            className="dish-content__section dish-ingredients-block"
            aria-labelledby={DISH_SECTION_IDS.ingredients}
          >
            <h2 id={DISH_SECTION_IDS.ingredients}>Ingredients</h2>
            <div className="ing-list">
              {ingredients.map((ing) => (
                <div className="ing" key={ing.ingredientId}>
                  <span className="qty">
                    {ing.quantity ?? ""}
                    {ing.quantity ? " " : ""}
                    {ing.name}
                  </span>
                </div>
              ))}
            </div>

            {preparations.length > 0 && (
              <>
                <h3 className="col-h col-h--sub">Prepared components</h3>
                <div className="ing-list">
                  {preparations.map((p) => (
                    <div className="ing" key={p.id}>
                      <span className="qty">{p.methodName}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <section
          className="dish-content__section dish-recipes-block"
          aria-labelledby={DISH_SECTION_IDS.recipes}
        >
          <h2 id={DISH_SECTION_IDS.recipes}>Recipes</h2>
          <DishRecipesBlock recipes={recipes} dishName={dish.name} />
        </section>
      </div>

      {/* ─── Sources ──────────────────────────────────────────────────── */}
      {hasSources && (
        <section
          className="dish-content__section dish-sources-block"
          aria-labelledby={DISH_SECTION_IDS.sources}
        >
          <h2 id={DISH_SECTION_IDS.sources}>Sources</h2>
          <ol className="src-list">
            {sources.map((s) => (
              <li key={s.id} className="src">
                <span className="src__title">
                  {s.title ?? s.citationText ?? s.sourceType}
                </span>
                {s.url && (
                  <a className="src__link" href={s.url}>
                    {s.url}
                  </a>
                )}
                {s.claimText && (
                  <span className="src__note">Supports: {s.claimText}</span>
                )}
              </li>
            ))}
          </ol>
          {unevidenced && (
            <p className="dish-sources-block__note">
              Claims with no source attached stay marked Unverified until a
              cookbook, archival or scholarly record is attached.
            </p>
          )}
        </section>
      )}
    </>
  );
}

export default DishContentSections;

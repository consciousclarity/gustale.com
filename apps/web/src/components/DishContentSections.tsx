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
import { preparedComponents } from "../lib/preparedComponents";
import { sourceTierWords } from "../lib/sourceTier";
import type { RecipeSummary } from "../lib/recipes";
import type {
  DishCategory,
  DishCitation,
  DishDetailCore,
  DishIngredient,
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

  // The PREPARED COMPONENTS: the ingredients that are themselves made.
  // See lib/preparedComponents.ts for why this is not the preparation
  // method.
  const components = preparedComponents(ingredients);

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
      {/*
        THE VARIANTS SECTION, WITH ITS EMPTY STATE (D21-11).

        The section used to render ONLY when the dish had variants. A
        dish with none simply had no Variants heading at all, so a
        reader could not tell whether the site had no variants for
        this dish or had not looked.

        The brief asks for "a section with an empty state", and
        ATLAS_STYLE is the reason: "The facts table never pads. An
        empty row shows 'No evidence' ... That is an honest state, so
        don't fill a row just to avoid it." A section that vanishes is
        the same failure in a different costume -- the reader is left
        guessing.

        So the section always renders, and when there is nothing in it
        it says so in the site's own words.
      */}
      <section
        className="dish-content__section dish-variants-block"
        aria-labelledby={DISH_SECTION_IDS.variants}
      >
        <h2 id={DISH_SECTION_IDS.variants}>Variants</h2>
        {hasVariants ? (
          <>
            <p className="dish-variants-block__lede">
              Named forms of the same dish, told differently across regions and
              traditions.
            </p>
            <div className="world-list">
              {variants.map((v) => (
                <a
                  key={v.id}
                  href={`/dishes/${v.slug}`}
                  className="world-item"
                >
                  <span className="pin" />
                  <span className="wnm">{v.name}</span>
                  <span className="wrg">
                    {v.creatorName ?? v.description ?? ""}
                  </span>
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="dish-variants-block__empty">
            No variants recorded yet.
          </p>
        )}
      </section>

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
            {/*
                THE INGREDIENT LIST: NO QUANTITIES (D21-10).

                The brief asks for "no quantities, and prepared
                components listed once". The list used to print the
                quantity -- "4 medium Eggplant" -- which turns an
                ingredient list into half a recipe. The site has a
                Recipes section for the recipe; an ingredient list that
                carries quantities invites the reader to treat the
                encyclopedia page as the recipe, and the two are
                different things.

                A quantity that is not a quantity is also dropped: the
                API carries a `quantity` column that sometimes holds a
                UNIT rather than a count ("medium"), and "medium
                Eggplant" is not an ingredient either. The name is
                the ingredient; everything else belongs to the recipe.
            */}
            <div className="ing-list">
              {ingredients.map((ing) => (
                <div className="ing" key={ing.ingredientId}>
                  <span className="qty">{ing.name}</span>
                </div>
              ))}
            </div>

            {/*
                PREPARED COMPONENTS, NOT THE PREPARATION METHOD.

                This list used to be fed the preparation rows, so it
                printed the METHOD -- "Fried & topped" -- under a
                heading that promises components. A method is how the
                dish is cooked; a component is something the dish is
                built FROM that is itself made. The béchamel in a
                moussaka is a component; it was in the ingredient list
                and nowhere else, and the component list was showing
                the wrong kind of thing entirely.

                The METHOD now goes into the Technique row of the facts
                table, which is where a technique belongs.
            */}
            {components.length > 0 && (
              <>
                <h3 className="col-h col-h--sub">Prepared components</h3>
                <div className="ing-list">
                  {components.map((c) => (
                    <div className="ing" key={c.ingredientId}>
                      <span className="qty">
                        {c.quantity ?? ""}
                        {c.quantity ? " " : ""}
                        {c.name}
                      </span>
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
      {/*
        THE SOURCES SECTION ALWAYS RENDERS.

        The same rule as the Variants section, and for the same
        reason: a dish with NO sources is the single most important
        gap on the page, and it was the one gap that vanished
        instead of being shown. A reader who cannot see that a
        dish has no sources will read the page's other claims as
        sourced.

        So the heading is always there, and an unsourced dish says
        so in the site's own words.
      */}
      <section
        className="dish-content__section dish-sources-block"
        aria-labelledby={DISH_SECTION_IDS.sources}
      >
        <h2 id={DISH_SECTION_IDS.sources}>Sources</h2>
        {hasSources ? (
          <>
          <ol className="src-list">
            {sources.map((s) => (
              <li key={s.id} className="src">
                {/*
                    THE TIER, IN PUBLIC WORDS (D21-12).

                    The brief: "show each source's tier in public
                    words. A Wikipedia entry reads 'Reference ·
                    supports the definition only'."

                    The tier is shown BEFORE the source's title,
                    because the tier is what the reader needs in
                    order to read the title: it says what kind of
                    document this is, and therefore how much the
                    citation is worth.
                */}
                <span className="src__tier">{sourceTierWords(s.sourceClass)}</span>
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
          {/*
              THE NOTE BELOW THE LIST.

              The brief asks for exactly this line, below the list:
              "Claims without a qualifying source show as Unverified."

              It is shown ALWAYS, not only for an unevidenced dish.
              It is the reader's key to the rest of the page: it
              tells them what the word "Unverified" means when they
              meet it on a facts row or an association. Leaving it
              off the other pages makes it a note about this one
              dish rather than an explanation of the site's
              vocabulary.
          */}
          <p className="dish-sources-block__note">
            Claims without a qualifying source show as Unverified.
          </p>
          </>
        ) : (
          <p className="dish-sources-block__empty">
            No sources recorded yet.
          </p>
        )}
      </section>
    </>
  );
}

export default DishContentSections;

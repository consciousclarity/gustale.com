/**
 * Grouping the dish relations into the mockup's three columns — WP-C2.
 *
 * WHY THIS IS PURE
 *
 * Because the three columns make DIFFERENT CLAIMS, and a claim is
 * where this project is most careful. The columns are:
 *
 *   Resembles     — a likeness. No history is implied.
 *   Influenced by — directional. This dish came out of that one.
 *   Same family   — taxonomic. A classification, not an ancestry.
 *
 * Getting these wrong means saying a dish was influenced by something
 * it merely resembles, or that a cousin dish is a member of the same
 * family. So the mapping is data, it is one function, and it is tested
 * — not scattered through a component.
 *
 * THE DIRECTION RULE
 *
 * `ancestor` says "the other dish came first, and this one came out of
 * it". So it belongs in "Influenced by". `descendant` says the exact
 * opposite — this dish came first — so it belongs in an "Influenced"
 * column, not an "Influenced by" one, and there is no such column here.
 *
 * The inverse is the whole point. Reading `descendant` as "Influenced
 * by" would reverse the claim, which is the kind of error a reader
 * cannot detect on their own.
 */

import {
  connectionColumnFor,
  DISH_CONNECTION_COLUMNS,
  type DishConnectionColumnKey,
  type DishConnectionEntry,
} from "./dishSections.ts";

/** One relation, as the API returns it. */
export interface RelationLike {
  slug: string;
  name: string;
  shortDescription?: string | null;
  countryName?: string | null;
  isoCode?: string | null;
  relationType: string;
  reason?: string | null;
  strength?: number;
}

/** The three columns, each with its entries. */
export type DishConnectionColumns = Record<
  DishConnectionColumnKey,
  DishConnectionEntry[]
>;

/**
 * Group the relations into the three columns.
 *
 * A relation that no column means is DROPPED — not shown in a column
 * that does not describe it. `shared-ingredient`, `shared-method`,
 * `similar-serving`, `diaspora` and `descendant` are all real
 * relations, and dropping them loses nothing: they are not what the
 * mockup's three columns assert.
 *
 * Within a column the order is the API's — which sorts by strength,
 * strongest first. A stronger relation is the one an editor judged to
 * matter more, so it should lead.
 */
export function buildConnectionColumns(
  relations: RelationLike[],
): DishConnectionColumns {
  const columns: DishConnectionColumns = {
    resembles: [],
    influencedBy: [],
    sameFamily: [],
  };

  for (const relation of relations) {
    const column = connectionColumnFor(relation.relationType);
    if (!column) continue;

    columns[column].push({
      slug: relation.slug,
      name: relation.name,
      reason: relation.reason ?? undefined,
      placeName: relation.countryName ?? undefined,
      placeIso: relation.isoCode ?? undefined,
      description: relation.shortDescription ?? undefined,
    });
  }

  return columns;
}

/**
 * Whether any column has an entry.
 *
 * The section is rendered when there is something to show. A page with
 * three empty columns is three empty headings, which reads as a broken
 * page rather than as an honest absence.
 */
export function hasConnections(columns: DishConnectionColumns): boolean {
  return DISH_CONNECTION_COLUMNS.some((c) => columns[c.key].length > 0);
}

/**
 * ALL THREE COLUMNS, in the mockup's order (D21-11).
 *
 * This used to return only the columns that had entries, and the whole
 * section was then skipped when none of them did. The blueprint
 * reverses that:
 *
 *   "The dish page always shows Variants and the three Connections
 *   columns (Resembles · Influenced by · Same family), each with a
 *   short empty state when it has no data."
 *
 * The reasoning is the same one the Variants section uses, and it is
 * the site's rule: a section that vanishes leaves the reader unable to
 * tell whether the site has no connections for this dish or has not
 * looked. An empty state answers that; a missing section does not.
 *
 * The three columns are kept together for a second reason. They make
 * DIFFERENT claims, and a reader who sees only "Resembles" cannot tell
 * whether the site looked and found no likeness, or whether there is
 * no such thing as a likeness for this dish. Showing all three, each
 * saying what it has, is what makes the difference between them
 * legible.
 *
 * The order is the mockup's, and it is fixed.
 */
export function allColumns(columns: DishConnectionColumns): Array<{
  key: DishConnectionColumnKey;
  label: string;
  mark: string;
  entries: DishConnectionEntry[];
}> {
  return DISH_CONNECTION_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    mark: c.mark,
    entries: columns[c.key],
  }));
}

/**
 * The columns that have entries, in the mockup's order.
 *
 * Kept for the places that still want "only what has something in it" —
 * the key block, and anything that must not print an empty column.
 * The dish page itself uses `allColumns`.
 */
export function populatedColumns(columns: DishConnectionColumns): Array<{
  key: DishConnectionColumnKey;
  label: string;
  mark: string;
  entries: DishConnectionEntry[];
}> {
  return DISH_CONNECTION_COLUMNS.filter((c) => columns[c.key].length > 0).map(
    (c) => ({
      key: c.key,
      label: c.label,
      mark: c.mark,
      entries: columns[c.key],
    }),
  );
}

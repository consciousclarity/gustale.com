/**
 * Building the facts table from what the API returned — WP-C2.
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * Because the table is where the page makes CLAIMS about a dish, and a
 * claim that is not backed by data is the failure mode this whole
 * project cares about. So the mapping from the API's response to the
 * table's rows is pure data-in/data-out, with no JSX, and is tested
 * directly.
 *
 * THE RULE
 *
 * Every value comes from the response. Nothing is inferred, nothing is
 * defaulted to a plausible answer, and nothing is invented to fill a
 * row. Where the dish has no value for a fact, the row says "No
 * evidence" — which is a statement about the RECORD, not about the
 * dish.
 *
 * That last distinction is the one that matters. "No evidence" says
 * we looked and found no source. It does not say the dish has no
 * serving context, and it does not say the dish is served only at
 * home. The row is about the encyclopedia's state, and the wording
 * keeps it that way.
 */

import {
  DISH_FACT_KEYS,
  DISH_FACT_LABELS,
  DISH_FACT_MISSING,
  type DishFactKey,
  type DishFactRow,
} from "./dishSections.ts";

/** One dimension from the API's `dimensions` array. */
export interface DishDimension {
  vocabulary: string;
  valueId: string;
  slug: string;
  name: string;
  isPrimary: boolean;
}

/** One name from the API's `names` array (ADR-003 layer 2). */
export interface DishName {
  language: string;
  script: string | null;
  name: string;
  kind: string;
  isPrimary: boolean;
}

/** A place association, as the atlas returns it. */
export interface DishPlaceAssociation {
  slug?: string;
  name: string;
  /** The kind of association — "established tradition", "documentation", … */
  relationship?: string;
  /** The evidence status of the association. */
  status?: string;
}

/**
 * The vocabulary names the facts table reads.
 *
 * These are the API's own vocabulary keys. A dimension the dish does
 * not have simply does not appear in `dimensions`, so the mapping is a
 * lookup rather than a default.
 */
const FACT_VOCABULARY: Partial<Record<DishFactKey, string>> = {
  family: "family",
  servedAs: "serving",
  technique: "technique",
};

/**
 * The path a dimension's value links to, when it has a page.
 *
 * A family is a page (`/families/<slug>`); a technique and a serving
 * context are vocabulary values with no page of their own yet, so they
 * are plain text. Linking to a page that does not exist would be a
 * dead end, and the nav rule — "every link must reach real content" —
 * applies to the facts table too.
 */
function dimensionHref(
  fact: DishFactKey,
  dimension: DishDimension,
): string | undefined {
  if (fact === "family") {
    return `/families/${dimension.slug}`;
  }
  return undefined;
}

/**
 * The relationship kinds, in the words a reader would use.
 *
 * The API stores a machine key ("established_tradition"). The facts
 * table is prose, so the key is spelled out here rather than shown raw.
 *
 * "legacy_unreviewed" is the MIGRATION'S OWN label, not a claim that
 * the dish has an "unreviewed" relationship. It means: this row came
 * from the old places & traditions list and no source supports it yet.
 * So it reads as "Unverified association" — which is what the row
 * actually is — and the evidence badge beside it says the same thing.
 *
 * A key this table does not know is passed through unchanged, so a new
 * kind is visible on the page rather than silently dropped.
 */
const RELATIONSHIP_LABELS: Record<string, string> = {
  historical_emergence: "Historical emergence",
  established_tradition: "Established tradition",
  earliest_documentation: "Earliest documentation",
  regional_adaptation: "Regional adaptation",
  later_introduction: "Later introduction",
  legacy_unreviewed: "Unverified association",
};

export function relationshipLabel(relationship?: string): string | undefined {
  if (!relationship) return undefined;
  const known = RELATIONSHIP_LABELS[relationship];
  if (known) return known;
  // An unknown kind: humanise it rather than hide it.
  return relationship.replace(/_/g, " ");
}

/**
 * The "also called" names.
 *
 * A name is excluded when it is the SAME string as the dish's own
 * canonical name — "Moussaka; Moussaka" is noise. The result keeps the
 * order the API returned, so the primary name comes first.
 */
export function alsoCalledNames(
  names: DishName[],
  canonicalName: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const n of names) {
    const value = n.name?.trim();
    if (!value) continue;
    if (value.toLowerCase() === canonicalName.trim().toLowerCase()) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

/**
 * The primary dimension for a vocabulary.
 *
 * The API marks one value per vocabulary as primary. When several are
 * primary (data drift), the first wins — the order is stable, so the
 * rendering is stable too.
 */
export function primaryDimension(
  dimensions: DishDimension[],
  vocabulary: string,
): DishDimension | undefined {
  return dimensions.find((d) => d.vocabulary === vocabulary && d.isPrimary);
}

/**
 * Build the facts table.
 *
 * `associatedWith` is the one row that needs more than a dimension: it
 * is the place the dish belongs to, with the kind of association and
 * its evidence state. The places come from the atlas associations.
 */
export function buildDishFacts(input: {
  canonicalName: string;
  dimensions: DishDimension[];
  names: DishName[];
  places: DishPlaceAssociation[];
  /** The evidence status of the whole dish, when it is unevidenced. */
  unevidenced?: boolean;
  /**
   * The preparation METHODS of the dish ("Fried & topped").
   *
   * A method is a TECHNIQUE, and the Technique row is where a technique
   * belongs. It used to be printed under the heading "Prepared
   * components", which promised something else entirely -- and the
   * components (the béchamel) were nowhere to be seen.
   */
  preparations?: { methodName: string }[];
}): DishFactRow[] {
  const rows: DishFactRow[] = [];

  for (const key of DISH_FACT_KEYS) {
    const label = DISH_FACT_LABELS[key];

    if (key === "associatedWith") {
      const place = input.places[0];
      if (!place) {
        rows.push({ key, label, value: DISH_FACT_MISSING });
        continue;
      }
      // The place name, the kind of association, and the evidence state.
      // The relation is the reason the dish belongs there, so it is
      // part of the value rather than a separate fact.
      const parts = [place.name];
      const kind = relationshipLabel(place.relationship);
      if (kind) parts.push(kind);
      rows.push({
        key,
        label,
        value: parts.join(" · "),
        href: place.slug ? `/place/${place.slug}` : undefined,
        evidence: place.status
          ? place.status.charAt(0).toUpperCase() + place.status.slice(1)
          : undefined,
      });
      continue;
    }

    if (key === "alsoCalled") {
      const also = alsoCalledNames(input.names, input.canonicalName);
      if (also.length === 0) {
        rows.push({ key, label, value: DISH_FACT_MISSING });
        continue;
      }
      rows.push({ key, label, value: also.join(", ") });
      continue;
    }

    const vocabulary = FACT_VOCABULARY[key];
    if (!vocabulary) continue;

    // The technique row carries the dish's TECHNIQUE.
    //
    // It used to carry TWO things: the vocabulary dimension ("Frying")
    // and the preparation method ("Fried & topped"). The brief calls
    // that out -- "Clean up the technique row: it shows 'Frying,
    // Fried & topped', the same thing twice."
    //
    // They ARE the same thing. "Frying" is the controlled vocabulary
    // for how the dish is cooked; "Fried & topped" is the name the
    // preparation step carries, and it names the same cooking step in
    // the site's own words. Printing both says it twice.
    //
    // The vocabulary value WINS, for two reasons. It is the
    // controlled term, so it is the one that is consistent across
    // dishes and the one the Atlas filters on. And the preparation
    // method is only a fallback: a dish with a preparation but no
    // recorded technique dimension still has a technique, and saying
    // so is better than saying "No evidence".
    //
    // A missing fact and a fact that was checked and found unset are
    // different things to a reader, so the row is always present.
    if (key === "technique") {
      const dimension = primaryDimension(input.dimensions, vocabulary);
      const methods = (input.preparations ?? [])
        .map((p) => p.methodName?.trim())
        .filter((n): n is string => Boolean(n));
      const parts: string[] = [];
      if (dimension) {
        parts.push(dimension.name);
      } else {
        // No recorded technique dimension -- fall back to the
        // preparation method, but only if it does not already say
        // the same thing as another method.
        for (const method of methods) {
          if (!parts.includes(method)) parts.push(method);
        }
      }
      if (parts.length === 0) {
        rows.push({ key, label, value: DISH_FACT_MISSING });
        continue;
      }
      rows.push({
        key,
        label,
        value: parts.join(", "),
        href: dimension ? dimensionHref(key, dimension) : undefined,
      });
      continue;
    }

    const dimension = primaryDimension(input.dimensions, vocabulary);
    if (!dimension) {
      rows.push({ key, label, value: DISH_FACT_MISSING });
      continue;
    }
    rows.push({
      key,
      label,
      value: dimension.name,
      href: dimensionHref(key, dimension),
    });
  }

  return rows;
}

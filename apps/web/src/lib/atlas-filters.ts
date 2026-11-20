/**
 * THE ATLAS'S FILTER — the state, the URL, and the one hard rule.
 *
 * This lives in `lib/` rather than in the island component because it
 * is the part of the atlas with a RULE in it, and a rule that lives in
 * a component can only be checked by clicking it.
 *
 * THE RULE
 * --------
 * The blueprint's WP-C3 says "Stop drawing relation type `family`".
 * On the live data `family` is 47 of the 82 connections — nearly
 * three fifths of every edge on the map — and the relationship grammar
 * has since dissolved it: "same family" said that two dishes resemble
 * each other, which is what `likeness` now says.
 *
 * "Stop drawing" is not "off by default". A URL parameter is enough to
 * bring a retired relationship type back onto the map, so the
 * exclusion is applied to EVERY kind set, whatever produced it: the
 * default, the URL, and a reader's click.
 *
 * That is why this module exists: the rule lives in ONE place, every
 * path into the state goes through it, and a test can prove it.
 */

import {
  RELATIONSHIP_KINDS,
  type RelationshipKind,
} from "./relationship-grammar.ts";

/**
 * The kind the atlas never draws.
 *
 * `family` -- the relationship the grammar has dissolved.
 */
export const NEVER_DRAWN: RelationshipKind = "family";

/**
 * The kinds the atlas draws when the reader says nothing.
 *
 * The whole grammar minus the one that is never drawn.
 */
export const DEFAULT_KINDS: RelationshipKind[] = RELATIONSHIP_KINDS.filter(
  (k) => k !== NEVER_DRAWN,
);

/**
 * The query-string parameters the filter uses.
 *
 * Named here so the test can assert that a parameter the island reads
 * is a parameter the module declares -- a filter that is written to
 * the URL but not declared here would be silently untested.
 */
export const ATLAS_FILTER_PARAMS = [
  "q",
  "family",
  "technique",
  "course",
  "kinds",
] as const;

export interface AtlasFilterState {
  /** The free-text query: a dish's name, its description, its place. */
  q: string;
  /** The dish's food family -- a facet slug. */
  family: string;
  /** The technique the dish is made with -- a facet slug. */
  technique: string;
  /** Where the dish sits in a meal -- a facet slug. */
  course: string;
  /** The relationship kinds the map draws. */
  kinds: Set<RelationshipKind>;
}

/**
 * The kinds a set may actually draw.
 *
 * `family` is removed here, and only here: every kind set in the
 * atlas -- the default, the URL's, a reader's click -- is passed
 * through this, so none of them can carry it.
 */
export function drawableKinds(
  kinds: Iterable<RelationshipKind>,
): Set<RelationshipKind> {
  return new Set([...kinds].filter((k) => k !== NEVER_DRAWN));
}

/**
 * Read the filter out of the URL.
 *
 * An unknown kind in the URL is IGNORED, not honoured: the URL is
 * reader-editable, and a kind the grammar does not have would draw a
 * layer that does not exist.
 */
export function readAtlasFilters(search: string): AtlasFilterState {
  const params = new URLSearchParams(search);
  const rawKinds = params.get("kinds");
  const kinds = new Set<RelationshipKind>();
  if (rawKinds === null) {
    for (const k of DEFAULT_KINDS) kinds.add(k);
  } else {
    for (const part of rawKinds.split(",")) {
      const k = part.trim() as RelationshipKind;
      // A kind the grammar does not have is ignored, and so is one the
      // atlas never draws -- `?kinds=family` must not bring `family`
      // back to the map.
      if (RELATIONSHIP_KINDS.includes(k) && k !== NEVER_DRAWN) kinds.add(k);
    }
  }

  return {
    q: params.get("q") ?? "",
    family: params.get("family") ?? "",
    technique: params.get("technique") ?? "",
    course: params.get("course") ?? "",
    kinds,
  };
}

/**
 * Write the filter back to the URL.
 *
 * The kinds are written in the grammar's own order, so the same
 * filter always produces the same URL -- which matters for caching
 * and for the back button.
 *
 * `family` is never written, even if it is in the set: the URL must
 * not be able to name a kind the map will not draw.
 */
export function writeAtlasFilters(filters: AtlasFilterState): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.family) params.set("family", filters.family);
  if (filters.technique) params.set("technique", filters.technique);
  if (filters.course) params.set("course", filters.course);

  const kinds = RELATIONSHIP_KINDS.filter(
    (k) => filters.kinds.has(k) && k !== NEVER_DRAWN,
  );
  if (kinds.length > 0) params.set("kinds", kinds.join(","));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

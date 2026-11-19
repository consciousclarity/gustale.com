/**
 * The ONE public sentence for an association.
 *
 * WHY THIS EXISTS
 *
 * An association row in the database carries an `explanation` column. For
 * the legacy import that column holds the DATABASE'S note about how the
 * row got there, written for whoever maintains the table:
 *
 *   "Migrated from the legacy origin_geo_id. This is the Wikidata
 *    'country of origin' value -- DISCOVERY DATA, not a reviewed
 *    historical claim. It is not promoted to historical_emergence
 *    because no qualifying source supports that specific claim. The
 *    original value is preserved in legacy_value."
 *
 *   "Migrated from the legacy dish_cuisines assignment. The cuisine
 *    '<cuisine>' has a matching tradition row '<tradition>'; the
 *    original cuisine value is preserved in legacy_value."
 *
 * That is not a finding about the dish. A reader has no way to know it
 * is an internal note, and it printed on the public page verbatim --
 * including the literal unfilled placeholder tokens `<cuisine>` and
 * `<tradition>`, which appear in the string because the backfill wrote
 * them as templates and nothing ever filled them in.
 *
 * The rule, then, is narrow and mechanical:
 *
 *   THE RELATIONSHIP LABEL + THE EVIDENCE LABEL + ONE PUBLIC SENTENCE.
 *
 * The relationship label says what kind of claim this is. The evidence
 * label says how much is behind it. The sentence says what the
 * association is, in the site's own words, and says NOTHING about where
 * the row came from.
 *
 * The API no longer ships `explanation`, `legacyValue` or `provenance`
 * in the public atlas payload, so this module cannot accidentally render
 * them even if the data still holds them. That is deliberate
 * defence in depth: the check that proves it is
 * `scripts/check-no-internal-text.py`.
 */

/**
 * The sentence for one association.
 *
 * The wording is deliberately the SAME for every relationship type that
 * is not a historical claim. An association records a connection; it
 * does not establish that the dish was invented there (ADR-004 §10),
 * and a place, a tradition and a community are all "associated with"
 * rather than "the origin".
 */
export function publicSentence(association: {
  relationship: string;
  entityKind: "place" | "community";
  name: string | null;
  isoCode?: string | null;
}): string {
  const name = (association.name ?? "").trim();
  const subject = name.length > 0 ? name : "this dish";

  // A community is a people or a practice, NOT a place. "Associated with
  // the Greek cuisine" reads; "Associated with Greece" for a tradition
  // would read as a claim about the country.
  if (association.entityKind === "community") {
    return `Associated with the ${subject}.`;
  }

  return `Associated with ${subject}.`;
}

/**
 * The placeholder tokens that must never reach a rendered page.
 *
 * The legacy backfill wrote `<cuisine>` and `<tradition>` into the
 * `explanation` column as templates. Nothing ever filled them in, so
 * the values were stored -- and published -- literally. A reader saw
 * the angle brackets.
 *
 * This list is the single definition, and the build check imports it, so
 * the check and the renderer can never drift apart.
 */
export const INTERNAL_PLACEHOLDER_TOKENS = [
  "<cuisine>",
  "<tradition>",
] as const;

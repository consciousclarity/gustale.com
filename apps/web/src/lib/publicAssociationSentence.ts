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
 *
 * WHY THIS EXISTS AT ALL
 * ---------------------
 * The page needs ONE sentence per association, and the association's
 * own `explanation` column cannot supply it. That column is the
 * DATABASE'S note about how the row got here -- the legacy import
 * wrote "Migrated from the legacy origin_geo_id. This is the
 * Wikidata 'country of origin' value -- DISCOVERY DATA, not a
 * reviewed historical claim ..." into it -- not a finding about the
 * dish. Printing it read as if the site were unsure what it was
 * talking about, and it printed unfilled placeholder tokens
 * literally.
 *
 * So the page builds its own sentence. But building a sentence from
 * the relationship and the entity ALONE produces a filler:
 *
 *     "Associated with the Greek cuisine."
 *
 * That sentence asserts nothing, and it reads as though it did. The
 * brief calls it out directly: "No generated filler sentence".
 * ATLAS_STYLE §1 is blunter still -- an **Unverified** item is
 * "**Not written as prose.** It stays a gap; the facts row shows
 * 'No evidence'", and "**The facts table never pads.** An empty row
 * shows 'No evidence' ... so don't fill a row just to avoid it."
 *
 * So the rule is: a sentence is only generated when there is
 * something to assert. An association whose evidence status is
 * `unevidenced` has no sourced finding, so it gets the honest empty
 * state instead of a sentence that says nothing. See
 * `NO_EVIDENCE_TEXT`.
 *
 * The brief also asks for "an explanation from its source (<= 25
 * words)". Where a source-backed explanation EXISTS it is shown, and
 * the generated sentence is not used at all -- the explanation is the
 * better text, because it says what the source establishes. The
 * generated sentence is the fallback for an association that has a
 * relationship but no prose, and it is suppressed entirely when the
 * association is unevidenced.
 */
export const NO_EVIDENCE_TEXT = "No evidence";

/**
 * One "place of a related dish" row.
 *
 * `relationLabel` says HOW this dish reaches the place -- it is a
 * relation, not an association of this dish. `dishName` is the
 * related dish, so the row reads "Home of a related dish, musakka."
 */
export interface RelatedPlaceRow {
  key: string;
  place: string;
  relationLabel: string;
  dishName: string;
}

/**
 * THE EVIDENCE STATUSES THAT MAY CARRY PROSE.
 *
 * The database's `evidence_status` enum has exactly four values
 * (`packages/db/src/schema/index.ts`):
 *
 *     unevidenced | research_pending | provisional | evidenced
 *
 * Only `evidenced` is a finding. The other three are the three
 * STAGES BEFORE one:
 *
 *   unevidenced      -- nothing attached. The gap.
 *   research_pending -- research is under way. Not a finding yet.
 *   provisional      -- research concluded provisionally. NOT a finding
 *                       the site may state as one.
 *   evidenced        -- qualifying non-Wikipedia sources are attached.
 *
 * So the rule is an ALLOWLIST, not a blacklist. An earlier version
 * of this function read `status !== "unevidenced"`, which let
 * `research_pending` and `provisional` print prose -- so a claim the
 * site had NOT verified was rendered in the same voice as one it had.
 *
 * A blacklist also fails OPEN: an unknown or missing status would
 * have been allowed through. The rule this function implements is
 * "never state what you cannot show", so it has to fail CLOSED. A
 * status this site does not know is treated as a gap.
 *
 * NOTE ON A SECOND VOCABULARY: the web's `EvidenceLabel.tsx` knows
 * `documented | likely | disputed | unverified`. Those are NOT the
 * values this column carries -- they are the public badge names for a
 * different axis. The badge vocabulary and the stored vocabulary are
 * separate, and only the stored one reaches this function.
 */
const PROSE_CARRYING_EVIDENCE_STATUSES = new Set(["evidenced"]);

/**
 * Whether this association may carry a generated sentence.
 *
 * Only an association with a QUALIFYING evidence status gets prose.
 * Everything else -- a gap, research in progress, a provisional
 * reading, or a status this site does not recognise -- is a gap, and
 * a gap renders as "No evidence".
 */
export function mayCarrySentence(
  evidenceStatus: string | null | undefined,
): boolean {
  if (!evidenceStatus) return false;
  return PROSE_CARRYING_EVIDENCE_STATUSES.has(evidenceStatus);
}

/**
 * The sentence for one association.
 *
 * Returns `null` when the association is unevidenced: there is no
 * finding to state, and the caller renders the empty state instead.
 */
export function publicSentence(association: {
  relationship: string;
  entityKind: "place" | "community";
  name: string | null;
  isoCode?: string | null;
  evidenceStatus?: string;
}): string | null {
  // An absent status is a gap, not a licence. The guard is
  // unconditional: only a qualifying status reaches the prose.
  if (!mayCarrySentence(association.evidenceStatus)) {
    return null;
  }

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

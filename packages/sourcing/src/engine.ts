/**
 * ADR-008 — the sourcing rating engine.
 *
 * ONE PURE FUNCTION (ADR-008 Decision 12):
 *
 *   rateSourcing(recipeLines, availabilityRows, substitutes, country)
 *     → { rating, reasons[] }
 *
 * No I/O, no database access, no network, no filesystem. The inputs are
 * plain data. That is what makes the function testable against
 * synthetic fixtures (Decision 17) and reusable from the API, a CLI and
 * a test.
 *
 * THE RULES, IN THE ORDER THEY ARE EVALUATED
 *
 * 1. Per required ingredient, every RECIPE-COMPATIBLE FORM in the
 *    reader's country is scored on two dimensions — availability and
 *    price — and the form's burden is `max(availability, price)`, never
 *    the sum (Decision 3).
 * 2. The ingredient's burden is the LOWEST burden across its
 *    compatible forms (Decision 3).
 * 3. The recipe result is decided in this order (Decision 4):
 *    Hard → Availability unknown → Moderate → Easy.
 * 4. Optional ingredients are excluded from every step (Decision 3).
 * 5. Substitutes are scored for the country too, and only a
 *    `suitable` substitute with burden < 2 rescues anything
 *    (Decision 5).
 *
 * THE REASONS ARE DATA
 *
 * The engine never writes a sentence. The prose is generated from the
 * structured reasons by templates elsewhere (Decision 12), so every
 * reason carries the ingredient, the form, the country, the cause, the
 * score and — when a substitute was involved — the substitute and its
 * `changeNote`.
 */

import type {
  Availability,
  AvailabilityRow,
  CountryContext,
  IngredientForm,
  PriceBand,
  RateSourcingOptions,
  ReasonCause,
  RecipeLine,
  SourcingRating,
  SourcingReason,
  SourcingResult,
  SourcingSubstitute,
  SubstituteRow,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────
// The score tables (ADR-008 Decision 3)
// ─────────────────────────────────────────────────────────────────────

/**
 * Availability → score.
 *
 * `common` and `occasional` are both 0 ("commonly available in
 * ordinary retail" / "occasional" are both the easy end of the scale
 * the ADR draws); `specialty_only` and `limited` are both 2.
 */
const AVAILABILITY_SCORE: Readonly<Record<Availability, number>> = {
  common: 0,
  occasional: 0,
  seasonal: 1,
  specialty_only: 2,
  limited: 2,
  unavailable: 3,
};

/**
 * Price band → score.
 *
 * `unknown` is NOT here: it is not a score of 0, it is "no usable
 * price" (Decision 3, and Decision 10 for a stale row).
 */
const PRICE_SCORE: Readonly<Record<Exclude<PriceBand, "unknown">, number>> = {
  typical: 0,
  elevated: 1,
  high: 2,
  prohibitive: 3,
};

/**
 * The order forms are preferred in when two of them carry the SAME
 * burden. It changes only WHICH form the reason names — never the
 * burden, never the rating.
 *
 * "Homemade" and "fresh" come first because they are the local
 * explanations a reader can act on ("grate it yourself", "buy it at
 * the market"), and a packaged form is the fallback. ADR-008 Decision
 * 12 asks the explanation to name "the local form that makes something
 * easy".
 */
const FORM_PREFERENCE: readonly IngredientForm[] = [
  "homemade",
  "fresh",
  "frozen",
  "dried",
  "canned_or_packaged",
  "paste_or_concentrate",
  "extract",
];

/**
 * Price data older than this is unknown FOR THE PRICE SCORE
 * (ADR-008 Decision 10). Availability data has no expiry.
 */
const PRICE_MAX_AGE_MONTHS = 12;

// ─────────────────────────────────────────────────────────────────────
// Small date helpers — the clock is an INPUT, never read from inside
// ─────────────────────────────────────────────────────────────────────

function toDate(value: string | Date | undefined): Date | null {
  if (value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A calendar-month difference, ignoring the time of day.
 *
 * `monthsBetween(later, earlier)` is how many whole calendar months
 * separate the two dates.
 */
function monthsBetween(later: Date, earlier: Date): number {
  return (
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth())
  );
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * `now` shifted back by whole months, with the day clamped to the
 * target month's length so that 31 March minus 12 months is 28
 * February and not 3 March.
 */
function monthsBefore(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() - months;
  const day = Math.min(
    date.getUTCDate(),
    daysInUtcMonth(year + Math.floor(month / 12), ((month % 12) + 12) % 12),
  );
  return new Date(
    Date.UTC(
      year + Math.floor(month / 12),
      ((month % 12) + 12) % 12,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ),
  );
}

/**
 * Is the price data on this row older than the 12-month threshold?
 *
 * A row with NO `last_reviewed` is NOT stale: the rule is "price data
 * older than 12 months counts as unknown", and a row that was never
 * dated is not "older than 12 months" — it is simply undated. An
 * unparsable date is treated the same way, because inventing a
 * staleness the data does not state would turn a priced ingredient
 * into an unknown one.
 */
function isPriceStale(lastReviewed: string | null, now: Date): boolean {
  if (lastReviewed === null) return false;
  const reviewed = toDate(lastReviewed);
  if (reviewed === null) return false;
  const threshold = monthsBefore(now, PRICE_MAX_AGE_MONTHS);
  const exactMonths = monthsBetween(now, reviewed);
  if (exactMonths > PRICE_MAX_AGE_MONTHS) return true;
  if (exactMonths < PRICE_MAX_AGE_MONTHS) return false;
  return reviewed.getTime() < threshold.getTime();
}

// ─────────────────────────────────────────────────────────────────────
// Data resolution — most specific wins (ADR-008 Decision 9)
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve the rows that describe an ingredient IN THIS COUNTRY.
 *
 *   country row → region row with `fallbackReliable = true` → none
 *
 * "Europe is never one profile": a region row is used only when it
 * carries the reliable-fallback flag, so a German-only listing can
 * never stand in for a continent.
 */
function resolveRows(
  ingredientId: string,
  country: CountryContext,
  availabilityRows: readonly AvailabilityRow[],
): AvailabilityRow[] {
  const forIngredient = availabilityRows.filter(
    (row) => row.ingredientId === ingredientId,
  );

  const countryRows = forIngredient.filter(
    (row) => row.geoEntityId === country.geoEntityId,
  );
  if (countryRows.length > 0) return countryRows;

  for (const regionId of country.regionGeoEntityIds) {
    const regionRows = forIngredient.filter(
      (row) => row.geoEntityId === regionId && row.fallbackReliable,
    );
    if (regionRows.length > 0) return regionRows;
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────
// The per-form score
// ─────────────────────────────────────────────────────────────────────

type FormScore = {
  row: AvailabilityRow;
  availabilityScore: number;
  /** `null` when there is no usable price (unknown band, or stale). */
  priceScore: number | null;
  priceStale: boolean;
  /** `max(availability, price)` — the higher of the two, never the sum. */
  burden: number;
};

/**
 * Score one row as one form of one ingredient in one country.
 *
 * The price score is capped at 1 for a `minor` recipe line
 * (ADR-008 Decision 6): without the cap, "a pinch of saffron" would
 * price a whole recipe out of reach.
 */
function scoreForm(
  row: AvailabilityRow,
  costWeight: RecipeLine["costWeight"],
  now: Date,
): FormScore {
  const availabilityScore = AVAILABILITY_SCORE[row.availability];

  const stale = isPriceStale(row.lastReviewed, now);
  const usableBand: Exclude<PriceBand, "unknown"> | null =
    row.priceBand === "unknown" || stale ? null : row.priceBand;
  let priceScore: number | null =
    usableBand === null ? null : PRICE_SCORE[usableBand];
  if (priceScore !== null && costWeight === "minor") {
    priceScore = Math.min(priceScore, 1);
  }

  // The higher of the two dimensions. An imported premium is ONE
  // problem, not two (ADR-008 Decision 3).
  const burden = Math.max(availabilityScore, priceScore ?? -1);

  return {
    row,
    availabilityScore,
    priceScore,
    priceStale: stale,
    burden,
  };
}

/**
 * The better of two forms: the lower burden wins; a tie is broken by
 * the form preference, so the reason names the most useful form.
 */
function isBetterForm(candidate: FormScore, current: FormScore): boolean {
  if (candidate.burden !== current.burden)
    return candidate.burden < current.burden;
  const candidateRank = FORM_PREFERENCE.indexOf(candidate.row.form);
  const currentRank = FORM_PREFERENCE.indexOf(current.row.form);
  return candidateRank < currentRank;
}

// ─────────────────────────────────────────────────────────────────────
// The per-ingredient assessment
// ─────────────────────────────────────────────────────────────────────

type IngredientState =
  /** The ingredient's burden is known. */
  | { kind: "known"; burden: number; best: FormScore | null }
  /** The ingredient cannot be had in a recipe-compatible form. */
  | { kind: "unavailable"; burden: 3; best: FormScore | null }
  /** Nothing usable is known for this country. */
  | {
      kind: "unknown";
      cause: "no_record" | "stale_price";
      best: FormScore | null;
    };

type SubstituteCandidate = SourcingSubstitute;

type Assessment = {
  state: IngredientState;
  substitutes: SubstituteCandidate[];
  /** The substitute that rescues this ingredient, when one does. */
  rescue: SubstituteCandidate | null;
  /** How this ingredient contributes to the recipe's rating. */
  contribution: "easy" | "moderate" | "unknown" | "hard";
};

/**
 * Resolve the substitute rows for one recipe line.
 *
 * Suitability is RECIPE-SPECIFIC (ADR-008 Decision 5): a per-recipe
 * override wins over the global default. The merge is per substitute
 * ingredient, so a recipe that overrides one pair keeps the global
 * default for the others.
 */
function resolveSubstitutes(
  line: RecipeLine,
  substitutes: readonly SubstituteRow[],
): SubstituteRow[] {
  const globalRows = substitutes.filter(
    (row) =>
      row.recipeIngredientId === null && row.ingredientId === line.ingredientId,
  );
  const recipeRows = substitutes.filter(
    (row) => row.recipeIngredientId === line.id,
  );

  const merged = new Map<string, SubstituteRow>();
  for (const row of globalRows) {
    merged.set(row.substituteIngredientId, row);
  }
  for (const row of recipeRows) {
    // The recipe row wins.
    merged.set(row.substituteIngredientId, row);
  }
  return Array.from(merged.values());
}

/**
 * Score a substitute for the country.
 *
 * A substitute is itself scored for the country (ADR-008 Decision 5),
 * and a substitute with burden >= 2 does not rescue anything — an
 * imported substitute is not a rescue.
 *
 * The substitute's cost weight is the recipe line's cost weight: the
 * substitute fills the same line, so a `minor` line's price cap
 * applies to it too.
 */
function scoreSubstitute(
  substitute: SubstituteRow,
  costWeight: RecipeLine["costWeight"],
  country: CountryContext,
  availabilityRows: readonly AvailabilityRow[],
  now: Date,
): SubstituteCandidate {
  const rows = resolveRows(
    substitute.substituteIngredientId,
    country,
    availabilityRows,
  ).filter(
    (row) =>
      substitute.substituteForm === null ||
      row.form === substitute.substituteForm,
  );

  let burden: number | null = null;
  let best: FormScore | null = null;
  for (const row of rows) {
    const scored = scoreForm(row, costWeight, now);
    if (best === null || isBetterForm(scored, best)) best = scored;
  }
  if (best !== null) burden = best.burden;

  // A staple has no rows of its own and is still free everywhere
  // (ADR-008 Decision 8).
  if (burden === null && substitute.substituteUbiquitous === true) burden = 0;

  return {
    ingredientId: substitute.substituteIngredientId,
    slug: substitute.substituteSlug,
    name: substitute.substituteName,
    form: substitute.substituteForm,
    suitability: substitute.suitability,
    changeNote: substitute.changeNote,
    burden,
    rescues: false,
  };
}

/**
 * Assess one ingredient in one country: its burden, its substitutes,
 * and what it contributes to the recipe's rating.
 */
function assessIngredient(
  line: RecipeLine,
  country: CountryContext,
  availabilityRows: readonly AvailabilityRow[],
  substitutes: readonly SubstituteRow[],
  now: Date,
): Assessment {
  const rows = resolveRows(line.ingredientId, country, availabilityRows);
  const compatible = rows.filter(
    (row) =>
      line.acceptedForms === null || line.acceptedForms.includes(row.form),
  );

  const scored = compatible.map((row) => scoreForm(row, line.costWeight, now));
  let best: FormScore | null = null;
  for (const candidate of scored) {
    if (best === null || isBetterForm(candidate, best)) best = candidate;
  }

  // The substitutes, scored for the country.
  const candidates = resolveSubstitutes(line, substitutes).map((substitute) =>
    scoreSubstitute(
      substitute,
      line.costWeight,
      country,
      availabilityRows,
      now,
    ),
  );

  // ── The staples rule (ADR-008 Decision 8) ────────────────────────
  //
  // An ingredient marked `ubiquitous` counts as burden 0 everywhere
  // UNLESS a country row says otherwise. So: no row at all → burden 0
  // and no unknown. A row for THIS country → the row is the truth, and
  // it is scored normally.
  if (line.ubiquitous && rows.length === 0) {
    return {
      state: { kind: "known", burden: 0, best: null },
      substitutes: candidates,
      rescue: null,
      contribution: "easy",
    };
  }

  let state: IngredientState;
  if (rows.length === 0) {
    // Nothing at all is known for this country.
    state = { kind: "unknown", cause: "no_record", best: null };
  } else if (compatible.length === 0) {
    // Rows exist, but none of them is a form this recipe accepts: the
    // ingredient is unavailable IN A RECIPE-COMPATIBLE FORM.
    state = { kind: "unavailable", burden: 3, best: null };
  } else if (best !== null && best.burden === 3) {
    state = { kind: "unavailable", burden: 3, best };
  } else if (best !== null && best.priceScore === null) {
    // The availability is known, but the price is not usable — the
    // band is `unknown`, or the row is older than 12 months. The
    // price score is unknown, so the recipe's rating is unknown
    // (ADR-008 Decision 4, step 2).
    state = { kind: "unknown", cause: "stale_price", best };
  } else {
    state = { kind: "known", burden: best?.burden ?? 0, best };
  }

  // ── The substitutes (ADR-008 Decision 5) ─────────────────────────
  //
  // Only a substitute with burden < 2 can rescue anything, and only a
  // `suitable` one rescues a KEY ingredient. An `approximate`
  // substitute rescues a non-key ingredient and the change must be
  // disclosed. A `not_suitable` substitute never rescues — it is
  // shown, so the site can never suggest it.
  const rescuable = candidates.filter(
    (candidate) =>
      candidate.suitability !== "not_suitable" &&
      candidate.burden !== null &&
      candidate.burden < 2,
  );
  const suitable = rescuable.find(
    (candidate) => candidate.suitability === "suitable",
  );
  const approximate = rescuable.find(
    (candidate) => candidate.suitability === "approximate",
  );

  const rescue = suitable ?? (line.isKey ? undefined : approximate) ?? null;
  if (rescue !== null) rescue.rescues = true;

  // ── What this ingredient contributes (ADR-008 Decision 4) ─────────
  let contribution: Assessment["contribution"];
  if (state.kind === "unavailable") {
    if (suitable !== undefined) {
      // Burden 3, rescued by a suitable substitute → Moderate.
      contribution = "moderate";
    } else if (line.isKey) {
      // A key ingredient with burden 3 and no suitable substitute.
      contribution = "hard";
    } else {
      // A non-key ingredient with burden 3 → Moderate: the dish is
      // still makeable without it (ADR-008 Decision 4).
      contribution = "moderate";
    }
  } else if (state.kind === "unknown") {
    contribution = rescue !== null ? "moderate" : "unknown";
  } else {
    contribution = state.burden === 0 ? "easy" : "moderate";
  }

  return { state, substitutes: candidates, rescue, contribution };
}

// ─────────────────────────────────────────────────────────────────────
// The reasons
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the reason for one ingredient.
 *
 * The reason is DATA. There is no sentence anywhere in this function.
 */
function buildReason(
  line: RecipeLine,
  country: CountryContext,
  assessment: Assessment,
): SourcingReason {
  const { state, substitutes, rescue } = assessment;
  const best = state.best;

  const base: SourcingReason = {
    ingredientId: line.ingredientId,
    ingredientSlug: line.ingredientSlug,
    ingredientName: line.ingredientName,
    form: best?.row.form ?? null,
    country: country.isoCode,
    cause: "available",
    score: 0,
    availabilityScore: best?.availabilityScore ?? null,
    priceScore: best?.priceScore ?? null,
    availability: best?.row.availability ?? null,
    priceBand: best?.row.priceBand ?? null,
    isOptional: line.isOptional,
    isKey: line.isKey,
    substitute: rescue,
    substitutes,
  };

  if (rescue !== null) {
    // The substitute rescued the ingredient. The reason names the
    // change — the disclosed difference between the original and the
    // substitute.
    return {
      ...base,
      cause: "substituted",
      score: state.kind === "known" ? state.burden : 3,
    };
  }

  if (state.kind === "unknown") {
    return {
      ...base,
      cause: state.cause,
      score: 0,
      availabilityScore: best?.availabilityScore ?? null,
      priceScore: null,
    };
  }

  if (state.kind === "unavailable") {
    return { ...base, cause: "unavailable", score: 3 };
  }

  // A known burden. The cause is the dimension that produced it; when
  // both dimensions differ, both scores are carried so the template
  // can name both ("inexpensive, but sold only in specialty stores").
  const availabilityScore = best?.availabilityScore ?? 0;
  const priceScore = best?.priceScore ?? 0;
  let cause: ReasonCause = "available";
  if (state.burden > 0) {
    cause = priceScore > availabilityScore ? "price" : "availability";
  }
  return { ...base, cause, score: state.burden };
}

// ─────────────────────────────────────────────────────────────────────
// The engine
// ─────────────────────────────────────────────────────────────────────

/**
 * Rate how hard a recipe's ingredients are to source in a country.
 *
 * @param recipeLines    the recipe's ingredient lines
 * @param availabilityRows  the `ingredient_availability` rows
 * @param substitutes    the substitute rows (global and per-recipe)
 * @param country        the reader's country and its region fallback
 * @param options        `now` — the reference date for price staleness
 */
export function rateSourcing(
  recipeLines: readonly RecipeLine[],
  availabilityRows: readonly AvailabilityRow[],
  substitutes: readonly SubstituteRow[],
  country: CountryContext,
  options: RateSourcingOptions = {},
): SourcingResult {
  const now = toDate(options.now) ?? new Date();

  const reasons: SourcingReason[] = [];
  let sawHard = false;
  let sawUnknown = false;
  let sawModerate = false;

  for (const line of recipeLines) {
    const assessment = assessIngredient(
      line,
      country,
      availabilityRows,
      substitutes,
      now,
    );

    // Optional ingredients are EXCLUDED from every step. They may be
    // mentioned in the reasons, but they never move the result
    // (ADR-008 Decision 3).
    if (!line.isOptional) {
      if (assessment.contribution === "hard") sawHard = true;
      else if (assessment.contribution === "unknown") sawUnknown = true;
      else if (assessment.contribution === "moderate") sawModerate = true;
    }

    // An optional ingredient that is easy here is not worth a reason.
    const worthMentioning =
      !line.isOptional ||
      assessment.state.kind !== "known" ||
      assessment.state.burden > 0;
    if (worthMentioning) {
      reasons.push(buildReason(line, country, assessment));
    }
  }

  // The recipe result, evaluated in this order (ADR-008 Decision 4).
  // Hard outranks Unknown, because a known blocker is certain whatever
  // the unknowns are.
  const rating: SourcingRating = sawHard
    ? "hard"
    : sawUnknown
      ? "availability_unknown"
      : sawModerate
        ? "moderate"
        : "easy";

  return { rating, reasons };
}

export type {
  Availability,
  AvailabilityRow,
  CostWeight,
  CountryContext,
  IngredientForm,
  PriceBand,
  RateSourcingOptions,
  ReasonCause,
  RecipeLine,
  SourcingRating,
  SourcingReason,
  SourcingResult,
  SourcingSubstitute,
  SubstituteRow,
  Suitability,
} from "./types.js";

/**
 * ADR-008 — the input and output types of the sourcing engine.
 *
 * These are the shapes the API will pass in. The field names follow
 * ADR-008 Decision 7's column names (snake_case in the database,
 * camelCase here) so a row maps onto a type field-for-field and the
 * mapping layer stays trivial.
 *
 * THE ENGINE HAS NO DATABASE DEPENDENCY
 *
 * Nothing in this file imports from `@gustale/db`, and nothing in
 * `rateSourcing` touches a database, a network, the filesystem or the
 * clock (except the explicitly-passed `now`). That is what makes the
 * function testable against synthetic fixtures and reusable from the
 * API, a CLI and a test (ADR-008 Decision 12).
 */

/** The four results (ADR-008 Decision 2). */
export type SourcingRating =
  | "easy"
  | "moderate"
  | "hard"
  | "availability_unknown";

/**
 * The availability enum (ADR-008 Decision 7, `ingredient_availability`).
 *
 * `common` and `occasional` both score 0; `specialty_only` and `limited`
 * both score 2.
 */
export type Availability =
  | "common"
  | "occasional"
  | "seasonal"
  | "specialty_only"
  | "limited"
  | "unavailable";

/** The price band enum (ADR-008 Decision 7). */
export type PriceBand =
  | "typical"
  | "elevated"
  | "high"
  | "prohibitive"
  | "unknown";

/** The preparation form of an ingredient (ADR-008 Decision 7). */
export type IngredientForm =
  | "fresh"
  | "frozen"
  | "dried"
  | "canned_or_packaged"
  | "paste_or_concentrate"
  | "extract"
  | "homemade";

/** The editorial cost weight of a recipe line (ADR-008 Decision 6). */
export type CostWeight = "minor" | "major";

/** The suitability grade of a substitute (ADR-008 Decision 5). */
export type Suitability = "suitable" | "approximate" | "not_suitable";

/**
 * One recipe line, as the engine needs it.
 *
 * `acceptedForms` is `recipe_ingredients.accepted_forms`: `null` means
 * ANY form is acceptable, anything else restricts the compatible forms
 * to the listed ones.
 */
export type RecipeLine = {
  /** `recipe_ingredients.id` */
  id: string;
  /** `recipe_ingredients.ingredient_id` → `ingredients.id` */
  ingredientId: string;
  /** `ingredients.slug` */
  ingredientSlug: string;
  /** `ingredients.canonical_name` */
  ingredientName: string;
  /** `recipe_ingredients.is_optional` */
  isOptional: boolean;
  /** `recipe_ingredients.is_key` — the ingredient defines the dish. */
  isKey: boolean;
  /** `recipe_ingredients.accepted_forms` — `null` = any form. */
  acceptedForms: IngredientForm[] | null;
  /** `recipe_ingredients.cost_weight` */
  costWeight: CostWeight;
  /**
   * `ingredients.ubiquitous` — the staples flag (ADR-008 Decision 8).
   *
   * It is a property of the INGREDIENT, not of the line, but the engine
   * receives one line per ingredient it must judge, so the API fills it
   * in from the joined `ingredients` row.
   */
  ubiquitous: boolean;
};

/**
 * One `ingredient_availability` row (ADR-008 Decision 7).
 *
 * `geoEntityId` is `ingredient_availability.geo_entity_id`. It may be a
 * COUNTRY id or a REGION id; `fallbackReliable` is only meaningful on a
 * region row (ADR-008 Decision 9).
 */
export type AvailabilityRow = {
  id: string;
  ingredientId: string;
  form: IngredientForm;
  productCategory: string | null;
  geoEntityId: string;
  availability: Availability;
  priceBand: PriceBand;
  /** `last_reviewed` — drives the 12-month staleness rule (Decision 10). */
  lastReviewed: string | null;
  /** Only meaningful on a region row. */
  fallbackReliable: boolean;
};

/**
 * One substitute, global default or per-recipe override.
 *
 * `recipeIngredientId` is set for a `recipe_ingredient_substitutes`
 * row and `null` for a global `ingredient_substitutes` row. A
 * per-recipe row WINS over the global default for the same substitute
 * ingredient (ADR-008 Decision 5).
 */
export type SubstituteRow = {
  id: string;
  /** The ingredient being replaced. */
  ingredientId: string;
  /** The replacement. */
  substituteIngredientId: string;
  /** The replacement's identity, for the reasons. */
  substituteSlug: string;
  substituteName: string;
  /** `substitute_form` — `null` means any form of the substitute. */
  substituteForm: IngredientForm | null;
  suitability: Suitability;
  /** `change_note` — the disclosed change for an approximate substitute. */
  changeNote: string | null;
  /** `recipe_ingredient_id` — `null` for the global default. */
  recipeIngredientId: string | null;
  /**
   * `ingredients.ubiquitous` of the SUBSTITUTE ingredient.
   *
   * It lives on the substitute's own ingredient row, so the API fills
   * it in with the same join it does for the recipe lines.
   */
  substituteUbiquitous?: boolean;
};

/**
 * The reader's country, and the geo entities the engine may fall back to.
 *
 * `country.geoEntityId` is the COUNTRY's `geo_entities.id`;
 * `regionGeoEntityIds` are the ids of the ancestors the engine may use
 * as a fallback — but ONLY when the fallback row carries
 * `fallbackReliable = true` (ADR-008 Decision 9). The order is
 * nearest-first, so the first match wins.
 */
export type CountryContext = {
  /** ISO 3166-1 alpha-2, e.g. "DE". */
  isoCode: string;
  /** `geo_entities.id` of the country. */
  geoEntityId: string;
  /** The country's English name. */
  name: string;
  /** Ancestor geo entity ids, nearest first. */
  regionGeoEntityIds: string[];
};

/**
 * WHY the ingredient is hard to get — the `cause` of a reason.
 *
 * `available` — the ingredient is easy here; the reason carries the
 *   local form that makes it so (ADR-008 Decision 12 asks the
 *   explanation to name it).
 * `availability` — the form is not commonly available.
 * `price` — the form costs more than the local market norm.
 * `unavailable` — the form cannot be had in the country at all.
 * `no_record` — nothing usable was found for the country.
 * `stale_price` — the only price data is unknown or older than the
 *   12-month threshold.
 * `substituted` — the ingredient was replaced by a substitute.
 */
export type ReasonCause =
  | "available"
  | "availability"
  | "price"
  | "unavailable"
  | "no_record"
  | "stale_price"
  | "substituted";

/** One candidate substitute, as the reasons carry it. */
export type SourcingSubstitute = {
  ingredientId: string;
  slug: string;
  name: string;
  form: IngredientForm | null;
  suitability: Suitability;
  /** The disclosed change — the reason a substitute is `approximate`. */
  changeNote: string | null;
  /** The substitute's OWN burden in this country, or `null` if unknown. */
  burden: number | null;
  /** Whether this substitute actually rescues the ingredient. */
  rescues: boolean;
};

/**
 * ONE STRUCTURED REASON. Never prose.
 *
 * ADR-008 Decision 12: the reasons are data; the prose is generated
 * from them by templates elsewhere. The engine must not write a
 * sentence.
 */
export type SourcingReason = {
  /** The ingredient the reason is about. */
  ingredientId: string;
  ingredientSlug: string;
  ingredientName: string;
  /** The form the reason is about, when a form was scored. */
  form: IngredientForm | null;
  /** The ISO code of the country the rating is for. */
  country: string;
  /** Why it is hard — which dimension. */
  cause: ReasonCause;
  /** The burden score 0–3 that the cause produced. */
  score: number;
  /** The availability score on its own, when it was scored. */
  availabilityScore: number | null;
  /** The price score on its own, when it was scored. */
  priceScore: number | null;
  /** The availability enum as recorded. */
  availability: Availability | null;
  /** The price band as recorded. */
  priceBand: PriceBand | null;
  /** Whether the ingredient is optional (mentioned, never decisive). */
  isOptional: boolean;
  /** Whether the ingredient is key to the dish. */
  isKey: boolean;
  /** The substitute that rescued the ingredient, when one did. */
  substitute: SourcingSubstitute | null;
  /** Every candidate substitute for this ingredient, with its grade. */
  substitutes: SourcingSubstitute[];
};

/** The engine's output. */
export type SourcingResult = {
  rating: SourcingRating;
  reasons: SourcingReason[];
};

/**
 * The engine's options.
 *
 * `now` is the reference date for the 12-month price-staleness rule
 * (ADR-008 Decision 10). It is passed IN so the function stays
 * deterministic and testable; when it is omitted the current time is
 * used.
 */
export type RateSourcingOptions = {
  now?: string | Date;
};

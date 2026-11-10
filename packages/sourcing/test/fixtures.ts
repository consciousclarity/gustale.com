/**
 * The fixture helpers for the sourcing engine tests.
 *
 * These build the plain data objects the engine consumes. They are
 * deliberately dumb: no defaults that would hide a rule, no
 * convenience that would make a fixture pass for the wrong reason.
 * Every fixture states the values it depends on.
 *
 * The data is SYNTHETIC (ADR-008 Decision 17: "the fixtures test the
 * RULES, not the world").
 */

import type {
  Availability,
  AvailabilityRow,
  CountryContext,
  IngredientForm,
  PriceBand,
  RecipeLine,
  SubstituteRow,
} from "../src/types.js";

/** A fixed "now" so the 12-month staleness rule is deterministic. */
export const NOW = "2026-11-10T00:00:00.000Z";

export function country(
  isoCode: string,
  options: {
    geoEntityId?: string;
    name?: string;
    regionGeoEntityIds?: string[];
  } = {},
): CountryContext {
  return {
    isoCode,
    geoEntityId: options.geoEntityId ?? `geo-${isoCode}`,
    name: options.name ?? isoCode,
    regionGeoEntityIds: options.regionGeoEntityIds ?? [],
  };
}

export function line(
  overrides: Partial<RecipeLine> & {
    ingredientId: string;
    ingredientSlug?: string;
    ingredientName?: string;
  },
): RecipeLine {
  const { ingredientId, ingredientSlug, ingredientName, ...rest } = overrides;
  return {
    id: `line-${ingredientId}`,
    ingredientId,
    ingredientSlug: ingredientSlug ?? ingredientId.toLowerCase(),
    ingredientName: ingredientName ?? ingredientId,
    isOptional: false,
    isKey: false,
    acceptedForms: null,
    costWeight: "major",
    ubiquitous: false,
    ...rest,
  };
}

export function row(
  overrides: Partial<AvailabilityRow> & {
    ingredientId: string;
    geoEntityId: string;
    availability: Availability;
  },
): AvailabilityRow {
  const {
    ingredientId,
    geoEntityId,
    availability,
    form = "fresh",
    ...rest
  } = overrides;
  return {
    id: `row-${ingredientId}-${geoEntityId}-${form}`,
    ingredientId,
    form,
    productCategory: null,
    geoEntityId,
    availability,
    priceBand: "typical",
    lastReviewed: "2026-10-01",
    fallbackReliable: false,
    ...rest,
  };
}

export function substitute(
  overrides: Partial<SubstituteRow> & {
    ingredientId: string;
    substituteIngredientId: string;
  },
): SubstituteRow {
  const {
    ingredientId,
    substituteIngredientId,
    substituteSlug,
    substituteName,
    ...rest
  } = overrides;
  return {
    id: `sub-${ingredientId}-${substituteIngredientId}`,
    ingredientId,
    substituteIngredientId,
    substituteSlug: substituteSlug ?? substituteIngredientId.toLowerCase(),
    substituteName: substituteName ?? substituteIngredientId,
    substituteForm: null,
    suitability: "suitable",
    changeNote: null,
    recipeIngredientId: null,
    ...rest,
  };
}

/** A short alias so the fixtures read as tables, not as builders. */
export const form = {
  fresh: "fresh",
  frozen: "frozen",
  dried: "dried",
  canned: "canned_or_packaged",
  paste: "paste_or_concentrate",
  extract: "extract",
  homemade: "homemade",
} satisfies Record<string, IngredientForm>;

export const band = {
  typical: "typical",
  elevated: "elevated",
  high: "high",
  prohibitive: "prohibitive",
  unknown: "unknown",
} satisfies Record<string, PriceBand>;

/**
 * Shared types for the Gustale curated seed dataset.
 * Data arrays live in sibling modules; this file holds only type exports.
 */

export type DishTypeSlug =
  | "pasta"
  | "noodle-soup"
  | "stew"
  | "fried-rice"
  | "sandwich"
  | "soup"
  | "curry"
  | "stir-fry"
  | "salad"
  | "pancake"
  | "dumpling"
  | "kebab"
  | "bread"
  | "sauce"
  | "dessert"
  | "rice-dish"
  | "casserole"
  | "appetizer"
  | "main-course"
  // Network expansion — added with the food-network knowledge map pass.
  // `side` for plantain-side / bread-side dishes; `street-snack` for
  // handheld market foods (acarajé, pempek). `fermented` is reserved for
  // future kimchi-style primary-ingredient dishes.
  | "side"
  | "street-snack"
  | "fermented";

export interface SeedDish {
  slug: string;
  canonicalName: string;
  shortDescription: string;
  longDescription?: string;
  lat: number;
  lng: number;
  countryName: string;
  isoCode: string; // ISO 3166-1 alpha-2
  cuisineSlug: string; // e.g. "italian-cuisine"
  dishTypes: DishTypeSlug[];
  wikipediaSlug: string; // for source URL construction
  originDateEarliest?: number;
  originDateLatest?: number;
}
export type RelationType =
  | "family" // same food family (dumpling, noodle soup, etc.)
  | "regional-cousin" // neighboring-region variation
  | "diaspora" // diaspora adaptation
  | "shared-ingredient" // shares a key ingredient base
  | "shared-method" // uses the same core cooking technique
  | "similar-serving" // served in similar contexts (street snack, dessert)
  | "ancestor" // historical ancestor
  | "descendant"; // historical descendant

export interface SeedRelation {
  from: string;
  to: string;
  relationType: RelationType;
  reason: string;
  strength: 1 | 2 | 3 | 4 | 5;
}
export type SeedLineageHistoricalForce =
  | "migration"
  | "trade_route"
  | "empire"
  | "colonization"
  | "diaspora"
  | "religious_exchange"
  | "port_city_exchange"
  | "agricultural_spread"
  | "technological_change"
  | "local_adaptation"
  | "parallel_evolution"
  | "colonial_spread"
  | "cultural_exchange"
  | "nomadic_pastoral"
  | "war_and_displacement";

export type SeedLineageRole =
  | "ancestor"
  | "descendant"
  | "cousin"
  | "regional_variant"
  | "adaptation"
  | "fusion"
  | "diaspora_adaptation"
  | "trade_route_spread"
  | "colonial_spread"
  | "technique_relative"
  | "ingredient_relative"
  | "possible_influence"
  | "parallel_evolution"
  | "uncertain";

export type SeedConfidenceLevel =
  | "documented"
  | "likely"
  | "probable"
  | "possible"
  | "uncertain"
  | "parallel_evolution";

export type SeedChangedElement =
  | "ingredient"
  | "spice_profile"
  | "cooking_method"
  | "shape"
  | "filling"
  | "dough"
  | "grain"
  | "preservation_method"
  | "serving_context"
  | "religious_rule"
  | "local_availability"
  | "cooking_fat"
  | "wrapper"
  | "fermentation_time";

export interface SeedDishLineageEdge {
  dishSlug: string;
  role: SeedLineageRole;
  explanation: string;
  changedElements: SeedChangedElement[];
  confidenceLevel: SeedConfidenceLevel;
  sortOrder: number;
}

export interface SeedLineage {
  slug: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  conceptSummary: string;
  originSummary: string;
  originRegions: string[];
  relatedRegions: string[];
  historicalForces: SeedLineageHistoricalForce[];
  primaryTechnique: string;
  techniques: string[];
  baseIngredients: string[];
  courseGroups: string[];
  relatedFamilies: string[];
  representativeDishes: string[]; // illustrative names, may include dishes NOT in Gustale yet
  confidenceLevel: SeedConfidenceLevel;
  uncertaintyNote: string;
  culturalPracticeNote: string;
  sourceNotes: string;
  displayOrder: number;
  dishMappings: SeedDishLineageEdge[];
}
export type JourneyConfidenceSeed =
  | "documented"
  | "likely"
  | "possible"
  | "parallel";

export interface JourneyBeatSourceSeed {
  title: string;
  url: string;
  year?: number;
  citationText: string;
}

export interface JourneyBeatSeed {
  sequence: number;
  placeName: string;
  lat: number | null;
  lng: number | null;
  yearApprox: number | null;
  label: string;
  confidence: JourneyConfidenceSeed;
  source?: JourneyBeatSourceSeed;
}

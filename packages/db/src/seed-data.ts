/**
 * Curated seed dataset for Gustale — barrel re-export.
 *
 * Content lives in `./seed-data/*`. This file keeps every existing
 * `from "./seed-data.js"` import path working without touching consumers
 * (seed.ts, API tests, mock scripts).
 */

export {
  CUISINE_CATEGORIES,
  DISH_TYPE_CATEGORIES,
} from "./seed-data/categories.js";

export { DISHES } from "./seed-data/dishes.js";
export { JOURNEY_BEATS } from "./seed-data/journeys.js";
export {
  DISH_LINEAGES,
  LINEAGE_METHODS,
  LINEAGES,
} from "./seed-data/lineages.js";
export { DISH_RELATIONS } from "./seed-data/relations.js";
export type {
  DishTypeSlug,
  JourneyBeatSeed,
  JourneyBeatSourceSeed,
  JourneyConfidenceSeed,
  RelationType,
  SeedChangedElement,
  SeedConfidenceLevel,
  SeedDish,
  SeedDishLineageEdge,
  SeedLineage,
  SeedLineageHistoricalForce,
  SeedLineageRole,
  SeedRelation,
} from "./seed-data/types.js";

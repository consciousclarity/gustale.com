// Mirrors apps/api/src/routes/lineages.ts + packages/db/src/schema/index.ts
//
// Lineage = dish ancestry / migration / transformation / influence story.
// Distinct from Family (form) and Cuisine (region).

export type LineageConfidence =
  | 'documented'
  | 'likely'
  | 'probable'
  | 'possible'
  | 'uncertain'
  | 'parallel_evolution';

export type LineageRole =
  | 'ancestor'
  | 'descendant'
  | 'cousin'
  | 'regional_variant'
  | 'adaptation'
  | 'fusion'
  | 'diaspora_adaptation'
  | 'trade_route_spread'
  | 'colonial_spread'
  | 'technique_relative'
  | 'ingredient_relative'
  | 'possible_influence'
  | 'parallel_evolution'
  | 'uncertain';

export interface LineageSummary {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  conceptSummary: string | null;
  originSummary: string | null;
  originRegions: string[];
  relatedRegions: string[];
  historicalForces: string[];
  primaryTechnique: string | null;
  techniques: string[];
  baseIngredients: string[];
  courseGroups: string[];
  relatedFamilies: string[];
  representativeDishes: string[];
  confidenceLevel: LineageConfidence;
  uncertaintyNote: string | null;
  culturalPracticeNote: string | null;
  sourceNotes: string | null;
  displayOrder: number;
  dishCount: number;
  relationCount: number;
}

export interface LineageListResponse {
  lineages: LineageSummary[];
  totalLineages: number;
  totalDishes: number;
  totalRelations: number;
  uncertainOrParallelCount: number;
  regions: string[];
  techniques: string[];
  historicalForces: string[];
  confidenceLevels: LineageConfidence[];
}

export interface LineageDishInGroup {
  id: string;
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  originName: string | null;
  role: LineageRole;
  explanation: string | null;
  changedElements: string[];
  confidenceLevel: LineageConfidence;
  sortOrder: number;
}

export interface LineageDishGroup {
  title: string;
  note: string;
  dishes: LineageDishInGroup[];
}

export interface LineageDetailResponse {
  lineage: LineageSummary;
  longDescription: string | null;
  groupedDishes: LineageDishGroup[];
}
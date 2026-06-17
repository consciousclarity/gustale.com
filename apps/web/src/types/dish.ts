// Mirrors the gustale-api response shape. Keep in sync with
// apps/api/src/routes/dishes.ts and packages/db/src/schema/index.ts (dishes table).

export type DishStatus = 'draft' | 'published' | 'archived';

export interface DishSummary {
  id: string;
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  status: DishStatus;
  originGeoId: string | null;
  viewCount: number;
  updatedAt: string; // ISO timestamp
  methodSlug?: string | null;
}

export interface DishListResponse {
  dishes: DishSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface DishDetail extends DishSummary {
  longDescription: string | null;
  originLocation: unknown | null; // GeoJSON — refine when we know the shape
  originDateEarliest: number | null;
  originDateLatest: number | null;
  editCount: number;
  contributorCount: number;
  createdAt: string;
  createdBy: string | null;
  lastEditedBy: string | null;
}

// Mirrors the gustale-api response shapes. Keep in sync with:
//   - apps/api/src/routes/dishes.ts
//   - packages/db/src/schema/index.ts
//
// The `/api/dishes/:slug` endpoint returns a rich payload (dish + origin +
// variants + ingredients + categories + preparations + sources + media).
// See the route handler for canonical names.

export type DishStatus = 'draft' | 'published' | 'archived';

// ─── Taxonomy (GET /api/categories, GET /api/tags) ────────────────────────

export interface CategoryListItem {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  icon: string | null;
}

export interface TagListItem {
  id: string;
  name: string;
  slug: string;
}

// ─── List view (GET /api/dishes) ──────────────────────────────────────────

export interface DishSummary {
  id: string;
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  status: DishStatus;
  originGeoId: string | null;
  originName: string | null;
  viewCount: number;
  updatedAt: string; // ISO timestamp
  methodSlug?: string | null;
}

export interface DishListResponse {
  dishes: DishSummary[];
  limit: number;
  offset: number;
}

// ─── Detail view (GET /api/dishes/:slug) ──────────────────────────────────

export interface DishEditorRef {
  id: string;
  displayName: string;
  role: string;
}

export interface DishDetailCore {
  id: string;
  canonicalName: string;
  slug: string;
  shortDescription: string | null;
  longDescription: string | null;
  originGeoId: string | null;
  // PostGIS hex-encoded EWKB; not surfaced to the UI directly (lat/lng come
  // via `origin`).
  originLocation: string | null;
  originDateEarliest: number | null;
  originDateLatest: number | null;
  status: DishStatus;
  viewCount: number;
  editCount: number;
  contributorCount: number;
  createdAt: string;
  updatedAt: string;
  // The route handler maps these to { id, displayName, role } objects.
  createdBy: DishEditorRef | null;
  lastEditedBy: DishEditorRef | null;
  // Translation-resolved fields (preferred language → 'en' fallback).
  name: string;
  description: string | null;
}

export interface DishOrigin {
  id: string;
  name: string;
  localName: string | null;
  isoCode: string | null;
  entityType: string;
  lat: number | null;
  lng: number | null;
}

export interface DishVariant {
  id: string;
  parentDishId: string;
  name: string;
  slug: string;
  description: string | null;
  regionGeoId: string | null;
  regionLocation: string | null;
  creatorName: string | null;
  creatorDate: number | null;
  status: DishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DishIngredient {
  ingredientId: string;
  position: number;
  quantity: string | null;
  unit: string | null;
  isOptional: boolean;
  preparationNote: string | null;
  name: string;
  slug: string;
}

export interface DishCategory {
  categoryId: string;
  name: string;
  slug: string;
  isPrimary: boolean;
}

export interface DishTag {
  tagId: string;
  name: string;
  slug: string;
}

export interface DishPreparation {
  id: string;
  methodId: string;
  methodSlug: string;
  methodName: string;
  steps: string | null;
  durationMinutes: number | null;
  difficulty: string | null;
  sequenceOrder: number;
}

export interface DishCitation {
  id: string;
  claimText: string | null;
  location: string | null;
  addedAt: string;
  sourceId: string;
  sourceType: string;
  title: string | null;
  authors: string | null;
  year: number | null;
  publisher: string | null;
  url: string | null;
  citationText: string | null;
  language: string | null;
  reliability: string | null;
}

export interface DishMediaAttachment {
  attachmentId: string;
  role: string;
  position: number;
  attachedAt: string;
  mediaId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  credit: string | null;
  license: string | null;
  uploadedAt: string;
}

export interface DishDetailResponse {
  dish: DishDetailCore;
  origin: DishOrigin | null;
  variants: DishVariant[];
  ingredients: DishIngredient[];
  categories: DishCategory[];
  tags: DishTag[];
  preparations: DishPreparation[];
  sources: DishCitation[];
  media: DishMediaAttachment[];
  coverImage: DishMediaAttachment | null;
  availableLanguages: string[];
}

export interface FeaturedDish {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  originName: string | null;
  originIso: string | null;
  cuisineSlug: string | null;
  cuisineName: string | null;
  relationCount: number;
  coverMediaId: string | null;
}

export interface FeaturedDishesResponse {
  dishes: FeaturedDish[];
  count: number;
}
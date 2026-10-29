// Mirrors the gustale-api response shapes. Keep in sync with:
//   - apps/api/src/routes/dishes.ts
//   - packages/db/src/schema/index.ts
//
// The `/api/dishes/:slug` endpoint returns a rich payload (dish + origin +
// variants + ingredients + categories + preparations + sources + media).
// See the route handler for canonical names.

export type DishStatus = "draft" | "published" | "archived";

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
  /** Primary dish-type category slug — used as 'family' for /families page grouping. */
  familySlug: string | null;
  /** Primary dish-type category display name. */
  familyName: string | null;
  /** Primary preparation method slug — used as 'lineage' for /lineages page grouping. */
  methodSlug: string | null;
  /** Primary preparation method display name. */
  methodName: string | null;
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
  /**
   * Same-origin public URL for this media (e.g. `/media/<storageKey>`).
   * Caddy serves this from MinIO's `gustale-public` bucket with a
   * 1-year immutable cache header. The dish page is built at
   * deploy time, so this URL is baked directly into the static
   * HTML's `<img src>` — no client-side signed-URL fetch.
   *
   * Always set on rows served by the API now; null only for legacy
   * rows that pre-date the `/media/*` proxy.
   */
  publicUrl: string | null;
  /**
   * Variant map keyed by nominal width (e.g. "800", "1536") →
   * same-origin public URL. Used to build the `<img srcset>` for
   * responsive delivery without an extra round-trip. Missing or
   * empty means the row has no pre-rendered derivatives and the
   * front-end should fall back to the original `publicUrl`.
   */
  variantsUrls: Record<string, string>;
  /**
   * Raw `variants` JSONB from the API: `{"<width>": "<storageKey>"}`.
   * Same shape as `variantsUrls` but with raw storage keys instead
   * of public URLs. Kept for debugging; the front-end uses
   * `variantsUrls` for `<img srcset>`.
   */
  variants: Record<string, string>;
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

  // ADR-003 layer 1 — the vocabulary dimensions, with their labels
  // translated into the requested locale. The English label is the
  // dimension's own name, and is the fallback.
  dimensions: DishDimension[];
  // The dimensions that are explicitly unset, so the page can say
  // "no evidence" rather than showing nothing.
  unsetDimensions: DishUnsetDimension[];

  // ADR-003 layer 2 — the dish's names.
  names: DishName[];
  // The languages the dish has a name in, for the language switcher.
  availableNameLanguages: string[];

  // The locale actually served, and the one that was asked for. When
  // they differ, the page shows the English-fallback notice.
  locale: string;
  requestedLocale: string;
}

/** A vocabulary dimension of a dish: family, cuisine, technique, etc. */
export interface DishDimension {
  vocabulary: string;
  valueId: string;
  slug: string;
  name: string;
  isPrimary: boolean;
}

/** A dimension that is explicitly unset, with the reason. */
export interface DishUnsetDimension {
  dimension: string;
  reason: string;
}

/** One of a dish's names, in one language. */
export interface DishName {
  language: string;
  /** The ISO 15924 script code: Latn, Cyrl, Arab, Hans, Hant, Jpan, Deva. */
  script: string | null;
  name: string;
  /** 'endonym' | 'exonym' | 'romanization' */
  kind: string;
  isPrimary: boolean;
}

// Lightweight fetch wrapper for the gustale-api.
//
// In dev, requests go to the same origin and Astro's dev server proxy
// (configured in astro.config.mjs) forwards them to the API on :4000.
// In production, we use the same-origin /api/* path so the browser
// hits Caddy, which reverse-proxies to the API container. This means:
//   - No CORS: the cookie + fetch happen on the same origin.
//   - No domain-aware code: gustale.com and gustale.recipes share the
//     same gustale-web container and the same /api/* prefix.
//   - The build-time PUBLIC_API_BASE is only used during server-side
//     rendering (Astro getStaticPaths), where the container doesn't
//     know which domain the user came in on — so it bakes in a single
//     canonical API host (api.gustale.recipes going forward).
//
// All dish routes are mounted under /api/* on the server
// (see apps/api/src/routes/dishes.ts: app.get('/api/dishes', ...)).
// The /api prefix is consistent with the better-auth routes mounted
// at /api/auth/* (see server.ts).

import type {
  CategoryListItem,
  DishDetailResponse,
  DishListResponse,
  TagListItem,
} from '../types/dish';

// Build-time API host — used only during SSR. In the browser we always
// use a relative /api path so same-origin proxying handles the routing.
const SSR_API_BASE =
  import.meta.env.PUBLIC_API_BASE ?? 'http://localhost:4000';

// Client-side: empty string makes fetch() hit the same origin.
// On the server: PUBLIC_API_BASE (absolute URL) because there's no
// "current origin" to be relative to during SSR / SSG.
const API_BASE = import.meta.env.SSR ? SSR_API_BASE : '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Retry configuration. We only retry:
 *
 * - network errors (TypeError from fetch, e.g. DNS, refused, offline)
 * - 5xx responses (server errors that may be transient)
 * - 429 (rate limited — honor Retry-After if present)
 *
 * We do NOT retry 4xx (except 429) — those are client mistakes that
 * retrying won't fix.
 *
 * Backoff: 200ms, 600ms, 1400ms (×1.5x per retry, plus ±25% jitter).
 * Three attempts total, ~2.2s worst case before giving up.
 */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
  // attempt = 0 → BASE_DELAY_MS * 1
  // attempt = 1 → BASE_DELAY_MS * 3
  // attempt = 2 → BASE_DELAY_MS * 7
  const base = BASE_DELAY_MS * (1 + attempt * 2);
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

function shouldRetry(status: number | undefined, err: unknown, attempt: number): boolean {
  if (attempt >= MAX_RETRIES) return false;
  // Network error → retry
  if (err instanceof TypeError) return true;
  // 5xx and 429 → retry
  if (status !== undefined && RETRYABLE_STATUS.has(status)) return true;
  return false;
}

/**
 * fetch with exponential backoff for transient errors.
 *
 * - Retries up to MAX_RETRIES times on network errors and 5xx/429.
 * - Honors Retry-After header when present (seconds).
 * - Aborts immediately on 4xx (except 429) — those won't recover.
 * - Logs each retry to console.warn with attempt # + status so debugging
 *   in the browser is straightforward.
 */
async function fetchWithRetry(
  path: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown = null;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        cache: 'no-store',
        ...init,
      });

      if (res.ok) return res;
      lastStatus = res.status;

      if (!shouldRetry(res.status, null, attempt)) {
        return res;
      }

      // Honor Retry-After header if present (in seconds)
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter
        ? Math.max(0, parseInt(retryAfter, 10) * 1000)
        : backoffDelay(attempt);

      // eslint-disable-next-line no-console
      console.warn(
        `[api] ${init.method ?? 'GET'} ${path} → ${res.status}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await delay(waitMs);
      // Drain the body so the connection can be reused
      await res.text().catch(() => undefined);
    } catch (err) {
      lastError = err;
      if (!shouldRetry(undefined, err, attempt)) {
        throw err;
      }
      const waitMs = backoffDelay(attempt);
      // eslint-disable-next-line no-console
      console.warn(
        `[api] ${init.method ?? 'GET'} ${path} → network error, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await delay(waitMs);
    }
  }

  // Exhausted retries. Return the last response (if we had one) or throw.
  if (lastStatus !== undefined) {
    // Re-issue a final request so we can surface the response status to the caller
    return fetch(`${API_BASE}${path}`, init);
  }
  throw lastError ?? new Error('fetchWithRetry: exhausted retries');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithRetry(path, {
    method: 'GET',
    ...(init ?? {}),
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, body, `GET ${path} failed (${res.status})`);
  }

  return (await res.json()) as T;
}

// ─── Dish list (GET /api/dishes) ──────────────────────────────────────────

export interface ListDishesParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: 'published' | 'draft' | 'archived';
  country?: string;    // origin country
  cuisine?: string;   // cuisine category (Korean cuisine, Italian cuisine…)
  type?: string;       // dish-type category (Noodle soup, Stew, Pasta…)
  ingredient?: string;
  technique?: string;
  region?: string;     // legacy alias for country
  category?: string;    // legacy alias for cuisine
  period?: string;     // historical era e.g. 1920-1950
  family?: string;      // kind='family' category slug (Dumplings, Noodle soups…)
}

export function listDishes(
  params: ListDishesParams = {},
): Promise<DishListResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.search) qs.set('q', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.country) qs.set('country', params.country);
  if (params.cuisine) qs.set('cuisine', params.cuisine);
  if (params.type) qs.set('type', params.type);
  if (params.ingredient) qs.set('ingredient', params.ingredient);
  if (params.technique) qs.set('technique', params.technique);
  if (params.region) qs.set('region', params.region);
  if (params.category) qs.set('category', params.category);
  if (params.period) qs.set('period', params.period);
  if (params.family) qs.set('family', params.family);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<DishListResponse>(`/api/dishes${suffix}`);
}

// ─── Dish detail (GET /api/dishes/:slug) ─────────────────────────────────

export interface GetDishDetailParams {
  language?: string;
}

export function getDishDetail(
  slug: string,
  params: GetDishDetailParams = {},
): Promise<DishDetailResponse> {
  const qs = new URLSearchParams();
  if (params.language) qs.set('language', params.language);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<DishDetailResponse>(
    `/api/dishes/${encodeURIComponent(slug)}${suffix}`,
  );
}

// ─── Health (GET /api/health) ─────────────────────────────────────────────

export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/api/health');
}

// ─── Map view (GET /api/dishes/map) ───────────────────────────────────────

export interface MapDishRegion {
  name: string;
  localName: string | null;
  isoCode: string | null;
  entityType: string | null;
}

export interface MapDish {
  slug: string;
  canonicalName: string;
  shortDescription: string | null;
  viewCount: number;
  lat: number;
  lng: number;
  region: MapDishRegion;
}

export interface MapDishesResponse {
  dishes: MapDish[];
  count: number;
}

export interface MapDishesParams {
  limit?: number;
}

/**
 * Fetch all published dishes with origin coordinates, in one request.
 * Returns a flat list (no pagination) — the standalone /map page plots
 * one dot per dish on a globe.
 */
export function getMapDishes(
  params: MapDishesParams = {},
): Promise<MapDishesResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<MapDishesResponse>(`/api/dishes/map${suffix}`);
}

// ─── Related dishes (food-genealogy network) ────────────────────────────

export interface RelatedDish {
  slug: string;
  name: string;
  shortDescription: string | null;
  cuisineSlug: string | null;
  cuisineName: string | null;
  countryName: string | null;
  isoCode: string | null;
  relationId: string;
  relationType: string;
  reason: string | null;
  strength: number;
}

export interface DishRelationsResponse {
  sourceSlug: string;
  totalRelations: number;
  relationsByType: Record<string, RelatedDish[]>;
}

/**
 * Fetch the curated dish-relations graph for a dish, grouped by
 * relation_type and ordered by strength desc. Powers the "Related
 * Dishes" section on every dish page.
 */
export function getDishRelations(slug: string): Promise<DishRelationsResponse> {
  return request<DishRelationsResponse>(
    `/api/dishes/${encodeURIComponent(slug)}/relations`,
  );
}

// ─── Taxonomy (GET /api/categories, GET /api/tags) ────────────────────────
// Powers the classification pickers in EditDishForm / NewDishForm. Both
// lists are small (low hundreds at most) and fetched in full — no
// pagination needed.

export function getCategories(): Promise<{ categories: CategoryListItem[] }> {
  return request<{ categories: CategoryListItem[] }>('/api/categories');
}

export function getTags(): Promise<{ tags: TagListItem[] }> {
  return request<{ tags: TagListItem[] }>('/api/tags');
}

// ─── Ingredient detail (GET /api/ingredients/:slug) ───────────────────────

export interface IngredientDetailResponse {
  ingredient: {
    slug: string;
    canonicalName: string;
    scientificName: string | null;
    category: string | null;
    shortDescription: string | null;
    longDescription: string | null;
  };
  dishes: Array<{
    dishSlug: string;
    dishName: string;
    isOptional: boolean;
    position: number;
  }>;
}

/**
 * Fetch a single ingredient (encyclopedia entry) plus the dishes that
 * use it. Powers the /ingredients/:slug page.
 */
export function getIngredient(slug: string): Promise<IngredientDetailResponse> {
  return request<IngredientDetailResponse>(
    `/api/ingredients/${encodeURIComponent(slug)}`,
  );
}

// ─── Media signed URL (GET /api/media/:id/signed-url) ─────────────────────

export interface MediaSignedUrlResponse {
  url: string;
  expiresInSeconds: number;
  mimeType: string;
  byteSize: number;
}

/**
 * Fetch a short-lived signed URL for a private media object.
 *
 * The URL expires in 15 minutes. Callers should fetch a fresh URL
 * each time the gallery component mounts; the URL is also passed to
 * <img src=...> which the browser fetches once per page render.
 *
 * For most use cases you don't need to call this directly — the
 * DishGallery component does the right thing on hydration.
 */
export function getMediaSignedUrl(
  mediaId: string,
): Promise<MediaSignedUrlResponse> {
  return request<MediaSignedUrlResponse>(
    `/api/media/${encodeURIComponent(mediaId)}/signed-url`,
  );
}
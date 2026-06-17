// Lightweight fetch wrapper for the gustale-api.
//
// In dev, requests go to the same origin and Astro's dev server proxy
// (configured in astro.config.mjs) forwards them to the API on :4000.
// In production, PUBLIC_API_BASE controls the absolute URL.
//
// All dish routes are mounted under /api/* on the server
// (see apps/api/src/routes/dishes.ts: app.get('/api/dishes', ...)).
// The /api prefix is consistent with the better-auth routes mounted
// at /api/auth/* (see server.ts).

import type {
  DishDetailResponse,
  DishListResponse,
  MapDish,
  MapDishesResponse,
} from '../types/dish';

const API_BASE =
  import.meta.env.PUBLIC_API_BASE ?? 'http://localhost:4000';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    ...init,
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
}

export function listDishes(
  params: ListDishesParams = {},
): Promise<DishListResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
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

export interface MapDishesParams {
  limit?: number;
}

/**
 * Fetch all published dishes with origin coordinates, in one request.
 * Returns a flat list (no pagination) — the map plots one dot per dish.
 */
export function getMapDishes(
  params: MapDishesParams = {},
): Promise<MapDishesResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<MapDishesResponse>(`/api/dishes/map${suffix}`);
}

// Re-export the map types so consumers can import everything from api.ts.
export type { MapDish, MapDishesResponse };
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

import type { DishDetail, DishListResponse } from '../types/dish';

const API_BASE =
  import.meta.env.PUBLIC_API_BASE ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
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

export interface ListDishesParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: 'published' | 'draft' | 'archived';
}

export function listDishes(params: ListDishesParams = {}): Promise<DishListResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<DishListResponse>(`/api/dishes${suffix}`);
}

export function getDish(slug: string): Promise<DishDetail> {
  return request<DishDetail>(`/api/dishes/${encodeURIComponent(slug)}`);
}

export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/api/health');
}

// ---------------------------------------------------------------------------
// Map view
// ---------------------------------------------------------------------------

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
 * Returns a flat list (no pagination) — the map plots one dot per dish.
 */
export function getMapDishes(params: MapDishesParams = {}): Promise<MapDishesResponse> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return request<MapDishesResponse>(`/api/dishes/map${suffix}`);
}

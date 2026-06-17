// Lightweight fetch wrapper for the gustale-api.
//
// In dev, requests go to the same origin and Astro's dev server proxy
// (configured in astro.config.mjs) forwards them to the API on :4000.
// In production, PUBLIC_API_BASE controls the absolute URL.

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
  return request<DishListResponse>(`/dishes${suffix}`);
}

export function getDish(slug: string): Promise<DishDetail> {
  return request<DishDetail>(`/dishes/${encodeURIComponent(slug)}`);
}

export function getHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('/health');
}

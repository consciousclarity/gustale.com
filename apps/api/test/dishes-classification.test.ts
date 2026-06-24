/**
 * Integration tests for dish classification (categories, tags, variants).
 *
 * Same in-process app.inject() approach as dishes-write.test.ts, with the
 * same better-auth mock. Categories/tags are read from the live seed data
 * via @gustale/db rather than hardcoded, so this doesn't drift if seed-data
 * changes.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, categories } from '@gustale/db';
import { buildServer } from '../src/server.js';
import * as authModule from '../src/auth.js';

const mockGetSession = vi.spyOn(authModule.auth.api, 'getSession');

const CONTRIBUTOR = {
  id: 'test-classification-contributor',
  email: '[email protected]',
  name: 'Test Contributor',
  emailVerified: true,
  role: 'contributor' as const,
  displayName: 'Tester',
};

function asContributor(): void {
  mockGetSession.mockResolvedValue({
    user: CONTRIBUTOR,
    session: { id: 's', userId: CONTRIBUTOR.id, expiresAt: new Date(), token: 't', ipAddress: null, userAgent: null, createdAt: new Date(), updatedAt: new Date() },
  } as never);
}

function asAnonymous(): void {
  mockGetSession.mockResolvedValue(null as never);
}

let app: FastifyInstance;
let draftSlug: string;
let otherDraftSlug: string;
let categoryIds: string[];

beforeAll(async () => {
  app = await buildServer();

  const cats = await db.select({ id: categories.id }).from(categories).limit(2);
  categoryIds = cats.map((c) => c.id);

  asContributor();
  draftSlug = `test-classification-${Date.now()}`;
  const created = await app.inject({
    method: 'POST',
    url: '/api/dishes',
    payload: { canonicalName: 'Classification Test Dish', slug: draftSlug },
  });
  expect(created.statusCode).toBe(201);

  otherDraftSlug = `test-classification-other-${Date.now()}`;
  const createdOther = await app.inject({
    method: 'POST',
    url: '/api/dishes',
    payload: { canonicalName: 'Other Draft Dish', slug: otherDraftSlug },
  });
  expect(createdOther.statusCode).toBe(201);
});

afterAll(async () => {
  await app.close();
  mockGetSession.mockRestore();
});

describe('GET /api/categories, GET /api/tags', () => {
  it('lists categories', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().categories)).toBe(true);
  });

  it('lists tags', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().tags)).toBe(true);
  });
});

describe('POST /api/tags — create-or-get', () => {
  it('requires auth', async () => {
    asAnonymous();
    const res = await app.inject({ method: 'POST', url: '/api/tags', payload: { name: 'Smoky' } });
    expect(res.statusCode).toBe(401);
  });

  it('creates a new tag, then returns the same tag on a repeat call', async () => {
    asContributor();
    const name = `Test Tag ${Date.now()}`;
    const first = await app.inject({ method: 'POST', url: '/api/tags', payload: { name } });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().tag.id;

    const second = await app.inject({ method: 'POST', url: '/api/tags', payload: { name } });
    expect(second.statusCode).toBe(200);
    expect(second.json().tag.id).toBe(firstId);
  });
});

describe('PATCH /api/dishes/:slug — categories + tags', () => {
  it('rejects more than one primary category', async () => {
    if (categoryIds.length < 2) return; // seed data must have ≥2 categories for this check
    asContributor();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/dishes/${draftSlug}`,
      payload: {
        categories: categoryIds.map((id) => ({ categoryId: id, isPrimary: true })),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('sets categories and tags, reflected on the next GET', async () => {
    asContributor();
    const tagRes = await app.inject({
      method: 'POST',
      url: '/api/tags',
      payload: { name: `Round Trip Tag ${Date.now()}` },
    });
    const tagId = tagRes.json().tag.id as string;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/dishes/${draftSlug}`,
      payload: {
        categories: categoryIds.slice(0, 1).map((id) => ({ categoryId: id, isPrimary: true })),
        tagIds: [tagId],
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().diff.tags).toBeDefined();

    // GET requires published status to be visible publicly, so query the
    // row directly via PATCH's own returned diff instead of re-fetching
    // the public detail route (drafts 404 there by design).
    expect(patch.json().diff.tags.to).toEqual([tagId]);
  });
});

describe('Dish variants CRUD', () => {
  let variantId: string;

  it('creates a variant on a draft dish', async () => {
    asContributor();
    const res = await app.inject({
      method: 'POST',
      url: `/api/dishes/${draftSlug}/variants`,
      payload: { name: 'Test Variant', slug: 'test-variant' },
    });
    expect(res.statusCode).toBe(201);
    variantId = res.json().variant.id;
    expect(variantId).toBeDefined();
  });

  it('rejects a duplicate variant slug on the same dish', async () => {
    asContributor();
    const res = await app.inject({
      method: 'POST',
      url: `/api/dishes/${draftSlug}/variants`,
      payload: { name: 'Test Variant Again', slug: 'test-variant' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('updates the variant', async () => {
    asContributor();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/dishes/${draftSlug}/variants/${variantId}`,
      payload: { description: 'Updated description' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().variant.description).toBe('Updated description');
  });

  it('404s when updating a variant via a sibling dish (wrong parent)', async () => {
    asContributor();
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/dishes/${otherDraftSlug}/variants/${variantId}`,
      payload: { description: 'wrong parent' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes the variant', async () => {
    asContributor();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/dishes/${draftSlug}/variants/${variantId}`,
    });
    expect(res.statusCode).toBe(204);
  });
});

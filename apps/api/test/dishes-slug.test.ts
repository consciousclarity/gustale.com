/**
 * Integration test for GET /api/dishes/:slug
 *
 * Boots the Fastify app in-process (no network), uses the live DATABASE_URL
 * from process.env. The seed must have been run (pnpm --filter @gustale/db run seed
 * or the equivalent SQL applied) for these to pass.
 *
 * Test dish: moussaka-greek
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

let app: FastifyInstance;
let dishSlug: string;

beforeAll(async () => {
  app = await buildServer();
  dishSlug = 'moussaka-greek';
});

describe('GET /api/dishes/:slug — full payload', () => {
  it('returns 200 with the complete Gustale dish payload', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/dishes/${dishSlug}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Top-level shape
    expect(body).toHaveProperty('dish');
    expect(body).toHaveProperty('origin');
    expect(body).toHaveProperty('variants');
    expect(body).toHaveProperty('ingredients');
    expect(body).toHaveProperty('categories');
    expect(body).toHaveProperty('preparations');
    expect(body).toHaveProperty('sources');
    expect(body).toHaveProperty('media');
    expect(body).toHaveProperty('coverImage');
    expect(body).toHaveProperty('availableLanguages');
  });

  it('dish has the translated name + description, not just canonical', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    expect(body.dish.name).toBe('Moussaka');
    expect(body.dish.description).toBeTruthy();
    expect(body.dish.slug).toBe(dishSlug);
    expect(body.dish.canonicalName).toBe('Moussaka');
  });

  it('origin has lat/lng extracted from PostGIS geometry', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    expect(body.origin).not.toBeNull();
    expect(body.origin).toMatchObject({
      name: 'Greece',
      isoCode: 'GR',
      entityType: 'country',
    });
    expect(typeof body.origin.lat).toBe('number');
    expect(typeof body.origin.lng).toBe('number');
    // Athens-ish: lng ~23.7, lat ~37.9
    expect(body.origin.lng).toBeCloseTo(23.7275, 2);
    expect(body.origin.lat).toBeCloseTo(37.9838, 2);
  });

  it('returns at least one variant, ingredient, category, preparation, source, media', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    expect(body.variants.length).toBeGreaterThanOrEqual(1);
    expect(body.ingredients.length).toBeGreaterThanOrEqual(3);
    expect(body.categories.length).toBeGreaterThanOrEqual(1);
    expect(body.preparations.length).toBeGreaterThanOrEqual(1);
    expect(body.sources.length).toBeGreaterThanOrEqual(1);
    expect(body.media.length).toBeGreaterThanOrEqual(1);
  });

  it('primary category is flagged', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    const primary = body.categories.find((c: { isPrimary: boolean }) => c.isPrimary);
    expect(primary).toBeDefined();
    expect(primary.name).toBe('Moussaka');
  });

  it('preparations carry the method slug and a steps string', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    for (const prep of body.preparations) {
      expect(typeof prep.methodSlug).toBe('string');
      expect(typeof prep.methodName).toBe('string');
      expect(typeof prep.steps).toBe('string');
    }
    // Simmering should come before baking (sequenceOrder)
    expect(body.preparations[0].methodSlug).toBe('simmer');
  });

  it('coverImage is the media item with role=cover', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    expect(body.coverImage).not.toBeNull();
    expect(body.coverImage.role).toBe('cover');
    expect(body.coverImage.storageKey).toContain('moussaka');
  });

  it('sources carry both citation metadata and source provenance', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    const src = body.sources[0];
    expect(src).toHaveProperty('claimText');
    expect(src).toHaveProperty('title');
    expect(src).toHaveProperty('url');
    expect(src).toHaveProperty('reliability');
    expect(src.title).toBe('Moussaka');
    expect(src.url).toContain('wikipedia.org');
  });

  it('availableLanguages lists en', async () => {
    const body = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    expect(body.availableLanguages).toContain('en');
  });

  it('view count increments on each call', async () => {
    const before = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    const beforeCount = before.dish.viewCount;
    // Hit it 3 more times
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` });
    }
    // Give the fire-and-forget update a moment
    await new Promise((r) => setTimeout(r, 200));
    const after = (await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` })).json();
    expect(after.dish.viewCount).toBeGreaterThan(beforeCount);
  });
});

describe('GET /api/dishes/:slug — 404 paths', () => {
  it('returns 404 for an unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dishes/this-does-not-exist' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('not_found');
  });

  it('returns 404 for a draft (visibility rule A1)', async () => {
    // First create a draft by toggling the existing dish's status, then querying it
    const { db, dishes } = await import('@gustale/db');
    const { eq } = await import('drizzle-orm');
    await db.update(dishes).set({ status: 'draft' }).where(eq(dishes.slug, dishSlug));
    try {
      const res = await app.inject({ method: 'GET', url: `/api/dishes/${dishSlug}` });
      expect(res.statusCode).toBe(404);
    } finally {
      // Restore
      await db.update(dishes).set({ status: 'published' }).where(eq(dishes.slug, dishSlug));
    }
  });
});

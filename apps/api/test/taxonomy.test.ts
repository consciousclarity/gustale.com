/**
 * Slice 1 — food-family taxonomy foundation.
 *
 * Unit assertions over the schema enums + DB assertions over the seeded
 * taxonomy (11 course groups + 77 families as `categories` rows). Boots the
 * server only to manage the shared @gustale/db client lifecycle (afterAll
 * app.close() ends the postgres connection) — queries hit the db directly,
 * not over HTTP. Requires DATABASE_URL (source apps/api/.env before running).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, like } from 'drizzle-orm';
import { db, categories, categoryKind, dishRelationType } from '@gustale/db';
import { buildServer } from '../src/server.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('taxonomy enums (unit)', () => {
  it('categoryKind is exactly [cuisine, course-group, family, dish-type]', () => {
    expect([...categoryKind]).toEqual([
      'cuisine',
      'course-group',
      'family',
      'dish-type',
    ]);
  });

  it('dishRelationType includes the new relation types (incl. same-region, same-occasion)', () => {
    for (const t of [
      'trade-route',
      'colonial',
      'festival-ritual',
      'ingredient-substitution',
      'cooking-vessel',
      'texture',
      'same-region',
      'same-occasion',
    ]) {
      expect(dishRelationType).toContain(t);
    }
    // existing values preserved (additive extension)
    expect(dishRelationType).toContain('family');
    expect(dishRelationType).toContain('shared-method');
  });
});

describe('taxonomy seed (DB)', () => {
  it('has exactly 11 course groups, all top-level (parentId null)', async () => {
    const rows = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(and(eq(categories.kind, 'course-group'), isNull(categories.parentId)));
    expect(rows.length).toBe(11);
  });

  it('has exactly 77 families, each parented to a course group', async () => {
    const families = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.kind, 'family'));
    expect(families.length).toBe(77);

    const groupIds = new Set(
      (
        await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.kind, 'course-group'))
      ).map((g) => g.id),
    );

    for (const f of families) {
      expect(f.parentId).not.toBeNull();
      expect(groupIds.has(f.parentId as string)).toBe(true);
    }
  });

  it('every course group has at least one family child', async () => {
    const groups = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.kind, 'course-group'));
    const familyParentIds = new Set(
      (
        await db
          .select({ parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.kind, 'family'))
      ).map((f) => f.parentId),
    );
    for (const g of groups) {
      expect(familyParentIds.has(g.id)).toBe(true);
    }
  });

  it('techniques-bases has at least 6 family children', async () => {
    const group = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, 'techniques-bases'))
      .limit(1);
    expect(group.length).toBe(1);
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.kind, 'family'), eq(categories.parentId, group[0]!.id)));
    expect(children.length).toBeGreaterThanOrEqual(6);
  });

  it('cuisines are kind=cuisine and legacy dish-types still resolve', async () => {
    const cuisines = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.kind, 'cuisine'), like(categories.slug, '%-cuisine')));
    expect(cuisines.length).toBeGreaterThanOrEqual(30);

    // A legacy dish-type slug still exists and is still kind='dish-type'
    // (back-compat: the `?category=<slug>` filter is unaffected).
    const legacy = await db
      .select({ kind: categories.kind })
      .from(categories)
      .where(eq(categories.slug, 'pasta'))
      .limit(1);
    expect(legacy.length).toBe(1);
    expect(legacy[0]!.kind).toBe('dish-type');
  });

  it('fried-rice was promoted from dish-type to a family with a parent', async () => {
    const row = await db
      .select({ kind: categories.kind, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.slug, 'fried-rice'))
      .limit(1);
    expect(row.length).toBe(1);
    expect(row[0]!.kind).toBe('family');
    expect(row[0]!.parentId).not.toBeNull();
  });
});

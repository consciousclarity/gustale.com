/**
 * Dish write endpoints — Phase 7c.
 *
 * - POST   /api/dishes             create a draft (any authenticated user)
 * - PATCH  /api/dishes/:slug       update fields, increment edit_count
 * - POST   /api/dishes/:slug/publish  moderator+ only, transitions draft → published
 * - DELETE /api/dishes/:slug       archive (admin only)
 *
 * Every write creates an `edit_history` row recording: who, when, what (diff),
 * and an optional comment. The history is the audit trail required for
 * community-driven content moderation.
 *
 * Authentication: `request.user` is populated by plugins/auth-context.ts.
 * Authorization: `app.requireRole(request, 'moderator')` for publish + delete.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  dishes,
  dishCategories,
  dishTags,
  dishVariants,
  editHistory,
  type EditAction,
} from '@gustale/db';
import { httpError } from '../errors.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createDishSchema = z.object({
  // canonicalName is the only required field for a stub draft.
  // Editors can fill in the rest via PATCH.
  canonicalName: z.string().min(2).max(200),
  slug: z.string().regex(SLUG_RE, 'Slug must be lowercase letters, digits, and hyphens').min(2).max(200),
  shortDescription: z.string().max(500).optional(),
  longDescription: z.string().max(20000).optional(),
  // Optional origin. We accept lat/lng; the API converts to PostGIS geometry.
  origin: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  // Optional date range (CE year; null = unknown)
  originDateEarliest: z.number().int().min(-3000).max(2100).optional(),
  originDateLatest: z.number().int().min(-3000).max(2100).optional(),
});

// Classification: which categories this dish belongs to (at most one
// marked primary) and which freeform tags apply. Both are full-replace
// semantics on PATCH — the client sends the complete desired set.
const categoryAssignmentSchema = z.object({
  categoryId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
});

const patchDishSchema = z
  .object({
    canonicalName: z.string().min(2).max(200).optional(),
    shortDescription: z.string().max(500).nullable().optional(),
    longDescription: z.string().max(20000).nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    origin: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .nullable()
      .optional(),
    originDateEarliest: z.number().int().min(-3000).max(2100).nullable().optional(),
    originDateLatest: z.number().int().min(-3000).max(2100).nullable().optional(),
    categories: z.array(categoryAssignmentSchema).max(20).optional(),
    tagIds: z.array(z.string().uuid()).max(50).optional(),
    comment: z.string().max(1000).optional(), // edit summary recorded in edit_history
  })
  .refine((obj) => Object.keys(obj).filter((k) => k !== 'comment').length > 0, {
    message: 'At least one field must be provided',
  })
  .refine(
    (obj) => !obj.categories || obj.categories.filter((c) => c.isPrimary).length <= 1,
    { message: 'At most one category can be marked primary' },
  );

// dish_variants sub-resource — name/slug/description plus optional
// attribution and a region pin. Reuses the same lat/lng-to-PostGIS
// conversion as the parent dish's origin.
const variantSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().regex(SLUG_RE, 'Slug must be lowercase letters, digits, and hyphens').min(2).max(200),
  description: z.string().max(20000).nullable().optional(),
  creatorName: z.string().max(200).nullable().optional(),
  creatorDate: z.number().int().min(-3000).max(2100).nullable().optional(),
  region: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
});

const variantPatchSchema = variantSchema.partial();

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Compute the diff between two dish snapshots. Returns an object where keys
 * are field names and values are `{ from, to }`. Used to populate the
 * `edit_history.diff` jsonb column so moderators can review changes.
 */
function diffDish(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'lastEditedBy' || k === 'editCount') continue;
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out[k] = { from: a ?? null, to: b ?? null };
    }
  }
  return out;
}

/**
 * Convert a `lat`/`lng` pair to a PostGIS `POINT(lng lat)` literal.
 * Note: PostGIS takes longitude FIRST in WKT, hence the parameter order.
 * We build the literal as a parameterized raw query to avoid SQL injection
 * (the values are validated by Zod before reaching here).
 */
function pointLiteral(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`;
}

/**
 * Shared draft/published authorization gate. Variants are edited as part
 * of their parent dish (no independent draft/published workflow in the
 * UI), so they reuse the parent dish's status to decide who can write.
 */
function assertDishEditable(
  user: { role: 'visitor' | 'contributor' | 'moderator' | 'admin' },
  dishRow: { status: string },
): void {
  if (dishRow.status === 'published') {
    const rank: Record<typeof user.role, number> = {
      visitor: 0,
      contributor: 1,
      moderator: 2,
      admin: 3,
    };
    if (rank[user.role] < rank.moderator) {
      throw httpError(403, 'forbidden', 'Only moderators can edit published dishes. Create a draft edit instead.');
    }
  } else if (dishRow.status === 'archived') {
    throw httpError(409, 'archived', 'Archived dishes are immutable. Un-archive first.');
  }
}

// ─── Route registration ──────────────────────────────────────────────────

export function registerDishWriteRoutes(app: FastifyInstance): void {
  // ─── POST /api/dishes ──────────────────────────────────────────────────
  // Create a draft dish. Any authenticated user can do this; new dishes
  // always start as `draft` and require a moderator to publish.
  app.post('/api/dishes', async (request, reply) => {
    const user = await app.requireUser(request);
    const body = createDishSchema.parse(request.body);

    // Reject duplicate slugs up front with a clean error rather than a
    // postgres unique-violation stack trace.
    const existing = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, body.slug))
      .limit(1);
    if (existing.length > 0) {
      throw httpError(409, 'slug_conflict', `A dish with slug "${body.slug}" already exists`, { fields: ['slug'] });
    }

    // Insert with optional origin. We use a single insert statement with
    // SQL helpers for the PostGIS column. Returning() gives us the new id.
    const pointWkt = body.origin ? pointLiteral(body.origin.lat, body.origin.lng) : null;
    const inserted = await db.execute(sql`
      INSERT INTO dishes (
        canonical_name, slug, short_description, long_description,
        origin_location, origin_date_earliest, origin_date_latest,
        status, created_by, last_edited_by
      ) VALUES (
        ${body.canonicalName},
        ${body.slug},
        ${body.shortDescription ?? null},
        ${body.longDescription ?? null},
        ${pointWkt ? sql`ST_GeomFromText(${pointWkt}, 4326)` : sql`NULL`},
        ${body.originDateEarliest ?? null},
        ${body.originDateLatest ?? null},
        'draft',
        ${user.id},
        ${user.id}
      )
      RETURNING id, slug, status, created_at
    `);
    const row = (inserted as unknown as Array<{
      id: string;
      slug: string;
      status: string;
      created_at: string;
    }>)[0];
    if (!row) {
      throw new Error('Insert returned no rows');
    }

    // Audit trail.
    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish',
      targetId: row.id,
      action: 'create' satisfies EditAction,
      diff: { after: body },
      comment: 'Initial draft',
    });

    return reply.status(201).send({
      dish: {
        id: row.id,
        slug: row.slug,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  });

  // ─── PATCH /api/dishes/:slug ──────────────────────────────────────────
  // Update an existing dish. Any authenticated user can update drafts;
  // only moderator+ can update published dishes (community edits require
  // review). The diff is recorded in edit_history for transparency.
  app.patch('/api/dishes/:slug', async (request, reply) => {
    const user = await app.requireUser(request);
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);
    const patch = patchDishSchema.parse(request.body);

    // Fetch current row for diff + role check.
    const current = await db
      .select()
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (current.length === 0) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const before = current[0]!;

    // Authorization: published dishes are moderator-only territory.
    // Drafts can be edited by anyone authenticated (incl. the creator).
    assertDishEditable(user, before);

    // Build the update payload.
    const updateValues: Record<string, unknown> = {
      lastEditedBy: user.id,
      updatedAt: new Date(),
    };
    if (patch.canonicalName !== undefined) updateValues.canonicalName = patch.canonicalName;
    if (patch.shortDescription !== undefined) updateValues.shortDescription = patch.shortDescription;
    if (patch.longDescription !== undefined) updateValues.longDescription = patch.longDescription;
    if (patch.originDateEarliest !== undefined) updateValues.originDateEarliest = patch.originDateEarliest;
    if (patch.originDateLatest !== undefined) updateValues.originDateLatest = patch.originDateLatest;
    if (patch.origin !== undefined) {
      updateValues.originLocation =
        patch.origin === null
          ? null
          : sql`ST_GeomFromText(${pointLiteral(patch.origin.lat, patch.origin.lng)}, 4326)`;
    }

    // Single UPDATE with RETURNING to avoid two round-trips.
    const result = await db
      .update(dishes)
      .set({
        ...updateValues,
        editCount: sql`${dishes.editCount} + 1`,
      })
      .where(eq(dishes.id, before.id))
      .returning();

    const after = result[0];
    if (!after) {
      throw new Error('Update affected zero rows (race?)');
    }

    const diff = diffDish(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );

    // Categories & tags are relational (not columns on `dishes`), so they
    // can't go through diffDish — handled here but folded into the same
    // edit_history entry for one coherent audit record per PATCH call.
    if (patch.categories !== undefined) {
      const beforeCats = await db
        .select({ categoryId: dishCategories.categoryId, isPrimary: dishCategories.isPrimary })
        .from(dishCategories)
        .where(eq(dishCategories.dishId, before.id));
      await db.delete(dishCategories).where(eq(dishCategories.dishId, before.id));
      if (patch.categories.length > 0) {
        await db.insert(dishCategories).values(
          patch.categories.map((c) => ({
            dishId: before.id,
            categoryId: c.categoryId,
            isPrimary: c.isPrimary ?? false,
          })),
        );
      }
      diff.categories = { from: beforeCats, to: patch.categories };
    }

    if (patch.tagIds !== undefined) {
      const beforeTags = await db
        .select({ tagId: dishTags.tagId })
        .from(dishTags)
        .where(eq(dishTags.dishId, before.id));
      await db.delete(dishTags).where(eq(dishTags.dishId, before.id));
      if (patch.tagIds.length > 0) {
        await db.insert(dishTags).values(
          patch.tagIds.map((tagId) => ({ dishId: before.id, tagId })),
        );
      }
      diff.tags = { from: beforeTags.map((t) => t.tagId), to: patch.tagIds };
    }

    if (Object.keys(diff).length > 0) {
      await db.insert(editHistory).values({
        userId: user.id,
        targetType: 'dish',
        targetId: before.id,
        action: 'update' satisfies EditAction,
        diff,
        comment: patch.comment ?? null,
      });
    }

    return reply.send({
      dish: {
        id: after.id,
        slug: after.slug,
        status: after.status,
        updatedAt: after.updatedAt,
        editCount: after.editCount,
      },
      diff,
    });
  });

  // ─── POST /api/dishes/:slug/publish ───────────────────────────────────
  // Moderator+ only. Transitions a draft to `published`.
  app.post('/api/dishes/:slug/publish', async (request, reply) => {
    const user = await app.requireRole(request, 'moderator');
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);
    const body = z.object({ comment: z.string().max(1000).optional() }).parse(request.body ?? {});

    const before = await db
      .select()
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (before.length === 0) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const row = before[0]!;

    if (row.status === 'published') {
      return reply.status(409).send({
        error: 'already_published',
        message: 'Dish is already published',
      });
    }
    if (row.status === 'archived') {
      return reply.status(409).send({
        error: 'archived',
        message: 'Cannot publish an archived dish. Restore first.',
      });
    }

    await db
      .update(dishes)
      .set({
        status: 'published',
        lastEditedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(dishes.id, row.id));

    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish',
      targetId: row.id,
      action: 'review' satisfies EditAction, // 'review' = moderator approval
      diff: { status: { from: 'draft', to: 'published' } },
      comment: body.comment ?? 'Published',
    });

    return reply.send({
      dish: { id: row.id, slug: row.slug, status: 'published' },
    });
  });

  // ─── DELETE /api/dishes/:slug ─────────────────────────────────────────
  // Admin only. Soft delete → archive.
  app.delete('/api/dishes/:slug', async (request, reply) => {
    const user = await app.requireRole(request, 'admin');
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);

    const existing = await db
      .select({ id: dishes.id, status: dishes.status })
      .from(dishes)
      .where(eq(dishes.slug, slug))
      .limit(1);
    if (existing.length === 0) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const row = existing[0]!;

    await db
      .update(dishes)
      .set({
        status: 'archived',
        lastEditedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(dishes.id, row.id));

    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish',
      targetId: row.id,
      action: 'archive' satisfies EditAction,
      diff: { status: { from: row.status, to: 'archived' } },
      comment: 'Archived by admin',
    });

    return reply.send({ dish: { id: row.id, slug, status: 'archived' } });
  });

  // ─── POST /api/dishes/:slug/variants ──────────────────────────────────
  // Add a regional/preparation variant to a dish.
  app.post('/api/dishes/:slug/variants', async (request, reply) => {
    const user = await app.requireUser(request);
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);
    const body = variantSchema.parse(request.body);

    const parent = await db.select().from(dishes).where(eq(dishes.slug, slug)).limit(1);
    if (parent.length === 0) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const dishRow = parent[0]!;
    assertDishEditable(user, dishRow);

    const dupe = await db
      .select({ id: dishVariants.id })
      .from(dishVariants)
      .where(and(eq(dishVariants.parentDishId, dishRow.id), eq(dishVariants.slug, body.slug)))
      .limit(1);
    if (dupe.length > 0) {
      throw httpError(409, 'slug_conflict', `A variant with slug "${body.slug}" already exists for this dish`, { fields: ['slug'] });
    }

    const regionWkt = body.region ? pointLiteral(body.region.lat, body.region.lng) : null;
    const inserted = await db.execute(sql`
      INSERT INTO dish_variants (
        parent_dish_id, name, slug, description,
        region_location, creator_name, creator_date, status
      ) VALUES (
        ${dishRow.id}, ${body.name}, ${body.slug}, ${body.description ?? null},
        ${regionWkt ? sql`ST_GeomFromText(${regionWkt}, 4326)` : sql`NULL`},
        ${body.creatorName ?? null}, ${body.creatorDate ?? null}, 'draft'
      )
      RETURNING id, parent_dish_id, name, slug, description, creator_name, creator_date, status, created_at, updated_at
    `);
    const row = (inserted as unknown as Array<Record<string, unknown>>)[0];
    if (!row) {
      throw new Error('Insert returned no rows');
    }

    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish_variant',
      targetId: row.id as string,
      action: 'create' satisfies EditAction,
      diff: { after: body },
      comment: `Added variant to ${dishRow.canonicalName}`,
    });

    return reply.status(201).send({ variant: row });
  });

  // ─── PATCH /api/dishes/:slug/variants/:variantId ──────────────────────
  app.patch('/api/dishes/:slug/variants/:variantId', async (request, reply) => {
    const user = await app.requireUser(request);
    const { slug, variantId } = z
      .object({ slug: z.string().min(1).max(200), variantId: z.string().uuid() })
      .parse(request.params);
    const body = variantPatchSchema.parse(request.body);

    const parent = await db.select().from(dishes).where(eq(dishes.slug, slug)).limit(1);
    if (parent.length === 0) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const dishRow = parent[0]!;
    assertDishEditable(user, dishRow);

    const existing = await db
      .select({ id: dishVariants.id })
      .from(dishVariants)
      .where(and(eq(dishVariants.id, variantId), eq(dishVariants.parentDishId, dishRow.id)))
      .limit(1);
    if (existing.length === 0) {
      throw httpError(404, 'not_found', 'Variant not found on this dish');
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateValues.name = body.name;
    if (body.slug !== undefined) updateValues.slug = body.slug;
    if (body.description !== undefined) updateValues.description = body.description;
    if (body.creatorName !== undefined) updateValues.creatorName = body.creatorName;
    if (body.creatorDate !== undefined) updateValues.creatorDate = body.creatorDate;
    if (body.region !== undefined) {
      updateValues.regionLocation =
        body.region === null
          ? null
          : sql`ST_GeomFromText(${pointLiteral(body.region.lat, body.region.lng)}, 4326)`;
    }

    const result = await db
      .update(dishVariants)
      .set(updateValues)
      .where(eq(dishVariants.id, variantId))
      .returning();
    const after = result[0]!;

    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish_variant',
      targetId: variantId,
      action: 'update' satisfies EditAction,
      diff: { ...body },
      comment: `Edited variant of ${dishRow.canonicalName}`,
    });

    return reply.send({ variant: after });
  });

  // ─── DELETE /api/dishes/:slug/variants/:variantId ─────────────────────
  app.delete('/api/dishes/:slug/variants/:variantId', async (request, reply) => {
    const user = await app.requireUser(request);
    const { slug, variantId } = z
      .object({ slug: z.string().min(1).max(200), variantId: z.string().uuid() })
      .parse(request.params);

    const parent = await db.select().from(dishes).where(eq(dishes.slug, slug)).limit(1);
    if (parent.length === 0) {
      throw httpError(404, 'not_found', 'Dish not found');
    }
    const dishRow = parent[0]!;
    assertDishEditable(user, dishRow);

    const existing = await db
      .select({ id: dishVariants.id })
      .from(dishVariants)
      .where(and(eq(dishVariants.id, variantId), eq(dishVariants.parentDishId, dishRow.id)))
      .limit(1);
    if (existing.length === 0) {
      throw httpError(404, 'not_found', 'Variant not found on this dish');
    }

    await db.delete(dishVariants).where(eq(dishVariants.id, variantId));

    await db.insert(editHistory).values({
      userId: user.id,
      targetType: 'dish_variant',
      targetId: variantId,
      action: 'archive' satisfies EditAction,
      diff: { deleted: true },
      comment: `Removed variant from ${dishRow.canonicalName}`,
    });

    return reply.status(204).send();
  });
}
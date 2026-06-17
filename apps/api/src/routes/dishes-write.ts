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
import { eq, sql } from 'drizzle-orm';
import {
  db,
  dishes,
  editHistory,
  type EditAction,
} from '@gustale/db';

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
    comment: z.string().max(1000).optional(), // edit summary recorded in edit_history
  })
  .refine((obj) => Object.keys(obj).filter((k) => k !== 'comment').length > 0, {
    message: 'At least one field must be provided',
  });

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
      return reply.status(409).send({
        error: 'slug_conflict',
        message: `A dish with slug "${body.slug}" already exists`,
      });
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
        ${user.id}::uuid,
        ${user.id}::uuid
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
      return reply.status(404).send({ error: 'not_found', message: 'Dish not found' });
    }
    const before = current[0]!;

    // Authorization: published dishes are moderator-only territory.
    // Drafts can be edited by anyone authenticated (incl. the creator).
    if (before.status === 'published') {
      // Inline role-rank check (avoid importing from plugin to keep this
      // file independent of plugin file location).
      const rank: Record<typeof user.role, number> = {
        visitor: 0,
        contributor: 1,
        moderator: 2,
        admin: 3,
      };
      if (rank[user.role] < rank.moderator) {
        return reply.status(403).send({
          error: 'forbidden',
          message: 'Only moderators can edit published dishes. Create a draft edit instead.',
        });
      }
    } else if (before.status === 'archived') {
      return reply.status(409).send({
        error: 'archived',
        message: 'Archived dishes are immutable. Un-archive first.',
      });
    }

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
      return reply.status(404).send({ error: 'not_found', message: 'Dish not found' });
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
      return reply.status(404).send({ error: 'not_found', message: 'Dish not found' });
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
}
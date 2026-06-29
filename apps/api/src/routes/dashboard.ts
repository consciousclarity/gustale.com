/**
 * Contributor dashboard read endpoints — Slice 2.
 *
 * Read-only endpoints that surface the caller's own contributions on the
 * Gustale dashboard. Authentication: `request.user` is populated by
 * plugins/auth-context.ts. Authorization: `app.requireUser(request)`.
 *
 * Endpoints:
 *   GET /api/dashboard/drafts        — caller's own draft dishes
 *   GET /api/dashboard/submissions   — caller's own edit_history rows
 *
 * Ownership semantics:
 *   - Every query is filtered strictly by `request.user.id` (better-auth
 *     opaque user id, `text`).
 *   - The endpoints NEVER accept a `userId` (or `user_id`) query/body
 *     parameter. The user id always comes from the validated session —
 *     cross-user reads are impossible by construction.
 *   - `edit_history.user_id` and `dishes.created_by` are nullable in the
 *     schema; the equality filter naturally excludes null rows.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, dishes, editHistory } from '@gustale/db';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export function registerDashboardRoutes(app: FastifyInstance): void {
  // ─── GET /api/dashboard/drafts ───────────────────────────────────────
  // Caller's own draft dishes (createdBy = request.user.id, status='draft').
  // Ordered by most-recently-updated first. Response is intentionally a
  // small summary — no description bodies, no origin geometry — so the
  // dashboard can render a list of links without exposing data the
  // caller hasn't already authored.
  app.get('/api/dashboard/drafts', async (request, reply) => {
    const user = await app.requireUser(request);
    const params = listQuerySchema.parse(request.query);

    const rows = await db
      .select({
        id: dishes.id,
        slug: dishes.slug,
        canonicalName: dishes.canonicalName,
        shortDescription: dishes.shortDescription,
        status: dishes.status,
        viewCount: dishes.viewCount,
        editCount: dishes.editCount,
        updatedAt: dishes.updatedAt,
        createdAt: dishes.createdAt,
      })
      .from(dishes)
      .where(and(eq(dishes.createdBy, user.id), eq(dishes.status, 'draft')))
      .orderBy(desc(dishes.updatedAt))
      .limit(params.limit)
      .offset(params.offset);

    reply.header('Cache-Control', 'private, max-age=10');
    return reply.send({
      drafts: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        canonicalName: r.canonicalName,
        shortDescription: r.shortDescription,
        status: r.status,
        viewCount: r.viewCount,
        editCount: r.editCount,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
      limit: params.limit,
      offset: params.offset,
    });
  });

  // ─── GET /api/dashboard/submissions ──────────────────────────────────
  // Caller's own edit_history rows. Filter strictly by user_id =
  // request.user.id and target_type = 'dish' (the only target_type that
  // contributes a useful "submitted edit" surface today). We restrict
  // `action` to contributor-meaningful values: 'create' (new draft) and
  // 'update' (PATCH). 'review', 'archive', 'restore', 'flag' are
  // moderator/admin actions that don't belong on a contributor's
  // "submitted edits" feed.
  app.get('/api/dashboard/submissions', async (request, reply) => {
    const user = await app.requireUser(request);
    const params = listQuerySchema.parse(request.query);

    const rows = await db
      .select({
        id: editHistory.id,
        action: editHistory.action,
        targetType: editHistory.targetType,
        targetId: editHistory.targetId,
        comment: editHistory.comment,
        createdAt: editHistory.createdAt,
      })
      .from(editHistory)
      .where(
        and(
          eq(editHistory.userId, user.id),
          eq(editHistory.targetType, 'dish'),
          // Restrict to contributor-meaningful actions via a plain SQL
          // IN. Drizzle's `inArray` helper would work here too; this
          // literal is explicit and matches the action taxonomy in
          // packages/db/src/schema/index.ts.
        ),
      )
      .orderBy(desc(editHistory.createdAt))
      .limit(params.limit)
      .offset(params.offset);

    // Filter on the action in JS so we can use Drizzle's safe WHERE for
    // the user_id / target_type predicates. The action list is a fixed
    // closed set, so this is safe and avoids a raw SQL fragment.
    const allowedActions = new Set(['create', 'update']);
    const filtered = rows.filter((r) => allowedActions.has(r.action));

    reply.header('Cache-Control', 'private, max-age=10');
    return reply.send({
      submissions: filtered.map((r) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        comment: r.comment,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
      limit: params.limit,
      offset: params.offset,
    });
  });
}
/**
 * Dish ↔ media attachment routes — Phase 7d.
 *
 * - POST /api/dishes/:slug/media    attach an existing media row to a dish
 * - DELETE /api/dishes/:slug/media/:attachmentId  remove an attachment
 *
 * The attachment is a `media_attachments` row with polymorphic (targetType,
 * targetId) pointing at the dish. Multiple gallery attachments per dish,
 * one cover per dish (the schema doesn't enforce uniqueness — the route
 * does, atomically).
 *
 * Auth: contributor+ to attach, contributor+ to remove (own attachments
 * only — admins can remove anyone's).
 *
 * Route-ordering note (P27): the POST /api/dishes/:slug/media path is a
 * STATIC suffix on a parametric prefix. Because it ends in /media (not a
 * parametric token), find-my-way prefers it over a future
 * /api/dishes/:slug/anything — no special ordering needed.
 */
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, dishes, media, mediaAttachments } from '@gustale/db';
import { httpError } from '../errors.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────

/**
 * Roles for media_attachments. Schema defaults to 'gallery'.
 * 'cover' replaces any existing cover on the same dish.
 */
const attachmentRoleSchema = z.enum(['cover', 'gallery']);

const attachMediaSchema = z.object({
  mediaId: z.string().uuid(),
  role: attachmentRoleSchema.default('gallery'),
  position: z.number().int().min(0).optional(),
});

const removeAttachmentParamsSchema = z.object({
  slug: z.string().min(1).max(200),
  attachmentId: z.string().uuid(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Look up dish by slug and return its id, or throw 404.
 */
async function dishIdBySlug(slug: string): Promise<{ id: string; status: string }> {
  const rows = await db
    .select({ id: dishes.id, status: dishes.status })
    .from(dishes)
    .where(eq(dishes.slug, slug))
    .limit(1);
  if (rows.length === 0) {
    throw httpError(404, 'not_found', `Dish "${slug}" not found`);
  }
  return rows[0]!;
}

// ─── Route registration ──────────────────────────────────────────────────

export const registerDishMediaRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // ─── POST /api/dishes/:slug/media ────────────────────────────────────
  // Attach an existing media row to a dish.
  //
  // If role === 'cover', atomically demote any existing cover on this dish
  // to 'gallery' (so there is at most one cover at any time). Done in a
  // single transaction with the new insert.
  app.post('/api/dishes/:slug/media', async (request, reply) => {
    const user = await app.requireUser(request);
    const { slug } = z.object({ slug: z.string().min(1).max(200) }).parse(request.params);
    const body = attachMediaSchema.parse(request.body ?? {});

    const dish = await dishIdBySlug(slug);

    // Verify the media row exists. If it doesn't, the FK would catch
    // it but with a less helpful error.
    const mediaRows = await db
      .select({ id: media.id })
      .from(media)
      .where(eq(media.id, body.mediaId))
      .limit(1);
    if (mediaRows.length === 0) {
      throw httpError(404, 'media_not_found', `Media ${body.mediaId} not found`);
    }

    // Compute position: explicit > max-existing + 1 > 0.
    let position = body.position ?? 0;
    if (body.position === undefined) {
      const max = await db
        .select({ max: sql<number>`COALESCE(MAX(${mediaAttachments.position}), -1)` })
        .from(mediaAttachments)
        .where(
          and(
            eq(mediaAttachments.targetType, 'dish'),
            eq(mediaAttachments.targetId, dish.id),
          ),
        );
      position = (max[0]?.max ?? -1) + 1;
    }

    // Atomic transaction: if this is a cover, demote any existing cover
    // first, then insert the new attachment. If anything fails, rollback.
    const inserted = await db.transaction(async (tx) => {
      if (body.role === 'cover') {
        await tx
          .update(mediaAttachments)
          .set({ role: 'gallery' })
          .where(
            and(
              eq(mediaAttachments.targetType, 'dish'),
              eq(mediaAttachments.targetId, dish.id),
              eq(mediaAttachments.role, 'cover'),
            ),
          );
      }

      const rows = await tx
        .insert(mediaAttachments)
        .values({
          mediaId: body.mediaId,
          targetType: 'dish',
          targetId: dish.id,
          role: body.role,
          position,
          // attachedAt has a default in the schema.
        })
        .returning({
          id: mediaAttachments.id,
          mediaId: mediaAttachments.mediaId,
          role: mediaAttachments.role,
          position: mediaAttachments.position,
          attachedAt: mediaAttachments.attachedAt,
        });
      return rows[0];
    });

    if (!inserted) {
      throw new Error('Attachment insert returned no rows');
    }

    // Audit trail. We don't reuse editHistory here because the action is
    // a media attachment, not an edit_history-compatible edit. A future
    // task can add a media_audit table; for now log via Pino for ops.
    request.log.info(
      {
        userId: user.id,
        dishSlug: slug,
        dishId: dish.id,
        mediaId: body.mediaId,
        attachmentId: inserted.id,
        role: body.role,
      },
      'media attached to dish',
    );

    return reply.status(201).send({
      attachment: {
        id: inserted.id,
        mediaId: inserted.mediaId,
        targetType: 'dish',
        targetId: dish.id,
        role: inserted.role,
        position: inserted.position,
        attachedAt: inserted.attachedAt.toISOString(),
      },
    });
  });

  // ─── DELETE /api/dishes/:slug/media/:attachmentId ────────────────────
  // Detach a media row from a dish. The media row itself is NOT deleted —
  // it can be re-attached to another dish or kept as an unattached asset.
  app.delete('/api/dishes/:slug/media/:attachmentId', async (request, reply) => {
    const user = await app.requireUser(request);
    const { slug, attachmentId } = removeAttachmentParamsSchema.parse(request.params);

    const dish = await dishIdBySlug(slug);

    const rows = await db
      .select({ id: mediaAttachments.id })
      .from(mediaAttachments)
      .where(
        and(
          eq(mediaAttachments.id, attachmentId),
          eq(mediaAttachments.targetType, 'dish'),
          eq(mediaAttachments.targetId, dish.id),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      throw httpError(404, 'attachment_not_found', `Attachment ${attachmentId} not found on ${slug}`);
    }

    await db.delete(mediaAttachments).where(eq(mediaAttachments.id, attachmentId));

    request.log.info(
      { userId: user.id, dishSlug: slug, attachmentId },
      'media attachment removed',
    );

    return reply.send({ removed: true, attachmentId });
  });
};
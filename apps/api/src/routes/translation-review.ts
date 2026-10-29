/**
 * ADR-003 layer 4 — the translation review and moderation surface.
 *
 * The ADR: "Contributor corrections go through the existing moderation
 * path — a contributor proposes a correction, a moderator accepts it,
 * and the correction becomes the `reviewed` text."
 *
 * The DATABASE already enforces that: accepting a proposal makes it
 * the translation's text and sets the status to `reviewed`
 * (db/migrations/0026_adr003_sentence_translations.sql). This route is
 * the surface over it.
 *
 * The three roles:
 *
 *   | role         | can do
 *   |--------------|------------------------------------------------------------
 *   | contributor  | PROPOSE a correction to a machine translation
 *   | moderator    | ACCEPT or REJECT a correction, and mark a
 *   |              | translation as reviewed
 *   | visitor      | read the review queue
 *
 * The two queues:
 *
 *   - the REVIEW QUEUE: the machine translations that no human has
 *     confirmed. This is the 10%-sample style review the project
 *     uses elsewhere — and here it is the whole queue, because every
 *     translation starts as machine.
 *
 *   - the STALE QUEUE: the translations whose English source has
 *     changed. These are re-translated, but a human should look at
 *     them too.
 *
 * Authorization: `app.requireUser` for reading, and a role rank for
 * the mutating routes, the same shape as dishes-write.ts.
 */

import {
  db,
  descriptionSentences,
  descriptionSentenceTranslations,
  dishes,
} from "@gustale/db";
import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { httpError } from "../errors.js";

/** The role rank, highest first. Mirrors dishes-write.ts. */
const RANK = {
  visitor: 0,
  contributor: 1,
  moderator: 2,
  admin: 3,
} as const;

type Role = keyof typeof RANK;

function assertRole(user: { role: string }, needed: Role): void {
  const rank =
    RANK[(user.role as Role) in RANK ? (user.role as Role) : "visitor"];
  if (rank < RANK[needed]) {
    throw httpError(403, "forbidden", `This action needs the ${needed} role.`);
  }
}

/** How many rows a list route returns at most. */
const PAGE_SIZE = 100;

export function registerTranslationReviewRoutes(app: FastifyInstance): void {
  // ─── The review queue ────────────────────────────────────────────────
  //
  // The machine translations that no human has confirmed, with the
  // English source beside them so the reviewer can compare.
  app.get(
    "/api/admin/translations/review-queue",
    { preHandler: app.requireUser },
    async (request) => {
      const query = request.query as {
        locale?: string;
        limit?: string;
        offset?: string;
      };

      const limit = Math.min(
        Number(query.limit ?? PAGE_SIZE) || PAGE_SIZE,
        PAGE_SIZE,
      );
      const offset = Number(query.offset ?? 0) || 0;

      const conditions = [
        eq(descriptionSentenceTranslations.status, "machine"),
        isNull(descriptionSentenceTranslations.proposalStatus),
      ];
      if (query.locale) {
        conditions.push(
          eq(descriptionSentenceTranslations.locale, query.locale),
        );
      }

      const rows = await db
        .select({
          translationId: descriptionSentenceTranslations.id,
          locale: descriptionSentenceTranslations.locale,
          text: descriptionSentenceTranslations.text,
          status: descriptionSentenceTranslations.status,
          isStale: descriptionSentenceTranslations.isStale,
          translator: descriptionSentenceTranslations.translator,
          updatedAt: descriptionSentenceTranslations.updatedAt,
          sentenceId: descriptionSentences.id,
          sourceText: descriptionSentences.text,
          field: descriptionSentences.field,
          position: descriptionSentences.position,
          dishSlug: dishes.slug,
        })
        .from(descriptionSentenceTranslations)
        .innerJoin(
          descriptionSentences,
          eq(
            descriptionSentenceTranslations.sourceSentenceId,
            descriptionSentences.id,
          ),
        )
        .innerJoin(dishes, eq(descriptionSentences.dishId, dishes.id))
        .where(and(...conditions))
        .orderBy(
          asc(descriptionSentenceTranslations.locale),
          asc(dishes.slug),
          asc(descriptionSentences.field),
          asc(descriptionSentences.position),
        )
        .limit(limit)
        .offset(offset);

      const totals = await db
        .select({
          locale: descriptionSentenceTranslations.locale,
          n: count(),
        })
        .from(descriptionSentenceTranslations)
        .where(eq(descriptionSentenceTranslations.status, "machine"))
        .groupBy(descriptionSentenceTranslations.locale);

      return {
        queue: rows,
        total: totals.reduce((sum, t) => sum + t.n, 0),
        byLocale: totals,
        limit,
        offset,
      };
    },
  );

  // ─── The stale queue ─────────────────────────────────────────────────
  //
  // The translations whose English source has changed. These are
  // re-translated automatically, but a human should confirm the
  // re-translation, because a source edit can change the meaning.
  app.get(
    "/api/admin/translations/stale-queue",
    { preHandler: app.requireUser },
    async (request) => {
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(
        Number(query.limit ?? PAGE_SIZE) || PAGE_SIZE,
        PAGE_SIZE,
      );
      const offset = Number(query.offset ?? 0) || 0;

      const rows = await db
        .select({
          translationId: descriptionSentenceTranslations.id,
          locale: descriptionSentenceTranslations.locale,
          text: descriptionSentenceTranslations.text,
          status: descriptionSentenceTranslations.status,
          updatedAt: descriptionSentenceTranslations.updatedAt,
          sourceText: descriptionSentences.text,
          sourceHash: descriptionSentenceTranslations.sourceHash,
          currentHash: sql<string>`description_sentence_source_hash(${descriptionSentences.text})`,
          dishSlug: dishes.slug,
          field: descriptionSentences.field,
          position: descriptionSentences.position,
        })
        .from(descriptionSentenceTranslations)
        .innerJoin(
          descriptionSentences,
          eq(
            descriptionSentenceTranslations.sourceSentenceId,
            descriptionSentences.id,
          ),
        )
        .innerJoin(dishes, eq(descriptionSentences.dishId, dishes.id))
        .where(eq(descriptionSentenceTranslations.isStale, true))
        .orderBy(asc(descriptionSentenceTranslations.locale), asc(dishes.slug))
        .limit(limit)
        .offset(offset);

      return { queue: rows, limit, offset };
    },
  );

  // ─── The pending proposals ───────────────────────────────────────────
  app.get(
    "/api/admin/translations/proposals",
    { preHandler: app.requireUser },
    async (request) => {
      const query = request.query as { status?: string };
      const conditions = [
        sql`${descriptionSentenceTranslations.proposalStatus} is not null`,
      ];
      if (query.status) {
        conditions.push(
          eq(
            descriptionSentenceTranslations.proposalStatus as never,
            query.status,
          ),
        );
      }

      const rows = await db
        .select({
          translationId: descriptionSentenceTranslations.id,
          locale: descriptionSentenceTranslations.locale,
          currentText: descriptionSentenceTranslations.text,
          proposedText: descriptionSentenceTranslations.proposedText,
          proposedBy: descriptionSentenceTranslations.proposedBy,
          proposedAt: descriptionSentenceTranslations.proposedAt,
          proposalStatus: descriptionSentenceTranslations.proposalStatus,
          sourceText: descriptionSentences.text,
          dishSlug: dishes.slug,
          field: descriptionSentences.field,
          position: descriptionSentences.position,
        })
        .from(descriptionSentenceTranslations)
        .innerJoin(
          descriptionSentences,
          eq(
            descriptionSentenceTranslations.sourceSentenceId,
            descriptionSentences.id,
          ),
        )
        .innerJoin(dishes, eq(descriptionSentences.dishId, dishes.id))
        .where(and(...conditions))
        .orderBy(asc(descriptionSentenceTranslations.proposedAt));

      return { proposals: rows };
    },
  );

  // ─── Propose a correction ────────────────────────────────────────────
  //
  // A contributor proposes; a moderator accepts. The proposal does not
  // change the translation until it is accepted.
  app.post(
    "/api/admin/translations/:id/propose",
    { preHandler: app.requireUser },
    async (request) => {
      const user = request.user as { id: string; role: string };
      assertRole(user, "contributor");

      const { id } = request.params as { id: string };
      const body = request.body as { text?: string; note?: string };

      const text = body.text?.trim();
      if (!text) {
        throw httpError(400, "invalid_body", "A proposed text is required.");
      }

      const existing = await db
        .select({
          id: descriptionSentenceTranslations.id,
          proposalStatus: descriptionSentenceTranslations.proposalStatus,
        })
        .from(descriptionSentenceTranslations)
        .where(eq(descriptionSentenceTranslations.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw httpError(404, "not_found", "No such translation.");
      }
      if (existing[0]?.proposalStatus === "pending") {
        throw httpError(
          409,
          "conflict",
          "A correction is already pending on this translation.",
        );
      }

      await db
        .update(descriptionSentenceTranslations)
        .set({
          proposedText: text,
          proposedBy: user.id,
          proposedAt: new Date(),
          proposalStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(descriptionSentenceTranslations.id, id));

      return { ok: true, id, proposalStatus: "pending" };
    },
  );

  // ─── Accept or reject a correction ───────────────────────────────────
  //
  // Accepting is what the DATABASE does: the trigger makes the
  // proposed text the translation's text, sets the status to
  // `reviewed`, stamps reviewed_at, and clears the proposal.
  app.post(
    "/api/admin/translations/:id/resolve",
    { preHandler: app.requireUser },
    async (request) => {
      const user = request.user as { id: string; role: string };
      assertRole(user, "moderator");

      const { id } = request.params as { id: string };
      const body = request.body as { decision?: string };

      if (body.decision !== "accepted" && body.decision !== "rejected") {
        throw httpError(
          400,
          "invalid_body",
          "The decision must be 'accepted' or 'rejected'.",
        );
      }

      const existing = await db
        .select({
          id: descriptionSentenceTranslations.id,
          proposalStatus: descriptionSentenceTranslations.proposalStatus,
          proposedText: descriptionSentenceTranslations.proposedText,
        })
        .from(descriptionSentenceTranslations)
        .where(eq(descriptionSentenceTranslations.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw httpError(404, "not_found", "No such translation.");
      }
      if (existing[0]?.proposalStatus !== "pending") {
        throw httpError(
          409,
          "conflict",
          "This translation has no pending correction.",
        );
      }

      if (body.decision === "rejected") {
        // A rejection clears the proposal and leaves the translation
        // as it was. The trigger only fires on an ACCEPTANCE.
        await db
          .update(descriptionSentenceTranslations)
          .set({
            proposedText: null,
            proposedBy: null,
            proposedAt: null,
            proposalStatus: null,
            updatedAt: new Date(),
          })
          .where(eq(descriptionSentenceTranslations.id, id));

        return { ok: true, id, decision: "rejected" };
      }

      // The acceptance. The trigger does the work.
      await db
        .update(descriptionSentenceTranslations)
        .set({ proposalStatus: "accepted" })
        .where(eq(descriptionSentenceTranslations.id, id));

      return { ok: true, id, decision: "accepted" };
    },
  );

  // ─── Mark a translation as reviewed ──────────────────────────────────
  //
  // A moderator confirms the machine translation as it stands. No text
  // changes; the status does.
  app.post(
    "/api/admin/translations/:id/review",
    { preHandler: app.requireUser },
    async (request) => {
      const user = request.user as { id: string; role: string };
      assertRole(user, "moderator");

      const { id } = request.params as { id: string };

      const existing = await db
        .select({ id: descriptionSentenceTranslations.id })
        .from(descriptionSentenceTranslations)
        .where(eq(descriptionSentenceTranslations.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw httpError(404, "not_found", "No such translation.");
      }

      await db
        .update(descriptionSentenceTranslations)
        .set({
          status: "reviewed",
          reviewedBy: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(descriptionSentenceTranslations.id, id));

      return { ok: true, id, status: "reviewed" };
    },
  );

  // ─── The summary ─────────────────────────────────────────────────────
  app.get(
    "/api/admin/translations/summary",
    { preHandler: app.requireUser },
    async () => {
      const rows = await db
        .select({
          locale: descriptionSentenceTranslations.locale,
          status: descriptionSentenceTranslations.status,
          isStale: descriptionSentenceTranslations.isStale,
          n: count(),
        })
        .from(descriptionSentenceTranslations)
        .groupBy(
          descriptionSentenceTranslations.locale,
          descriptionSentenceTranslations.status,
          descriptionSentenceTranslations.isStale,
        )
        .orderBy(asc(descriptionSentenceTranslations.locale));

      const pending = await db
        .select({ n: count() })
        .from(descriptionSentenceTranslations)
        .where(
          eq(
            descriptionSentenceTranslations.proposalStatus as never,
            "pending",
          ),
        );

      return {
        byLocale: rows,
        pendingProposals: pending[0]?.n ?? 0,
      };
    },
  );
}

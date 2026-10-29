/**
 * Integration tests for the ADR-003 layer 4 translation review surface.
 *
 * The DATABASE enforces the moderation flow — accepting a proposal
 * makes it the translation's text and sets the status to `reviewed`.
 * These tests check that the ROUTE drives that flow correctly and
 * that the role gates hold.
 *
 * What's covered:
 *   - the review queue lists the machine translations with their source
 *   - the stale queue lists the translations whose source changed
 *   - a contributor can PROPOSE a correction
 *   - a contributor CANNOT accept a correction (403)
 *   - a moderator can ACCEPT, and the text becomes the reviewed text
 *   - a moderator can REJECT, and the text is unchanged
 *   - a moderator can mark a translation as reviewed
 *   - an unauthenticated request is refused (401)
 */

import { randomUUID } from "node:crypto";
import {
  db,
  descriptionSentences,
  descriptionSentenceTranslations,
  dishes,
  users,
} from "@gustale/db";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as authModule from "../src/auth.js";
import { buildServer } from "../src/server.js";

const mockGetSession = vi.spyOn(authModule.auth.api, "getSession");

const CONTRIBUTOR = {
  id: "tr-test-contributor",
  email: "tr-contributor@example.invalid",
  name: "TR Contributor",
  emailVerified: true,
  role: "contributor" as const,
  displayName: "TR C",
};

const MODERATOR = {
  id: "tr-test-moderator",
  email: "tr-moderator@example.invalid",
  name: "TR Moderator",
  emailVerified: true,
  role: "moderator" as const,
  displayName: "TR M",
};

function asContributor(): void {
  mockGetSession.mockResolvedValue({
    user: CONTRIBUTOR,
    session: {
      id: "s",
      userId: CONTRIBUTOR.id,
      expiresAt: new Date(),
      token: "t",
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as never);
}

function asModerator(): void {
  mockGetSession.mockResolvedValue({
    user: MODERATOR,
    session: {
      id: "s",
      userId: MODERATOR.id,
      expiresAt: new Date(),
      token: "t",
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as never);
}

function asAnonymous(): void {
  mockGetSession.mockResolvedValue(null as never);
}

let app: FastifyInstance;
let dishId: string;
let sentenceId: string;
let translationId: string;

beforeAll(async () => {
  app = await buildServer();

  // The users. The translation table references `users(id)` for the
  // proposer and the reviewer, so a mocked session is not enough — the
  // user has to EXIST, or the proposal violates the foreign key.
  await db
    .insert(users)
    .values([
      {
        id: CONTRIBUTOR.id,
        email: CONTRIBUTOR.email,
        displayName: CONTRIBUTOR.displayName,
        role: "contributor",
      },
      {
        id: MODERATOR.id,
        email: MODERATOR.email,
        displayName: MODERATOR.displayName,
        role: "moderator",
      },
    ])
    .onConflictDoNothing();

  // A dish, an English sentence, and a machine translation of it.
  dishId = randomUUID();
  await db.insert(dishes).values({
    id: dishId,
    slug: `tr-test-dish-${Date.now()}`,
    canonicalName: "TR Test Dish",
    shortDescription: "A test dish for the translation review surface.",
    status: "published",
  } as never);

  sentenceId = randomUUID();
  await db.insert(descriptionSentences).values({
    id: sentenceId,
    dishId,
    field: "short",
    locale: "en",
    position: 1,
    text: "A test dish for the translation review surface.",
  } as never);

  translationId = randomUUID();
  await db.insert(descriptionSentenceTranslations).values({
    id: translationId,
    sourceSentenceId: sentenceId,
    locale: "es",
    text: "Un plato de prueba para la superficie de revision.",
    sourceHash: "test-hash",
    status: "machine",
    isStale: false,
    translator: "test",
  } as never);
});

afterAll(async () => {
  await db
    .delete(descriptionSentenceTranslations)
    .where(eq(descriptionSentenceTranslations.id, translationId));
  await db
    .delete(descriptionSentences)
    .where(eq(descriptionSentences.id, sentenceId));
  await db.delete(dishes).where(eq(dishes.id, dishId));
  // The two users, by a list — an AND of two different ids matches
  // nothing, and would leave both behind.
  await db
    .delete(users)
    .where(inArray(users.id, [CONTRIBUTOR.id, MODERATOR.id]));
  await app.close();
  mockGetSession.mockRestore();
});

beforeEach(async () => {
  // Reset the translation between the tests, so they do not depend on
  // each other's order.
  await db
    .update(descriptionSentenceTranslations)
    .set({
      text: "Un plato de prueba para la superficie de revision.",
      status: "machine",
      isStale: false,
      proposedText: null,
      proposedBy: null,
      proposedAt: null,
      proposalStatus: null,
    })
    .where(eq(descriptionSentenceTranslations.id, translationId));
});

describe("GET /api/admin/translations/review-queue", () => {
  it("returns 401 when no session cookie", async () => {
    asAnonymous();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/translations/review-queue",
    });
    expect(res.statusCode).toBe(401);
  });

  it("lists the machine translations with their English source", async () => {
    asContributor();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/translations/review-queue?locale=es",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      queue: Array<{
        translationId: string;
        sourceText: string;
        text: string;
      }>;
    };
    const row = body.queue.find((q) => q.translationId === translationId);
    expect(row).toBeDefined();
    expect(row?.sourceText).toBe(
      "A test dish for the translation review surface.",
    );
    expect(row?.text).toContain("plato de prueba");
  });
});

describe("POST /api/admin/translations/:id/propose", () => {
  it("returns 401 when no session cookie", async () => {
    asAnonymous();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/propose`,
      payload: { text: "Un plato de prueba corregido." },
    });
    expect(res.statusCode).toBe(401);
  });

  it("records a proposed correction without changing the translation", async () => {
    asContributor();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/propose`,
      payload: { text: "Un plato de prueba corregido." },
    });
    expect(res.statusCode).toBe(200);

    const row = await db
      .select()
      .from(descriptionSentenceTranslations)
      .where(eq(descriptionSentenceTranslations.id, translationId))
      .limit(1);

    // The proposal is recorded...
    expect(row[0]?.proposedText).toBe("Un plato de prueba corregido.");
    expect(row[0]?.proposalStatus).toBe("pending");
    // ...but the translation itself is UNCHANGED until it is accepted.
    expect(row[0]?.text).toBe(
      "Un plato de prueba para la superficie de revision.",
    );
    expect(row[0]?.status).toBe("machine");
  });

  it("refuses a second pending proposal on the same translation", async () => {
    asContributor();

    // The FIRST proposal goes through.
    const first = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/propose`,
      payload: { text: "Una primera propuesta." },
    });
    expect(first.statusCode).toBe(200);

    // The SECOND is refused, because one is already pending.
    const second = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/propose`,
      payload: { text: "Otra propuesta." },
    });
    expect(second.statusCode).toBe(409);
  });
});

describe("POST /api/admin/translations/:id/resolve", () => {
  it("refuses a contributor", async () => {
    asContributor();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/resolve`,
      payload: { decision: "accepted" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("a moderator's acceptance makes the proposal the reviewed text", async () => {
    // Propose first.
    asContributor();
    await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/propose`,
      payload: { text: "Un plato de prueba corregido." },
    });

    // Then accept.
    asModerator();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/resolve`,
      payload: { decision: "accepted" },
    });
    expect(res.statusCode).toBe(200);

    const row = await db
      .select()
      .from(descriptionSentenceTranslations)
      .where(eq(descriptionSentenceTranslations.id, translationId))
      .limit(1);

    // The proposal IS the text now, and it is REVIEWED.
    expect(row[0]?.text).toBe("Un plato de prueba corregido.");
    expect(row[0]?.status).toBe("reviewed");
    // And the proposal is cleared.
    expect(row[0]?.proposedText).toBeNull();
    expect(row[0]?.proposalStatus).toBeNull();
  });

  it("a moderator's rejection leaves the text unchanged", async () => {
    asContributor();
    await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/propose`,
      payload: { text: "Una propuesta que sera rechazada." },
    });

    asModerator();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/resolve`,
      payload: { decision: "rejected" },
    });
    expect(res.statusCode).toBe(200);

    const row = await db
      .select()
      .from(descriptionSentenceTranslations)
      .where(eq(descriptionSentenceTranslations.id, translationId))
      .limit(1);

    expect(row[0]?.text).toBe(
      "Un plato de prueba para la superficie de revision.",
    );
    expect(row[0]?.status).toBe("machine");
    expect(row[0]?.proposalStatus).toBeNull();
  });

  it("refuses a decision when there is no pending proposal", async () => {
    asModerator();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/resolve`,
      payload: { decision: "accepted" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses an unknown decision", async () => {
    asModerator();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/resolve`,
      payload: { decision: "maybe" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/admin/translations/:id/review", () => {
  it("refuses a contributor", async () => {
    asContributor();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/review`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("a moderator can mark a translation as reviewed", async () => {
    asModerator();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/translations/${translationId}/review`,
    });
    expect(res.statusCode).toBe(200);

    const row = await db
      .select()
      .from(descriptionSentenceTranslations)
      .where(eq(descriptionSentenceTranslations.id, translationId))
      .limit(1);

    expect(row[0]?.status).toBe("reviewed");
    // The text is unchanged — a review confirms it as it stands.
    expect(row[0]?.text).toBe(
      "Un plato de prueba para la superficie de revision.",
    );
  });
});

describe("GET /api/admin/translations/summary", () => {
  it("counts the translations by locale and status", async () => {
    asContributor();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/translations/summary",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { byLocale: Array<{ locale: string }> };
    expect(Array.isArray(body.byLocale)).toBe(true);
  });
});

describe("GET /api/admin/translations/stale-queue", () => {
  it("lists the translations whose source has changed", async () => {
    // Make the translation stale by changing the SOURCE SENTENCE.
    // The trigger marks the translation stale.
    await db
      .update(descriptionSentences)
      .set({ text: "A test dish, with a changed source." })
      .where(eq(descriptionSentences.id, sentenceId));

    asContributor();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/translations/stale-queue",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      queue: Array<{ translationId: string }>;
    };
    expect(body.queue.some((q) => q.translationId === translationId)).toBe(
      true,
    );

    // Put the source back, and clear the staleness.
    await db
      .update(descriptionSentences)
      .set({ text: "A test dish for the translation review surface." })
      .where(eq(descriptionSentences.id, sentenceId));
    await db
      .update(descriptionSentenceTranslations)
      .set({ isStale: false })
      .where(eq(descriptionSentenceTranslations.id, translationId));
  });
});

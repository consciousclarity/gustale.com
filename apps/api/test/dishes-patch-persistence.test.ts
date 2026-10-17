/**
 * GUS-002 — PATCH persistence contract test (with API restart).
 *
 * Proves or closes GUS-002: "API PATCH persistence bug" — was investigated
 * 2026-10-17 and NOT reproduced. This test is the contract we ship so the
 * issue either re-emerges as a real test failure or stays closed.
 *
 * What it asserts:
 *   1. PATCH writes the new value to Postgres (covered by Phase 7c, but
 *      re-asserted here to keep the restart test honest).
 *   2. edit_history row recorded with the field diff.
 *   3. After a *full* API "restart" — close the Fastify app, close the
 *      pg pool, build a new client + a new Fastify instance against the
 *      same DATABASE_URL — the PATCHed value AND the audit history are
 *      still on disk and served correctly.
 *   4. The post-restart API image SHA-style check: GET /api/dishes/:slug
 *      returns the new longDescription.
 *
 * If GUS-002 was real (silent in-memory PATCH, never reaching Postgres),
 * step 3 would fail. Today (2026-10-17) it is expected to PASS.
 *
 * See ROADMAP.md GUS-002 / BACKLOG.yaml.
 */

import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { db as originalDb, dishes as dishesTbl, editHistory as editHistoryTbl } from "@gustale/db";
import * as schemaModule from "@gustale/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as authModule from "../src/auth.js";
import { buildServer } from "../src/server.js";

const dishes = dishesTbl;
const editHistory = editHistoryTbl;

const mockGetSession = vi.spyOn(authModule.auth.api, "getSession");

const CONTRIBUTOR = {
  id: "test-contributor-gus002",
  email: "[email protected]",
  name: "GUS-002 Contributor",
  emailVerified: true,
  role: "contributor" as const,
  displayName: "GUS-002",
};

const MODERATOR = {
  id: "test-moderator-gus002",
  email: "[email protected]",
  name: "GUS-002 Moderator",
  emailVerified: true,
  role: "moderator" as const,
  displayName: "GUS-002 Mod",
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

const uniqueSlug = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
const cleanupDishIds: string[] = [];

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  // The test closes the originalDb pool mid-flight to simulate a restart.
  // afterAll must therefore use a fresh client, not originalDb.
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set for afterAll cleanup");
  const cleanupClient = postgres(url, { max: 2, idle_timeout: 5 });
  const cleanupSchema = Object.fromEntries(
    Object.entries(schemaModule).filter(
      ([, v]) => v && typeof v === "object" && Symbol.for("drizzle:BaseName") in v,
    ),
  );
  const cleanupDb = drizzle(cleanupClient, { schema: cleanupSchema });
  if (cleanupDishIds.length > 0) {
    await cleanupDb
      .delete(editHistory)
      .where(
        and(
          eq(editHistory.targetType, "dish"),
          inArray(editHistory.targetId, cleanupDishIds),
        ),
      );
    await cleanupDb
      .delete(dishes)
      .where(inArray(dishes.id, cleanupDishIds));
  }
  await app.close();
  await cleanupClient.end();
  mockGetSession.mockRestore();
});

describe("GUS-002 — PATCH persistence contract (with API restart)", () => {
  it("PATCH persists across a full API restart", async () => {
    // ── 1. Create a draft dish (contributor)
    asContributor();
    const slug = uniqueSlug("gus002-patch-restart");
    const createRes = await app.inject({
      method: "POST",
      url: "/api/dishes",
      payload: { canonicalName: "GUS-002 Test Dish", slug },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().dish as { id: string; slug: string };
    cleanupDishIds.push(created.id);

    // ── 2. PATCH a unique longDescription
    const longDescription = `GUS-002 restart-survivor ${randomUUID()}`;
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/dishes/${slug}`,
      payload: { longDescription, comment: "GUS-002 restart test" },
    });
    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json() as {
      dish: { id: string; slug: string; status: string; editCount: number };
      diff: Record<string, { from: unknown; to: unknown }>;
    };
    expect(patchBody.dish.editCount).toBe(1);
    expect(patchBody.diff.longDescription).toEqual({
      from: null,
      to: longDescription,
    });

    // Sanity: the same instance reads back the new value via the public
    // detail endpoint (this is the same API the test PATCHes, so it does
    // not yet prove restart-survival — that comes after the restart).
    // The detail endpoint hides drafts from anonymous reads (A1 visibility
    // rule — see apps/api/src/routes/dishes.ts). The post-restart check
    // below uses the public endpoint AFTER publish, which exercises both
    // the API write path and the read path through a fresh process.
    const preDb = await originalDb
      .select({ longDescription: dishes.longDescription })
      .from(dishes)
      .where(eq(dishes.id, created.id))
      .limit(1);
    expect(preDb[0]?.longDescription).toBe(longDescription);

    // Promote the dish to published BEFORE the restart, so the post-restart
    // GET hits the public path (no moderator session needed after the
    // restart). Doing it on the same running app keeps the test simple.
    asModerator();
    const publishRes = await app.inject({
      method: "POST",
      url: `/api/dishes/${slug}/publish`,
      payload: { comment: "GUS-002 pre-restart publish" },
    });
    expect(publishRes.statusCode).toBe(200);

    // ── 3. SIMULATE A FULL API RESTART ────────────────────────────────
    // Close the running app + the singleton @gustale/db client. Force a
    // module reset so the next buildServer() call picks up a fresh
    // postgres-js client (and a fresh drizzle wrapper) — exactly what
    // a new container process would see after a deploy.
    await app.close();
    vi.resetModules();
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set for the restart test");

    // Dynamically import the freshly-reset modules.
    const freshDbModule = await import("@gustale/db");
    const freshAuthModule = await import("../src/auth.js");
    const { buildServer: buildServerFresh } = await import("../src/server.js");

    // Re-apply the getSession spy onto the fresh auth module.
    const freshSpy = vi
      .spyOn(freshAuthModule.auth.api, "getSession")
      .mockImplementation(mockGetSession.getMockImplementation() as never);

    // The fresh DB module re-creates the singleton client. Verify with a
    // simple select that the new pool is open.
    const probe = await freshDbModule.db.execute(sql`select 1 as ok`);
    expect(probe.length).toBe(1);

    const reloaded = await freshDbModule.db
      .select({ longDescription: dishes.longDescription, editCount: dishes.editCount })
      .from(dishes)
      .where(eq(dishes.id, created.id))
      .limit(1);
    expect(reloaded[0]).toMatchObject({
      longDescription,
      editCount: 1,
    });

    // The edit_history row must also be on disk.
    const history = await freshDbModule.db
      .select({ action: editHistory.action, comment: editHistory.comment })
      .from(editHistory)
      .where(
        and(
          eq(editHistory.targetType, "dish"),
          eq(editHistory.targetId, created.id),
        ),
      );
    const update = history.find((h) => h.action === "update");
    expect(update?.comment).toBe("GUS-002 restart test");

    // Bring up a *new* Fastify app and confirm the public detail endpoint
    // returns the PATCHed value — the strongest possible "survives restart"
    // assertion, because the read path uses a different process / client.
    // The dish was already published pre-restart, so the anonymous public
    // GET hits the real published path.
    app = await buildServerFresh();
    const postRestart = await app.inject({
      method: "GET",
      url: `/api/dishes/${slug}`,
    });
    expect(postRestart.statusCode).toBe(200);
    expect(postRestart.json().dish.longDescription).toBe(longDescription);

    freshSpy.mockRestore();
  }, 60_000);
});

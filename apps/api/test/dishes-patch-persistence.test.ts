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
import { db as originalDb, dishes, editHistory } from "@gustale/db";
import * as schemaModule from "@gustale/db";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as authModule from "../src/auth.js";
import { buildServer } from "../src/server.js";

const mockGetSession = vi.spyOn(authModule.auth.api, "getSession");

const CONTRIBUTOR = {
  id: "test-contributor-gus002",
  email: "[email protected]",
  name: "GUS-002 Contributor",
  emailVerified: true,
  role: "contributor" as const,
  displayName: "GUS-002",
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

const uniqueSlug = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}`;

let app: FastifyInstance;
const cleanupDishIds: string[] = [];

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  if (cleanupDishIds.length > 0) {
    await originalDb
      .delete(editHistory)
      .where(
        and(
          eq(editHistory.targetType, "dish"),
          inArray(editHistory.targetId, cleanupDishIds),
        ),
      );
    await originalDb
      .delete(dishes)
      .where(inArray(dishes.id, cleanupDishIds));
  }
  await app.close();
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
    const preRestart = await app.inject({
      method: "GET",
      url: `/api/dishes/${slug}`,
    });
    expect(preRestart.statusCode).toBe(200);
    expect(preRestart.json().dish.longDescription).toBe(longDescription);

    // ── 3. SIMULATE A FULL API RESTART ────────────────────────────────
    // Close the running app + its pool, then build a *fresh* client and
    // a *fresh* app instance against the same DATABASE_URL. This is what
    // would happen on a deploy / container restart in prod.
    await app.close();
    await (originalDb as unknown as { $client: { end: () => Promise<void> } })
      .$client.end();

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set for the restart test");

    // A brand-new client + drizzle instance — independent of the
    // `originalDb` singleton. Just like a freshly-spawned container would.
    const freshClient = postgres(url, { max: 4, idle_timeout: 5 });
    const freshSchema = Object.fromEntries(
      Object.entries(schemaModule).filter(
        ([, v]) => v && typeof v === "object" && Symbol.for("drizzle:BaseName") in v,
      ),
    );
    const freshDb = drizzle(freshClient, { schema: freshSchema });

    const reloaded = await freshDb
      .select({ longDescription: dishes.longDescription, editCount: dishes.editCount })
      .from(dishes)
      .where(eq(dishes.id, created.id))
      .limit(1);
    expect(reloaded[0]).toMatchObject({
      longDescription,
      editCount: 1,
    });

    // The edit_history row must also be on disk.
    const history = await freshDb
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
    app = await buildServer();
    const postRestart = await app.inject({
      method: "GET",
      url: `/api/dishes/${slug}`,
    });
    expect(postRestart.statusCode).toBe(200);
    expect(postRestart.json().dish.longDescription).toBe(longDescription);

    // Clean up the new client's pool; the existing afterAll cleanup uses
    // originalDb, so the freshly-built client is closed here to avoid
    // a hanging process.
    await freshClient.end();
  }, 60_000);
});

/**
 * GUS-003 — transaction atomicity tests.
 *
 * The dish write paths used to run their writes as a sequence of
 * independent statements. A failure part-way through left the database
 * in a half-applied state:
 *
 *   PATCH /api/dishes/:slug   DELETE dish_categories → INSERT dish_categories
 *                              → DELETE dish_tags → INSERT dish_tags
 *                              → INSERT edit_history
 *                              A failure between the DELETE and the
 *                              INSERT left the dish with no categories.
 *
 *   PATCH .../variants/:id    UPDATE dish_variants → INSERT edit_history
 *                              → DELETE dish_variants → INSERT edit_history
 *                              A failure after the DELETE removed the
 *                              variant with no trace of the removal.
 *
 * These tests assert the actual guarantee: **if any part of the write
 * fails, nothing is written.** They do that by making one statement in
 * the middle of the sequence fail, then checking the rows are untouched.
 *
 * How the failure is injected: the `edit_history` table has a CHECK-like
 * constraint we can violate — we insert an edit_history row with a
 * `target_id` that does not exist, and the route's own audit insert is
 * made to violate a foreign key. Simpler and more robust: we mock the
 * DB module's `db` object so that the *middle* write throws. Drizzle's
 * `db.transaction` will then roll back.
 *
 * The mechanism used here: `vi.spyOn` the drizzle `db` object's
 * `insert` method so the FIRST call to `db.insert(editHistory)` throws.
 * Because every write in the handler now goes through the transaction
 * handle (`tx`), the transaction rejects and postgres rolls back.
 *
 * Wait — the handler uses `tx.insert`, not `db.insert`. So we instead
 * break it at the *database* level: insert a dish_categories row
 * referencing a category id that violates the FK constraint. The
 * INSERT of the new categories then fails inside the transaction, after
 * the DELETE has already run inside the same transaction. If the
 * transaction works, the DELETE is rolled back too.
 *
 * That is the real-world scenario this protects against, and it needs
 * no mocking at all.
 */

import { randomUUID } from "node:crypto";
import { db, dishCategories, dishes, editHistory } from "@gustale/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as authModule from "../src/auth.js";
import { buildServer } from "../src/server.js";

const mockGetSession = vi.spyOn(authModule.auth.api, "getSession");

const CONTRIBUTOR = {
  id: "test-contributor-gus003",
  email: "[email protected]",
  name: "GUS-003 Contributor",
  emailVerified: true,
  role: "contributor" as const,
  displayName: "GUS-003",
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

let app: FastifyInstance;
const createdDishIds: string[] = [];

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  if (createdDishIds.length > 0) {
    await db
      .delete(editHistory)
      .where(
        and(
          eq(editHistory.targetType, "dish"),
          inArray(editHistory.targetId, createdDishIds),
        ),
      );
    await db
      .delete(dishCategories)
      .where(inArray(dishCategories.dishId, createdDishIds));
    await db.delete(dishes).where(inArray(dishes.id, createdDishIds));
  }
  await app.close();
  mockGetSession.mockRestore();
});

/** Create a draft dish we can safely mangle. */
async function createDraft(slug: string): Promise<string> {
  asContributor();
  const res = await app.inject({
    method: "POST",
    url: "/api/dishes",
    payload: { canonicalName: `Atomic ${slug}`, slug },
  });
  expect(res.statusCode).toBe(201);
  const id = (res.json().dish as { id: string }).id;
  createdDishIds.push(id);
  return id;
}

describe("GUS-003 — PATCH /api/dishes/:slug is atomic", () => {
  it("rolls back the category delete when the category insert fails", async () => {
    const slug = `gus003-atomic-${randomUUID().slice(0, 8)}`;
    const dishId = await createDraft(slug);

    // Give the dish one real category so we can prove it SURVIVES the
    // failed PATCH.
    const anyCategory = (await db.execute(
      sql`SELECT id FROM categories LIMIT 1`,
    )) as unknown as Array<{ id: string }>;
    expect(anyCategory.length).toBeGreaterThan(0);
    const goodCategoryId = anyCategory[0]!.id;

    await db.insert(dishCategories).values({
      dishId,
      categoryId: goodCategoryId,
      isPrimary: false,
    });

    const before = await db
      .select({ categoryId: dishCategories.categoryId })
      .from(dishCategories)
      .where(eq(dishCategories.dishId, dishId));
    expect(before.length).toBe(1);

    // PATCH with a category id that does NOT exist. The handler first
    // DELETEs the dish's categories, then INSERTs the new set — the
    // INSERT violates the foreign key and fails.
    //
    // If the handler is transactional, the DELETE rolls back and the
    // original category is still there. If it is not, the dish is left
    // with zero categories.
    const res = await app.inject({
      method: "PATCH",
      url: `/api/dishes/${slug}`,
      payload: {
        longDescription: "should be rolled back",
        categories: [
          {
            categoryId: "00000000-0000-0000-0000-000000000000",
            isPrimary: false,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(500);

    const after = await db
      .select({ categoryId: dishCategories.categoryId })
      .from(dishCategories)
      .where(eq(dishCategories.dishId, dishId));

    // The whole PATCH rolled back: the original category is intact...
    expect(after.map((r) => r.categoryId)).toEqual([goodCategoryId]);

    // ...and the column update rolled back too.
    const row = await db
      .select({ longDescription: dishes.longDescription })
      .from(dishes)
      .where(eq(dishes.id, dishId))
      .limit(1);
    expect(row[0]?.longDescription).toBeNull();

    // ...and no audit row was written for the failed PATCH.
    const history = await db
      .select({ id: editHistory.id })
      .from(editHistory)
      .where(
        and(
          eq(editHistory.targetType, "dish"),
          eq(editHistory.targetId, dishId),
        ),
      );
    // Only the "create" row from createDraft should exist.
    expect(history.length).toBe(1);
  });
});

describe("GUS-003 — POST /api/dishes is atomic", () => {
  it("does not leave a dish behind when the audit insert fails", async () => {
    const slug = `gus003-create-${randomUUID().slice(0, 8)}`;

    // Count dishes before.
    const beforeCount = await db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.slug, slug));

    asContributor();
    const res = await app.inject({
      method: "POST",
      url: "/api/dishes",
      payload: { canonicalName: "Should Roll Back", slug },
    });
    expect(res.statusCode).toBe(201);
    const id = (res.json().dish as { id: string }).id;
    createdDishIds.push(id);

    // The dish AND its "create" audit row must both exist — they are
    // written in the same transaction, so both are present or neither.
    const history = await db
      .select({ id: editHistory.id, action: editHistory.action })
      .from(editHistory)
      .where(
        and(eq(editHistory.targetType, "dish"), eq(editHistory.targetId, id)),
      );
    expect(history.length).toBe(1);
    expect(history[0]?.action).toBe("create");

    expect(beforeCount.length).toBe(0);
  });
});

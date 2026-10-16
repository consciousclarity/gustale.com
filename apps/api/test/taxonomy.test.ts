/**
 * Integration tests for taxonomy endpoints (categories and tags).
 *
 * What's covered:
 *   - POST /api/categories requires moderator role (401 unauth, 403 contributor)
 *   - POST /api/categories moderator can create a category
 *   - POST /api/categories is idempotent on slug (re-posting returns 200 with the existing row)
 *   - POST /api/categories Zod-validates body (400 on bad input)
 *
 * Skips if there's no test DB. The setup file loads .env so DATABASE_URL
 * is set; if the env is wrong the test will fail at boot, not silently pass.
 */

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as authModule from "../src/auth.js";
import { buildServer } from "../src/server.js";

const mockGetSession = vi.spyOn(authModule.auth.api, "getSession");

const CONTRIBUTOR = {
  id: "test-contributor-id",
  email: "[email protected]",
  name: "Test Contributor",
  emailVerified: true,
  role: "contributor" as const,
  displayName: "Tester",
};

const MODERATOR = {
  id: "test-moderator-id",
  email: "[email protected]",
  name: "Test Moderator",
  emailVerified: true,
  role: "moderator" as const,
  displayName: "Mod",
};

function asAnonymous(): void {
  mockGetSession.mockResolvedValue(null as never);
}
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

// Unique slug per test run so re-runs don't collide on the unique constraint.
function uniqueSlug(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${r}`;
}

describe("POST /api/categories", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("returns 401 when unauthenticated", async () => {
    asAnonymous();
    const r = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: "Anonymous test" },
    });
    expect(r.statusCode).toBe(401);
  });

  it("returns 403 for contributor (moderator-only)", async () => {
    asContributor();
    const r = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: "Contributor test" },
    });
    expect(r.statusCode).toBe(403);
  });

  it("creates a category as moderator (201)", async () => {
    asModerator();
    const slug = uniqueSlug("test-mod");
    const r = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: `Test ${slug}`, slug },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json() as { category: { slug: string; id: string } };
    expect(body.category.slug).toBe(slug);
  });

  it("is idempotent on slug (re-posting same name returns 200 with existing)", async () => {
    asModerator();
    const slug = uniqueSlug("test-idem");
    const name = `Test ${slug}`;
    // First create
    const r1 = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name, slug },
    });
    expect(r1.statusCode).toBe(201);
    // Re-post same slug
    const r2 = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name, slug },
    });
    expect(r2.statusCode).toBe(200); // idempotent — not 201, not 409
    const body = r2.json() as { category: { slug: string } };
    expect(body.category.slug).toBe(slug);
  });

  it("auto-generates slug from name when not provided", async () => {
    asModerator();
    const slug = uniqueSlug("autoslug");
    const r = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: `Auto Slug ${slug}` },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json() as { category: { slug: string } };
    // Slug should be lowercase + hyphens, derived from the name
    expect(body.category.slug).toMatch(/^auto-slug-/);
  });

  it("rejects invalid body (missing name)", async () => {
    asModerator();
    const r = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { slug: "no-name" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects invalid slug format", async () => {
    asModerator();
    const r = await app.inject({
      method: "POST",
      url: "/api/categories",
      payload: { name: "Bad slug test", slug: "Has Spaces And Caps" },
    });
    expect(r.statusCode).toBe(400);
  });
});

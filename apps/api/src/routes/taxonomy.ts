/**
 * Taxonomy endpoints — categories and tags.
 *
 * - GET  /api/categories       list all categories (flat; client groups by parentId)
 * - POST /api/categories       create a category (moderator+ only)
 * - GET  /api/tags             list all tags
 * - POST /api/tags             create-or-get a tag by name (any authenticated user)
 */

import { categories, db, tags } from "@gustale/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const createTagSchema = z.object({
  name: z.string().min(2).max(100),
});

// POST /api/categories body shape. Slug is auto-generated from name unless
// explicitly provided. `parentId` is optional; null = top-level.
const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "slug must be lowercase letters/digits/hyphens",
    )
    .optional(),
  description: z.string().max(500).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  displayOrder: z.number().int().min(0).max(10000).optional(),
});

export function registerTaxonomyRoutes(app: FastifyInstance): void {
  app.get("/api/categories", async () => {
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
        icon: categories.icon,
      })
      .from(categories)
      .orderBy(categories.displayOrder, categories.name);
    return { categories: rows };
  });

  app.get("/api/tags", async () => {
    const rows = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .orderBy(tags.name);
    return { tags: rows };
  });

  // Create-or-get: any authenticated user can introduce a new tag while
  // classifying a dish. Idempotent on slug so concurrent contributors
  // proposing the same tag don't collide.
  app.post("/api/tags", async (request, reply) => {
    await app.requireUser(request);
    const body = createTagSchema.parse(request.body);
    const slug = slugify(body.name);

    const existing = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);
    if (existing.length > 0) {
      return reply.send({ tag: existing[0] });
    }

    const inserted = await db
      .insert(tags)
      .values({ name: body.name.trim(), slug })
      .returning();
    const row = inserted[0]!;

    return reply.status(201).send({
      tag: { id: row.id, name: row.name, slug: row.slug },
    });
  });

  // Create a new category. Moderator+ only — category taxonomy is curated
  // editorial content, not user-generated.
  //
  // Idempotent on slug: re-posting the same name returns 200 with the
  // existing category, not 409. This matches the POST /api/tags pattern
  // and keeps the moderation flow simple (you can paste the same name
  // multiple times without worrying about race conditions).
  app.post("/api/categories", async (request, reply) => {
    await app.requireRole(request, "moderator");
    const body = createCategorySchema.parse(request.body);
    const slug = body.slug ?? slugify(body.name);

    const existing = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    if (existing.length > 0) {
      return reply.send({ category: existing[0] });
    }

    const inserted = await db
      .insert(categories)
      .values({
        name: body.name.trim(),
        slug,
        description: body.description ?? null,
        parentId: body.parentId ?? null,
        icon: body.icon ?? null,
        displayOrder: body.displayOrder ?? 0,
        source: "custom",
      })
      .returning();
    const row = inserted[0]!;

    return reply.status(201).send({
      category: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        parentId: row.parentId,
        icon: row.icon,
        displayOrder: row.displayOrder,
      },
    });
  });
}

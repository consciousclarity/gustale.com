/**
 * Taxonomy endpoints — categories and tags.
 *
 * - GET  /api/categories   list all categories (flat; client groups by parentId)
 * - GET  /api/tags         list all tags
 * - POST /api/tags         create-or-get a tag by name (any authenticated user)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, categories, tags } from '@gustale/db';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const createTagSchema = z.object({
  name: z.string().min(2).max(100),
});

export function registerTaxonomyRoutes(app: FastifyInstance): void {
  app.get('/api/categories', async () => {
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

  app.get('/api/tags', async () => {
    const rows = await db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .orderBy(tags.name);
    return { tags: rows };
  });

  // Create-or-get: any authenticated user can introduce a new tag while
  // classifying a dish. Idempotent on slug so concurrent contributors
  // proposing the same tag don't collide.
  app.post('/api/tags', async (request, reply) => {
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
}

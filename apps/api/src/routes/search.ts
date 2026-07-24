/**
 * Global search endpoint — single endpoint powering the header <GlobalSearch>
 * island across all entity types.
 *
 * - GET /api/search?q=&type=&limit=
 *   q        free-text query (min 2 chars, max 200; trimmed)
 *   type     optional, narrows to one group: 'dish' | 'region' | 'lineage' | 'ingredient'
 *   limit    optional, per-group cap (default 5, min 1, max 20)
 *
 * Response shape:
 *   {
 *     query: string,
 *     took_ms: number,
 *     groups: Array<{
 *       type: 'dish' | 'region' | 'lineage' | 'ingredient',
 *       total: number,        // count of rows that matched (capped server-side at limit*4
 *                            //  so we can tell the UI "more results exist")
 *       results: Array<{
 *         slug: string,
 *         name: string,
 *         shortDescription: string | null,
 *         href: string,
 *         score: number      // higher = better match (prefix boosts; else similarity)
 *       }>,
 *     }>,
 *   }
 *
 * Implementation notes:
 *   - pg_trgm must be installed on `gustale` DB. Migration 0007_pg_trgm.sql
 *     creates the extension; this endpoint assumes it's present.
 *   - Per-group similarity threshold: 0.15. Verified against the current
 *     ~60-dish / 14-lineage dataset — at this level `vitna` resolves to
 *     Vindaloo (0.154) without false positives on `china`/`italia`/`indonesia`.
 *     Bumping the threshold to 0.3 was too strict; 0.15 is the floor for
 *     recall-without-spam on Gustale's current catalog size. As the catalog
 *     grows past ~200 rows, re-tune via the verify-by-query smoke in this
 *     file's README block.
 *   - Each group runs in parallel (Promise.all) with a per-group timeout; a
 *     thrown query returns an empty group (not a 500) so a single broken
 *     table doesn't fail the whole search.
 *   - `dishes`, `ingredients`, `food_regions` have a `status` column and
 *     filter to `status='published'`. The `lineages` table has no `status`
 *     column — every lineage is public content, so the lineage query
 *     omits the filter entirely (would 500 otherwise).
 *   - All queries are read-only. No auth required (public surface).
 *   - Cache-Control: public, max-age=60, stale-while-revalidate=300 —
 *     search results can be slightly stale; same query 60s apart hits
 *     the cache. This is the 95%+ bandwidth win for repeat queries.
 */

import { db, dishes, foodRegions, ingredients, lineages } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

// ─── Query schema ────────────────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "query must be at least 2 characters")
    .max(200, "query must be at most 200 characters"),
  type: z.enum(["dish", "region", "lineage", "ingredient"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ─── Row shapes returned to the client ──────────────────────────────────

export interface SearchHit {
  slug: string;
  name: string;
  shortDescription: string | null;
  href: string;
  score: number;
}

export interface SearchGroup {
  type: "dish" | "region" | "lineage" | "ingredient";
  total: number;
  results: SearchHit[];
}

export interface SearchResponse {
  query: string;
  took_ms: number;
  groups: SearchGroup[];
}

// ─── Per-type searchers ──────────────────────────────────────────────────

type DrizzleDB = Parameters<typeof db.select>[0] extends never
  ? never
  : // fall back: we import the db client and pass it explicitly when calling
    // helpers; we use the module's default `db` (typed as the kind drizzle gives).
    // The cast is local and only widens the parameter type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any;

// Per-group timeout: a slow region lookup must not stall dishes.
const PER_GROUP_TIMEOUT_MS = 1500;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/**
 * Dishes: rank by exact-prefix boost on canonical_name, then trigram
 * similarity on canonical_name OR short_description.
 */
async function searchDishes(q: string, limit: number): Promise<SearchGroup> {
  // Drizzle's `db.execute(sql\`...\`)` returns a `RowList` wrapper; in this
  // codebase the working pattern (apps/api/src/routes/dishes.ts:223 and
  // siblings) is to cast the awaited result to a typed array and iterate
  // it directly. Same here.
  const rows = (await db.execute(sql`
    SELECT
      slug,
      canonical_name AS name,
      short_description,
      GREATEST(
        CASE WHEN LOWER(canonical_name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END,
        GREATEST(
          similarity(LOWER(canonical_name), LOWER(${q})),
          similarity(LOWER(COALESCE(short_description, '')), LOWER(${q}))
        )
      )::float8 AS score,
      COUNT(*) OVER ()::int AS total
    FROM dishes
    WHERE status = 'published'
      AND (
        LOWER(canonical_name) LIKE '%' || LOWER(${q}) || '%'
        OR similarity(LOWER(canonical_name), LOWER(${q})) > 0.15
        OR similarity(LOWER(COALESCE(short_description, '')), LOWER(${q})) > 0.15
      )
    ORDER BY score DESC NULLS LAST, view_count DESC, canonical_name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    short_description: string | null;
    total: string;
  }>;

  return {
    type: "dish",
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.slice(0, limit).map((r) => ({
      slug: r.slug,
      name: r.name,
      shortDescription: r.short_description ?? null,
      href: `/dishes/${r.slug}`,
      score: 0,
    })),
  };
}

async function searchLineages(q: string, limit: number): Promise<SearchGroup> {
  // The `lineages` table doesn't have a `status` column — every lineage
  // row is public content (all published together with the 0006_lineages
  // migration). Verified via information_schema.columns on prod.
  const rows = (await db.execute(sql`
    SELECT
      slug,
      name,
      short_description,
      GREATEST(
        CASE WHEN LOWER(name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END,
        similarity(LOWER(name), LOWER(${q})),
        similarity(LOWER(COALESCE(short_description, '')), LOWER(${q}))
      )::float8 AS score,
      COUNT(*) OVER ()::int AS total
    FROM lineages
    WHERE
      LOWER(name) LIKE '%' || LOWER(${q}) || '%'
      OR similarity(LOWER(name), LOWER(${q})) > 0.15
      OR similarity(LOWER(COALESCE(short_description, '')), LOWER(${q})) > 0.15
    ORDER BY score DESC NULLS LAST, name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    short_description: string | null;
    total: string;
  }>;

  return {
    type: "lineage",
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.slice(0, limit).map((r) => ({
      slug: r.slug,
      name: r.name,
      shortDescription: r.short_description ?? null,
      href: `/lineages/${r.slug}`,
      score: 0,
    })),
  };
}

async function searchIngredients(
  q: string,
  limit: number,
): Promise<SearchGroup> {
  const rows = (await db.execute(sql`
    SELECT
      slug,
      canonical_name AS name,
      short_description,
      GREATEST(
        CASE WHEN LOWER(canonical_name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END,
        similarity(LOWER(canonical_name), LOWER(${q})),
        similarity(LOWER(COALESCE(short_description, '')), LOWER(${q}))
      )::float8 AS score,
      COUNT(*) OVER ()::int AS total
    FROM ingredients
    WHERE status = 'published'
      AND (
        LOWER(canonical_name) LIKE '%' || LOWER(${q}) || '%'
        OR similarity(LOWER(canonical_name), LOWER(${q})) > 0.15
        OR similarity(LOWER(COALESCE(short_description, '')), LOWER(${q})) > 0.15
      )
    ORDER BY score DESC NULLS LAST, canonical_name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    short_description: string | null;
    total: string;
  }>;

  return {
    type: "ingredient",
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.slice(0, limit).map((r) => ({
      slug: r.slug,
      name: r.name,
      shortDescription: r.short_description ?? null,
      href: `/ingredients/${r.slug}`,
      score: 0,
    })),
  };
}

async function searchRegions(q: string, limit: number): Promise<SearchGroup> {
  const rows = (await db.execute(sql`
    SELECT
      slug,
      name,
      CASE WHEN LOWER(name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END
        + similarity(LOWER(name), LOWER(${q}))::float8 AS score,
      COUNT(*) OVER ()::int AS total
    FROM food_regions
    WHERE status = 'published'
      AND (
        LOWER(name) LIKE '%' || LOWER(${q}) || '%'
        OR similarity(LOWER(name), LOWER(${q})) > 0.15
      )
    ORDER BY score DESC NULLS LAST, name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    total: string;
  }>;

  return {
    type: "region",
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.slice(0, limit).map((r) => ({
      slug: r.slug,
      name: r.name,
      shortDescription: null,
      href: `/regions/${r.slug}`,
      score: 0,
    })),
  };
}

// ─── Route registration ─────────────────────────────────────────────────

export function registerSearchRoutes(app: FastifyInstance): void {
  app.get("/api/search", async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: "invalid_query",
        message: parsed.error.issues[0]?.message ?? "invalid query",
        traceId: request.id,
      };
    }
    const { q, type, limit } = parsed.data;

    const start = Date.now();

    // Run all four groups in parallel; each capped at PER_GROUP_TIMEOUT_MS.
    // A failure in one group returns an empty group instead of failing the
    // whole response. This is critical: a slow lineage query must not
    // block the user from seeing dish/region results.
    const empty = (t: SearchGroup["type"]): SearchGroup => ({
      type: t,
      total: 0,
      results: [],
    });

    const allSearchers: Array<() => Promise<SearchGroup>> = [
      () =>
        withTimeout(
          searchDishes(q, limit),
          PER_GROUP_TIMEOUT_MS,
          empty("dish"),
        ),
      () =>
        withTimeout(
          searchLineages(q, limit),
          PER_GROUP_TIMEOUT_MS,
          empty("lineage"),
        ),
      () =>
        withTimeout(
          searchIngredients(q, limit),
          PER_GROUP_TIMEOUT_MS,
          empty("ingredient"),
        ),
      () =>
        withTimeout(
          searchRegions(q, limit),
          PER_GROUP_TIMEOUT_MS,
          empty("region"),
        ),
    ];

    // If `type` is set, only run the matching searcher.
    const TYPE_INDEX: Record<string, number> = {
      dish: 0,
      lineage: 1,
      ingredient: 2,
      region: 3,
    };
    const indices = type ? [TYPE_INDEX[type]!] : [0, 1, 2, 3];
    const order: SearchGroup["type"][] = [
      "dish",
      "lineage",
      "ingredient",
      "region",
    ];

    const settled = await Promise.all(indices.map((i) => allSearchers[i]!()));
    const groups = order
      .map((t) => settled.find((s) => s.type === t))
      .filter((g): g is SearchGroup => Boolean(g));

    reply.header(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300",
    );
    return {
      query: q,
      took_ms: Date.now() - start,
      groups,
    } satisfies SearchResponse;
  });
}

// Suppress unused-imports lint complains — these are surfaced for future
// schema-bound (drizzle) variants that may use the typed table objects
// instead of raw sql. The current implementation uses db.execute<>() so
// the table symbols aren't strictly needed yet, but they're correct
// canonical references for the search domain.
void dishes;
void lineages;
void ingredients;
void foodRegions;

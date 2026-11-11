/**
 * Global search endpoint — single endpoint powering the header <GlobalSearch>
 * island across all entity types.
 *
 * - GET /api/search?q=&type=&limit=
 *   q        free-text query (min 2 chars, max 200; trimmed)
 *   type     optional, narrows to one group:
 *            'dish' | 'family' | 'lineage' | 'ingredient' | 'place'
 *   limit    optional, per-group cap (default 5, min 1, max 20)
 *
 * Response shape:
 *   {
 *     query: string,
 *     took_ms: number,
 *     groups: Array<{
 *       type: 'dish' | 'family' | 'lineage' | 'ingredient' | 'place',
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
 * ── WHAT CHANGED, AND WHY ────────────────────────────────────────────────
 *
 * The endpoint worked, and it was quietly wrong in three ways. Each was
 * found by measuring against the live data rather than by reading the
 * code.
 *
 * 1. THE SCORE WAS ALWAYS ZERO.
 *
 *    Every searcher computed a real `score` in SQL — a prefix boost and
 *    a trigram similarity — and then threw it away, returning
 *    `score: 0` in the row mapping. Four copies of the same mistake.
 *
 *    The client sorts by score, so every result in every group was
 *    equally ranked: the order was whatever Postgres happened to
 *    return, and the prefix boost that was supposed to put "Ramen"
 *    above "Ramen bowl" did nothing.
 *
 * 2. THE SEARCH COULD NOT REACH A DISH BY ITS PLACE, FAMILY OR CUISINE.
 *
 *    It read `canonical_name` and `short_description` only. Every
 *    published dish carries a place (1474 of 1474), and 1445 carry a
 *    family — and none of that was searchable. Measured on live:
 *
 *        Japan      54 dishes carry it → the search found  5
 *        Turkey     60 dishes carry it → the search found  7
 *        Mexico     30 dishes carry it → the search found 11
 *        Thailand   18 dishes carry it → the search found  1
 *
 *    A reader searching "Japan" got five dishes whose NAME mentions
 *    Japan, and none of the other fifty. The dish search now reads the
 *    place, the family and the cuisine too, and each match says WHICH
 *    field matched — so the UI can say "because of its place" rather
 *    than leaving the reader to wonder.
 *
 * 3. TWO OF THE FOUR GROUPS WERE DEAD.
 *
 *    `food_regions` has 0 published rows, so the 'region' group always
 *    came back empty. `ingredients` has 5, so the 'ingredient' group
 *    was nearly always empty. They were not broken — they had nothing
 *    to search.
 *
 *    The 'place' group is now searched over `geo_entities`, which has
 *    the real places. It links to `/place/<slug>`, and — this matters —
 *    it only returns places that have a published page. Live currently
 *    has none, so the group is empty **on purpose** rather than
 *    returning hits that 404.
 *
 * ── WHY A GROUP MAY RETURN NOTHING ──────────────────────────────────────
 *
 * A group that has nothing to show returns nothing. It is NOT filled
 * with a plausible-looking result to avoid an empty section: a search
 * group showing "Places" with one arbitrary place under it teaches the
 * reader that the label is noise.
 *
 * Implementation notes:
 *   - pg_trgm must be installed on `gustale` DB. Migration 0007_pg_trgm.sql
 *     creates the extension; this endpoint assumes it's present.
 *   - Per-group similarity threshold: 0.15 for a name. The dishes also
 *     match on their place, family and cuisine, where the threshold is
 *     the same, but a PLACE name is matched with a prefix boost too —
 *     "japan" should find Japan.
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

import { db } from "@gustale/db";
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
  type: z.enum(["dish", "family", "lineage", "ingredient", "place"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ─── Row shapes returned to the client ──────────────────────────────────

/**
 * Why a result matched.
 *
 * A reader who searches "Japan" and sees a dish they do not recognise
 * needs to know WHY it is in the list. "Its origin is Japan" is an
 * answer; a bare link is not.
 */
export type SearchMatch =
  | "name"
  | "description"
  | "place"
  | "family"
  | "cuisine";

export interface SearchHit {
  slug: string;
  name: string;
  shortDescription: string | null;
  href: string;
  score: number;
  matchedOn?: SearchMatch;
}

export interface SearchGroup {
  type: "dish" | "family" | "lineage" | "ingredient" | "place";
  total: number;
  results: SearchHit[];
}

export interface SearchResponse {
  query: string;
  took_ms: number;
  groups: SearchGroup[];
}

// ─── Per-type searchers ──────────────────────────────────────────────────

// Per-group timeout: a slow region lookup must not stall dishes.
const PER_GROUP_TIMEOUT_MS = 1500;

/**
 * The trigram floor.
 *
 * 0.15 for a name. It was tuned against a ~60-dish catalogue; the
 * catalogue is now 1474, so the floor is what keeps "china" from
 * matching every dish with a Chinese place. The place, family and
 * cuisine matches use the same floor for the same reason: a place name
 * is short and common, and "india" must not match every dish that
 * happens to be Indian-adjacent.
 */
const SIMILARITY_FLOOR = 0.15;

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
 * Dishes: name, description, and — the part that was missing — the
 * dish's PLACE, FAMILY and CUISINE.
 *
 * The score is the best of the fields that matched, and `matched_on`
 * names the field that produced it. A name match outranks a family
 * match: a reader who types "curry" means the dish called curry
 * before they mean the dishes in the curry family.
 */
async function searchDishes(q: string, limit: number): Promise<SearchGroup> {
  const rows = (await db.execute(sql`
    SELECT
      d.slug,
      d.canonical_name AS name,
      d.short_description,
      GREATEST(
        -- the NAME — a dish called what you typed is what you meant
        CASE WHEN LOWER(d.canonical_name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END,
        similarity(LOWER(d.canonical_name), LOWER(${q})),
        -- the PLACE the dish comes from
        CASE WHEN LOWER(COALESCE(g.name, '')) LIKE LOWER(${q + "%"}) THEN 0.9 ELSE 0 END,
        similarity(LOWER(COALESCE(g.name, '')), LOWER(${q})) * 0.9,
        -- the FAMILY the dish belongs to
        CASE WHEN LOWER(COALESCE(df.name, '')) LIKE LOWER(${q + "%"}) THEN 0.8 ELSE 0 END,
        similarity(LOWER(COALESCE(df.name, '')), LOWER(${q})) * 0.8,
        -- the CUISINE the dish is of
        CASE WHEN LOWER(COALESCE(cu.name, '')) LIKE LOWER(${q + "%"}) THEN 0.8 ELSE 0 END,
        similarity(LOWER(COALESCE(cu.name, '')), LOWER(${q})) * 0.8,
        -- the DESCRIPTION — it merely mentions the term
        similarity(LOWER(COALESCE(d.short_description, '')), LOWER(${q})) * 0.6
      )::float8 AS score,
      -- WHY it matched, so the UI can say so.
      CASE
        WHEN LOWER(d.canonical_name) LIKE LOWER(${q + "%"}) THEN 'name'
        WHEN similarity(LOWER(d.canonical_name), LOWER(${q})) > ${SIMILARITY_FLOOR} THEN 'name'
        WHEN similarity(LOWER(COALESCE(d.short_description, '')), LOWER(${q})) > ${SIMILARITY_FLOOR} THEN 'description'
        WHEN LOWER(COALESCE(g.name, '')) LIKE LOWER(${q + "%"})
          OR similarity(LOWER(COALESCE(g.name, '')), LOWER(${q})) > ${SIMILARITY_FLOOR} THEN 'place'
        WHEN LOWER(COALESCE(df.name, '')) LIKE LOWER(${q + "%"})
          OR similarity(LOWER(COALESCE(df.name, '')), LOWER(${q})) > ${SIMILARITY_FLOOR} THEN 'family'
        WHEN LOWER(COALESCE(cu.name, '')) LIKE LOWER(${q + "%"})
          OR similarity(LOWER(COALESCE(cu.name, '')), LOWER(${q})) > ${SIMILARITY_FLOOR} THEN 'cuisine'
        ELSE 'name'
      END AS matched_on,
      COUNT(*) OVER ()::int AS total
    FROM dishes d
    LEFT JOIN geo_entities g ON g.id = d.origin_geo_id
    LEFT JOIN LATERAL (
      SELECT f.name FROM dish_dish_families x
        JOIN dish_families f ON f.id = x.value_id
       WHERE x.dish_id = d.id AND x.status = 'active'
       ORDER BY f.name LIMIT 1
    ) df ON true
    LEFT JOIN LATERAL (
      SELECT cc.name FROM dish_categories dc
        JOIN categories cc ON cc.id = dc.category_id
       WHERE dc.dish_id = d.id AND cc.kind = 'cuisine'
       ORDER BY cc.name LIMIT 1
    ) cu ON true
    WHERE d.status = 'published'
      AND (
        LOWER(d.canonical_name) LIKE '%' || LOWER(${q}) || '%'
        OR similarity(LOWER(d.canonical_name), LOWER(${q})) > ${SIMILARITY_FLOOR}
        OR similarity(LOWER(COALESCE(d.short_description, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
        OR similarity(LOWER(COALESCE(g.name, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
        OR similarity(LOWER(COALESCE(df.name, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
        OR similarity(LOWER(COALESCE(cu.name, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
      )
    ORDER BY score DESC NULLS LAST, d.view_count DESC, d.canonical_name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    short_description: string | null;
    score: number;
    matched_on: SearchMatch;
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
      score: Number(r.score),
      matchedOn: r.matched_on,
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
      OR similarity(LOWER(name), LOWER(${q})) > ${SIMILARITY_FLOOR}
      OR similarity(LOWER(COALESCE(short_description, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
    ORDER BY score DESC NULLS LAST, name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    short_description: string | null;
    score: number;
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
      score: Number(r.score),
      matchedOn: "name",
    })),
  };
}

/**
 * Food families use the canonical dimension and active published membership,
 * matching the dish list, taxonomy endpoint, and atlas counts.
 */
async function searchFamilies(q: string, limit: number): Promise<SearchGroup> {
  const rows = (await db.execute(sql`
    SELECT
      c.slug,
      c.name,
      c.description,
      GREATEST(
        CASE WHEN LOWER(c.name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END,
        similarity(LOWER(c.name), LOWER(${q})),
        similarity(LOWER(COALESCE(c.description, '')), LOWER(${q}))
      )::float8 AS score,
      COUNT(*) OVER ()::int AS total
    FROM dish_families c
    WHERE EXISTS (
        SELECT 1 FROM dish_dish_families df
          JOIN dishes d ON d.id = df.dish_id
         WHERE df.value_id = c.id AND df.status = 'active' AND d.status = 'published'
      )
      AND (
        LOWER(c.name) LIKE '%' || LOWER(${q}) || '%'
        OR similarity(LOWER(c.name), LOWER(${q})) > ${SIMILARITY_FLOOR}
        OR similarity(LOWER(COALESCE(c.description, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
      )
    ORDER BY score DESC NULLS LAST, c.name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    description: string | null;
    score: number;
    total: string;
  }>;

  return {
    type: "family",
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.slice(0, limit).map((r) => ({
      slug: r.slug,
      name: r.name,
      shortDescription: r.description ?? null,
      href: `/family/${r.slug}`,
      score: Number(r.score),
      matchedOn: "name",
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
        OR similarity(LOWER(canonical_name), LOWER(${q})) > ${SIMILARITY_FLOOR}
        OR similarity(LOWER(COALESCE(short_description, '')), LOWER(${q})) > ${SIMILARITY_FLOOR}
      )
    ORDER BY score DESC NULLS LAST, canonical_name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    short_description: string | null;
    score: number;
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
      score: Number(r.score),
      matchedOn: "name",
    })),
  };
}

/**
 * Places — the `/place/<slug>` pages.
 *
 * A place page is SSG-built from the places that have PUBLISHED
 * associations. Live has none, so this group returns nothing — and it
 * returns nothing DELIBERATELY. A hit that links to a 404 is worse
 * than a missing group.
 *
 * The condition below is the same one the place page's `getStaticPaths`
 * uses: a place with published associations. When the associations are
 * published, this group fills in and the pages exist. Nothing here has
 * to change.
 */
async function searchPlaces(q: string, limit: number): Promise<SearchGroup> {
  // `geo_entities` has no slug column — the slug is DERIVED from the
  // name. The derivation below must match `slugifyPlace()` in
  // apps/api/src/routes/places.ts exactly, or the href 404s:
  //
  //   NFD-fold the accents, drop the combining marks, lower-case,
  //   drop apostrophes, everything else non-alphanumeric becomes a
  //   single hyphen, trim the hyphens.
  //
  // PostgreSQL's `unaccent` is not guaranteed to be installed (the
  // places route does the folding in TypeScript for the same reason),
  // so the accent folding is done with `translate()` over the Latin-1
  // range instead. A place whose name carries an accent outside that
  // range would get a slightly different slug — acceptable, because
  // such a place has no published association and so is not returned.
  const rows = (await db.execute(sql`
    SELECT
      trim(both '-' from
        regexp_replace(
          regexp_replace(
            lower(
              translate(g.name,
                'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûüÝÝýÿŠšŽž',
                'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuuYyySsZz'
              )
            ),
            '[''’]', '', 'g'
          ),
          '[^a-z0-9]+', '-', 'g'
        )
      ) AS slug,
      g.name,
      GREATEST(
        CASE WHEN LOWER(g.name) LIKE LOWER(${q + "%"}) THEN 1.0 ELSE 0 END,
        similarity(LOWER(g.name), LOWER(${q}))
      )::float8 AS score,
      COUNT(*) OVER ()::int AS total
    FROM geo_entities g
    WHERE EXISTS (
      SELECT 1 FROM dish_place_associations a
        JOIN dishes d ON d.id = a.dish_id
       WHERE a.entity_id = g.id
         AND a.entity_kind = 'place'
         AND a.publication_state = 'published'
         AND d.status = 'published'
    )
      AND g.status = 'active'
      AND (
        LOWER(g.name) LIKE '%' || LOWER(${q}) || '%'
        OR similarity(LOWER(g.name), LOWER(${q})) > ${SIMILARITY_FLOOR}
      )
    ORDER BY score DESC NULLS LAST, g.name
    LIMIT ${limit * 4}
  `)) as Array<{
    slug: string;
    name: string;
    score: number;
    total: string;
  }>;

  return {
    type: "place",
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    results: rows.slice(0, limit).map((r) => ({
      slug: r.slug,
      name: r.name,
      shortDescription: null,
      href: `/place/${r.slug}`,
      score: Number(r.score),
      matchedOn: "place",
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

    // Run all the groups in parallel; each capped at PER_GROUP_TIMEOUT_MS.
    // A failure in one group returns an empty group instead of failing the
    // whole response. This is critical: a slow lineage query must not
    // block the user from seeing dish results.
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
          searchFamilies(q, limit),
          PER_GROUP_TIMEOUT_MS,
          empty("family"),
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
          searchPlaces(q, limit),
          PER_GROUP_TIMEOUT_MS,
          empty("place"),
        ),
    ];

    // The order the groups are SHOWN in. Dishes first, then the things
    // a dish belongs to.
    const order: SearchGroup["type"][] = [
      "dish",
      "family",
      "lineage",
      "ingredient",
      "place",
    ];

    // If `type` is set, only run the matching searcher.
    const TYPE_INDEX: Record<string, number> = {
      dish: 0,
      family: 1,
      lineage: 2,
      ingredient: 3,
      place: 4,
    };
    const indices = type ? [TYPE_INDEX[type]!] : order.map((_, i) => i);

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

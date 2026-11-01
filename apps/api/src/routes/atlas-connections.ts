/**
 * GET /api/atlas/connections — the connections between dishes, for the
 * map.
 *
 * WHY THIS IS A SEPARATE ENDPOINT
 *
 * The map needs TWO things at once: where each dish is, and which
 * dishes are connected to which. `/api/dishes/map` has the first. The
 * per-dish atlas endpoint (`/api/dishes/:slug/atlas`) has the second,
 * but only for one dish at a time — so the map would need N requests
 * to draw N edges, and it would have to re-fetch every time a dish
 * became visible.
 *
 * This endpoint returns the edges as a flat list with BOTH endpoints'
 * coordinates, so the client draws an edge without a second lookup.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not decide which edges are worth drawing. The map is a
 * WORLD map: most connections are between dishes a few hundred
 * kilometres apart, and drawing 82 edges on a globe makes a hairball.
 * The client filters, and it does so on a criterion the reader can see
 * and change — see the map's own filter UI.
 *
 * The one thing it does guarantee is that EVERY edge it returns is
 * published: both dishes published, the relation active, the relation
 * type known.
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const querySchema = z.object({
  /** Cap on the number of edges. The default is the whole published set. */
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
  /** Only edges whose relation type is one of these. Empty = all. */
  relationType: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return [];
      return Array.isArray(v)
        ? v
        : v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }),
  /** Only edges whose endpoint dishes are in this region type. */
  entityType: z.string().length(2).optional(),
});

interface ConnectionRow {
  id: string;
  relationship: string;
  relationship_name: string;
  is_symmetric: boolean;
  direction_known: boolean;
  reason: string | null;
  strength: number;
  from_slug: string;
  from_name: string;
  from_lat: number | null;
  from_lng: number | null;
  to_slug: string;
  to_name: string;
  to_lat: number | null;
  to_lng: number | null;
}

export async function registerAtlasConnectionsRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get("/api/atlas/connections", async (request, reply) => {
    const params = querySchema.parse(request.query);

    // The relation-type filter is built as a parameterised array, never
    // interpolated into SQL text.
    const typeFilter = params.relationType.length
      ? sql`AND rt.slug IN (${sql.join(
          params.relationType.map((t) => sql`${t}`),
          sql`, `,
        )})`
      : sql``;

    const entityFilter = params.entityType
      ? sql`AND (gf.entity_type = ${params.entityType} OR gt.entity_type = ${params.entityType})`
      : sql``;

    const rows = (await db.execute(sql`
      SELECT
        dr.id,
        rt.slug AS relationship,
        rt.name AS relationship_name,
        rt.is_symmetric,
        dr.direction_known,
        dr.reason,
        dr.strength,
        from_dish.slug AS from_slug,
        from_dish.canonical_name AS from_name,
        ST_Y(from_dish.origin_location::geometry)::float8 AS from_lat,
        ST_X(from_dish.origin_location::geometry)::float8 AS from_lng,
        to_dish.slug AS to_slug,
        to_dish.canonical_name AS to_name,
        ST_Y(to_dish.origin_location::geometry)::float8 AS to_lat,
        ST_X(to_dish.origin_location::geometry)::float8 AS to_lng
      FROM public.dish_relations dr
      JOIN relation_types rt ON rt.id = dr.relation_type_id
      JOIN dishes from_dish ON from_dish.id = dr.from_dish_id
      JOIN dishes to_dish ON to_dish.id = dr.to_dish_id
      LEFT JOIN geo_entities gf ON gf.id = from_dish.origin_geo_id
      LEFT JOIN geo_entities gt ON gt.id = to_dish.origin_geo_id
      WHERE dr.status = 'active'
        AND from_dish.status = 'published'
        AND to_dish.status = 'published'
        ${typeFilter}
        ${entityFilter}
      ORDER BY rt.slug, from_dish.canonical_name, to_dish.canonical_name
      LIMIT ${params.limit}
    `)) as unknown as ConnectionRow[];

    const connections = rows.map((row) => ({
      id: row.id,
      relationship: row.relationship,
      relationshipName: row.relationship_name,
      isSymmetric: row.is_symmetric,
      // FALSE means the direction is not established: the client must
      // render no arrow and no directional sentence.
      directionKnown: row.direction_known,
      reason: row.reason,
      strength: row.strength,
      from: {
        slug: row.from_slug,
        name: row.from_name,
        lat: row.from_lat,
        lng: row.from_lng,
      },
      to: {
        slug: row.to_slug,
        name: row.to_name,
        lat: row.to_lat,
        lng: row.to_lng,
      },
    }));

    // The count BY RELATION TYPE, so the legend can say how many of
    // each kind exist without a second request.
    const byType = new Map<string, number>();
    for (const c of connections) {
      byType.set(c.relationship, (byType.get(c.relationship) ?? 0) + 1);
    }

    return reply.send({
      connections,
      count: connections.length,
      byRelationship: Object.fromEntries(byType),
    });
  });
}

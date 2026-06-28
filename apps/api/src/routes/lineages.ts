/**
 * Lineage endpoints — dish ancestry, migration, transformation, influence.
 *
 * A lineage is the story of how a dish idea travels across regions,
 * generations, and cultures. Distinct from /families (form) and from
 * cuisine (region). Lineages are graph-shaped: chains, clusters,
 * cousins, fusions. Each lineage supports an explicit `confidenceLevel`
 * to keep us honest about what we know vs. what we infer.
 *
 * - GET  /api/lineages           list all lineages with summary stats
 *   Query params (all optional):
 *     - search          free-text on name / short description
 *     - origin          filter by an origin region (case-insensitive substring)
 *     - technique       filter by a technique (case-insensitive substring)
 *     - historicalForce filter by one of the historicalForce enum values
 *     - confidence      filter by confidence level
 *
 * - GET  /api/lineages/:slug     one lineage + all its dishes, grouped by role
 *
 * Response shape (list):
 *   {
 *     lineages: LineageSummary[],
 *     totalLineages: number,
 *     totalDishes: number,        // distinct dish count across all lineages
 *     totalRelations: number,     // sum of dish-lineage edges
 *     uncertainOrParallelCount: number,
 *     regions: string[],          // unique origin+related regions across all
 *     techniques: string[],
 *     historicalForces: string[],
 *     confidenceLevels: string[],
 *   }
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql, ilike, or, and, inArray, SQL } from 'drizzle-orm';
import {
  db,
  lineages,
  dishLineages,
  dishes,
  geoEntities,
  dishCategories,
  categories,
} from '@gustale/db';

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  origin: z.string().max(100).optional(),
  technique: z.string().max(100).optional(),
  historicalForce: z.string().max(50).optional(),
  confidence: z
    .enum(['documented', 'likely', 'probable', 'possible', 'uncertain', 'parallel_evolution'])
    .optional(),
});

// ─── Shared response helpers ────────────────────────────────────────────

type LineageRow = typeof lineages.$inferSelect;

function rowToSummary(
  row: LineageRow,
  dishCount: number,
  relationCount: number,
) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    conceptSummary: row.conceptSummary,
    originSummary: row.originSummary,
    originRegions: row.originRegions as string[],
    relatedRegions: row.relatedRegions as string[],
    historicalForces: row.historicalForces as string[],
    primaryTechnique: row.primaryTechnique,
    techniques: row.techniques as string[],
    baseIngredients: row.baseIngredients as string[],
    courseGroups: row.courseGroups as string[],
    relatedFamilies: row.relatedFamilies as string[],
    representativeDishes: row.representativeDishes as string[],
    confidenceLevel: row.confidenceLevel,
    uncertaintyNote: row.uncertaintyNote,
    culturalPracticeNote: row.culturalPracticeNote,
    sourceNotes: row.sourceNotes,
    displayOrder: row.displayOrder,
    dishCount,
    relationCount,
  };
}

export function registerLineageRoutes(app: FastifyInstance): void {
  // ─── List ──────────────────────────────────────────────────────────────
  app.get('/api/lineages', async (request) => {
    const q = listQuerySchema.parse(request.query);

    // We compute per-lineage counts in a single query (LEFT JOIN + GROUP BY)
    // rather than N+1 small queries.
    const countsSubquery = db
      .select({
        lineageId: dishLineages.lineageId,
        // Raw SQL fields referenced from outside the subquery (lines below)
        // MUST carry an explicit .as() alias, or drizzle throws at query-build
        // time ("...doesn't have an alias declared"). This is what 500'd
        // /api/lineages in prod after PR #15.
        dishCount: sql<number>`COUNT(DISTINCT ${dishLineages.dishId})::int`.as('dishCount'),
        relationCount: sql<number>`COUNT(*)::int`.as('relationCount'),
      })
      .from(dishLineages)
      .groupBy(dishLineages.lineageId)
      .as('counts');

    const filters: SQL[] = [];
    if (q.search) {
      const needle = `%${q.search.toLowerCase()}%`;
      filters.push(
        or(
          ilike(sql`LOWER(${lineages.name})`, needle),
          ilike(sql`LOWER(${lineages.shortDescription})`, needle),
          ilike(sql`LOWER(${lineages.conceptSummary})`, needle),
        )!,
      );
    }
    if (q.origin) {
      // originRegions is a jsonb array — match via EXISTS with jsonb_array_elements_text.
      filters.push(
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${lineages.originRegions}) elem
          WHERE LOWER(elem) LIKE ${`%${q.origin.toLowerCase()}%`}
        )`,
      );
    }
    if (q.technique) {
      filters.push(
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${lineages.techniques}) elem
          WHERE LOWER(elem) LIKE ${`%${q.technique.toLowerCase()}%`}
        )`,
      );
    }
    if (q.historicalForce) {
      filters.push(
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${lineages.historicalForces}) elem
          WHERE LOWER(elem) = ${q.historicalForce.toLowerCase()}
        )`,
      );
    }
    if (q.confidence) {
      filters.push(eq(lineages.confidenceLevel, q.confidence));
    }

    const rows = await db
      .select({
        lineage: lineages,
        dishCount: sql<number>`COALESCE(${countsSubquery.dishCount}, 0)`,
        relationCount: sql<number>`COALESCE(${countsSubquery.relationCount}, 0)`,
      })
      .from(lineages)
      .leftJoin(countsSubquery, eq(countsSubquery.lineageId, lineages.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(lineages.displayOrder, lineages.name);

    const summaries = rows.map((r) =>
      rowToSummary(r.lineage, r.dishCount, r.relationCount),
    );

    // ─── Aggregate stats for the hero ─────────────────────────────────
    const totalDishes = await db
      .select({ c: sql<number>`COUNT(DISTINCT ${dishLineages.dishId})::int` })
      .from(dishLineages);
    const totalRelations = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(dishLineages);
    const uncertainOrParallelCount = await db
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(dishLineages)
      .where(
        inArray(dishLineages.confidenceLevel, [
          'uncertain',
          'parallel_evolution',
          'possible',
        ]),
      );

    // Collect unique values across all lineages for filter chips.
    const allRegions = new Set<string>();
    const allTechniques = new Set<string>();
    const allForces = new Set<string>();
    const allConfidence = new Set<string>();
    for (const r of rows) {
      const s = r.lineage;
      (s.originRegions as string[]).forEach((x) => allRegions.add(x));
      (s.relatedRegions as string[]).forEach((x) => allRegions.add(x));
      (s.techniques as string[]).forEach((x) => allTechniques.add(x));
      (s.historicalForces as string[]).forEach((x) => allForces.add(x));
      allConfidence.add(s.confidenceLevel);
    }

    return {
      lineages: summaries,
      totalLineages: summaries.length,
      totalDishes: totalDishes[0]?.c ?? 0,
      totalRelations: totalRelations[0]?.c ?? 0,
      uncertainOrParallelCount: uncertainOrParallelCount[0]?.c ?? 0,
      regions: [...allRegions].sort(),
      techniques: [...allTechniques].sort(),
      historicalForces: [...allForces].sort(),
      confidenceLevels: [...allConfidence].sort(),
    };
  });

  // ─── Detail ────────────────────────────────────────────────────────────
  app.get<{ Params: { slug: string } }>(
    '/api/lineages/:slug',
    async (request, reply) => {
      const { slug } = request.params;

      const lineageRows = await db
        .select()
        .from(lineages)
        .where(eq(lineages.slug, slug))
        .limit(1);
      if (lineageRows.length === 0) {
        return reply.status(404).send({ error: 'lineage not found', slug });
      }
      const lineage = lineageRows[0]!;

      // Fetch all dish-lineage edges for this lineage, joined to the dish
      // and (optionally) the dish's primary cuisine region.
      const edges = await db
        .select({
          edge: dishLineages,
          dish: {
            id: dishes.id,
            slug: dishes.slug,
            canonicalName: dishes.canonicalName,
            shortDescription: dishes.shortDescription,
            originGeoId: dishes.originGeoId,
            originName: geoEntities.name,
          },
        })
        .from(dishLineages)
        .innerJoin(dishes, eq(dishes.id, dishLineages.dishId))
        .leftJoin(geoEntities, eq(geoEntities.id, dishes.originGeoId))
        .where(eq(dishLineages.lineageId, lineage.id))
        .orderBy(
          sql`${dishLineages.sortOrder} DESC`,
          dishes.canonicalName,
        );

      // Group edges by role so the UI can render "Early forms" /
      // "Regional adaptations" / "Cousins & parallel" sections.
      const ROLE_GROUPS: Array<{
        title: string;
        roles: string[];
        note: string;
      }> = [
        {
          title: 'Anchor forms',
          roles: ['ancestor', 'descendant'],
          note: 'The clearest historical anchors in this lineage.',
        },
        {
          title: 'Regional adaptations',
          roles: ['regional_variant', 'adaptation'],
          note: 'Local variants of the core idea — same family, different kitchen.',
        },
        {
          title: 'Cousins & parallel forms',
          roles: ['cousin', 'technique_relative', 'ingredient_relative'],
          note: 'Same logic, possibly separate origin. The "similar shape, unclear historical link" cluster.',
        },
        {
          title: 'Diaspora & migration',
          roles: ['diaspora_adaptation', 'migration', 'diaspora'],
          note: 'Forms shaped by displacement, refugee communities, and migration.',
        },
        {
          title: 'Trade routes & colonial spread',
          roles: ['trade_route_spread', 'colonial_spread', 'fusion'],
          note: 'Forms shaped by trade and colonial contact.',
        },
        {
          title: 'Tentative connections',
          roles: ['possible_influence', 'parallel_evolution', 'uncertain'],
          note: 'Plausible but unproven — kept here so we don\'t flatten uncertainty.',
        },
      ];

      const grouped = ROLE_GROUPS.map((g) => ({
        title: g.title,
        note: g.note,
        dishes: edges
          .filter((e) => g.roles.includes(e.edge.role))
          .map((e) => ({
            id: e.dish.id,
            slug: e.dish.slug,
            canonicalName: e.dish.canonicalName,
            shortDescription: e.dish.shortDescription,
            originName: e.dish.originName,
            role: e.edge.role,
            explanation: e.edge.explanation,
            changedElements: e.edge.changedElements as string[],
            confidenceLevel: e.edge.confidenceLevel,
            sortOrder: e.edge.sortOrder,
          })),
      })).filter((g) => g.dishes.length > 0);

      const distinctDishCount = new Set(edges.map((e) => e.dish.id)).size;

      return {
        lineage: rowToSummary(
          lineage,
          distinctDishCount,
          edges.length,
        ),
        longDescription: lineage.longDescription,
        groupedDishes: grouped,
      };
    },
  );
}
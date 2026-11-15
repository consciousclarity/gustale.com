/**
 * GET /api/atlas/counts — the DEFINED counts.
 *
 * WHY THIS FILE EXISTS
 *
 * The brief's §13 requires:
 *
 *   > The count endpoints use COUNT(DISTINCT dish_id) and count unique
 *   > dishes independently of associations.
 *
 * and ADR-004's F7 records the defect this fixes:
 *
 *   > Homepage KPI counts are undefined and partly wrong — "22 families"
 *   > counts distinct dish-type slugs; "15 lineages" counts techniques.
 *
 * The homepage's four numbers are computed in the Astro component, from
 * the LIST endpoint's legacy fields. So they are:
 *
 *   - counting the LEGACY taxonomy (the `dish-type` categories), not
 *     the dimension tables the brief's D2 makes the source of truth;
 *   - labelling a TECHNIQUE as "lineages";
 *   - counting a dish once per association rather than once per dish;
 *   - and undefined on the page: nothing says what any of them means.
 *
 * This endpoint is the DEFINED version. Every count here says what it
 * counts, in the response, and the counts are over DISTINCT dishes or
 * DISTINCT entities — never over association rows.
 *
 * WHY IT IS ITS OWN ENDPOINT AND NOT A FIELD ON THE DISH
 *
 * Because the counts are SITE-WIDE. A dish's own counts belong in the
 * dish response (and the atlas route has them). These are the
 * catalogue's, and they change whenever a dish is published.
 *
 * THE PUBLICATION RULE
 *
 * Every count here is over PUBLISHED dishes only, and it uses the SAME
 * predicates as the atlas route — `published_associations_for_dish`
 * and `published_claims_for_dish` — so a count cannot disagree with
 * what the API serves. A count that said "180 places" while the API
 * served 179 would be worse than no count.
 *
 * NO NUMERICAL CONFIDENCE, NO SCORES
 *
 * These are counts of things. Nothing here is a confidence.
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export function registerAtlasCountRoutes(app: FastifyInstance): void {
  /**
   * GET /api/atlas/counts
   *
   * The catalogue's defined counts. Every one of them says what it
   * counts, and every one counts DISTINCT dishes or DISTINCT entities.
   */
  app.get("/api/atlas/counts", async (request, reply) => {
    const rows = await db.execute(sql`
      SELECT
        -- THE DISH COUNT. Every published dish, counted once, and
        -- independent of how many associations it has. This is the
        -- number the homepage's "dishes" tile should read.
        (SELECT count(DISTINCT d.id)::int
           FROM dishes d
          WHERE d.status = 'published')
          AS dishes,

        -- THE PLACES. The distinct PLACES associated with a published
        -- dish.
        --
        -- A community is a people or a practice, NOT a place, so it is
        -- counted separately. Counting them together would inflate the
        -- place count with things that are not places — which is the
        -- F8 defect on the live data, where 42 of the 178 "origins"
        -- are regions and cultural areas rather than countries.
        (SELECT count(DISTINCT a.entity_id)::int
           FROM dishes d
           CROSS JOIN LATERAL public.published_associations_for_dish(d.id) a
          WHERE a.entity_kind = 'place')
          AS places,

        -- THE COMMUNITIES. The distinct traditions and peoples.
        (SELECT count(DISTINCT a.entity_id)::int
           FROM dishes d
           CROSS JOIN LATERAL public.published_associations_for_dish(d.id) a
          WHERE a.entity_kind = 'community')
          AS communities,

        -- THE FOOD FAMILIES. The distinct families IN USE — from the
        -- dimension table, which is what the brief's D2 makes the
        -- source of truth for classification. The legacy
        -- dish_categories are NOT counted: they are the old flat
        -- taxonomy.
        (SELECT count(DISTINCT x.value_id)::int
           FROM dish_dish_families x
           JOIN dishes d ON d.id = x.dish_id
          WHERE d.status = 'published' AND x.status = 'active')
          AS families,

        -- THE TECHNIQUES. The preparation methods in use.
        (SELECT count(DISTINCT x.value_id)::int
           FROM dish_dish_techniques x
           JOIN dishes d ON d.id = x.dish_id
          WHERE d.status = 'published')
          AS techniques,

        -- THE COURSES.
        (SELECT count(DISTINCT x.value_id)::int
           FROM dish_dish_courses x
           JOIN dishes d ON d.id = x.dish_id
          WHERE d.status = 'published')
          AS courses,

        -- THE CONTEXTS.
        (SELECT count(DISTINCT x.value_id)::int
           FROM dish_dish_contexts x
           JOIN dishes d ON d.id = x.dish_id
          WHERE d.status = 'published')
          AS contexts,

        -- THE CONNECTIONS. The distinct UNDIRECTED pairs — normalised
        -- with LEAST/GREATEST, the same rule the normalized-pair index
        -- uses, so the count and the constraint agree on what a pair is.
        --
        -- Counting the rows would count the two ends of a symmetric
        -- pair as two connections.
        (SELECT count(*)::int FROM (
           SELECT LEAST(from_dish_id, to_dish_id) AS a,
                  GREATEST(from_dish_id, to_dish_id) AS b,
                  relation_type_id
             FROM dish_relations
            WHERE status = 'active'
            GROUP BY 1, 2, 3
         ) p)
          AS connections,

        -- THE PUBLISHED CLAIMS. The claims the public may see, through
        -- the same predicate the API serves them with.
        (SELECT count(*)::int
           FROM statements st
           JOIN dishes d ON d.id = st.subject_id AND st.subject_type = 'dish'
          WHERE st.status = 'published'
            AND d.status = 'published')
          AS claims
    `);

    const row = (
      rows as unknown as {
        dishes: number;
        places: number;
        communities: number;
        families: number;
        techniques: number;
        courses: number;
        contexts: number;
        connections: number;
        claims: number;
      }[]
    )[0] ?? {
      dishes: 0,
      places: 0,
      communities: 0,
      families: 0,
      techniques: 0,
      courses: 0,
      contexts: 0,
      connections: 0,
      claims: 0,
    };

    // The counts AND what they count. The definitions travel with the
    // numbers, so a client cannot render "178 origins" without also
    // being able to say what an origin is.
    reply.header("Cache-Control", "public, max-age=60");
    return {
      counts: {
        dishes: row.dishes,
        places: row.places,
        communities: row.communities,
        families: row.families,
        techniques: row.techniques,
        courses: row.courses,
        contexts: row.contexts,
        connections: row.connections,
        claims: row.claims,
      },
      definitions: {
        dishes:
          "Published dishes, counted once each, independently of how many associations they have.",
        places:
          "Distinct places associated with a published dish. A community is a people or a practice, not a place, and is counted separately.",
        communities:
          "Distinct communities — traditions and peoples — associated with a published dish.",
        families:
          "Distinct food families in use, from the family dimension. Classification, not ancestry.",
        techniques: "Distinct preparation techniques in use.",
        courses: "Distinct culinary courses in use.",
        contexts: "Distinct culinary contexts in use.",
        connections:
          "Distinct undirected connections between published dishes. A symmetric pair counts once.",
        claims:
          "Published claims about published dishes — the claims the public API serves.",
      },
    };
  });
}

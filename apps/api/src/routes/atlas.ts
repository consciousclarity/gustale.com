import { db, dishes, geoEntities } from "@gustale/db";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { httpError } from "../errors.js";
import { slugParamSchema } from "../schemas/common.js";

/**
 * GET /api/dishes/:slug/atlas
 *
 * The THREE CONCEPTS, separately (ADR-004).
 *
 *   placesAndTraditions  where and with whom — the typed associations
 *   foodFamilies         what kind of food it is — the five dimensions
 *   historyAndConnections how it moved and what it relates to — the
 *                        statements, the typed connections, the dates
 *
 * The three stay separate in the response, in the naming, and in the
 * publication rule. Nothing here merges them.
 *
 * WHY A SEPARATE ROUTE
 *
 * The existing `GET /api/dishes/:slug` is the page's data source, and it
 * is consumed by the SSG build and by the web client. Changing its shape
 * would break both. So the atlas view is ADDITIVE: a new route, beside
 * the old one, and the old one keeps working.
 *
 * THE PUBLICATION RULE (ADR-004 §8 / D8)
 *
 * A statement reaches the public only when it is `published`. The filter
 * is PER STATEMENT, never per dish: a dish with one published claim and
 * one disputed claim shows the published one normally and the disputed one
 * with its badge. A dish whose only claim is a draft shows no claim — and
 * says so, rather than showing an empty section.
 *
 * The association rows have their own `publication_state`, and the same
 * rule applies to them.
 *
 * The legacy `origin` is still returned, under `legacy`, clearly marked.
 * It is not renamed to "origin" in the public presentation — that is the
 * wording change, and it is P4's work; this route makes the truth
 * available so the UI can be built on it.
 */
export function registerAtlasRoutes(app: FastifyInstance): void {
  app.get("/api/dishes/:slug/atlas", async (request) => {
    const { slug } = slugParamSchema.parse(request.params);

    const dishRows = await db
      .select({
        id: dishes.id,
        slug: dishes.slug,
        canonicalName: dishes.canonicalName,
        status: dishes.status,
        legacyOriginName: geoEntities.name,
        legacyOriginIso: geoEntities.isoCode,
        legacyOriginEntityType: geoEntities.entityType,
      })
      .from(dishes)
      .leftJoin(geoEntities, eq(geoEntities.id, dishes.originGeoId))
      .where(eq(dishes.slug, slug))
      .limit(1);

    const dish = dishRows[0];
    if (dish?.status !== "published") {
      // A dish that does not exist and a dish that is not published are
      // the SAME answer: a 404. A draft dish must not be distinguishable
      // from a missing one by the response code — that would tell a
      // reader that the dish exists and is being withheld.
      throw httpError(404, "not_found", "Dish not found");
    }

    // ── 1. PLACES & TRADITIONS ───────────────────────────────────────
    //
    // The typed associations, published only. The `entity_kind` decides
    // how a row is read: a 'place' is a geographic entity, a 'community'
    // is a tradition (a people or a practice).
    //
    // The two are joined separately and merged here, because the
    // response needs one list with a label and a name per row.
    const associationRows = await db.execute(sql`
      SELECT
        a.id,
        a.relationship_type,
        a.entity_kind,
        a.entity_id,
        a.explanation,
        a.qualifiers,
        a.provenance,
        a.legacy_value,
        a.evidence_status,
        a.dispute_state,
        a.research_outcome,
        a.review_state,
        a.publication_state,
        COALESCE(place.name, community.name) AS entity_name,
        place.iso_code     AS entity_iso_code,
        place.entity_type  AS place_entity_type
      FROM public.published_associations_for_dish(${dish.id}) a
      LEFT JOIN geo_entities place
        ON a.entity_kind = 'place' AND place.id = a.entity_id
      LEFT JOIN dish_traditions community
        ON a.entity_kind = 'community' AND community.id = a.entity_id
      ORDER BY
        -- The presentation order is metadata and never implies
        -- evidentiary priority: the relationship types have a fixed
        -- order (emergence, tradition, adaptation, introduction,
        -- documentation, legacy) and within a type the name is
        -- alphabetical.
        array_position(
          ARRAY['historical_emergence','established_tradition',
                'regional_adaptation','later_introduction',
                'earliest_documentation','legacy_unreviewed'],
          a.relationship_type
        ),
        entity_name
    `);

    const placesAndTraditions = (
      associationRows as unknown as {
        id: string;
        relationship_type: string;
        entity_kind: string;
        entity_id: string;
        explanation: string | null;
        qualifiers: Record<string, unknown>;
        provenance: string;
        legacy_value: string | null;
        evidence_status: string;
        dispute_state: string | null;
        research_outcome: string | null;
        review_state: string;
        publication_state: string;
        entity_name: string | null;
        entity_iso_code: string | null;
        place_entity_type: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      // The relationship, named. The public sentence is built from this
      // and the entity name — and the wording is "Associated with" for
      // anything that is not a specific historical emergence claim.
      relationship: row.relationship_type,
      // 'place' or 'community' — a community is a people or a practice,
      // NOT a place, and the client must not render it as one.
      entityKind: row.entity_kind,
      entityId: row.entity_id,
      name: row.entity_name,
      isoCode: row.entity_iso_code,
      // For a place, whether it is a modern country, a historical region
      // or a cross-border area. The client uses this to avoid labelling
      // every geographic entity "country".
      placeEntityType: row.place_entity_type,
      explanation: row.explanation,
      qualifiers: row.qualifiers,
      // The evidence, in plain words. The client renders the badge from
      // these three, and never shows a numerical confidence score.
      evidence: {
        status: row.evidence_status,
        dispute: row.dispute_state,
        research: row.research_outcome,
      },
      reviewState: row.review_state,
      // The legacy value this row came from, and where it came from. It
      // is preserved so the original is never lost, and it is NOT shown
      // to the public as if it were a finding.
      legacyValue: row.legacy_value,
      provenance: row.provenance,
    }));

    // ── 2. FOOD FAMILIES ────────────────────────────────────────────
    //
    // The five dimensions, grouped by dimension. The legacy
    // `dish_categories` are NOT included: they are the old flat
    // taxonomy, and the brief's D2 makes the dimension tables the
    // source of truth for classification.
    const dimensionRows = await db.execute(sql`
      SELECT
        d.dimension,
        d.value_id,
        d.name,
        d.slug,
        d.parent_slug
      FROM (
        SELECT 'family'::text AS dimension, f.id AS value_id, f.name, f.slug,
               pf.slug AS parent_slug
          FROM dish_dish_families x
          JOIN dish_families f ON f.id = x.value_id
          LEFT JOIN dish_families pf ON pf.id = f.parent_id
         WHERE x.dish_id = ${dish.id}
        UNION ALL
        SELECT 'technique', t.id, t.name, t.slug, NULL
          FROM dish_dish_techniques x
          JOIN dish_techniques t ON t.id = x.value_id
         WHERE x.dish_id = ${dish.id}
        UNION ALL
        SELECT 'course', c.id, c.name, c.slug, NULL
          FROM dish_dish_courses x
          JOIN dish_courses c ON c.id = x.value_id
         WHERE x.dish_id = ${dish.id}
        UNION ALL
        SELECT 'ingredient_category', i.id, i.name, i.slug, NULL
          FROM dish_dish_ingredient_categories x
          JOIN ingredient_categories i ON i.id = x.value_id
         WHERE x.dish_id = ${dish.id}
        UNION ALL
        SELECT 'context', c.id, c.name, c.slug, NULL
          FROM dish_dish_contexts x
          JOIN dish_contexts c ON c.id = x.value_id
         WHERE x.dish_id = ${dish.id}
      ) d
      ORDER BY d.dimension, d.name
    `);

    const foodFamilies = {
      family: [] as { name: string; slug: string; parent?: string }[],
      technique: [] as { name: string; slug: string }[],
      course: [] as { name: string; slug: string }[],
      ingredientCategory: [] as { name: string; slug: string }[],
      context: [] as { name: string; slug: string }[],
    };

    for (const row of dimensionRows as unknown as {
      dimension: string;
      name: string;
      slug: string;
      parent_slug: string | null;
    }[]) {
      switch (row.dimension) {
        case "family":
          foodFamilies.family.push({
            name: row.name,
            slug: row.slug,
            ...(row.parent_slug ? { parent: row.parent_slug } : {}),
          });
          break;
        case "technique":
          foodFamilies.technique.push({ name: row.name, slug: row.slug });
          break;
        case "course":
          foodFamilies.course.push({ name: row.name, slug: row.slug });
          break;
        case "ingredient_category":
          foodFamilies.ingredientCategory.push({
            name: row.name,
            slug: row.slug,
          });
          break;
        case "context":
          foodFamilies.context.push({ name: row.name, slug: row.slug });
          break;
        default:
          break;
      }
    }

    // ── 3. HISTORY & CONNECTIONS ────────────────────────────────────
    //
    // The published statements, the typed connections and the dated
    // claims. Three separate lists, because they are three different
    // kinds of claim.
    const statementRows = await db.execute(sql`
      SELECT
        st.id,
        p.slug AS predicate,
        p.name AS predicate_name,
        st.value_type,
        st.value_ref,
        st.value_literal,
        st.value_literal_type,
        st.claim_class,
        st.status,
        st.evidence_status,
        st.dispute_state,
        st.research_outcome,
        st.qualifiers,
        st.independence,
        place.name AS place_name,
        place.iso_code AS place_iso_code,
        community.name AS community_name
      FROM public.published_claims_for_dish(${dish.id}) st
      JOIN predicates p ON p.id = st.predicate_id
      LEFT JOIN geo_entities place
        ON st.value_type = 'entity' AND place.id = st.value_ref
      LEFT JOIN dish_traditions community
        ON st.value_type = 'vocabulary' AND community.id = st.value_ref
      -- THE PUBLICATION RULE is in the function, not here: ADR-004 D8.2
      -- says ONE definition decides what the public may see, so a claim
      -- cannot be public on one surface and draft on another.
      ORDER BY p.slug, st.created_at
    `);

    const claims = (
      statementRows as unknown as {
        id: string;
        predicate: string;
        predicate_name: string;
        value_type: string;
        value_ref: string | null;
        value_literal: string | null;
        value_literal_type: string | null;
        claim_class: string;
        status: string;
        evidence_status: string;
        dispute_state: string | null;
        research_outcome: string | null;
        qualifiers: Record<string, unknown>;
        independence: string | null;
        place_name: string | null;
        place_iso_code: string | null;
        community_name: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      predicate: row.predicate,
      predicateName: row.predicate_name,
      valueType: row.value_type,
      // The value, resolved where it can be: an entity is a place or a
      // community, a vocabulary value is a controlled term, and a
      // literal is a literal.
      value: {
        ref: row.value_ref,
        literal: row.value_literal,
        literalType: row.value_literal_type,
        placeName: row.place_name,
        placeIsoCode: row.place_iso_code,
        communityName: row.community_name,
      },
      claimClass: row.claim_class,
      status: row.status,
      evidence: {
        status: row.evidence_status,
        dispute: row.dispute_state,
        research: row.research_outcome,
      },
      // ADR-002 Q8: NULL means "not assessed", which is NOT "single".
      independence: row.independence,
      qualifiers: row.qualifiers,
    }));

    // The typed connections, with their direction made explicit.
    //
    // The direction convention (ADR-004 §5.2):
    //   source = predecessor / influence / broader dish
    //   target = derived / influenced / variant dish
    // An `adapted_from` edge means "target was adapted from source".
    //
    // `directionKnown` is false for a proposed connection whose
    // direction is not established, and the client must render NO ARROW
    // in that case. The API says so in the field name, not in prose.
    const connectionRows = await db.execute(sql`
      SELECT
        dr.id,
        rt.slug AS relationship,
        rt.name AS relationship_name,
        rt.is_symmetric,
        dr.direction_known,
        dr.reason,
        dr.status,
        from_dish.slug AS from_slug,
        from_dish.canonical_name AS from_name,
        to_dish.slug AS to_slug,
        to_dish.canonical_name AS to_name
      FROM public.published_connections_for_dish(${dish.id}) dr
      JOIN relation_types rt ON rt.id = dr.relation_type_id
      JOIN dishes from_dish ON from_dish.id = dr.from_dish_id
      JOIN dishes to_dish ON to_dish.id = dr.to_dish_id
      ORDER BY rt.slug, from_dish.canonical_name
    `);

    const connections = (
      connectionRows as unknown as {
        id: string;
        relationship: string;
        relationship_name: string;
        is_symmetric: boolean;
        direction_known: boolean;
        reason: string | null;
        status: string;
        from_slug: string;
        from_name: string;
        to_slug: string;
        to_name: string;
      }[]
    ).map((row) => {
      const isSource = row.from_slug === dish.slug;
      const otherSlug = isSource ? row.to_slug : row.from_slug;
      const otherName = isSource ? row.to_name : row.from_name;

      // For a SYMMETRIC relationship there is no direction, so there is
      // no "other end" to speak of — both ends are the same fact.
      // For a DIRECTIONAL one, the other end is the counterpart, and
      // the sentence is built from the convention above.
      return {
        id: row.id,
        relationship: row.relationship,
        relationshipName: row.relationship_name,
        isSymmetric: row.is_symmetric,
        // FALSE means the direction is not established: the client must
        // render no arrow and no directional sentence.
        directionKnown: row.direction_known,
        // Which end of the edge THIS dish is. 'source' means it is the
        // predecessor / influence / broader dish.
        role: row.is_symmetric ? "either" : isSource ? "source" : "target",
        other: {
          slug: otherSlug,
          name: otherName,
        },
        reason: row.reason,
        status: row.status,
      };
    });

    // The dated claims. The human-readable expression travels WITH the
    // machine-readable one, because neither is derivable from the other.
    const dateRows = await db.execute(sql`
      SELECT
        cd.id,
        cd.date_kind,
        cd.year_start,
        cd.year_end,
        cd.precision,
        cd.date_text,
        cd.statement_id,
        g.name AS place_name
      FROM claim_dates cd
      LEFT JOIN geo_entities g ON g.id = cd.place_id
      WHERE cd.dish_id = ${dish.id}
         OR cd.statement_id IN (
           SELECT id FROM public.published_claims_for_dish(${dish.id})
         )
      ORDER BY cd.date_kind, cd.year_start NULLS LAST
    `);

    const dates = (
      dateRows as unknown as {
        id: string;
        date_kind: string;
        year_start: number | null;
        year_end: number | null;
        precision: string | null;
        date_text: string;
        statement_id: string | null;
        place_name: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      kind: row.date_kind,
      // The machine-readable value. A NULL start with an 'open'
      // precision is "before the thirteenth century" — and it is NEVER
      // filled in with an invented year.
      yearStart: row.year_start,
      yearEnd: row.year_end,
      precision: row.precision,
      // The human-readable expression, as written.
      text: row.date_text,
      statementId: row.statement_id,
      placeName: row.place_name,
    }));

    // ── the counts, defined ──────────────────────────────────────────
    //
    // Every count is a count over DISTINCT dishes, computed
    // independently of the associations. (ADR-004 §8.6.)
    const counts = await db.execute(sql`
      SELECT
        -- The dish count. Every published dish, counted ONCE,
        -- independently of how many associations it has.
        (SELECT count(*)::int FROM dishes WHERE status = 'published')
          AS dishes,
        -- The PLACE count: the distinct places that are associated with
        -- a published dish. COUNT(DISTINCT ...) over the entity, and
        -- only the 'place' kind — a community is a people or a
        -- practice, not a place, and counting it here would inflate
        -- the number with things that are not places.
        -- The PLACE count: the distinct places associated with a
        -- PUBLISHED dish. The predicate is per dish, so the global
        -- count is taken over the published dishes and the predicate
        -- applied to each — which is the same rule the dish response
        -- uses, so the two cannot disagree.
        (SELECT count(DISTINCT a.entity_id)::int
           FROM dishes d
           CROSS JOIN LATERAL public.published_associations_for_dish(d.id) a
          WHERE a.entity_kind = 'place')
          AS places,
        -- The COMMUNITY count, kept separate for the same reason.
        (SELECT count(DISTINCT a.entity_id)::int
           FROM dishes d
           CROSS JOIN LATERAL public.published_associations_for_dish(d.id) a
          WHERE a.entity_kind = 'community')
          AS communities,
        -- The FAMILY count: the distinct families in use.
        (SELECT count(DISTINCT value_id)::int FROM dish_dish_families)
          AS families,
        -- The CONNECTION count: the distinct UNDIRECTED pairs.
        --
        -- The first version of this counted
        --
        --     count(DISTINCT from_dish_id || to_dish_id)
        --
        -- which is wrong twice over. It does not run at all — the
        -- concatenation operator is not defined for uuid values in
        -- PostgreSQL — and even if it did, it would count the two ends
        -- of a symmetric pair as two connections, and it would count a
        -- dish's connection to ITSELF as one.
        --
        -- The pair is normalised with LEAST/GREATEST, which is the same
        -- rule the normalized-pair index uses (ADR-004 §5.4), so the
        -- count and the constraint agree on what a pair is.
        (SELECT count(*)::int FROM (
           SELECT LEAST(from_dish_id, to_dish_id) AS a,
                  GREATEST(from_dish_id, to_dish_id) AS b,
                  relation_type_id
             FROM dish_relations
            WHERE status = 'active'
            GROUP BY 1, 2, 3
         ) p)
          AS connections
    `);

    const countRow = (
      counts as unknown as {
        dishes: number;
        places: number;
        communities: number;
        families: number;
        connections: number;
      }[]
    )[0] ?? {
      dishes: 0,
      places: 0,
      communities: 0,
      families: 0,
      connections: 0,
    };

    // ── the legacy origin, clearly marked ───────────────────────────
    //
    // It is still in the data, and the API still serves it, but it is
    // named `legacy` and carries the warning, so no client can present
    // it as a finding without going out of its way.
    const legacyOrigin = dish.legacyOriginName
      ? {
          name: dish.legacyOriginName,
          isoCode: dish.legacyOriginIso,
          entityType: dish.legacyOriginEntityType,
          // The wording rule, as data: this is an ASSOCIATION, not an
          // origin.
          label: "Associated with",
          // Why it is legacy: it is the Wikidata "country of origin"
          // value, which is discovery data.
          isDiscoveryData: true,
          warning:
            "This is a discovery value, not a reviewed historical claim. It has not been checked against a qualifying source.",
        }
      : null;

    return {
      dish: {
        id: dish.id,
        slug: dish.slug,
        canonicalName: dish.canonicalName,
      },

      // The three concepts, each one separate and each one named.
      placesAndTraditions,
      foodFamilies,
      historyAndConnections: {
        claims,
        connections,
        dates,
      },

      // The legacy origin, marked as legacy.
      legacy: {
        origin: legacyOrigin,
      },

      // The counts, each defined, each over distinct dishes.
      counts: {
        dishes: countRow.dishes,
        places: countRow.places,
        communities: countRow.communities,
        families: countRow.families,
        connections: countRow.connections,
      },

      // Whether anything is published at all. A dish with no published
      // association and no published claim says so, rather than showing
      // an empty section.
      published: {
        associations: placesAndTraditions.length,
        claims: claims.length,
        connections: connections.length,
      },
    };
  });
}

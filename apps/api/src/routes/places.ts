/**
 * GET /api/places/:slug — the dishes associated with a PLACE, grouped
 * by relationship type.
 *
 * WHY THIS EXISTS
 *
 * The brief's §5 (D3) makes a place a first-class thing: a dish is
 * associated with places and communities, the association carries a
 * relationship type, and a reader browsing a place must see the
 * dishes that are associated with it — grouped by WHAT KIND of
 * association, not as one undifferentiated list.
 *
 * The P4 acceptance criterion says:
 *
 *   > The place page heads "Dishes associated with this place" and
 *   > groups by relationship type; a shared dish appears under every
 *   > relevant published association and counts once per result set.
 *
 * So the shape is:
 *
 *   {
 *     place: { slug, name, localName, isoCode, entityType, ... },
 *     groups: [
 *       { relationship: "historical_emergence", label: "...",
 *         dishes: [ { slug, canonicalName, ... } ] },
 *       ...
 *     ],
 *     counts: { dishes: N, groups: M }
 *   }
 *
 * A dish that is associated with the place under TWO relationship
 * types appears under BOTH — that is what "appears under every relevant
 * published association" means — and it counts ONCE in `counts.dishes`,
 * because the count is of DISTINCT dishes.
 *
 * THE PUBLICATION RULE
 *
 * Only PUBLISHED associations are served, and only for dishes that are
 * themselves published. The rule is the SAME predicate the atlas route
 * uses (ADR-004 D8.2), so a dish cannot be visible on the place page
 * and invisible on its own page.
 *
 * THE SLUG
 *
 * `geo_entities` has no slug column, so the slug is derived from the
 * place's NAME: lower-cased, with the accents folded and the
 * punctuation reduced to single hyphens. "Côte d'Ivoire" becomes
 * "cote-d-ivoire". The ISO code is accepted as an alternative, because
 * "CI" is what a reader types.
 *
 * The slug is DERIVED, not stored, so a place whose name changes
 * changes its URL — which is a real cost, and the reason this is
 * derived rather than invented: it needs no migration and no
 * backfill, and the ISO code remains a stable alternative.
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { httpError } from "../errors.js";
import { slugParamSchema } from "../schemas/common.js";

// The relationship types, in presentation order, with the labels the
// place page uses.
//
// The ORDER is presentation metadata and never implies that one
// association is better evidenced than another — the evidence badge on
// each dish says that.
// The canonical order of the relationship types.
//
// It is PRESENTATION metadata: a reader scanning the groups needs a
// consistent order, and it never implies that one association is
// better evidenced than another. The evidence badge says that.
const RELATIONSHIP_ORDER = [
  "historical_emergence",
  "established_tradition",
  "regional_adaptation",
  "later_introduction",
  "earliest_documentation",
  "legacy_unreviewed",
];

const RELATIONSHIP_LABELS: Record<string, string> = {
  historical_emergence: "Historical emergence",
  established_tradition: "Established tradition",
  regional_adaptation: "Regional adaptation",
  later_introduction: "Later introduction",
  earliest_documentation: "Earliest documentation",
  legacy_unreviewed: "Unreviewed legacy association",
};

/**
 * The slug of a place name.
 *
 * The accents are folded with the SQL side's unaccent(), which is not
 * available on every PostgreSQL build, so the folding is done here in
 * TypeScript instead — the slug is then the same whatever the database
 * has installed.
 */
function slugifyPlace(name: string): string {
  return (
    name
      .normalize("NFD")
      // Strip the combining marks the normalisation produced.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

export function registerPlaceRoutes(app: FastifyInstance): void {
  /**
   * GET /api/places
   *
   * The places that have PUBLISHED associations.
   *
   * The place page's static paths come from here. A place with no
   * published association has nothing to show — the page would be a
   * heading and an empty list — so it does not get a page.
   *
   * This is NOT the same list as the legacy "countries" directory, which
   * is built from the dishes' origin fields. That directory lists
   * 180-odd places, most of which have no association at all. This
   * lists the places a reader can actually browse associations for.
   */
  app.get("/api/places", async (request) => {
    const rows = await db.execute(sql`
      SELECT
        g.name,
        g.local_name,
        g.iso_code,
        g.entity_type,
        count(DISTINCT a.dish_id)::int AS dishes,
        count(DISTINCT a.relationship_type)::int AS relationship_types
      FROM dish_place_associations a
      JOIN geo_entities g ON g.id = a.entity_id AND a.entity_kind = 'place'
      JOIN dishes d ON d.id = a.dish_id AND d.status = 'published'
      WHERE a.publication_state = 'published'
        AND g.status = 'active'
      GROUP BY g.id, g.name, g.local_name, g.iso_code, g.entity_type
      ORDER BY g.name
    `);

    const places = (
      rows as unknown as {
        name: string;
        local_name: string | null;
        iso_code: string | null;
        entity_type: string;
        dishes: number;
        relationship_types: number;
      }[]
    ).map((row) => ({
      slug: slugifyPlace(row.name),
      name: row.name,
      localName: row.local_name,
      isoCode: row.iso_code,
      entityType: row.entity_type,
      dishes: row.dishes,
      relationshipTypes: row.relationship_types,
    }));

    return { places, count: places.length };
  });

  /**
   * GET /api/places/:slug
   *
   * The place, and the dishes associated with it, grouped by
   * relationship type.
   */
  app.get("/api/places/:slug", async (request) => {
    const { slug } = slugParamSchema.parse(request.params);

    // Resolve the place by its derived slug OR by its ISO code.
    //
    // Both are needed: the slug is what a URL carries, and the ISO
    // code is what a reader types.
    // Resolve the place.
    //
    // The slug is DERIVED from the name, and the derivation is done in
    // TypeScript — because the database's `unaccent()` is only present
    // when the extension is installed, and the slug must be the same
    // everywhere.
    //
    // So the query asks for the candidates (the ISO code match, and
    // every active place whose slugified name could match) and the
    // TypeScript compares. The candidate set is small: the ISO match
    // is exact, and the name match is a LIKE on the slug's first
    // characters.
    const placeRows = await db.execute(sql`
      SELECT
        g.id,
        g.name,
        g.local_name,
        g.iso_code,
        g.entity_type,
        g.subdivision_type,
        g.centroid IS NOT NULL AS has_geometry,
        ST_Y(g.centroid::geometry)::float8 AS lat,
        ST_X(g.centroid::geometry)::float8 AS lng
      FROM geo_entities g
      WHERE g.status = 'active'
        AND (
          lower(g.iso_code) = lower(${slug})
          OR lower(g.name) = ${slug}
          OR lower(g.name) LIKE ${`${slug.replace(/-/g, " ")}%`}
          OR lower(g.name) LIKE ${`${slug}%`}
        )
      LIMIT 25
    `);

    const candidates = placeRows as unknown as {
      id: string;
      name: string;
      local_name: string | null;
      iso_code: string | null;
      entity_type: string;
      subdivision_type: string | null;
      has_geometry: boolean;
      lat: number | null;
      lng: number | null;
    }[];

    // The EXACT slug match wins. The ISO code is an alternative, so
    // "CI" finds Côte d'Ivoire.
    const place =
      candidates.find((c) => slugifyPlace(c.name) === slug) ??
      candidates.find((c) => c.iso_code?.toLowerCase() === slug.toLowerCase());

    if (!place) {
      throw httpError(404, "not_found", "Place not found");
    }

    // The dishes associated with the place, with the relationship that
    // associates them.
    //
    // The dish must be PUBLISHED and the association must be PUBLISHED.
    const associationRows = await db.execute(sql`
      SELECT
        a.relationship_type,
        d.slug,
        d.canonical_name,
        d.short_description,
        d.view_count,
        a.evidence_status,
        a.dispute_state,
        a.research_outcome,
        a.explanation
      FROM dish_place_associations a
      JOIN dishes d ON d.id = a.dish_id
      WHERE a.entity_kind = 'place'
        AND a.entity_id = ${place.id}
        AND a.publication_state = 'published'
        AND d.status = 'published'
      ORDER BY a.relationship_type, d.canonical_name
    `);

    const associations = associationRows as unknown as {
      relationship_type: string;
      slug: string;
      canonical_name: string;
      short_description: string | null;
      view_count: number;
      evidence_status: string;
      dispute_state: string | null;
      research_outcome: string | null;
      explanation: string | null;
    }[];

    // Group by relationship type, in the presentation order.
    const groups: {
      relationship: string;
      label: string;
      dishes: {
        slug: string;
        canonicalName: string;
        shortDescription: string | null;
        viewCount: number;
        evidence: {
          status: string;
          dispute: string | null;
          research: string | null;
        };
        explanation: string | null;
      }[];
    }[] = [];

    const ordered = [
      ...RELATIONSHIP_ORDER,
      ...associations
        .map((a) => a.relationship_type)
        .filter((r) => !RELATIONSHIP_ORDER.includes(r)),
    ].filter((r, i, all) => all.indexOf(r) === i);

    for (const relationship of ordered) {
      const dishes = associations
        .filter((a) => a.relationship_type === relationship)
        .map((a) => ({
          slug: a.slug,
          canonicalName: a.canonical_name,
          shortDescription: a.short_description,
          viewCount: a.view_count,
          evidence: {
            status: a.evidence_status,
            dispute: a.dispute_state,
            research: a.research_outcome,
          },
          explanation: a.explanation,
        }));
      if (dishes.length === 0) continue;
      groups.push({
        relationship,
        label: RELATIONSHIP_LABELS[relationship] ?? relationship,
        dishes,
      });
    }

    // The count is of DISTINCT dishes. A dish associated under two
    // relationship types appears in both groups but counts once.
    const distinctDishes = new Set(associations.map((a) => a.slug)).size;

    return {
      place: {
        slug: slugifyPlace(place.name),
        name: place.name,
        localName: place.local_name,
        isoCode: place.iso_code,
        entityType: place.entity_type,
        subdivisionType: place.subdivision_type,
        lat: place.has_geometry ? place.lat : null,
        lng: place.has_geometry ? place.lng : null,
      },
      groups,
      counts: {
        dishes: distinctDishes,
        groups: groups.length,
      },
    };
  });
}

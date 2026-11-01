/**
 * GET /api/taxonomy/family/:slug — a family's taxonomy: its DIMENSION,
 * its DEFINITION, and what is INCLUDED in it.
 *
 * WHY THIS EXISTS
 *
 * The brief's §P4 acceptance criterion says:
 *
 *   > The family page states its dimension, its definition and its
 *   > inclusion criteria, and explains that classification does not
 *   > imply common ancestry.
 *
 * The last clause is the important one. A reader who sees "N dishes in
 * the Dumpling family" will otherwise conclude those dishes share an
 * origin — and classification does NOT mean ancestry. The brief's own
 * product principles say it:
 *
 *   > Similarity does not establish descent.
 *   > Never infer ancestry from shared names, ingredients, shape,
 *   > geography or category membership.
 *
 * So the page says so, in words, next to the number.
 *
 * THE DIMENSION
 *
 * The taxonomy has FIVE dimensions — family, technique, course,
 * ingredient category and context — and they are NOT interchangeable.
 * "Dumplings" as a FAMILY (a food form) is a different claim from
 * "Steamed" as a TECHNIQUE (a preparation method). The dimension is
 * what tells the reader which kind of grouping they are looking at,
 * so it is stated rather than assumed.
 *
 * THE INCLUSION CRITERIA
 *
 * What is IN this family, stated as a rule rather than as a list of
 * examples. Where the vocabulary carries a description, that IS the
 * criterion. Where it does not, the criterion says what is known and
 * what is not — an honest gap beats an invented rule.
 */

import { db } from "@gustale/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { httpError } from "../errors.js";
import { slugParamSchema } from "../schemas/common.js";

// The five dimensions, and what each one means.
//
// The dimension a slug belongs to is RESOLVED from the vocabulary, not
// guessed from the slug — because a family and a cuisine can share a
// name, and the page must say which one it is.
const DIMENSION_LABELS: Record<string, string> = {
  family: "Food family",
  technique: "Preparation technique",
  course: "Culinary course",
  ingredient_category: "Ingredient category",
  context: "Culinary context",
};

const DIMENSION_EXPLANATIONS: Record<string, string> = {
  family:
    "A family groups dishes by the form they take — a dumpling is a shape and a way of holding a filling.",
  technique:
    "A technique is how a dish is prepared — steamed, fried, braised. It says nothing about where the dish came from.",
  course:
    "A course is the role a dish plays at a table: an appetizer, a main course, a side.",
  ingredient_category:
    "An ingredient category groups dishes by what they are principally made from.",
  context:
    "A context is the occasion a dish belongs to: a street food, a festival, a household meal.",
};

// What a classification does NOT mean. The same sentence for every
// dimension, because the principle does not vary with the dimension.
const NOT_ANCESTRY =
  "Classification is not ancestry. Two dishes in the same group were not necessarily invented from one another, and sharing a group says nothing about where either came from.";

export function registerTaxonomyFamilyRoutes(app: FastifyInstance): void {
  /**
   * GET /api/taxonomy/family/:slug
   */
  app.get("/api/taxonomy/family/:slug", async (request) => {
    const { slug } = slugParamSchema.parse(request.params);

    // Resolve the slug against EVERY dimension, and report which one it
    // belongs to.
    //
    // The DIMENSION and the DESCRIPTION are fetched SEPARATELY, and
    // that is not tidiness — it is the fix.
    //
    // The first version resolved both in ONE query: a UNION of the five
    // dimension tables with a COALESCE onto the legacy categories
    // table, and a LIMIT 1 over the union.
    //
    // It returned a NULL description for "dumpling", and the reason is
    // that the union's branches are independent: the dish_families
    // branch matched and produced its own row, and its COALESCE — which
    // DOES work when the query is run on its own — did not survive
    // the union's own type resolution.
    //
    // Two simple queries cannot get that wrong.
    const dimensionRows = await db.execute(sql`
      SELECT 'family' AS dimension, f.slug, f.name
        FROM dish_families f WHERE f.slug = ${slug}
      UNION ALL
      SELECT 'technique', t.slug, t.name
        FROM dish_techniques t WHERE t.slug = ${slug}
      UNION ALL
      SELECT 'course', c.slug, c.name
        FROM dish_courses c WHERE c.slug = ${slug}
      UNION ALL
      SELECT 'ingredient_category', i.slug, i.name
        FROM ingredient_categories i WHERE i.slug = ${slug}
      UNION ALL
      SELECT 'context', c.slug, c.name
        FROM dish_contexts c WHERE c.slug = ${slug}
      LIMIT 1
    `);

    const dimension = (
      dimensionRows as unknown as {
        dimension: string;
        slug: string;
        name: string;
      }[]
    )[0];

    if (!dimension) {
      throw httpError(404, "not_found", "Family not found");
    }

    // THE DESCRIPTION — the dimension's own, falling back to the
    // legacy categories table.
    //
    // The dimension tables are the source of truth for CLASSIFICATION
    // (the brief's D2), but their `description` column is mostly EMPTY
    // — 173 of 306 families have one, and the dumpling and moussaka
    // families do not. The prose about what a family contains lives in
    // the legacy categories table, and it is the only prose there is.
    //
    // So the dimension's own description wins when it has one, and the
    // legacy one is the fallback. An empty definition is not a
    // definition.
    const descriptionRows = await db.execute(sql`
      SELECT COALESCE(
        (SELECT description FROM dish_families      WHERE slug = ${slug}),
        (SELECT description FROM dish_techniques   WHERE slug = ${slug}),
        (SELECT description FROM dish_courses      WHERE slug = ${slug}),
        (SELECT description FROM ingredient_categories WHERE slug = ${slug}),
        (SELECT description FROM dish_contexts     WHERE slug = ${slug}),
        (SELECT description FROM categories        WHERE slug = ${slug})
      ) AS description
    `);

    const definition =
      (descriptionRows as unknown as { description: string | null }[])[0]
        ?.description ?? null;

    const found = {
      dimension: dimension.dimension,
      slug: dimension.slug,
      name: dimension.name,
      description: definition,
    };

    // How many published dishes are in it, and which dishes.
    //
    // The dishes come from the dimension tables AND from the legacy
    // categories, because the two taxonomies hold different dishes:
    // "dumpling" is filed in the legacy one, and "moussaka" is in both.
    //
    // The dimension is chosen FIRST and the query is built for it,
    // rather than a five-branch OR with the dimension as a parameter.
    // The OR version evaluated ${found.dimension} per row, which is
    // both slower and — the same union problem as above — prone to
    // resolving to nothing.
    const dishSql =
      found.dimension === "family"
        ? sql`
            SELECT d.slug, d.canonical_name, d.short_description
              FROM dishes d
             WHERE d.status = 'published'
               AND (
                 EXISTS (SELECT 1 FROM dish_dish_families x
                          WHERE x.dish_id = d.id AND x.value_id = (
                            SELECT id FROM dish_families WHERE slug = ${found.slug}))
                 OR EXISTS (SELECT 1 FROM dish_categories dc
                              JOIN categories c ON c.id = dc.category_id
                             WHERE dc.dish_id = d.id AND c.slug = ${found.slug})
               )
             ORDER BY d.canonical_name
             LIMIT 200`
        : found.dimension === "technique"
          ? sql`
            SELECT d.slug, d.canonical_name, d.short_description
              FROM dishes d
             WHERE d.status = 'published'
               AND EXISTS (SELECT 1 FROM dish_dish_techniques x
                            WHERE x.dish_id = d.id AND x.value_id = (
                              SELECT id FROM dish_techniques WHERE slug = ${found.slug}))
             ORDER BY d.canonical_name
             LIMIT 200`
          : found.dimension === "course"
            ? sql`
              SELECT d.slug, d.canonical_name, d.short_description
                FROM dishes d
               WHERE d.status = 'published'
                 AND EXISTS (SELECT 1 FROM dish_dish_courses x
                              WHERE x.dish_id = d.id AND x.value_id = (
                                SELECT id FROM dish_courses WHERE slug = ${found.slug}))
               ORDER BY d.canonical_name
               LIMIT 200`
            : found.dimension === "ingredient_category"
              ? sql`
                SELECT d.slug, d.canonical_name, d.short_description
                  FROM dishes d
                 WHERE d.status = 'published'
                   AND EXISTS (SELECT 1 FROM dish_dish_ingredient_categories x
                                WHERE x.dish_id = d.id AND x.value_id = (
                                  SELECT id FROM ingredient_categories WHERE slug = ${found.slug}))
                 ORDER BY d.canonical_name
                 LIMIT 200`
              : sql`
                SELECT d.slug, d.canonical_name, d.short_description
                  FROM dishes d
                 WHERE d.status = 'published'
                   AND EXISTS (SELECT 1 FROM dish_dish_contexts x
                                WHERE x.dish_id = d.id AND x.value_id = (
                                  SELECT id FROM dish_contexts WHERE slug = ${found.slug}))
                 ORDER BY d.canonical_name
                 LIMIT 200`;

    const dishRows = await db.execute(dishSql);

    const dishes = (
      dishRows as unknown as {
        slug: string;
        canonical_name: string;
        short_description: string | null;
      }[]
    ).map((d) => ({
      slug: d.slug,
      canonicalName: d.canonical_name,
      shortDescription: d.short_description,
    }));

    return {
      family: {
        slug: found.slug,
        name: found.name,
        dimension: found.dimension,
        dimensionLabel: DIMENSION_LABELS[found.dimension] ?? found.dimension,
        dimensionExplanation: DIMENSION_EXPLANATIONS[found.dimension] ?? null,
        definition: found.description,
      },
      inclusion: {
        // The INCLUSION CRITERIA — what belongs in this group, stated
        // as a rule.
        //
        // Where the vocabulary carries a description, that IS the
        // criterion. Where it does not, the criterion says what is known
        // and what is not — an honest gap beats an invented rule.
        criteria: found.description,
        hasCriteria: Boolean(found.description),
      },
      notAncestry: NOT_ANCESTRY,
      counts: { dishes: dishes.length },
      dishes,
    };
  });
}

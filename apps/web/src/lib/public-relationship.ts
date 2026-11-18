/**
 * THE PUBLIC RELATIONSHIP KINDS — the three the blueprint teaches, and
 * the rule that decides which links may appear in a ROUTE.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The site has THIRTEEN relation types (`relation_types`), grouped into
 * four visual groups by `relationship-grammar.ts`. That grouping is for
 * DRAWING. It is not what the reader is taught.
 *
 * The reader is taught THREE kinds (the blueprint's D3):
 *
 *   Associated with — a dish is part of food life somewhere.
 *   Resembles       — two things look or taste alike. NEVER descent.
 *   Influenced      — one thing influenced another. Directional, and it
 *                     needs a source that states the transmission.
 *
 * So the relation types have to be mapped onto those three, and that
 * mapping has to live in ONE place. When it lived only in the legend's
 * eye, the home page's map caption started naming RESEMBLANCES as if
 * they were influence: the live caption read "India to Indonesia to
 * United Kingdom to Hungary to Morocco to South Korea", because
 * Goulash (Hungary), Tagine (Morocco) and Kimchi Jjigae (South Korea)
 * were in the curry thread as COUSINS — `parallel_evolution`, a pure
 * resemblance — and their ORIGIN PLACES were being treated as stops on
 * a route that claimed to show how an idea travelled.
 *
 * A goulash and a tagine look alike. Neither influenced the other, and
 * neither has anything to do with the curry thread's history.
 *
 * THE RULE THIS MODULE ENFORCES
 * ------------------------------
 * A route is a claim about TRANSMISSION: "the idea went from here to
 * there". Only an INFLUENCE may be in a route, and only an influence
 * that CARRIES A SOURCE. Two things that resemble each other are
 * drawn as a dashed line — a resemblance is a visible connection — but
 * a resemblance is NEVER a stop on a route and NEVER a word in a
 * caption.
 *
 * The two requirements are separate and both are load-bearing:
 *
 *   1. The relationship must be an INFLUENCE — a directional descent or
 *      a migration — not a resemblance and not a family.
 *   2. The influence must HAVE A SOURCE. A source is not a nicety:
 *      an unsourced influence is an assertion nobody has checked, and
 *      the blueprint says an influence "needs a source that states the
 *      transmission". `drawableMovements()` in `journey.ts` already
 *      applies the same rule to a journey's movements — "a line on a
 *      map is a claim, and an unsourced claim is not drawn".
 *
 * WHY A FAMILY IS NOT IN A ROUTE EITHER
 * ------------------------------------
 * A family is CLASSIFICATION ("these belong to the same tradition"),
 * not a relationship between two dishes. The blueprint dropped it as a
 * connection kind for exactly that reason. Putting a family edge in a
 * route would say the tradition travelled, which is a different claim
 * and one the data does not make.
 *
 * WHERE A SOURCED INFLUENCE ACTUALLY LIVES
 * ----------------------------------------
 * A `dish_relations` row has NO source column — the relation table
 * cannot say why the claim holds. The sourced transmission is recorded
 * where the evidence actually is: in the dish's JOURNEY, as a chapter
 * (a beat) that carries a `source`, and as a movement between two
 * chapters that carries one.
 *
 * So the route is built from journey beats that carry a source, in the
 * beat's own order. A beat WITHOUT a source is a chapter of the
 * dish's story that nobody has cited — it is shown on the dish page as
 * an unsourced chapter, and it is NOT a stop on the route.
 */

// ─── The three kinds ───────────────────────────────────────────────────

export type PublicRelationshipKind = "associated" | "resembles" | "influenced";

/**
 * The relation types that assert TRANSMISSION — one thing came from
 * another, or travelled to another place.
 *
 * This is the union of the `descent` and `migration` groups in
 * `relationship-grammar.ts`, written out by slug because the route
 * filter is a WHITELIST: a relation type nobody has classified cannot
 * join a route by accident. The grammar's `KIND_BY_RELATION` map is the
 * authority on which group a type belongs to, and the two are checked
 * against each other by the test.
 */
export const INFLUENCE_RELATION_TYPES: readonly string[] = [
  // descent — one dish came from the other.
  "ancestor",
  "developed_from",
  "adapted_from",
  "influenced_by",
  // migration — one dish travelled to another place.
  "diaspora",
  "regional_variant_of",
];

/**
 * The relation types that assert RESEMBLANCE — they look or taste alike
 * and nothing more.
 *
 * A resemblance may be DRAWN (as a dashed line) but it may never be a
 * stop on a route, and it may never be named in a caption.
 */
export const RESEMBLANCE_RELATION_TYPES: readonly string[] = [
  "similar_form",
  "similar_technique",
  "similar-serving",
  "similar_serving",
  "shared-ingredient",
  "shared_ingredient",
  "often_compared_with",
];

/**
 * The relation types that assert CLASSIFICATION, not a connection.
 *
 * The blueprint dropped "same family" as a connection kind: a family
 * says which tradition a dish belongs to. It does not say the tradition
 * travelled, so it cannot be a stop on a route.
 */
export const FAMILY_RELATION_TYPES: readonly string[] = ["family"];

/**
 * The public kind of a relation type.
 *
 * Returns `null` for a type that is not classified — a type nobody
 * decided about. `null` means "not in a route", and it is the SAFE
 * answer: an unclassified relation must never silently become an
 * influence, because that is exactly the bug this module exists to
 * stop.
 */
export function publicRelationshipKind(
  relationType: string,
): PublicRelationshipKind | null {
  if (INFLUENCE_RELATION_TYPES.includes(relationType)) return "influenced";
  if (RESEMBLANCE_RELATION_TYPES.includes(relationType)) return "resembles";
  if (FAMILY_RELATION_TYPES.includes(relationType)) return "associated";
  // `connection_proposed` — a proposed connection whose direction is
  // not established. It is not an influence (the direction is not
  // known), and it is not a resemblance. It is not in a route.
  return null;
}

/** True when the relation type is a RESEMBLANCE. */
export function isResemblance(relationType: string): boolean {
  return publicRelationshipKind(relationType) === "resembles";
}

/** True when the relation type asserts INFLUENCE. */
export function isInfluence(relationType: string): boolean {
  return publicRelationshipKind(relationType) === "influenced";
}

// ─── The source rule ───────────────────────────────────────────────────

/**
 * The minimum a source must carry before it can be READ.
 *
 * A source is identified by its id and/or its citation. A source with
 * an id is readable even if its citation text is empty — the id points
 * at a row in `sources`, and the reader can open it. A source with only
 * text is readable too. A source that is absent, or present but empty
 * in every field, is not.
 */
export interface ConnectionSource {
  id?: string | null;
  citationText?: string | null;
  title?: string | null;
  url?: string | null;
}

/**
 * True when the source can be READ — there is a citation to open.
 *
 * This is the "has a source" test, and it is the same test
 * `drawableMovements()` applies to a journey's movements.
 */
export function hasReadableSource(
  source: ConnectionSource | null | undefined,
): boolean {
  if (!source) return false;
  if (typeof source.id === "string" && source.id.trim().length > 0) return true;
  if (
    typeof source.citationText === "string" &&
    source.citationText.trim().length > 0
  ) {
    return true;
  }
  if (typeof source.title === "string" && source.title.trim().length > 0) {
    return true;
  }
  if (typeof source.url === "string" && source.url.trim().length > 0) {
    return true;
  }
  return false;
}

// ─── The route ─────────────────────────────────────────────────────────

/**
 * The lineage roles that put a dish ON THE ROUTE.
 *
 * A thread's dishes are related to the thread in different ways, and
 * the thread records which. On the curry thread:
 *
 *   `regional_variant`      — a local variant of the core idea. The
 *                             idea came here. ELIGIBLE.
 *   `cousin`                — "same logic, possibly separate origin".
 *                             Looks alike; the data does not record a
 *                             transmission. NOT eligible.
 *   `parallel_evolution`    — "same logic, separate origin". A
 *                             resemblance that evolved apart. NOT
 *                             eligible.
 *
 * A route is a claim about TRANSMISSION. A cousin and a
 * parallel evolution are the thread's RESEMBLANCES — the blueprint's
 * "looks alike, not related" — and they are exactly what must never
 * appear in a route caption or on a route line.
 *
 * So a dish's ROLE in the thread is a gate in its own right, applied
 * BEFORE the source gate. A cousin with a sourced chapter is still a
 * cousin: the source backs the claim "the tagine is in Berber North
 * Africa", not the claim "the tagine is on the curry's route".
 */
export const ROUTE_LINEAGE_ROLES: readonly string[] = [
  "regional_variant",
  "descendant",
  "ancestor",
];

/**
 * True when the dish's role in the thread puts it on the route.
 *
 * A role the data does not record — or does not record as one of the
 * ROUTE_LINEAGE_ROLES — is NOT eligible. The safe answer is "no": a
 * role nobody classified must never silently become a route stop.
 */
export function isRouteLineageRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ROUTE_LINEAGE_ROLES.includes(role);
}

/**
 * A chapter of a dish's journey — the record of the dish in one place.
 *
 * A chapter that CARRIES A SOURCE is a sourced transmission: the dish
 * is in this place, and a source says so. A chapter WITHOUT a source
 * is an unsourced claim, and it is not a stop on the route.
 */
export interface RouteChapter {
  /** The dish the chapter belongs to. */
  dishSlug: string;
  /** The chapter's order within its dish's journey. */
  sequence: number;
  /** The place the chapter names. */
  placeName: string;
  /** The source behind the chapter, if any. */
  source?: ConnectionSource | null;
  /**
   * The dish's ROLE in the thread the route belongs to.
   *
   * A dish that is a cousin, or a parallel evolution, is a RESEMBLANCE
   * in the thread — no matter how well sourced its own journey is.
   */
  lineageRole?: string | null;
  /** Where the place is, when the journey knows. */
  lat?: number | null;
  lng?: number | null;
}

/** A place on the route, in order. */
export interface RouteStop {
  /** The place's name. */
  name: string;
  /** The dish slugs that reach this place. */
  dishSlugs: string[];
  /** Where the place is, when the journey knows. */
  lat: number | null;
  lng: number | null;
}

/**
 * True when the chapter may be a stop on a route.
 *
 * THREE GATES, all of them load-bearing:
 *
 *   1. The dish's ROLE in the thread must be a route role. A cousin or
 *      a parallel evolution is a RESEMBLANCE — "looks alike, not
 *      related" — and never a stop, however well sourced its own
 *      journey is.
 *   2. The chapter needs a PLACE (a route names places).
 *   3. The chapter needs a SOURCE (the blueprint: an influence "needs
 *      a source that states the transmission").
 */
export function mayJoinRoute(chapter: RouteChapter): boolean {
  if (!isRouteLineageRole(chapter.lineageRole)) return false;
  if (!chapter.placeName || !chapter.placeName.trim()) return false;
  if (!hasReadableSource(chapter.source)) return false;
  return true;
}

/**
 * The route, as the ordered places it passes through.
 *
 * THE ORDER IS THE JOURNEY'S OWN ORDER
 * -------------------------------------
 * A dish's journey chapters are already ordered by `sequence`, and that
 * order IS the transmission order: the dish was here, then it was
 * there. So the route is the sourced chapters in their own sequence —
 * NOT the order the dishes are listed in, and NOT the order the
 * thread's region vocabulary happens to give.
 *
 * THE ORDER ACROSS DISHES
 * -----------------------
 * The dishes are ordered by the order they first contribute a sourced
 * chapter. That is the thread's own order, which is the editorial
 * order the lineage records (its `sort_order`), and it is the order
 * the reader is being asked to follow.
 *
 * TWO DISHES IN ONE PLACE ARE ONE STOP
 * -----------------------------------
 * The route passes through a place once, and the caption names it
 * once. That is what makes the caption "India to Indonesia to the
 * United Kingdom" rather than "India to India to Indonesia".
 *
 * A dish with NO sourced chapter contributes nothing to the route. It
 * is in the thread, but the route says how the idea MOVED, and a dish
 * with no sourced transmission has not moved anywhere the data
 * records. It still appears on the map as a marker — a marker is a
 * position, not a claim about how the idea got there.
 */
export function routeFromChapters(
  chapters: RouteChapter[],
  options: { dishOrder?: readonly string[] } = {},
): RouteStop[] {
  const usable = chapters.filter(mayJoinRoute);
  if (usable.length === 0) return [];

  // The dish order: the caller's list first (the thread's editorial
  // order), then any dish the caller did not name, in the order the
  // chapters arrived.
  const rank = new Map<string, number>();
  options.dishOrder?.forEach((slug, i) => rank.set(slug, i));

  // Group the usable chapters by dish, each dish's chapters in its own
  // sequence order.
  const byDish = new Map<string, RouteChapter[]>();
  for (const c of usable) {
    const list = byDish.get(c.dishSlug) ?? [];
    list.push(c);
    byDish.set(c.dishSlug, list);
  }
  for (const list of byDish.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
  }

  // The dish order: the caller's order for the dishes it named, and the
  // arrival order for the rest.
  const dishSlugs = [...byDish.keys()].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });

  const stops: RouteStop[] = [];
  const byName = new Map<string, RouteStop>();

  for (const slug of dishSlugs) {
    for (const chapter of byDish.get(slug) ?? []) {
      const name = chapter.placeName.trim();
      const existing = byName.get(name);
      if (existing) {
        existing.dishSlugs.push(slug);
        // The first chapter that knows the coordinates wins — two
        // dishes reaching one place usually agree on where it is, and
        // the first sourced chapter is the one that put it on the
        // route.
        if (existing.lat === null && typeof chapter.lat === "number") {
          existing.lat = chapter.lat;
          existing.lng = chapter.lng ?? null;
        }
        continue;
      }
      const stop: RouteStop = {
        name,
        dishSlugs: [slug],
        lat: typeof chapter.lat === "number" ? chapter.lat : null,
        lng: typeof chapter.lng === "number" ? chapter.lng : null,
      };
      byName.set(name, stop);
      stops.push(stop);
    }
  }

  return stops;
}

/**
 * The caption's route text: "India to Indonesia to the United Kingdom".
 *
 * The place names are joined with " to ", which is the reading the
 * blueprint's mockup uses. Nothing else goes in here: no resemblance,
 * no dish that has no sourced transmission, and no place the sourced
 * chapters do not name.
 */
export function routeCaption(stops: RouteStop[]): string {
  return stops.map((s) => s.name).join(" to ");
}

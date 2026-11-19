/**
 * THE ROUTE — the tests.
 *
 * WHAT IS PROVEN HERE
 * -------------------
 * 1. A RESEMBLANCE can never appear in a route caption. Not "usually
 *    does not" — NEVER. The test builds the exact data that produced
 *    the live bug ("India to Indonesia to United Kingdom to Hungary to
 *    Morocco to South Korea") and asserts that Hungary, Morocco and
 *    South Korea are absent, and that the resemblance edges that would
 *    put them there are rejected.
 * 2. A resemblance may still be DRAWN. The rule is about the ROUTE and
 *    the CAPTION, not about the map's edges. A dashed line for a
 *    resemblance is a visible, honest connection; a place on a route
 *    is a claim about transmission, and the two must not be confused.
 * 3. An influence WITHOUT a source is not in a route either. The
 *    blueprint says an influence "needs a source that states the
 *    transmission".
 * 4. The route is ordered by the JOURNEY's own sequence, not by the
 *    order the dishes happen to be listed in.
 * 5. Two dishes in one place are ONE stop.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FAMILY_RELATION_TYPES,
  hasReadableSource,
  INFLUENCE_RELATION_TYPES,
  isInfluence,
  isResemblance,
  isRouteLineageRole,
  mayJoinRoute,
  publicRelationshipKind,
  RESEMBLANCE_RELATION_TYPES,
  type RouteChapter,
  routeCaption,
  routeFromChapters,
} from "./public-relationship.ts";

// ─── Fixtures ──────────────────────────────────────────────────────────
//
// The six dishes of the curry thread, as they are on live, with the
// journey beats that carry a source AND the role each dish holds in
// the thread.
//
//   vindaloo               Portugal (sourced) → Goa (sourced) → United Kingdom (UNSOURCED)
//                          role: regional_variant
//   chicken-tikka-masala   South Asia (sourced) → Glasgow (sourced) → United Kingdom (UNSOURCED)
//                          role: regional_variant
//   rendang                no journey at all
//                          role: regional_variant
//   goulash-hungarian      no journey at all
//                          role: cousin            ← a RESEMBLANCE
//   tagine-moroccan        Berber North Africa (SOURCED) → Maghreb spice routes (UNSOURCED)
//                          role: cousin            ← a RESEMBLANCE, but with a source
//   kimchi-jjigae          no journey at all
//                          role: parallel_evolution ← a RESEMBLANCE

const SOURCE = { id: "src-1", citationText: "Wikipedia. (2024). Vindaloo." };
const OTHER_SOURCE = { id: "src-2", title: "Chicken Tikka Masala" };

function chapter(
  dishSlug: string,
  sequence: number,
  placeName: string,
  source: RouteChapter["source"],
  lineageRole: RouteChapter["lineageRole"] = "regional_variant",
): RouteChapter {
  return { dishSlug, sequence, placeName, source, lineageRole };
}

// The curry thread's chapters, in the lineage's order.
const CURRY_CHAPTERS: RouteChapter[] = [
  chapter("vindaloo", 1, "Portugal", SOURCE),
  chapter("vindaloo", 2, "Goa", SOURCE),
  chapter("vindaloo", 3, "United Kingdom", null),
  chapter("chicken-tikka-masala", 1, "South Asia", OTHER_SOURCE),
  chapter("chicken-tikka-masala", 2, "Glasgow", OTHER_SOURCE),
  chapter("chicken-tikka-masala", 3, "United Kingdom", null),
  // The tagine is a cousin AND has a sourced chapter. It must still be
  // rejected — the source backs "the tagine is in Berber North Africa",
  // not "the tagine is on the curry's route".
  chapter("tagine-moroccan", 1, "Berber North Africa", SOURCE, "cousin"),
  chapter("tagine-moroccan", 2, "Maghreb spice routes", null, "cousin"),
];

// The thread's DISH order — the lineage's editorial order. This is the
// order the reader is asked to follow.
const DISH_ORDER = [
  "vindaloo",
  "chicken-tikka-masala",
  "rendang",
  "goulash-hungarian",
  "tagine-moroccan",
  "kimchi-jjigae",
];

// ─── The bug that was on live ──────────────────────────────────────────

describe("a resemblance can never appear in a route caption", () => {
  it("drops Hungary, Morocco and South Korea — the three that were on live", () => {
    const stops = routeFromChapters(CURRY_CHAPTERS, { dishOrder: DISH_ORDER });
    const caption = routeCaption(stops);

    // The three places that were wrongly in the live caption.
    assert.ok(
      !caption.includes("Hungary"),
      "Hungary must not be in the caption",
    );
    assert.ok(
      !caption.includes("Morocco"),
      "Morocco must not be in the caption",
    );
    assert.ok(
      !caption.includes("South Korea"),
      "South Korea must not be in the caption",
    );

    // And the resemblance dishes are not stops at all.
    const stopNames = stops.map((s) => s.name);
    assert.ok(!stopNames.includes("Hungary"));
    assert.ok(!stopNames.includes("Morocco"));
    assert.ok(!stopNames.includes("South Korea"));
  });

  it("drops a cousin even when its own chapter IS sourced", () => {
    // The tagine has a sourced chapter ("Berber North Africa"). It is
    // still a cousin — "same logic, possibly separate origin" — so it
    // is not on the curry's route. The source backs the claim "the
    // tagine is in Berber North Africa"; it does NOT back "the tagine
    // is on the curry's route".
    const stops = routeFromChapters(CURRY_CHAPTERS, { dishOrder: DISH_ORDER });
    const names = stops.map((s) => s.name);
    assert.ok(
      !names.includes("Berber North Africa"),
      "a cousin's place must not be a route stop",
    );
    assert.ok(
      !stops.some((s) => s.dishSlugs.includes("tagine-moroccan")),
      "the cousin dish must not be on the route",
    );
  });

  it("rejects a cousin and a parallel evolution by role", () => {
    for (const role of ["cousin", "parallel_evolution"]) {
      assert.equal(
        isRouteLineageRole(role),
        false,
        `${role} is not a route role`,
      );
      assert.equal(
        mayJoinRoute(chapter("tagine-moroccan", 1, "Morocco", SOURCE, role)),
        false,
        `${role} must not join a route`,
      );
    }
  });

  it("accepts a regional variant", () => {
    assert.equal(isRouteLineageRole("regional_variant"), true);
    assert.equal(
      mayJoinRoute(chapter("vindaloo", 1, "Goa", SOURCE, "regional_variant")),
      true,
    );
  });

  it("rejects an unknown or missing role", () => {
    // The safe answer is "no": a role nobody classified must never
    // silently become a route stop.
    assert.equal(isRouteLineageRole(null), false);
    assert.equal(isRouteLineageRole(undefined), false);
    assert.equal(isRouteLineageRole("some_role_nobody_classified"), false);
    assert.equal(
      mayJoinRoute(chapter("vindaloo", 1, "Goa", SOURCE, null)),
      false,
    );
  });

  it("never names a place reached only through a resemblance edge", () => {
    // The RESEMBLANCE relation types are the ones that would have put
    // Hungary, Morocco and South Korea on the route. None of them may
    // be an influence, and none of them may be in a route.
    for (const type of RESEMBLANCE_RELATION_TYPES) {
      assert.equal(isResemblance(type), true, `${type} is a resemblance`);
      assert.equal(publicRelationshipKind(type), "resembles");
      assert.equal(isInfluence(type), false, `${type} is not an influence`);
    }
  });

  it("does not classify a family as an influence", () => {
    for (const type of FAMILY_RELATION_TYPES) {
      assert.equal(isInfluence(type), false);
      assert.equal(publicRelationshipKind(type), "associated");
    }
  });

  it("classifies the influence types as influences", () => {
    for (const type of INFLUENCE_RELATION_TYPES) {
      assert.equal(isInfluence(type), true, `${type} is an influence`);
      assert.equal(publicRelationshipKind(type), "influenced");
    }
  });

  it("does not classify an unclassified relation type as an influence", () => {
    // `connection_proposed` has no established direction, so it is not
    // an influence. And a type nobody has heard of must never be
    // silently promoted to one.
    assert.equal(publicRelationshipKind("connection_proposed"), null);
    assert.equal(publicRelationshipKind("some_type_nobody_classified"), null);
    assert.equal(isInfluence("some_type_nobody_classified"), false);
  });
});

// ─── The source rule ──────────────────────────────────────────────────

describe("an influence without a source is not in the route", () => {
  it("rejects a chapter with no source", () => {
    assert.equal(mayJoinRoute(chapter("vindaloo", 1, "Goa", null)), false);
    assert.equal(mayJoinRoute(chapter("vindaloo", 1, "Goa", undefined)), false);
  });

  it("accepts a chapter with a readable source", () => {
    assert.equal(mayJoinRoute(chapter("vindaloo", 1, "Goa", SOURCE)), true);
    assert.equal(
      mayJoinRoute(chapter("vindaloo", 1, "Goa", { id: "x" })),
      true,
    );
    assert.equal(
      mayJoinRoute(chapter("vindaloo", 1, "Goa", { citationText: "A book" })),
      true,
    );
  });

  it("rejects an EMPTY source", () => {
    // A source object with every field blank is not a source.
    assert.equal(
      hasReadableSource({ id: "", citationText: "", title: "", url: "" }),
      false,
    );
    assert.equal(hasReadableSource({ id: "   " }), false);
    assert.equal(hasReadableSource(null), false);
    assert.equal(hasReadableSource(undefined), false);
  });

  it("rejects a chapter with no place", () => {
    assert.equal(mayJoinRoute(chapter("vindaloo", 1, "", SOURCE)), false);
    assert.equal(mayJoinRoute(chapter("vindaloo", 1, "   ", SOURCE)), false);
  });
});

// ─── The order ────────────────────────────────────────────────────────

describe("the route is ordered by the journey, not by the listing", () => {
  it("follows each dish's own sequence", () => {
    const stops = routeFromChapters(CURRY_CHAPTERS, { dishOrder: DISH_ORDER });
    const names = stops.map((s) => s.name);

    // Portugal before Goa, because Portugal is sequence 1.
    assert.ok(
      names.indexOf("Portugal") < names.indexOf("Goa"),
      "Portugal comes before Goa",
    );
    // South Asia before Glasgow.
    assert.ok(
      names.indexOf("South Asia") < names.indexOf("Glasgow"),
      "South Asia comes before Glasgow",
    );
  });

  it("drops the unsourced chapters", () => {
    const stops = routeFromChapters(CURRY_CHAPTERS, { dishOrder: DISH_ORDER });
    const names = stops.map((s) => s.name);

    // "United Kingdom" is an unsourced chapter on both dishes.
    assert.ok(!names.includes("United Kingdom"));
    // "Maghreb spice routes" is unsourced.
    assert.ok(!names.includes("Maghreb spice routes"));
  });

  it("keeps the thread's dish order", () => {
    const stops = routeFromChapters(CURRY_CHAPTERS, { dishOrder: DISH_ORDER });
    const names = stops.map((s) => s.name);

    // vindaloo is the first dish, so Portugal and Goa come first.
    assert.equal(names[0], "Portugal");
    assert.ok(names.indexOf("Goa") < names.indexOf("South Asia"));
  });

  it("makes two dishes in one place ONE stop", () => {
    // Both dishes reach "Goa" in this fixture.
    const stops = routeFromChapters(
      [
        chapter("vindaloo", 1, "Goa", SOURCE),
        chapter("chicken-tikka-masala", 1, "Goa", OTHER_SOURCE),
      ],
      { dishOrder: ["vindaloo", "chicken-tikka-masala"] },
    );
    assert.equal(stops.length, 1);
    assert.equal(stops[0]?.name, "Goa");
    assert.deepEqual(stops[0]?.dishSlugs, ["vindaloo", "chicken-tikka-masala"]);
  });

  it("is empty when nothing is sourced", () => {
    const stops = routeFromChapters([
      chapter("vindaloo", 1, "Goa", null),
      chapter("goulash-hungarian", 1, "Hungary", null),
    ]);
    assert.deepEqual(stops, []);
    assert.equal(routeCaption(stops), "");
  });

  it("is empty when there are no chapters at all", () => {
    assert.deepEqual(routeFromChapters([]), []);
  });
});

// ─── The caption ──────────────────────────────────────────────────────

describe("the caption", () => {
  it("joins the stops with ' to '", () => {
    const stops = routeFromChapters(CURRY_CHAPTERS, { dishOrder: DISH_ORDER });
    const caption = routeCaption(stops);
    assert.ok(caption.includes(" to "));
    assert.ok(!caption.includes(" to  "));
  });

  it("is empty for an empty route", () => {
    assert.equal(routeCaption([]), "");
  });
});

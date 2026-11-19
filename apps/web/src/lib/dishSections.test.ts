import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSectionLinks,
  connectionColumnFor,
  DISH_CONNECTION_COLUMN_STYLE,
  DISH_CONNECTION_COLUMNS,
  DISH_FACT_KEYS,
  DISH_FACT_LABELS,
  DISH_FACT_MISSING,
  DISH_SECTION_IDS,
  DISH_SECTION_ORDER,
  type DishSectionAvailability,
  isDirectionalRelation,
} from "./dishSections.ts";

const ALL_ON: DishSectionAvailability = {
  hasWhere: true,
  hasHistory: true,
  hasConnections: true,
  hasVariants: true,
  hasIngredients: true,
  hasRecipes: true,
  hasSources: true,
};

const ALL_OFF: DishSectionAvailability = {
  hasWhere: false,
  hasHistory: false,
  hasConnections: false,
  hasVariants: false,
  hasIngredients: false,
  hasRecipes: false,
  hasSources: false,
};

describe("the dish page section order", () => {
  it("is the mockup's order, exactly", () => {
    assert.deepEqual(
      [...DISH_SECTION_ORDER].map((s) => s.label),
      [
        "Overview",
        "Where",
        "History",
        "Connections",
        "Variants",
        "Ingredients",
        "Recipes",
        "Sources",
      ],
    );
  });

  it("keeps Overview first — the page always opens with the facts table", () => {
    const links = buildSectionLinks(ALL_OFF);
    assert.equal(links[0]?.label, "Overview");
    assert.equal(links[0]?.id, DISH_SECTION_IDS.overview);
  });

  it("gives every section a distinct anchor id", () => {
    const ids = DISH_SECTION_ORDER.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicate anchors");
  });

  it("uses an anchor id that reads as an id, not a label", () => {
    for (const s of DISH_SECTION_ORDER) {
      assert.match(s.id, /^[a-z0-9-]+$/, `${s.id} is a valid anchor`);
    }
  });
});

describe("buildSectionLinks — every link reaches real content", () => {
  it("includes every section when everything is rendered", () => {
    const links = buildSectionLinks(ALL_ON);
    assert.equal(links.length, DISH_SECTION_ORDER.length);
    assert.deepEqual(
      links.map((l) => l.label),
      DISH_SECTION_ORDER.map((s) => s.label),
    );
  });

  it("drops a section that is NOT rendered", () => {
    const links = buildSectionLinks({ ...ALL_ON, hasVariants: false });
    assert.ok(
      !links.some((l) => l.id === DISH_SECTION_IDS.variants),
      "no link to a Variants anchor that is not on the page",
    );
    assert.ok(
      links.some((l) => l.id === DISH_SECTION_IDS.ingredients),
      "the other sections survive",
    );
  });

  it("never links to an anchor that is not in the order registry", () => {
    // The invariant the whole nav rests on: a link's id is always one of
    // the ids the page renders.
    const known = new Set(DISH_SECTION_ORDER.map((s) => s.id));
    for (const available of [ALL_ON, ALL_OFF]) {
      for (const link of buildSectionLinks(available)) {
        assert.ok(known.has(link.id), `${link.id} is a known section anchor`);
      }
    }
  });

  it("keeps the mockup's order when sections drop out", () => {
    // Order is the order, not the set — dropping the middle sections
    // must not reorder the survivors.
    const links = buildSectionLinks({
      ...ALL_ON,
      hasWhere: false,
      hasVariants: false,
      hasRecipes: false,
    });
    assert.deepEqual(
      links.map((l) => l.label),
      ["Overview", "History", "Connections", "Ingredients", "Sources"],
    );
  });

  it("leaves only Overview when nothing else is rendered", () => {
    assert.deepEqual(
      buildSectionLinks(ALL_OFF).map((l) => l.label),
      ["Overview"],
    );
  });
});

describe("the facts table", () => {
  it("has the mockup's rows, in its order", () => {
    assert.deepEqual(
      [...DISH_FACT_KEYS],
      ["associatedWith", "family", "servedAs", "technique", "alsoCalled"],
    );
  });

  it("labels every row", () => {
    for (const key of DISH_FACT_KEYS) {
      assert.ok(DISH_FACT_LABELS[key].length > 0, `${key} has a label`);
    }
  });

  it("says 'No evidence' for a fact the dish does not have", () => {
    // A1's rule: a missing fact and a checked-and-unset fact are
    // different things. The wording says the second.
    assert.equal(DISH_FACT_MISSING, "No evidence");
    assert.ok(
      !DISH_FACT_MISSING.toLowerCase().includes("unknown"),
      "it does not pretend to know the answer",
    );
  });
});

describe("the connections columns", () => {
  it("has the mockup's three columns, in its order", () => {
    assert.deepEqual(
      [...DISH_CONNECTION_COLUMNS].map((c) => c.label),
      ["Resembles", "Influenced by", "Same family"],
    );
  });

  it("marks a likeness with a dashed line and influence with an arrow", () => {
    const by = Object.fromEntries(
      DISH_CONNECTION_COLUMNS.map((c) => [c.key, c]),
    );
    assert.equal(by.resembles?.mark, "dashed");
    assert.equal(by.influencedBy?.mark, "arrow");
  });

  it("gives the classification column NO mark", () => {
    // A2 retired "same family" as a relationship kind: a family is
    // CLASSIFICATION, not a relationship between two dishes. So there
    // is no line to draw and no arrow to point.
    const by = Object.fromEntries(
      DISH_CONNECTION_COLUMNS.map((c) => [c.key, c]),
    );
    assert.equal(by.sameFamily?.mark, "none");
  });

  it("writes the classification heading in small capitals", () => {
    // The capitals are what make the third column read as a label
    // rather than as a third kind of relationship.
    assert.equal(DISH_CONNECTION_COLUMN_STYLE.sameFamily, "caps");
    assert.equal(DISH_CONNECTION_COLUMN_STYLE.resembles, "title");
    assert.equal(DISH_CONNECTION_COLUMN_STYLE.influencedBy, "title");
  });

  it("routes each relation type to the column that means it", () => {
    assert.equal(connectionColumnFor("similar_form"), "resembles");
    assert.equal(connectionColumnFor("ancestor"), "influencedBy");
    assert.equal(connectionColumnFor("family"), "sameFamily");
  });

  it("refuses a relation type that no column means", () => {
    // These are real relations, but none of them is what the mockup's
    // three columns assert. Forcing them in would misname them.
    for (const type of [
      "descendant",
      "diaspora",
      "shared-ingredient",
      "shared-method",
      "similar-serving",
      "regional-cousin",
    ]) {
      assert.equal(
        connectionColumnFor(type),
        null,
        `${type} belongs in no column`,
      );
    }
  });

  it("never puts a descendant in the 'Influenced by' column", () => {
    // `descendant` is the INVERSE of `ancestor`. Reading it as
    // "Influenced by" would reverse the claim.
    assert.ok(
      !DISH_CONNECTION_COLUMNS.some((c) =>
        (c.relationTypes as readonly string[]).includes("descendant"),
      ),
      "no column carries the inverse type",
    );
  });

  it("knows which relation types carry a direction", () => {
    assert.equal(isDirectionalRelation("ancestor"), true);
    assert.equal(isDirectionalRelation("descendant"), true);
    assert.equal(isDirectionalRelation("family"), false);
    assert.equal(isDirectionalRelation("similar_form"), false);
  });
});

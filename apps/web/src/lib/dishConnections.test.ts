import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConnectionColumns,
  hasConnections,
  allColumns,
  populatedColumns,
  type RelationLike,
} from "./dishConnections.ts";

const rel = (
  slug: string,
  relationType: string,
  extra: Partial<RelationLike> = {},
): RelationLike => ({
  slug,
  name: slug.replace(/-/g, " "),
  relationType,
  ...extra,
});

describe("buildConnectionColumns", () => {
  it("puts a likeness in Resembles", () => {
    const c = buildConnectionColumns([
      rel("musakka-turkish", "similar_form", {
        reason: "no béchamel",
        countryName: "Turkey",
      }),
    ]);
    assert.equal(c.resembles.length, 1);
    assert.equal(c.resembles[0]?.slug, "musakka-turkish");
    assert.equal(c.resembles[0]?.reason, "no béchamel");
    assert.equal(c.resembles[0]?.placeName, "Turkey");
  });

  it("puts an ancestor in Influenced by", () => {
    const c = buildConnectionColumns([rel("vindaloo", "ancestor")]);
    assert.equal(c.influencedBy.length, 1);
    assert.equal(c.influencedBy[0]?.slug, "vindaloo");
  });

  it("puts a family relation in Same family", () => {
    const c = buildConnectionColumns([rel("hummus", "family")]);
    assert.equal(c.sameFamily.length, 1);
  });

  it("drops a relation that no column means", () => {
    const c = buildConnectionColumns([
      rel("a", "shared-ingredient"),
      rel("b", "shared-method"),
      rel("c", "similar-serving"),
      rel("d", "diaspora"),
      rel("e", "descendant"),
    ]);
    assert.deepEqual(c.resembles, []);
    assert.deepEqual(c.influencedBy, []);
    assert.deepEqual(c.sameFamily, []);
  });

  it("never puts a descendant in Influenced by", () => {
    // The inverse of ancestor. Reading it as "Influenced by" reverses
    // the claim, and a reader cannot detect that on their own.
    const c = buildConnectionColumns([rel("x", "descendant")]);
    assert.equal(c.influencedBy.length, 0);
  });

  it("keeps the API's order within a column", () => {
    // The API sorts by strength, strongest first.
    const c = buildConnectionColumns([
      rel("strong", "similar_form"),
      rel("weak", "similar_form"),
    ]);
    assert.equal(c.resembles[0]?.slug, "strong");
    assert.equal(c.resembles[1]?.slug, "weak");
  });

  it("carries the related dish's place and description", () => {
    const c = buildConnectionColumns([
      rel("moussaka-levant", "similar_form", {
        countryName: "Lebanon",
        isoCode: "LB",
        shortDescription: "An eggplant mezze.",
      }),
    ]);
    assert.equal(c.resembles[0]?.placeName, "Lebanon");
    assert.equal(c.resembles[0]?.placeIso, "LB");
    assert.equal(c.resembles[0]?.description, "An eggplant mezze.");
  });
});

describe("hasConnections", () => {
  it("is false when every column is empty", () => {
    assert.equal(hasConnections(buildConnectionColumns([])), false);
  });

  it("is true when one column has an entry", () => {
    const c = buildConnectionColumns([rel("hummus", "family")]);
    assert.equal(hasConnections(c), true);
  });
});

describe("allColumns (D21-11)", () => {
  it("returns all three columns even when none has an entry", () => {
    // The blueprint: "The dish page always shows ... the three
    // Connections columns (Resembles · Influenced by · Same family),
    // each with a short empty state when it has no data."
    const c = buildConnectionColumns([]);
    assert.deepEqual(
      allColumns(c).map((col) => col.label),
      ["Resembles", "Influenced by", "Same family"],
    );
  });

  it("keeps the mockup's order", () => {
    const c = buildConnectionColumns([
      rel("musakka-turkish", "similar_form"),
      rel("vindaloo", "ancestor"),
      rel("hummus", "family"),
    ]);
    assert.deepEqual(
      allColumns(c).map((col) => col.label),
      ["Resembles", "Influenced by", "Same family"],
    );
  });

  it("gives every column an entry list, empty or not", () => {
    const c = buildConnectionColumns([rel("hummus", "family")]);
    const by = Object.fromEntries(allColumns(c).map((x) => [x.key, x]));
    assert.equal(by.sameFamily?.entries.length, 1);
    assert.equal(by.resembles?.entries.length, 0);
    assert.equal(by.influencedBy?.entries.length, 0);
  });

  it("carries the mark each kind is drawn with", () => {
    const c = buildConnectionColumns([]);
    const by = Object.fromEntries(allColumns(c).map((x) => [x.key, x]));
    assert.equal(by.resembles?.mark, "dashed");
    assert.equal(by.influencedBy?.mark, "arrow");
    assert.equal(by.sameFamily?.mark, "none");
  });
});

describe("populatedColumns", () => {
  it("keeps the mockup's order", () => {
    const c = buildConnectionColumns([
      rel("musakka-turkish", "similar_form"),
      rel("vindaloo", "ancestor"),
      rel("hummus", "family"),
    ]);
    assert.deepEqual(
      populatedColumns(c).map((col) => col.label),
      ["Resembles", "Influenced by", "Same family"],
    );
  });

  it("omits a column with no entries", () => {
    const c = buildConnectionColumns([rel("hummus", "family")]);
    assert.deepEqual(
      populatedColumns(c).map((col) => col.label),
      ["Same family"],
    );
  });

  it("carries the mark each kind is drawn with", () => {
    const c = buildConnectionColumns([
      rel("musakka-turkish", "similar_form"),
      rel("vindaloo", "ancestor"),
      rel("hummus", "family"),
    ]);
    const by = Object.fromEntries(populatedColumns(c).map((x) => [x.key, x]));
    assert.equal(by.resembles?.mark, "dashed");
    assert.equal(by.influencedBy?.mark, "arrow");
    assert.equal(by.sameFamily?.mark, "none");
  });
});

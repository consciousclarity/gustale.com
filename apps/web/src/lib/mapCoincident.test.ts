import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allShareSameCoordKey,
  coordKey,
  countCoincidentByCoord,
  dedupeDishesBySlug,
  dishesAtCoordKey,
  expandToCoincidentStack,
  parseCoord,
} from "./mapCoincident.ts";

type D = { slug: string; lat: number; lng: number; name?: string };

describe("parseCoord", () => {
  it("accepts finite numbers including zero", () => {
    assert.equal(parseCoord(0), 0);
    // IEEE -0 must remain a valid coordinate, not treated as missing.
    assert.equal(parseCoord(-0) === 0, true);
    assert.equal(parseCoord(106.8456), 106.8456);
  });

  it("parses numeric strings including zero", () => {
    assert.equal(parseCoord("0"), 0);
    assert.equal(parseCoord("  -6.2088 "), -6.2088);
  });

  it("rejects empty / non-numeric / non-finite", () => {
    assert.equal(parseCoord(""), null);
    assert.equal(parseCoord("  "), null);
    assert.equal(parseCoord("abc"), null);
    assert.equal(parseCoord(Number.NaN), null);
    assert.equal(parseCoord(null), null);
    assert.equal(parseCoord(undefined), null);
  });
});

describe("coordKey", () => {
  it("groups exact shared centroids at 4 decimal places", () => {
    assert.equal(coordKey(-6.2088, 106.8456), coordKey(-6.2088, 106.8456));
    assert.equal(coordKey(-6.20881, 106.84561), coordKey(-6.2088, 106.8456));
  });

  it("does not merge nearby-but-different places", () => {
    assert.notEqual(coordKey(-6.2088, 106.8456), coordKey(-6.21, 106.85));
  });
});

describe("countCoincidentByCoord / dishesAtCoordKey", () => {
  const jakarta = { lat: -6.2088, lng: 106.8456 };
  const dishes: D[] = [
    { slug: "nasi-goreng", ...jakarta },
    { slug: "soto-ayam", ...jakarta },
    { slug: "bakso", ...jakarta },
    { slug: "poutine", lat: 46.8139, lng: -71.208 },
  ];
  const poutine = dishes[3];

  it("counts one dish at a unique point", () => {
    assert.ok(poutine);
    const counts = countCoincidentByCoord([poutine]);
    assert.equal(counts.get(coordKey(46.8139, -71.208)), 1);
  });

  it("counts two and eight coincident dishes", () => {
    const two = countCoincidentByCoord(dishes.slice(0, 2));
    assert.equal(two.get(coordKey(jakarta.lat, jakarta.lng)), 2);

    const eight: D[] = Array.from({ length: 8 }, (_, i) => ({
      slug: `jkt-${i}`,
      ...jakarta,
    }));
    const counts = countCoincidentByCoord(eight);
    assert.equal(counts.get(coordKey(jakarta.lat, jakarta.lng)), 8);
    assert.equal(
      dishesAtCoordKey(eight, coordKey(jakarta.lat, jakarta.lng)).length,
      8,
    );
  });

  it("keeps mixed coordinate groups separate", () => {
    const counts = countCoincidentByCoord(dishes);
    assert.equal(counts.get(coordKey(jakarta.lat, jakarta.lng)), 3);
    assert.equal(counts.get(coordKey(46.8139, -71.208)), 1);
  });
});

describe("dedupeDishesBySlug", () => {
  it("drops duplicate features for the same dish", () => {
    const out = dedupeDishesBySlug([
      { slug: "sushi", lat: 1, lng: 2 },
      { slug: "sushi", lat: 1, lng: 2 },
      { slug: "ramen", lat: 1, lng: 2 },
      { slug: "", lat: 1, lng: 2 },
    ]);
    assert.deepEqual(
      out.map((d) => d.slug),
      ["sushi", "ramen"],
    );
  });
});

describe("expandToCoincidentStack / allShareSameCoordKey", () => {
  const jakarta = { lat: -6.2088, lng: 106.8456 };
  const all: D[] = [
    { slug: "nasi-goreng", ...jakarta },
    { slug: "soto-ayam", ...jakarta },
    { slug: "bakso", ...jakarta },
    { slug: "poutine", lat: 46.8139, lng: -71.208 },
  ];
  const nasi = all[0];
  const soto = all[1];
  const poutine = all[3];

  it("expands a single hit feature to the full coincident stack", () => {
    assert.ok(nasi);
    const stack = expandToCoincidentStack([nasi], all);
    assert.equal(stack.length, 3);
    assert.ok(allShareSameCoordKey(stack));
  });

  it("leaves a unique dish alone", () => {
    assert.ok(poutine);
    const stack = expandToCoincidentStack([poutine], all);
    assert.equal(stack.length, 1);
    assert.equal(stack[0]?.slug, "poutine");
  });

  it("detects mixed cluster leaves", () => {
    assert.ok(nasi && soto && poutine);
    assert.equal(allShareSameCoordKey([nasi, poutine]), false);
    assert.equal(allShareSameCoordKey([nasi, soto]), true);
  });
});

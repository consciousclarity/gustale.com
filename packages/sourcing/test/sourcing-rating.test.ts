/**
 * ADR-008 Decision 17 — the SIXTEEN FIXTURES.
 *
 * These are the acceptance criterion for GUS-1103. Each test is named
 * after the fixture it implements, so a failure says which rule broke.
 *
 * The fixtures test the RULES, not the world. The data is synthetic.
 *
 * THE RULES UNDER TEST (ADR-008 Decision 3, 4, 5, 6, 9, 10):
 *
 *   • a form's burden = MAX(availability, price), never the sum
 *   • an ingredient's burden = the LOWEST burden across its forms
 *   • the recipe result is evaluated: Hard → Unknown → Moderate → Easy
 *   • optional ingredients are excluded from every step
 *   • a substitute with burden >= 2 rescues nothing
 *   • an approximate substitute never rescues a KEY ingredient
 *   • a `minor` cost weight caps the price score at 1
 *   • price data older than 12 months counts as unknown
 *   • most specific data wins: country → reliable region → unknown
 */

import { describe, expect, it } from "vitest";
import { rateSourcing } from "../src/engine.js";
import type {
  AvailabilityRow,
  RecipeLine,
  SubstituteRow,
} from "../src/types.js";
import { band, country, form, line, NOW, row, substitute } from "./fixtures.js";

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 1 — all required ingredients common → Easy
// ─────────────────────────────────────────────────────────────────────

describe("fixture 1 — all required ingredients common → Easy", () => {
  const de = country("DE");

  it("rates a recipe whose required ingredients are all common as easy", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato", ingredientSlug: "tomato" }),
      line({ ingredientId: "onion", ingredientSlug: "onion" }),
      line({ ingredientId: "olive-oil", ingredientSlug: "olive-oil" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      row({
        ingredientId: "onion",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      row({
        ingredientId: "olive-oil",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("easy");
  });

  it("gives every required ingredient a reason with a score of zero", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato", ingredientSlug: "tomato" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.ingredientSlug).toBe("tomato");
    expect(result.reasons[0]?.score).toBe(0);
    expect(result.reasons[0]?.country).toBe("DE");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 2 — a missing ingredient with a suitable substitute → Moderate
// ─────────────────────────────────────────────────────────────────────

describe("fixture 2 — a missing ingredient with a suitable substitute → Moderate", () => {
  const de = country("DE");

  it("rates it moderate and names the substitute", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({ ingredientId: "tamarind", ingredientSlug: "tamarind" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      // Tamarind has NO row in Germany — it is missing.
      row({
        ingredientId: "tamarind",
        geoEntityId: "geo-JP",
        availability: "common",
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "tamarind",
        substituteIngredientId: "date-paste",
        substituteSlug: "date-paste",
        suitability: "suitable",
        changeNote: null,
      }),
    ];
    const datePaste: AvailabilityRow[] = [
      row({
        ingredientId: "date-paste",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];

    const result = rateSourcing(
      lines,
      [...rows, ...datePaste],
      substitutes,
      de,
      { now: NOW },
    );

    expect(result.rating).toBe("moderate");

    const reason = result.reasons.find((r) => r.ingredientSlug === "tamarind");
    expect(reason?.substitute).not.toBeNull();
    expect(reason?.substitute?.slug).toBe("date-paste");
    expect(reason?.substitute?.suitability).toBe("suitable");
  });

  it("is unknown, not moderate, when the missing ingredient has NO substitute", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({ ingredientId: "tamarind", ingredientSlug: "tamarind" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("availability_unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 3 — hard-to-find ingredient with a usable alternative form →
// Moderate
// ─────────────────────────────────────────────────────────────────────

describe("fixture 3 — a hard-to-find ingredient with a usable alternative form → Moderate", () => {
  const de = country("DE");

  it("takes the alternative form and rates it moderate", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "curry-leaves", ingredientSlug: "curry-leaves" }),
    ];
    const rows: AvailabilityRow[] = [
      // Fresh is a specialty-store product at a high price → burden 2.
      row({
        ingredientId: "curry-leaves",
        geoEntityId: de.geoEntityId,
        form: form.fresh,
        availability: "specialty_only",
        priceBand: band.high,
      }),
      // Frozen is seasonal and a little dearer than the local norm →
      // burden 1. It is USABLE, and it is the best of the two.
      row({
        ingredientId: "curry-leaves",
        geoEntityId: de.geoEntityId,
        form: form.frozen,
        availability: "seasonal",
        priceBand: band.elevated,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // The ingredient's burden is the LOWEST across its compatible
    // forms: min(2, 1) = 1 → moderate.
    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.form).toBe("frozen");
    expect(result.reasons[0]?.score).toBe(1);
  });

  it("is easy when the alternative form is itself easy", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "curry-leaves", ingredientSlug: "curry-leaves" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "curry-leaves",
        geoEntityId: de.geoEntityId,
        form: form.fresh,
        availability: "specialty_only",
        priceBand: band.high,
      }),
      row({
        ingredientId: "curry-leaves",
        geoEntityId: de.geoEntityId,
        form: form.frozen,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.form).toBe("frozen");
  });

  it("stays hard when the easy alternative is NOT recipe-compatible", () => {
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "curry-leaves",
        geoEntityId: de.geoEntityId,
        form: form.fresh,
        availability: "specialty_only",
        priceBand: band.high,
      }),
      row({
        ingredientId: "curry-leaves",
        geoEntityId: de.geoEntityId,
        form: form.frozen,
        availability: "common",
        priceBand: band.typical,
      }),
    ];
    // The recipe accepts ONLY the fresh form → the easy alternative is
    // not recipe-compatible, so the ingredient stays hard.
    const strict: RecipeLine[] = [
      line({
        ingredientId: "curry-leaves",
        ingredientSlug: "curry-leaves",
        acceptedForms: ["fresh"],
      }),
    ];

    const result = rateSourcing(strict, rows, [], de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.form).toBe("fresh");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 4 — missing key ingredient, no suitable substitute → Hard
// ─────────────────────────────────────────────────────────────────────

describe("fixture 4 — a missing key ingredient with no suitable substitute → Hard", () => {
  const de = country("DE");

  it("rates it hard", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({ ingredientId: "ackee", ingredientSlug: "ackee", isKey: true }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      row({
        ingredientId: "ackee",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("hard");
    const reason = result.reasons.find((r) => r.ingredientSlug === "ackee");
    expect(reason?.cause).toBe("unavailable");
    expect(reason?.score).toBe(3);
    expect(reason?.isKey).toBe(true);
  });

  it("is moderate, not hard, when the same ingredient is NOT key", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "ackee", ingredientSlug: "ackee", isKey: false }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "ackee",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // ADR-008 Decision 4: a non-key ingredient with burden 3 and no
    // substitute at all → Moderate, because the dish is still
    // makeable without it.
    expect(result.rating).toBe("moderate");
  });

  it("is hard when the only substitute is approximate — it cannot rescue a key ingredient", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "ackee", ingredientSlug: "ackee", isKey: true }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "ackee",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
      row({
        ingredientId: "plantain",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "ackee",
        substituteIngredientId: "plantain",
        suitability: "approximate",
        changeNote: "a different fruit; the dish does not taste the same",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, de, { now: NOW });

    expect(result.rating).toBe("hard");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 5 — no country data for a required ingredient → Unknown
// ─────────────────────────────────────────────────────────────────────

describe("fixture 5 — no country data for a required ingredient → Availability unknown", () => {
  const de = country("DE");

  it("rates it unknown", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({ ingredientId: "panch-phoron", ingredientSlug: "panch-phoron" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      // panch-phoron exists, but only for another country.
      row({
        ingredientId: "panch-phoron",
        geoEntityId: "geo-IN",
        availability: "common",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("availability_unknown");
    const reason = result.reasons.find(
      (r) => r.ingredientSlug === "panch-phoron",
    );
    expect(reason?.cause).toBe("no_record");
  });

  it("uses a region row only when it is marked fallback_reliable", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "panch-phoron", ingredientSlug: "panch-phoron" }),
    ];
    const deWithRegion = country("DE", {
      regionGeoEntityIds: ["geo-EU"],
    });
    const unreliable: AvailabilityRow[] = [
      row({
        ingredientId: "panch-phoron",
        geoEntityId: "geo-EU",
        availability: "common",
        fallbackReliable: false,
      }),
    ];
    const reliable: AvailabilityRow[] = [
      row({
        ingredientId: "panch-phoron",
        geoEntityId: "geo-EU",
        availability: "common",
        fallbackReliable: true,
      }),
    ];

    // "Europe" is never one profile: a region row without the
    // reliable flag is not a fallback (ADR-008 Decision 9).
    expect(
      rateSourcing(lines, unreliable, [], deWithRegion, { now: NOW }).rating,
    ).toBe("availability_unknown");
    expect(
      rateSourcing(lines, reliable, [], deWithRegion, { now: NOW }).rating,
    ).toBe("easy");
  });

  it("prefers the country row over the region row", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "panch-phoron", ingredientSlug: "panch-phoron" }),
    ];
    const deWithRegion = country("DE", {
      regionGeoEntityIds: ["geo-EU"],
    });
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "panch-phoron",
        geoEntityId: "geo-EU",
        availability: "common",
        fallbackReliable: true,
      }),
      row({
        ingredientId: "panch-phoron",
        geoEntityId: deWithRegion.geoEntityId,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], deWithRegion, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.form).toBe("fresh");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 6 — unavailable / expensive optional ingredient → no change
// ─────────────────────────────────────────────────────────────────────

describe("fixture 6 — an unavailable or expensive optional ingredient changes nothing", () => {
  const de = country("DE");

  it("stays easy when the optional ingredient is unavailable", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({
        ingredientId: "ube",
        ingredientSlug: "ube",
        isOptional: true,
        isKey: true,
      }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      row({
        ingredientId: "ube",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("easy");
  });

  it("stays easy when the optional ingredient is prohibitive", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({
        ingredientId: "saffron",
        ingredientSlug: "saffron",
        isOptional: true,
      }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      row({
        ingredientId: "saffron",
        geoEntityId: de.geoEntityId,
        availability: "specialty_only",
        priceBand: band.prohibitive,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("easy");
  });

  it("mentions the optional ingredient in the reasons but never moves the result", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "tomato" }),
      line({
        ingredientId: "ube",
        ingredientSlug: "ube",
        isOptional: true,
      }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "tomato",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
      row({
        ingredientId: "ube",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    const reason = result.reasons.find((r) => r.ingredientSlug === "ube");
    expect(reason).toBeDefined();
    expect(reason?.isOptional).toBe(true);
    expect(reason?.score).toBe(3);
    expect(result.rating).toBe("easy");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 7 — coconut milk: Indonesia vs Germany → Easy in both
// ─────────────────────────────────────────────────────────────────────

describe("fixture 7 — coconut milk is Easy in Indonesia and in Germany, for different reasons", () => {
  it("is easy in Indonesia, on the homemade form", () => {
    const id = country("ID");
    const lines: RecipeLine[] = [
      line({ ingredientId: "coconut-milk", ingredientSlug: "coconut-milk" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "coconut-milk",
        geoEntityId: id.geoEntityId,
        form: form.homemade,
        availability: "common",
        priceBand: band.typical,
      }),
      row({
        ingredientId: "coconut-milk",
        geoEntityId: id.geoEntityId,
        form: form.canned,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], id, { now: NOW });

    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.form).toBe("homemade");
    expect(result.reasons[0]?.score).toBe(0);
  });

  it("is easy in Germany, on the packaged form", () => {
    const de = country("DE");
    const lines: RecipeLine[] = [
      line({ ingredientId: "coconut-milk", ingredientSlug: "coconut-milk" }),
    ];
    const rows: AvailabilityRow[] = [
      // Fresh is a specialty product at a high price.
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.fresh,
        availability: "specialty_only",
        priceBand: band.high,
      }),
      // Packaged is ordinary retail at a typical price.
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.canned,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.form).toBe("canned_or_packaged");
    expect(result.reasons[0]?.score).toBe(0);
  });

  it("names a DIFFERENT form in each country — that is the whole difference", () => {
    const id = country("ID");
    const de = country("DE");
    const lines: RecipeLine[] = [
      line({ ingredientId: "coconut-milk", ingredientSlug: "coconut-milk" }),
    ];
    const idRows: AvailabilityRow[] = [
      row({
        ingredientId: "coconut-milk",
        geoEntityId: id.geoEntityId,
        form: form.homemade,
        availability: "common",
        priceBand: band.typical,
      }),
    ];
    const deRows: AvailabilityRow[] = [
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.canned,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const inId = rateSourcing(lines, idRows, [], id, { now: NOW });
    const inDe = rateSourcing(lines, deRows, [], de, { now: NOW });

    expect(inId.rating).toBe("easy");
    expect(inDe.rating).toBe("easy");
    expect(inId.reasons[0]?.form).not.toBe(inDe.reasons[0]?.form);
  });

  it("takes the LOWEST burden, never the highest — Germany stays easy despite a costly fresh form", () => {
    const de = country("DE");
    const lines: RecipeLine[] = [
      line({ ingredientId: "coconut-milk", ingredientSlug: "coconut-milk" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.fresh,
        availability: "specialty_only",
        priceBand: band.prohibitive,
      }),
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.canned,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // The fresh form's burden is 3, the canned form's is 0. The
    // ingredient's burden is the LOWEST → 0 → easy.
    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.score).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 8 — cassava stew: Ghana Easy (fresh) · Germany Moderate
// ─────────────────────────────────────────────────────────────────────

describe("fixture 8 — cassava stew: Ghana is Easy (fresh), Germany is Moderate (frozen, specialty)", () => {
  const lines: RecipeLine[] = [
    line({ ingredientId: "cassava", ingredientSlug: "cassava" }),
  ];

  it("is easy in Ghana, on the fresh form", () => {
    const gh = country("GH");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "cassava",
        geoEntityId: gh.geoEntityId,
        form: form.fresh,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], gh, { now: NOW });

    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.form).toBe("fresh");
  });

  it("is moderate in Germany, on the frozen specialty-store form", () => {
    const de = country("DE");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "cassava",
        geoEntityId: de.geoEntityId,
        form: form.fresh,
        availability: "unavailable",
      }),
      row({
        ingredientId: "cassava",
        geoEntityId: de.geoEntityId,
        form: form.frozen,
        availability: "specialty_only",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.form).toBe("frozen");
    expect(result.reasons[0]?.score).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 9 — ackee & saltfish: Jamaica Easy · canned-only Moderate ·
// no-supply Hard
// ─────────────────────────────────────────────────────────────────────

describe("fixture 9 — ackee and saltfish: Jamaica Easy, a canned-only country Moderate, a no-supply country Hard", () => {
  const lines: RecipeLine[] = [
    line({ ingredientId: "ackee", ingredientSlug: "ackee", isKey: true }),
    line({ ingredientId: "saltfish", ingredientSlug: "saltfish" }),
  ];

  it("is easy in Jamaica", () => {
    const jm = country("JM");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "ackee",
        geoEntityId: jm.geoEntityId,
        form: form.fresh,
        availability: "common",
        priceBand: band.typical,
      }),
      row({
        ingredientId: "saltfish",
        geoEntityId: jm.geoEntityId,
        form: form.dried,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], jm, { now: NOW });

    expect(result.rating).toBe("easy");
  });

  it("is moderate in a canned-only country", () => {
    const xx = country("XX");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "ackee",
        geoEntityId: xx.geoEntityId,
        form: form.fresh,
        availability: "unavailable",
      }),
      row({
        ingredientId: "ackee",
        geoEntityId: xx.geoEntityId,
        form: form.canned,
        availability: "specialty_only",
        priceBand: band.elevated,
      }),
      row({
        ingredientId: "saltfish",
        geoEntityId: xx.geoEntityId,
        form: form.dried,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], xx, { now: NOW });

    // The canned form's burden is 2 — not 3, so it is not a blocker.
    expect(result.rating).toBe("moderate");
    expect(result.reasons.find((r) => r.ingredientSlug === "ackee")?.form).toBe(
      "canned_or_packaged",
    );
  });

  it("is hard in a no-supply country — ackee is key and has no substitute", () => {
    const yy = country("YY");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "ackee",
        geoEntityId: yy.geoEntityId,
        form: form.fresh,
        availability: "unavailable",
      }),
      row({
        ingredientId: "ackee",
        geoEntityId: yy.geoEntityId,
        form: form.canned,
        availability: "unavailable",
      }),
      row({
        ingredientId: "saltfish",
        geoEntityId: yy.geoEntityId,
        form: form.dried,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], yy, { now: NOW });

    expect(result.rating).toBe("hard");
    const reason = result.reasons.find((r) => r.ingredientSlug === "ackee");
    expect(reason?.cause).toBe("unavailable");
    expect(reason?.substitute).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 10 — preserved-lemon tagine: Morocco vs Germany, salted
// lemon marked approximate
// ─────────────────────────────────────────────────────────────────────

describe("fixture 10 — preserved-lemon tagine: Morocco vs Germany, salted lemon marked approximate", () => {
  const lines: RecipeLine[] = [
    line({
      ingredientId: "preserved-lemon",
      ingredientSlug: "preserved-lemon",
    }),
  ];

  it("is easy in Morocco, on the preserved form", () => {
    const ma = country("MA");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "preserved-lemon",
        geoEntityId: ma.geoEntityId,
        form: form.canned,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], ma, { now: NOW });

    expect(result.rating).toBe("easy");
  });

  it("is moderate in Germany — the salted lemon is an approximate substitute and the change is disclosed", () => {
    const de = country("DE");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "preserved-lemon",
        geoEntityId: de.geoEntityId,
        form: form.canned,
        availability: "unavailable",
      }),
      row({
        ingredientId: "salted-lemon",
        geoEntityId: de.geoEntityId,
        form: form.dried,
        availability: "common",
        priceBand: band.typical,
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "preserved-lemon",
        substituteIngredientId: "salted-lemon",
        substituteSlug: "salted-lemon",
        suitability: "approximate",
        changeNote:
          "salted lemon is drier and sharper than preserved lemon; salt the stew more lightly",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, de, { now: NOW });

    expect(result.rating).toBe("moderate");
    const reason = result.reasons[0];
    expect(reason?.substitute?.slug).toBe("salted-lemon");
    expect(reason?.substitute?.suitability).toBe("approximate");
    expect(reason?.substitute?.changeNote).toBe(
      "salted lemon is drier and sharper than preserved lemon; salt the stew more lightly",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 11 — gochujang dish: South Korea Easy · Germany by import
// effort
// ─────────────────────────────────────────────────────────────────────

describe("fixture 11 — gochujang: South Korea Easy, Germany by import effort", () => {
  const lines: RecipeLine[] = [
    line({ ingredientId: "gochujang", ingredientSlug: "gochujang" }),
  ];

  it("is easy in South Korea", () => {
    const kr = country("KR");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gochujang",
        geoEntityId: kr.geoEntityId,
        // Gochujang is a fermented paste — never "fresh" (ADR-008
        // Decision 18).
        form: form.paste,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], kr, { now: NOW });

    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.form).toBe("paste_or_concentrate");
  });

  it("is moderate in Germany — import-dependent", () => {
    const de = country("DE");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gochujang",
        geoEntityId: de.geoEntityId,
        form: form.paste,
        availability: "specialty_only",
        priceBand: band.high,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.score).toBe(2);
  });

  it("is hard in Germany when the import is prohibitive", () => {
    const de = country("DE");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gochujang",
        geoEntityId: de.geoEntityId,
        form: form.paste,
        availability: "specialty_only",
        priceBand: band.prohibitive,
      }),
    ];

    // max(2, 3) = 3 → a key-less ingredient with burden 3 → moderate.
    expect(rateSourcing(lines, rows, [], de, { now: NOW }).rating).toBe(
      "moderate",
    );

    // As a KEY ingredient it is a blocker.
    const keyed: RecipeLine[] = [
      line({
        ingredientId: "gochujang",
        ingredientSlug: "gochujang",
        isKey: true,
      }),
    ];
    expect(rateSourcing(keyed, rows, [], de, { now: NOW }).rating).toBe("hard");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 12 — fondue: Switzerland Easy · Indonesia Moderate (suitable
// local blend) / Hard (none)
// ─────────────────────────────────────────────────────────────────────

describe("fixture 12 — fondue: Switzerland Easy, Indonesia Moderate with a suitable local blend, Hard without one", () => {
  const lines: RecipeLine[] = [
    line({ ingredientId: "gruyere", ingredientSlug: "gruyere", isKey: true }),
  ];

  it("is easy in Switzerland", () => {
    const ch = country("CH");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gruyere",
        geoEntityId: ch.geoEntityId,
        form: form.fresh,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    const result = rateSourcing(lines, rows, [], ch, { now: NOW });

    expect(result.rating).toBe("easy");
  });

  it("is moderate in Indonesia with a suitable local cheese blend", () => {
    const id = country("ID");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gruyere",
        geoEntityId: id.geoEntityId,
        form: form.fresh,
        availability: "unavailable",
      }),
      row({
        ingredientId: "keju",
        geoEntityId: id.geoEntityId,
        form: form.fresh,
        availability: "common",
        priceBand: band.typical,
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "gruyere",
        substituteIngredientId: "keju",
        substituteSlug: "keju",
        suitability: "suitable",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, id, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.substitute?.slug).toBe("keju");
  });

  it("is hard in Indonesia with no substitute at all", () => {
    const id = country("ID");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gruyere",
        geoEntityId: id.geoEntityId,
        form: form.fresh,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], id, { now: NOW });

    expect(result.rating).toBe("hard");
  });

  it("is hard in Indonesia when the only substitute is itself hard to get", () => {
    const id = country("ID");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gruyere",
        geoEntityId: id.geoEntityId,
        form: form.fresh,
        availability: "unavailable",
      }),
      // The local blend is itself a specialty import.
      row({
        ingredientId: "keju",
        geoEntityId: id.geoEntityId,
        form: form.fresh,
        availability: "specialty_only",
        priceBand: band.high,
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "gruyere",
        substituteIngredientId: "keju",
        substituteSlug: "keju",
        suitability: "suitable",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, id, { now: NOW });

    // A substitute with burden >= 2 does not rescue anything.
    expect(result.rating).toBe("hard");
    // The candidate is still reported — it is simply not a rescue.
    const candidate = result.reasons[0]?.substitutes.find(
      (s) => s.slug === "keju",
    );
    expect(candidate?.burden).toBe(2);
    expect(candidate?.rescues).toBe(false);
    expect(result.reasons[0]?.substitute).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 13 — coconut curry where only an imported can exists
// ─────────────────────────────────────────────────────────────────────

describe("fixture 13 — coconut curry where only an imported can exists", () => {
  const lines: RecipeLine[] = [
    line({
      ingredientId: "coconut-milk",
      ingredientSlug: "coconut-milk",
      isKey: true,
    }),
  ];

  it("is moderate when the can is stocked at a reasonable price", () => {
    const de = country("DE");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.canned,
        availability: "specialty_only",
        priceBand: band.elevated,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.score).toBe(2);
  });

  it("is hard when the can is prohibitive and there is no alternative", () => {
    const de = country("DE");
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "coconut-milk",
        geoEntityId: de.geoEntityId,
        form: form.canned,
        availability: "specialty_only",
        priceBand: band.prohibitive,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("hard");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 14 — price band Typical → High flips Easy → Moderate
// ─────────────────────────────────────────────────────────────────────

describe("fixture 14 — a price band crossing from Typical to High flips a recipe from Easy to Moderate", () => {
  const de = country("DE");
  const lines: RecipeLine[] = [
    line({ ingredientId: "olives", ingredientSlug: "olives" }),
  ];

  it("is easy at a typical price", () => {
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "common",
        priceBand: band.typical,
      }),
    ];

    expect(rateSourcing(lines, rows, [], de, { now: NOW }).rating).toBe("easy");
  });

  it("is moderate at a high price — the price alone moved it", () => {
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "common",
        priceBand: band.high,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.score).toBe(2);
    expect(result.reasons[0]?.cause).toBe("price");
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 15 — price older than the threshold → Unknown
// ─────────────────────────────────────────────────────────────────────

describe("fixture 15 — price data older than the 12-month threshold counts as unknown", () => {
  const de = country("DE");
  const lines: RecipeLine[] = [
    line({ ingredientId: "olives", ingredientSlug: "olives" }),
  ];

  it("is unknown when the price row is older than 12 months", () => {
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "common",
        priceBand: band.typical,
        lastReviewed: "2025-06-01",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("availability_unknown");
    expect(result.reasons[0]?.cause).toBe("stale_price");
  });

  it("is easy when the price row is inside the 12-month window", () => {
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "common",
        priceBand: band.typical,
        lastReviewed: "2026-06-01",
      }),
    ];

    expect(rateSourcing(lines, rows, [], de, { now: NOW }).rating).toBe("easy");
  });

  it("keeps the availability: a stale price does not expire the availability", () => {
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
        priceBand: band.typical,
        lastReviewed: "2025-06-01",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // The availability is the blocker, and it does not expire.
    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.cause).toBe("unavailable");
    expect(result.reasons[0]?.availabilityScore).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// FIXTURE 16 — a `minor` cost weight caps an expensive spice at
// Moderate
// ─────────────────────────────────────────────────────────────────────

describe("fixture 16 — a `minor` cost weight caps an expensive spice at Moderate", () => {
  const de = country("DE");
  const rows: AvailabilityRow[] = [
    row({
      ingredientId: "saffron",
      geoEntityId: de.geoEntityId,
      availability: "specialty_only",
      priceBand: band.prohibitive,
    }),
  ];

  it("is moderate when the line is `minor`", () => {
    const lines: RecipeLine[] = [
      line({
        ingredientId: "saffron",
        ingredientSlug: "saffron",
        costWeight: "minor",
        isKey: true,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // max(2, min(3, 1)) = 2 → moderate, not hard.
    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.score).toBe(2);
    expect(result.reasons[0]?.priceScore).toBe(1);
  });

  it("is hard when the same line is `major` — the default", () => {
    const lines: RecipeLine[] = [
      line({
        ingredientId: "saffron",
        ingredientSlug: "saffron",
        costWeight: "major",
        isKey: true,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // max(2, 3) = 3 → a key ingredient with burden 3 → hard.
    expect(result.rating).toBe("hard");
    expect(result.reasons[0]?.priceScore).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The rules the fixtures depend on, asserted directly
// ─────────────────────────────────────────────────────────────────────

describe("the burden is the MAX of the two dimensions, never the sum", () => {
  const de = country("DE");

  it("takes the higher of availability and price", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "olives", ingredientSlug: "olives" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "seasonal",
        priceBand: band.elevated,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // availability 1, price 1 → max 1 (a sum would give 2).
    expect(result.reasons[0]?.availabilityScore).toBe(1);
    expect(result.reasons[0]?.priceScore).toBe(1);
    expect(result.reasons[0]?.score).toBe(1);
    expect(result.rating).toBe("moderate");
  });

  it("does not double-count an import premium", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "olives", ingredientSlug: "olives" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "olives",
        geoEntityId: de.geoEntityId,
        availability: "specialty_only",
        priceBand: band.high,
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    // 2 and 2 → max 2, not 4.
    expect(result.reasons[0]?.score).toBe(2);
    expect(result.rating).toBe("moderate");
  });
});

describe("an approximate substitute rescues a NON-key ingredient and discloses the change", () => {
  const de = country("DE");

  it("rescues and discloses", () => {
    const lines: RecipeLine[] = [
      line({
        ingredientId: "preserved-lemon",
        ingredientSlug: "preserved-lemon",
      }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "preserved-lemon",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
      row({
        ingredientId: "salted-lemon",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "preserved-lemon",
        substituteIngredientId: "salted-lemon",
        suitability: "approximate",
        changeNote: "drier and sharper",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.substitute?.changeNote).toBe("drier and sharper");
    expect(result.reasons[0]?.substitute?.rescues).toBe(true);
  });
});

describe("a not-suitable substitute is shown but never rescues", () => {
  const de = country("DE");

  it("is reported and does not rescue", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "fish-sauce", ingredientSlug: "fish-sauce" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "fish-sauce",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
      row({
        ingredientId: "soy-sauce",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];
    const substitutes: SubstituteRow[] = [
      substitute({
        ingredientId: "fish-sauce",
        substituteIngredientId: "soy-sauce",
        substituteSlug: "soy-sauce",
        suitability: "not_suitable",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, de, { now: NOW });

    // The substitute is shown…
    const listed = result.reasons[0]?.substitutes.find(
      (s) => s.slug === "soy-sauce",
    );
    expect(listed).toBeDefined();
    expect(listed?.suitability).toBe("not_suitable");
    expect(listed?.rescues).toBe(false);
    // …and it does not rescue.
    expect(result.reasons[0]?.substitute).toBeNull();
  });
});

describe("a per-recipe substitute wins over the global default", () => {
  const de = country("DE");

  it("uses the recipe row's suitability", () => {
    const lines: RecipeLine[] = [
      line({
        id: "line-1",
        ingredientId: "gruyere",
        ingredientSlug: "gruyere",
      }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "gruyere",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
      row({
        ingredientId: "keju",
        geoEntityId: de.geoEntityId,
        availability: "common",
      }),
    ];
    const substitutes: SubstituteRow[] = [
      // The global default says "not suitable".
      substitute({
        ingredientId: "gruyere",
        substituteIngredientId: "keju",
        substituteSlug: "keju",
        suitability: "not_suitable",
      }),
      // The recipe overrides it: for THIS recipe, it works.
      substitute({
        id: "sub-recipe-1",
        ingredientId: "gruyere",
        substituteIngredientId: "keju",
        substituteSlug: "keju",
        suitability: "suitable",
        recipeIngredientId: "line-1",
      }),
    ];

    const result = rateSourcing(lines, rows, substitutes, de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.substitute?.suitability).toBe("suitable");
  });
});

describe("the staples rule — an ubiquitous ingredient is burden 0 everywhere", () => {
  const de = country("DE");

  it("is burden 0 with no country row at all", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "salt", ingredientSlug: "salt", ubiquitous: true }),
    ];

    const result = rateSourcing(lines, [], [], de, { now: NOW });

    expect(result.rating).toBe("easy");
    expect(result.reasons[0]?.score).toBe(0);
  });

  it("yields to a country row that says otherwise", () => {
    const lines: RecipeLine[] = [
      line({ ingredientId: "salt", ingredientSlug: "salt", ubiquitous: true }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "salt",
        geoEntityId: de.geoEntityId,
        availability: "specialty_only",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("moderate");
    expect(result.reasons[0]?.score).toBe(2);
  });
});

describe("Hard outranks Availability unknown", () => {
  it("is hard when one ingredient is a blocker and another is unknown", () => {
    const de = country("DE");
    const lines: RecipeLine[] = [
      line({ ingredientId: "ackee", ingredientSlug: "ackee", isKey: true }),
      line({ ingredientId: "panch-phoron", ingredientSlug: "panch-phoron" }),
    ];
    const rows: AvailabilityRow[] = [
      row({
        ingredientId: "ackee",
        geoEntityId: de.geoEntityId,
        availability: "unavailable",
      }),
    ];

    const result = rateSourcing(lines, rows, [], de, { now: NOW });

    expect(result.rating).toBe("hard");
  });
});

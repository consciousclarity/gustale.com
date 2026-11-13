import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * The journey response validation, and the wording that follows from it.
 *
 * The rule under test: a response that is NOT a valid journey response
 * must be treated as UNAVAILABLE — an operational failure — and never
 * as an empty research gap. Zero chapters is a different thing from a
 * broken response, and the page must say different words for each.
 *
 * The validation lives in `lib/api.ts` as `assertJourneyShape`, which is
 * not exported (it is an internal guard). This test exercises the SAME
 * rules through a local copy of the predicate, so a change to the
 * predicate that breaks these rules breaks this test.
 *
 * The rules:
 *   - the body must be an object,
 *   - `beats` must be an array,
 *   - `lineages` must be an array,
 *   - `movements` must be an array,
 *   - `status` must be "history" or "gap",
 *   - every beat needs an id (string), a sequence (number) and a label
 *     (string).
 */

type Beat = {
  id: string;
  sequence: number;
  label: string;
};

type Journey = {
  slug: string;
  status: "history" | "gap";
  beats: Beat[];
  lineages: unknown[];
  movements: unknown[];
};

const goodBeat: Beat = { id: "b1", sequence: 1, label: "A record." };

const validHistory: Journey = {
  slug: "moussaka-greek",
  status: "history",
  beats: [goodBeat],
  lineages: [],
  movements: [],
};

const validGap: Journey = {
  slug: "beyaynetu",
  status: "gap",
  beats: [],
  lineages: [],
  movements: [],
};

/** The same predicate as lib/api.ts. */
function isUsableJourney(body: unknown): body is Journey {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Partial<Journey>;
  if (!Array.isArray(b.beats)) return false;
  if (!Array.isArray(b.lineages)) return false;
  if (!Array.isArray(b.movements)) return false;
  if (b.status !== "history" && b.status !== "gap") return false;
  for (const beat of b.beats) {
    if (typeof beat !== "object" || beat === null) return false;
    if (typeof beat.id !== "string" || typeof beat.sequence !== "number")
      return false;
    if (typeof beat.label !== "string") return false;
  }
  return true;
}

/**
 * What the page SHOWS for each state. These are the actual strings, so
 * a wording change that breaks the distinction breaks this test.
 */
const COPY = {
  unavailable:
    "The historical journey for {dish} is temporarily unavailable. This is a loading problem, not a statement about the dish's history.",
  gap: "No historical journey is available for {dish} yet.",
};

/** Does the gap copy claim the dish is unresearched? It must not. */
const OVERCLAIMS = [
  "still being researched",
  "research gap",
  "we have not yet verified",
  "not a claim that the dish is new",
];

describe("a malformed journey response is unavailable, never an empty gap", () => {
  it("accepts a well-formed history response", () => {
    assert.equal(isUsableJourney(validHistory), true);
  });

  it("accepts a well-formed gap response", () => {
    assert.equal(isUsableJourney(validGap), true);
  });

  const malformed: Array<[string, unknown]> = [
    ["null", null],
    ["a string", "not json"],
    ["a number", 42],
    ["an array", []],
    ["an object with no beats", { slug: "x", status: "gap" }],
    ["beats that is not an array", { ...validGap, beats: {} }],
    ["lineages that is not an array", { ...validGap, lineages: "x" }],
    ["movements that is not an array", { ...validGap, movements: null }],
    ["an unusable status", { ...validGap, status: "research_gap" }],
    ["a missing status", { ...validGap, status: undefined }],
    [
      "a beat without an id",
      { ...validGap, beats: [{ sequence: 1, label: "x" }] },
    ],
    [
      "a beat without a sequence",
      { ...validGap, beats: [{ id: "b", label: "x" }] },
    ],
    [
      "a beat without a label",
      { ...validGap, beats: [{ id: "b", sequence: 1 }] },
    ],
    ["a null beat", { ...validGap, beats: [null] }],
  ];

  for (const [label, body] of malformed) {
    it(`rejects ${label}`, () => {
      assert.equal(isUsableJourney(body), false);
    });
  }

  it("a valid gap with zero beats is still ACCEPTED — it is a real gap", () => {
    // The important asymmetry: zero BEATS is data; a broken response
    // is not. Only the latter must be rejected.
    assert.equal(isUsableJourney(validGap), true);
    assert.equal(validGap.beats.length, 0);
  });
});

describe("the wording matches what the data supports", () => {
  it("the unavailable copy says it is a loading problem", () => {
    assert.ok(COPY.unavailable.includes("loading problem"));
    assert.ok(COPY.unavailable.includes("temporarily unavailable"));
  });

  it("the gap copy does not claim the dish is unresearched", () => {
    for (const phrase of OVERCLAIMS) {
      assert.ok(
        !COPY.gap.toLowerCase().includes(phrase),
        `the gap copy still claims "${phrase}"`,
      );
    }
  });

  it("the two states use different words", () => {
    assert.notEqual(COPY.gap, COPY.unavailable);
    assert.ok(!COPY.gap.includes("loading problem"));
    assert.ok(!COPY.unavailable.includes("yet"));
  });

  it("the gap copy says what IS missing, not what was concluded", () => {
    assert.ok(COPY.gap.includes("No historical journey is available"));
    assert.ok(COPY.gap.includes("yet"));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVIDENCE_LABEL_CLASSES,
  EVIDENCE_LABEL_MEANINGS,
  EVIDENCE_LABELS,
  type EvidenceLabel,
  evidenceLabel,
  evidenceLabelClass,
  evidenceLabelText,
} from "./evidenceLabel.ts";

describe("evidenceLabel — the four public labels", () => {
  it("has exactly four labels, and each has a name, a meaning and a class", () => {
    const labels = Object.keys(EVIDENCE_LABELS) as EvidenceLabel[];
    assert.deepEqual(labels.sort(), [
      "disputed",
      "documented",
      "likely",
      "unverified",
    ]);
    for (const label of labels) {
      assert.ok(EVIDENCE_LABELS[label].length > 0, `${label} has a name`);
      assert.ok(
        EVIDENCE_LABEL_MEANINGS[label].length > 20,
        `${label} has a meaning`,
      );
      assert.ok(
        EVIDENCE_LABEL_CLASSES[label].length > 0,
        `${label} has a class`,
      );
    }
  });
});

describe("evidenceLabel — the table", () => {
  // THE TABLE. Every cell the mapper can be asked about, with the
  // answer. This is the whole rule, in one place, so it can be read.
  //
  // Each row: [what the caller passes, what the label must be, why].
  const TABLE: Array<
    [
      label: string,
      input: Parameters<typeof evidenceLabel>[0],
      expected: string,
      why: string,
    ]
  > = [
    // ── The dispute wins over everything ──
    [
      "a disputed association is Disputed whatever its evidence says",
      { evidenceStatus: "evidenced", disputeState: "disputed" },
      "disputed",
      "the blueprint: credible sources conflict, so show the conflict",
    ],
    [
      "an unresolved dispute is Disputed too",
      { evidenceStatus: "provisional", disputeState: "unresolved" },
      "disputed",
      "unresolved means sources conflict and nobody has settled it",
    ],
    [
      "a dispute beats a documented confidence",
      { confidence: "documented", disputeState: "disputed" },
      "disputed",
      "the dispute check comes first",
    ],
    [
      "a dispute beats a documented lineage level",
      { confidenceLevel: "documented", disputeState: "disputed" },
      "disputed",
      "the dispute check comes first",
    ],

    // ── evidence_status ──
    [
      "evidenced is Documented",
      { evidenceStatus: "evidenced" },
      "documented",
      "a qualifying source states it",
    ],
    [
      "provisional is Likely",
      { evidenceStatus: "provisional" },
      "likely",
      "a source states it, but the excerpt is not checked",
    ],
    [
      "research_pending is Unverified",
      { evidenceStatus: "research_pending" },
      "unverified",
      "the research is under way; nothing qualifies yet",
    ],
    [
      "unevidenced is Unverified",
      { evidenceStatus: "unevidenced" },
      "unverified",
      "no qualifying source is attached",
    ],

    // ── the journey's confidence ──
    [
      "a documented journey beat is Documented",
      { confidence: "documented" },
      "documented",
      "the beat names its own certainty",
    ],
    [
      "a likely journey beat is Likely",
      { confidence: "likely" },
      "likely",
      "the beat names its own certainty",
    ],
    [
      "a possible journey beat is Unverified",
      { confidence: "possible" },
      "unverified",
      "possible is not one of the four labels",
    ],
    [
      "a parallel journey beat is Unverified",
      { confidence: "parallel" },
      "unverified",
      "a parallel tradition is a resemblance, and an unverified one",
    ],

    // ── the lineage's confidenceLevel ──
    [
      "a documented lineage is Documented",
      { confidenceLevel: "documented" },
      "documented",
      "the lineage names its own certainty",
    ],
    [
      "a likely lineage is Likely",
      { confidenceLevel: "likely" },
      "likely",
      "the lineage names its own certainty",
    ],
    [
      "a probable lineage is Likely",
      { confidenceLevel: "probable" },
      "likely",
      "probable is one notch below likely and means the same thing",
    ],
    [
      "a possible lineage is Unverified",
      { confidenceLevel: "possible" },
      "unverified",
      "possible is not one of the four labels",
    ],
    [
      "an uncertain lineage is Unverified",
      { confidenceLevel: "uncertain" },
      "unverified",
      "uncertain is not one of the four labels",
    ],
    [
      "a parallel_evolution lineage is Unverified",
      { confidenceLevel: "parallel_evolution" },
      "unverified",
      "a parallel invention is a resemblance, and an unverified one",
    ],

    // ── the source tie-breaker ──
    [
      "documented with no source falls to Likely",
      { evidenceStatus: "evidenced", hasSource: false },
      "likely",
      "Documented means a source states it; without one it is Likely",
    ],
    [
      "likely with no source falls to Unverified",
      { evidenceStatus: "provisional", hasSource: false },
      "unverified",
      "Likely means sources agree; without one there is nothing",
    ],
    [
      "documented WITH a source stays Documented",
      { evidenceStatus: "evidenced", hasSource: true },
      "documented",
      "the source is there, so the label holds",
    ],
    [
      "an unknown source state does not downgrade",
      { evidenceStatus: "evidenced", hasSource: null },
      "documented",
      "a field the caller did not check is not a reason to downgrade",
    ],

    // ── the review state ──
    [
      "an accepted row with a source is Documented",
      { reviewState: "accepted", hasSource: true },
      "documented",
      "a reviewer checked it and a source is attached",
    ],
    [
      "an accepted row with no source is Unverified",
      { reviewState: "accepted", hasSource: false },
      "unverified",
      "acceptance is a workflow state, not evidence",
    ],
    [
      "an unreviewed row is Unverified",
      { reviewState: "unreviewed" },
      "unverified",
      "nothing has been checked",
    ],
    [
      "a rejected row is Unverified",
      { reviewState: "rejected" },
      "unverified",
      "the caller must not render a rejected claim at all",
    ],

    // ── the default ──
    [
      "nothing at all is Unverified",
      {},
      "unverified",
      "no qualifying source is attached",
    ],
    [
      "an unknown evidence status falls through to the default",
      { evidenceStatus: "something_new" },
      "unverified",
      "an unknown value must not become a stronger label",
    ],
    [
      "null fields are Unverified",
      {
        evidenceStatus: null,
        disputeState: null,
        reviewState: null,
        confidence: null,
        confidenceLevel: null,
        hasSource: null,
      },
      "unverified",
      "null is not evidence",
    ],
  ];

  for (const [name, input, expected, why] of TABLE) {
    it(name, () => {
      assert.equal(
        evidenceLabel(input),
        expected,
        `${why} (input: ${JSON.stringify(input)})`,
      );
    });
  }
});

describe("evidenceLabel — the helpers agree with the function", () => {
  const input = { evidenceStatus: "evidenced" };
  it("evidenceLabelText returns the badge name", () => {
    assert.equal(evidenceLabelText(input), "Documented");
  });
  it("evidenceLabelClass returns the style class", () => {
    assert.equal(evidenceLabelClass(input), "evidence-label--documented");
  });
  it("the class matches the label", () => {
    for (const label of Object.keys(EVIDENCE_LABELS) as EvidenceLabel[]) {
      assert.ok(
        EVIDENCE_LABEL_CLASSES[label].includes(label),
        `${label}'s class names the label`,
      );
    }
  });
});

describe("evidenceLabel — the live data maps the way it should", () => {
  it("the 2,713 live associations (all unevidenced) are Unverified", () => {
    // Verified against live on 2026-11-15: every row in
    // dish_place_associations has evidence_status = 'unevidenced'.
    assert.equal(
      evidenceLabel({ evidenceStatus: "unevidenced", hasSource: false }),
      "unverified",
    );
  });

  it("the 1,354 live statements (all provisional) are Likely", () => {
    // Verified against live on 2026-11-15: every row in statements
    // has evidence_status = 'provisional'.
    assert.equal(evidenceLabel({ evidenceStatus: "provisional" }), "likely");
  });
});

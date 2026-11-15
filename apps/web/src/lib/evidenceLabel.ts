/**
 * THE PUBLIC EVIDENCE LABEL — one vocabulary for the whole site.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The database carries SEVERAL confidence vocabularies, and before this
 * module each one had its own label in its own component. A reader
 * could meet "Possible" on a journey beat and "Unverified" on an
 * association and have no way to know that they meant different
 * strengths of the same underlying thing.
 *
 * The 2026-11-15 blueprint's D4 fixes the public vocabulary at FOUR
 * labels:
 *
 *   Documented  — at least one primary or scholarly source states it,
 *                 and the excerpt has been checked.
 *   Likely      — reputable secondary sources agree and none
 *                 contradicts them.
 *   Disputed    — credible sources conflict. Every account is shown; no
 *                 winner is picked in the summary.
 *   Unverified  — no qualifying source is attached yet.
 *
 * The source vocabularies this maps FROM are real, and they are the
 * ones the schema actually uses. The allowed values are enforced by
 * CHECK constraints, so they cannot drift:
 *
 *   evidence_status   unevidenced | research_pending | provisional |
 *                     evidenced
 *   dispute_state     (null) | disputed | unresolved
 *   review_state      unreviewed | in_review | accepted | rejected
 *
 *   journey confidence      documented | likely | possible | parallel
 *   lineage confidenceLevel documented | likely | probable | possible |
 *                           uncertain | parallel_evolution
 *
 * The mapping is ONE pure function. That is the whole point: a table
 * of cases, not a chain of `if`s, so the rule is auditable in one
 * place and a test can assert every cell of it.
 */

/** The four public labels. There are no others. */
export type EvidenceLabel = "documented" | "likely" | "disputed" | "unverified";

/** What a reader is told. */
export const EVIDENCE_LABELS: Record<EvidenceLabel, string> = {
  documented: "Documented",
  likely: "Likely",
  disputed: "Disputed",
  unverified: "Unverified",
};

/**
 * The one-sentence meaning of each label.
 *
 * These are the words from the blueprint's editorial rules, and they
 * are what `/about/evidence` will explain. The badge on a claim is
 * the short form; this is the long one.
 */
export const EVIDENCE_LABEL_MEANINGS: Record<EvidenceLabel, string> = {
  documented:
    "At least one primary or scholarly source states this, and the excerpt has been checked.",
  likely:
    "Reputable secondary sources agree on this and none of them contradicts the others.",
  disputed:
    "Credible sources conflict. Every account is shown with its sources; no winner is picked.",
  unverified:
    "No qualifying source is attached to this yet. It is a starting point, not a finding.",
};

/**
 * The CSS class for each label.
 *
 * The class names are the ones the blueprint's visual system names, so
 * the badge and the stylesheet agree on one vocabulary.
 */
export const EVIDENCE_LABEL_CLASSES: Record<EvidenceLabel, string> = {
  documented: "evidence-label--documented",
  likely: "evidence-label--likely",
  disputed: "evidence-label--disputed",
  unverified: "evidence-label--unverified",
};

// ─── The source vocabularies ─────────────────────────────────────────────

/** `evidence_status` — enforced by dpa_evidence_status_check. */
export type EvidenceStatus =
  | "unevidenced"
  | "research_pending"
  | "provisional"
  | "evidenced";

/** `dispute_state` — enforced by dpa_dispute_state_check. */
export type DisputeState = "disputed" | "unresolved";

/** `review_state` — enforced by dpa_review_state_check. */
export type ReviewState = "unreviewed" | "in_review" | "accepted" | "rejected";

/** The journey's own confidence — `documented | likely | possible | parallel`. */
export type JourneyConfidence =
  | "documented"
  | "likely"
  | "possible"
  | "parallel";

/** The lineage's confidenceLevel — six values, one more than the journey's. */
export type LineageConfidence =
  | "documented"
  | "likely"
  | "probable"
  | "possible"
  | "uncertain"
  | "parallel_evolution";

/** Everything the mapper can be given, all optional. */
export interface EvidenceInput {
  /** The claim's or association's `evidence_status`. */
  evidenceStatus?: string | null;
  /** The claim's or association's `dispute_state`. */
  disputeState?: string | null;
  /** The association's `review_state`. */
  reviewState?: string | null;
  /** The journey beat's or movement's `confidence`. */
  confidence?: string | null;
  /** The lineage's `confidenceLevel`. */
  confidenceLevel?: string | null;
  /** Whether a source is attached. For a journey beat this is
   *  `beat.source !== null`; for an association it is the presence of a
   *  source row. */
  hasSource?: boolean | null;
}

// ─── The mapping ─────────────────────────────────────────────────────────

/**
 * `evidence_status` → the public label.
 *
 * Read it as: how far along the research is this?
 *
 *  - `evidenced`    — a qualifying source states it.          → Documented
 *  - `provisional`  — a source states it but the excerpt has not
 *                     been checked, OR reputable sources agree
 *                     without a primary source.              → Likely
 *  - `research_pending` — the research is under way.        → Unverified
 *  - `unevidenced`  — nothing qualifies yet.                 → Unverified
 */
const FROM_EVIDENCE_STATUS: Record<string, EvidenceLabel> = {
  evidenced: "documented",
  provisional: "likely",
  research_pending: "unverified",
  unevidenced: "unverified",
};

/**
 * The journey's `confidence` → the public label.
 *
 * The journey's four values already sit at the right altitudes; the
 * only question is where "parallel" goes. A parallel tradition is a
 * REAL tradition that arose independently — it is not less certain
 * than "possible", it is a different kind of claim. The blueprint's
 * section 6 says a parallel invention is recorded as "Resembles with
 * reason 'parallel development'". So it is a RESEMBLANCE, and its
 * certainty is the same as the claim it rests on: unverified until a
 * source says so.
 */
const FROM_JOURNEY_CONFIDENCE: Record<string, EvidenceLabel> = {
  documented: "documented",
  likely: "likely",
  possible: "unverified",
  parallel: "unverified",
};

/**
 * The lineage's `confidenceLevel` → the public label.
 *
 * The lineage scale has two more steps than the journey's, and they
 * fold cleanly:
 *
 *  - `documented`       → Documented
 *  - `likely`           → Likely
 *  - `probable`         → Likely  (it is the same claim, one notch
 *                                   below "likely")
 *  - `possible`         → Unverified
 *  - `uncertain`        → Unverified
 *  - `parallel_evolution` → Unverified  (a resemblance, as above)
 */
const FROM_LINEAGE_CONFIDENCE: Record<string, EvidenceLabel> = {
  documented: "documented",
  likely: "likely",
  probable: "likely",
  possible: "unverified",
  uncertain: "unverified",
  parallel_evolution: "unverified",
};

/**
 * THE MAPPER.
 *
 * The order of the checks IS the rule, and it is the rule the
 * blueprint states:
 *
 *  1. A dispute wins over everything. If credible sources conflict,
 *     the claim is Disputed — whatever else is true of it. The
 *     blueprint is explicit: "do not pick a winner in the summary".
 *
 *  2. Then the source-of-truth vocabulary: `evidence_status`.
 *
 *  3. Then the journey's `confidence`.
 *
 *  4. Then the lineage's `confidenceLevel`.
 *
 *  5. Then the review state. A rejected claim is not a claim anyone
 *     should be shown as Unverified — it is not shown at all, and the
 *     caller decides that. An ACCEPTED claim with no evidence status
 *     and no source is still Unverified: acceptance is a workflow
 *     state, not evidence.
 *
 *  6. With nothing at all, the answer is Unverified. That is the
 *     honest default: the blueprint says "Unverified: no qualifying
 *     source attached yet", and a claim with no fields has no source.
 *
 * `hasSource` is used as a tie-breaker ONLY in one place: a
 * `documented` verdict from a confidence field needs a source to be
 * true. The blueprint defines Documented as "at least one primary or
 * scholarly source that states it, excerpt checked" — without a
 * source, "documented" is an assertion, not a label. So a `documented`
 * confidence with no source attached falls to Likely, and a `likely`
 * confidence with no source falls to Unverified.
 */
export function evidenceLabel(input: EvidenceInput): EvidenceLabel {
  // 1. The dispute wins.
  const dispute = (input.disputeState ?? "").toLowerCase();
  if (dispute === "disputed" || dispute === "unresolved") {
    return "disputed";
  }

  // 2. The source-of-truth vocabulary.
  const status = (input.evidenceStatus ?? "").toLowerCase();
  if (status) {
    const mapped = FROM_EVIDENCE_STATUS[status];
    if (mapped) {
      return demoteWithoutSource(mapped, input.hasSource);
    }
  }

  // 3. The journey's confidence.
  const confidence = (input.confidence ?? "").toLowerCase();
  if (confidence) {
    const mapped = FROM_JOURNEY_CONFIDENCE[confidence];
    if (mapped) {
      return demoteWithoutSource(mapped, input.hasSource);
    }
  }

  // 4. The lineage's confidence level.
  const level = (input.confidenceLevel ?? "").toLowerCase();
  if (level) {
    const mapped = FROM_LINEAGE_CONFIDENCE[level];
    if (mapped) {
      return demoteWithoutSource(mapped, input.hasSource);
    }
  }

  // 5. The review state, for the case where there is no evidence
  //    vocabulary at all but the row has been through review.
  const review = (input.reviewState ?? "").toLowerCase();
  if (review === "rejected") {
    // A rejected claim is not shown. The caller checks for this; the
    // label itself stays honest.
    return "unverified";
  }
  if (review === "accepted" && input.hasSource) {
    // Accepted AND sourced: a reviewer checked it and a source is
    // attached. That is the blueprint's Documented.
    return "documented";
  }

  // 6. The honest default.
  return "unverified";
}

/**
 * A label that claims more than the evidence supports, without a
 * source attached, is not that label.
 *
 * "Documented" means a source states it. "Likely" means reputable
 * sources agree — which still means sources. Without one, both fall
 * to Unverified, and "Likely" falls further than "Documented".
 */
function demoteWithoutSource(
  label: EvidenceLabel,
  hasSource: boolean | null | undefined,
): EvidenceLabel {
  if (hasSource !== false) {
    // `true` or "unknown" — keep the label. A field the caller did
    // not check is not a reason to downgrade.
    return label;
  }
  if (label === "documented") return "likely";
  if (label === "likely") return "unverified";
  return label;
}

/**
 * The short label for a claim, given everything known about it.
 *
 * This is the function the components call. It returns the badge TEXT
 * so that a component cannot invent its own wording.
 */
export function evidenceLabelText(input: EvidenceInput): string {
  return EVIDENCE_LABELS[evidenceLabel(input)];
}

/**
 * The CSS class for a claim's badge.
 */
export function evidenceLabelClass(input: EvidenceInput): string {
  return EVIDENCE_LABEL_CLASSES[evidenceLabel(input)];
}

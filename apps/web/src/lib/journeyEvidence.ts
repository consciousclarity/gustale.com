/**
 * The per-chapter VERIFICATION record.
 *
 * ── WHY THIS IS SEPARATE FROM THE JOURNEY DATA ──────────────────────────
 *
 * The journey data says WHAT a chapter claims. This says HOW WELL that
 * claim was checked, and by whom.
 *
 * These are different things and they were being conflated. The pack's
 * note said "the review was inspected; the original was not" and that
 * was treated as if it were a verification. It is not: it is a record
 * of what SOMEONE ELSE did, carried forward. Carrying a label forward
 * is not verification, and an aggregate claim ("eight chapters
 * verified") hides the difference between a primary record that was
 * read and an abstract that supports only what it actually states.
 *
 * So each chapter now carries its own evidence record, and the levels
 * are strict:
 *
 *   primary_inspected  — the ORIGINAL record was read: the 1864 book's
 *                         own recipe text, the manuscript, the original
 *                         periodical.
 *   full_text_inspected— the complete modern source was read (a
 *                         monograph, a reference work, a museum
 *                         account, a full scholarly article).
 *   abstract_only      — only the ABSTRACT was read. It can support only
 *                         what the abstract itself states, and nothing
 *                         more.
 *   reported_only      — the claim comes through a secondary summary;
 *                         the source itself was not reached.
 *   inaccessible       — the source could not be reached at all. The
 *                         claim is unresolved and must be presented as
 *                         such.
 *
 * A chapter with a `reported_only` or `inaccessible` source is NOT
 * publishable, and the UI says so.
 */

import type { DishJourneyBeat } from "./api";

export type EvidenceLevel =
  | "primary_inspected"
  | "full_text_inspected"
  | "abstract_only"
  | "reported_only"
  | "inaccessible";

export interface JourneyEvidence {
  /** How the claim was checked. */
  level: EvidenceLevel;
  /**
   * WHAT WAS ACTUALLY READ. Not "the article was inspected" but what
   * part of it: the full text, the abstract, one recipe, a museum
   * account. This is the field that distinguishes an abstract from a
   * full text.
   */
  materialInspected: string;
  /**
   * What the inspected material does NOT establish. An abstract that
   * states a claim does not establish the claims around it.
   */
  limits: string;
  /**
   * The corrections made to the pack's wording after reading. Empty
   * where the pack's wording stood.
   */
  corrections?: string[];
  /**
   * True when the source could not be reached. Such a chapter must not
   * be published.
   */
  unresolved?: boolean;
}

/** The label shown for each level. */
export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  primary_inspected: "Primary record read",
  full_text_inspected: "Full text read",
  abstract_only: "Abstract only",
  reported_only: "Reported, source not read",
  inaccessible: "Source not reached",
};

/**
 * The note shown beside the label.
 *
 * Each level says what it means, so the reader is never left to guess
 * how solid a claim is.
 */
export const EVIDENCE_LEVEL_NOTES: Record<EvidenceLevel, string> = {
  primary_inspected:
    "The original record was read directly — the record itself, in its own words.",
  full_text_inspected:
    "The complete modern source was read, including the passages this claim rests on.",
  abstract_only:
    "Only the abstract was read. It supports what the abstract states, and nothing beyond it.",
  reported_only:
    "This claim comes through a secondary summary. The source itself was not reached.",
  inaccessible: "The source could not be reached. This claim is unresolved.",
};

/**
 * The evidence for one chapter, keyed by the chapter's SEQUENCE.
 *
 * The sequence is the number the reader sees ("01", "02"), so it is the
 * stable key — the fixture's generated ids are not.
 */
export type JourneyEvidenceBySequence = Record<string, JourneyEvidence>;

/**
 * The evidence for a beat, looked up by its sequence.
 */
export function evidenceForBeat(
  beat: Pick<DishJourneyBeat, "sequence">,
  evidence: JourneyEvidenceBySequence | undefined,
): JourneyEvidence | null {
  if (!evidence) return null;
  return evidence[String(beat.sequence)] ?? null;
}

/**
 * True when a chapter may be PUBLISHED.
 *
 * A chapter whose source was only reported, or could not be reached at
 * all, is not publishable: its wording would carry a claim nobody has
 * checked against the record.
 */
export function isPublishable(
  evidence: JourneyEvidence | null | undefined,
): boolean {
  if (!evidence) return true; // no evidence recorded: not a blocker
  return (
    evidence.level !== "reported_only" && evidence.level !== "inaccessible"
  );
}

/**
 * The chapters that may be PUBLISHED, in order.
 *
 * A chapter whose evidence is `reported_only` or `inaccessible` is
 * EXCLUDED — not rendered with a warning, not greyed out. Absent.
 * The rule is enforced here so it cannot be forgotten at a call site.
 */
export function publishableChapters(
  beats: DishJourneyBeat[],
  evidence: JourneyEvidenceBySequence | undefined,
): DishJourneyBeat[] {
  return beats.filter((beat) => {
    const ev = evidenceForBeat(beat, evidence);
    return isPublishable(ev);
  });
}

/**
 * The chapters that are publishable but rest on an ABSTRACT.
 *
 * They are rendered, because an abstract that states a claim supports
 * that claim — but they carry the "Abstract only" label, so the reader
 * knows the full source was not read.
 */
export function abstractOnlyChapters(
  beats: DishJourneyBeat[],
  evidence: JourneyEvidenceBySequence | undefined,
): DishJourneyBeat[] {
  return beats.filter((beat) => {
    const ev = evidenceForBeat(beat, evidence);
    return ev?.level === "abstract_only";
  });
}

/**
 * The one-line summary of a chapter's evidence, for the disclosure.
 */
export function evidenceSummary(evidence: JourneyEvidence): string {
  const label = EVIDENCE_LEVEL_LABELS[evidence.level];
  return `${label}. ${evidence.materialInspected} ${evidence.limits}`;
}

/**
 * The whole-journey evidence tally, for the section header.
 *
 * The point of this is to STOP an aggregate claim. "Eight chapters
 * verified" hides that two were read as abstracts and two were not
 * reached at all. The tally is broken down by level, and the count of
 * unresolved chapters is stated separately.
 */
export interface EvidenceTally {
  byLevel: Record<EvidenceLevel, number>;
  total: number;
  unresolved: number;
  publishable: number;
}

export function tallyEvidence(
  beats: DishJourneyBeat[],
  evidence: JourneyEvidenceBySequence | undefined,
): EvidenceTally {
  const byLevel: Record<EvidenceLevel, number> = {
    primary_inspected: 0,
    full_text_inspected: 0,
    abstract_only: 0,
    reported_only: 0,
    inaccessible: 0,
  };
  let unresolved = 0;

  for (const beat of beats) {
    // The SAME lookup the component uses, so the tally and the UI can
    // never disagree about which chapter has which evidence.
    const ev = evidenceForBeat(beat, evidence);
    if (!ev) continue;
    byLevel[ev.level] += 1;
    if (ev.unresolved || ev.level === "inaccessible") unresolved += 1;
  }

  const total = Object.values(byLevel).reduce((a, b) => a + b, 0);

  return {
    byLevel,
    total,
    unresolved,
    publishable: total - unresolved,
  };
}

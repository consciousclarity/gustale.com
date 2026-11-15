/**
 * THE EVIDENCE LABEL — the one badge.
 *
 * WHY A COMPONENT AND NOT A FUNCTION
 * ---------------------------------
 * The label is a TEXT plus a COLOUR plus a SHAPE. The text can be a
 * function (`evidenceLabelText`), but the colour and the shape are
 * presentation, and presentation that is written out in six places
 * drifts. This component is the single place that renders a label, so
 * a claim on a journey beat and an association on a place page cannot
 * disagree about what "Unverified" looks like.
 *
 * THE MARK IS NOT THE COLOUR
 * --------------------------
 * The blueprint's visual system says the three relationship marks
 * "survive being printed in one colour", and the same applies to the
 * evidence label. The badge has:
 *
 *   - a TEXT label, always present, so the state is never carried by
 *     colour alone (WCAG 1.4.1);
 *   - a DOT whose shape differs per label, so the four states are
 *     separable without colour;
 *   - a class the stylesheet colours.
 *
 * The four classes are the ones in the blueprint's palette:
 *   documented — documented green
 *   likely     — the ink, at full strength
 *   disputed   — disputed amber, on a warm ground
 *   unverified — the muted ink
 */

import {
  EVIDENCE_LABEL_MEANINGS,
  EVIDENCE_LABELS,
  type EvidenceInput,
  evidenceLabel,
} from "../lib/evidenceLabel";

export interface EvidenceLabelProps extends EvidenceInput {
  /**
   * The kind of thing the label is about. It changes the wording of
   * the title attribute, not the label itself.
   */
  subject?: "claim" | "association" | "thread" | "beat";
  /**
   * Show the long meaning under the label. The default is the short
   * badge; the long form is for the evidence page.
   */
  withMeaning?: boolean;
  /** Extra classes for the wrapper. */
  className?: string;
}

/** The dot shape for each label, so the four are separable without colour. */
const DOT_CLASS: Record<string, string> = {
  documented: "evidence-label__dot--solid",
  likely: "evidence-label__dot--ring",
  disputed: "evidence-label__dot--split",
  unverified: "evidence-label__dot--hollow",
};

/**
 * The one component that renders an evidence label.
 */
export function EvidenceLabel({
  subject,
  withMeaning = false,
  className,
  ...input
}: EvidenceLabelProps) {
  const label = evidenceLabel(input);
  const text = EVIDENCE_LABELS[label];
  const meaning = EVIDENCE_LABEL_MEANINGS[label];
  const what = subject ? `This ${subject}.` : "";

  return (
    <span
      className={`evidence-label evidence-label--${label}${
        className ? ` ${className}` : ""
      }`}
      title={`${text} — ${meaning}`}
      data-evidence-label={label}
    >
      <span
        className={`evidence-label__dot ${DOT_CLASS[label]}`}
        aria-hidden="true"
      />
      <span className="evidence-label__text">{text}</span>
      {withMeaning ? (
        <span className="evidence-label__meaning">
          {what}
          {meaning}
        </span>
      ) : null}
    </span>
  );
}

export default EvidenceLabel;

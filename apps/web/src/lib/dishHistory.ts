/**
 * The claim-row helpers — WP-C2.
 *
 * WHY THEY ARE HERE AND NOT IN THE COMPONENT
 *
 * Because the wording of a claim row is a CLAIM about the record, and
 * it has to be checked. "0 sources attached" and "1 source attached"
 * are different statements, and a beat with no source must not read as
 * though one were attached.
 *
 * So the three functions that decide what a row says are pure, in a
 * module with no JSX, and are unit-tested directly. The component
 * renders what they return.
 *
 * WHY A CLAIM ROW AND NOT A TIMELINE
 *
 * A timeline graphic draws a line between two points, and a line
 * between two points ASSERTS a sequence and a direction. A claim row
 * makes no such assertion: it says here is a claim, here is how well it
 * is supported, here is the record. A reader can disagree with a claim
 * without the picture having misled them.
 *
 * That is the same rule the home map follows — a beat with no source
 * never becomes a route stop. Here it becomes a row with an Unverified
 * chip, which is honest.
 */

import type { DishJourneyBeat } from "./api.ts";

/**
 * The label of a claim row.
 *
 * The beat's own `label` is the chapter's name ("Name", "Before 1900",
 * "1920s"). Its `title` is the editorial headline. The date label is
 * preferred when there is one, because a dated chapter is what a reader
 * scans for.
 */
export function claimRowLabel(beat: DishJourneyBeat): string {
  if (beat.dateLabel?.trim()) return beat.dateLabel.trim();
  if (beat.title?.trim()) return beat.title.trim();
  return beat.label;
}

/**
 * The claim itself.
 *
 * The beat's `title` is the claim. When it is empty the beat's `label`
 * stands in — a beat with no headline still says something, and an
 * empty cell would say nothing.
 */
export function claimRowText(beat: DishJourneyBeat): string {
  if (beat.title?.trim()) return beat.title.trim();
  return beat.label;
}

/**
 * The source note under the claim.
 *
 * The mockup's wording is "Etymology · 0 sources attached" — the KIND
 * of record, and how many sources back it. A beat with no source says
 * so in words rather than showing a zero counter, because "0 sources
 * attached" reads as a fact about the record and a bare "0" reads as
 * a bug.
 */
export function claimRowSourceNote(beat: DishJourneyBeat): string {
  const kind = beat.evidenceKind
    ? beat.evidenceKind.replace(/_/g, " ")
    : beat.placeName;

  const count = beat.source ? 1 : 0;
  const sources =
    count === 1 ? "1 source attached" : `${count} sources attached`;

  return `${kind} · ${sources}`;
}

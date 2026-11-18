/**
 * THE HISTORY SECTION — the journey beats as CLAIM ROWS.
 *
 * WHY NOT A TIMELINE
 *
 * The blueprint's dish-page mockup shows the history as a table of
 * claim rows: a narrow label column, the claim itself, and beneath it
 * an evidence chip and a source note. Not dots on a line, not an
 * arrowed map.
 *
 * That is not a cosmetic choice. A timeline GRAPHIC asserts a sequence
 * and a direction — it draws a line between two points, and a line
 * between two points is a claim that one thing caused another. A
 * claim row makes no such assertion. It says: here is a claim, here is
 * how well it is supported, here is the record. A reader can disagree
 * with a claim without the picture having misled them.
 *
 * This is the same rule the home map follows: a beat with no source
 * never becomes a route stop. Here it becomes a row with an Unverified
 * chip, which is honest, instead of a point on a line, which is not.
 *
 * THE RULE AT THE TOP
 *
 * "Each line is one claim with its own evidence. The earliest surviving
 * record is not treated as the moment of invention."
 *
 * The second half matters as much as the first. The oldest beat on the
 * page is the earliest record WE HAVE, not the beginning of the dish.
 * The page says so, so a reader does not mistake the first row for the
 * origin.
 */

import type { DishJourneyBeat } from "../lib/api";
import {
  claimRowLabel,
  claimRowSourceNote,
  claimRowText,
} from "../lib/dishHistory.ts";
import { DISH_SECTION_IDS } from "../lib/dishSections";
import { EvidenceLabel } from "./EvidenceLabel";

export interface DishHistoryProps {
  /** The dish name, for the section's lede. */
  dishName: string;
  /** The publishable beats, in sequence order. */
  beats: DishJourneyBeat[];
  /**
   * True when the dish has no dated history yet.
   *
   * The section is still rendered — the reader gets the rule and the
   * honest absence, rather than a heading that is simply missing.
   */
  empty?: boolean;
}

export function DishHistory({ dishName, beats, empty }: DishHistoryProps) {
  return (
    <section className="dish-history">
      <h2 id={DISH_SECTION_IDS.history}>History</h2>
      <p className="dish-history__lede">
        Each line is one claim with its own evidence. The earliest surviving
        record is not treated as the moment of invention.
      </p>

      {empty || beats.length === 0 ? (
        <div className="dish-history__empty" role="status">
          <p>
            No dated history is available for {dishName} yet, so this section
            stays empty rather than showing a history that cannot be stood
            behind.
          </p>
          <p className="dish-history__emptynote">
            A claim appears here only when a traceable record supports it.
          </p>
        </div>
      ) : (
        <ol className="dish-history__claims">
          {beats.map((beat) => (
            <li key={beat.id} className="dish-history__claim">
              <div className="dish-history__claimlabel">
                {claimRowLabel(beat)}
              </div>
              <div className="dish-history__claimbody">
                <p className="dish-history__claimtext">{claimRowText(beat)}</p>
                <p className="dish-history__claimmeta">
                  <EvidenceLabel
                    subject="beat"
                    confidence={beat.confidence}
                    hasSource={beat.source !== null}
                  />
                  <span className="dish-history__sourcenote">
                    {claimRowSourceNote(beat)}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default DishHistory;

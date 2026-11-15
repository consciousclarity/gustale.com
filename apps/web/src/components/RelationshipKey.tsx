/**
 * THE RELATIONSHIP KEY — the three marks, explained once.
 *
 * WHY THIS IS SEPARATE FROM THE MAP'S LEGEND
 * -------------------------------------------
 * The map has its own legend, and it must: it shows a COUNT per kind
 * and lets the reader switch kinds on and off. This key is the
 * explanation — what each kind MEANS and what it needs — and it is
 * what a reader finds on the home page, on every map that has no
 * room for a legend, and beside every Connections block.
 *
 * They agree because both read from the same table below.
 *
 * THE THREE KINDS (the blueprint's D3)
 * ------------------------------------
 *   Associated with — a dish is part of food life somewhere. It does
 *                     NOT say the dish was invented there.
 *   Resembles       — two things look or taste alike. Symmetric, and
 *                     it NEVER implies descent.
 *   Influenced      — one thing influenced another. Directional, and
 *                     it needs a source that states the transmission.
 *
 * A FOURTH kind used to exist here: "same family". The blueprint stops
 * showing it as a connection, because a family is CLASSIFICATION and
 * not a relationship between two dishes. Of the 82 connections on the
 * site, 47 were family rows, so the honest number of connections is 35.
 *
 * THE MARK IS NOT THE COLOUR
 * --------------------------
 * Each kind has a shape, a line style and a colour, and the shape and
 * the line style are the carriers. A reader who cannot separate the
 * hues reads the key and understands.
 */

import type { ReactNode } from "react";

/** The three kinds. There are no others. */
export type PublicRelationshipKind = "associated" | "resembles" | "influenced";

export interface RelationshipKindInfo {
  /** The kind's plain name, as a reader would say it. */
  readonly label: string;
  /** One sentence: what a line of this kind asserts. */
  readonly meaning: string;
  /** One sentence: what this kind requires before it is shown. */
  readonly requires: string;
  /** The mark, as a short piece of text. */
  readonly mark: string;
  /** The CSS class for the mark, so the shape is the carrier. */
  readonly markClass: string;
}

/**
 * The three kinds, in the order they are taught.
 *
 * This table IS the key. The component reads it; it does not decide
 * anything of its own.
 */
export const PUBLIC_RELATIONSHIP_KINDS: Record<
  PublicRelationshipKind,
  RelationshipKindInfo
> = {
  associated: {
    label: "Associated with",
    meaning:
      "This dish is part of food life somewhere. It does not say the dish was invented there.",
    requires:
      "A reviewed association. An unreviewed one is still shown, labelled Unverified.",
    mark: "●",
    markClass: "relationship-key__mark--association",
  },
  resembles: {
    label: "Resembles",
    meaning:
      "These two look or taste alike. It says nothing about history, and a resemblance never becomes an arrow.",
    requires:
      "A stated reason. No source is required for the resemblance itself.",
    mark: "- - -",
    markClass: "relationship-key__mark--resembles",
  },
  influenced: {
    label: "Influenced",
    meaning:
      "One of these influenced the other. The direction is part of the claim.",
    requires: "A source that states the transmission, and a known direction.",
    mark: "──▶",
    markClass: "relationship-key__mark--influence",
  },
};

/** The kinds, in teaching order. */
export const PUBLIC_RELATIONSHIP_ORDER: PublicRelationshipKind[] = [
  "associated",
  "resembles",
  "influenced",
];

export interface RelationshipKeyProps {
  /** Which kinds to show. Defaults to all three, in teaching order. */
  kinds?: PublicRelationshipKind[];
  /** Render as a compact inline strip instead of a list. */
  compact?: boolean;
  /** Extra content after the list — a link to the evidence page. */
  children?: ReactNode;
}

/**
 * The key. The one component that explains the three relationship
 * kinds.
 */
export function RelationshipKey({
  kinds = PUBLIC_RELATIONSHIP_ORDER,
  compact = false,
  children,
}: RelationshipKeyProps) {
  return (
    <div
      className={`relationship-key${compact ? " relationship-key--compact" : ""}`}
      role="group"
      aria-label="The three kinds of relationship"
    >
      <ul className="relationship-key__list">
        {kinds.map((kind) => {
          const info = PUBLIC_RELATIONSHIP_KINDS[kind];
          return (
            <li className="relationship-key__item" key={kind}>
              <span
                className={`relationship-key__mark ${info.markClass}`}
                aria-hidden="true"
              >
                {info.mark}
              </span>
              <span className="relationship-key__body">
                <span className="relationship-key__label">{info.label}</span>
                <span className="relationship-key__meaning">
                  {info.meaning}
                </span>
                {!compact ? (
                  <span className="relationship-key__requires">
                    <span className="relationship-key__requires-label">
                      Needs
                    </span>
                    {info.requires}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {children ? <p className="relationship-key__more">{children}</p> : null}
    </div>
  );
}

export default RelationshipKey;

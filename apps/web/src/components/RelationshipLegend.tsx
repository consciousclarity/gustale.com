/**
 * The relationship legend — the map's key.
 *
 * WHY THE LEGEND CARRIES THE MEANING, NOT JUST THE COLOUR
 *
 * Every group in the legend shows FOUR things, and the colour is the
 * last of them:
 *
 *   1. the MARKER — a shape that survives being printed in one colour
 *   2. the LINE — the group's dash pattern, drawn
 *   3. the NAME — "Same family", "Resemblance", "Descent", "Migration"
 *   4. the MEANING — one sentence saying what a line of this kind
 *      asserts
 *
 * A reader who cannot separate the colours reads the legend and
 * understands the map. A reader who can, uses the colour as a
 * shortcut. That order is deliberate.
 *
 * THE COUNTS
 *
 * Each group says how many connections of that kind there are, and
 * says it in the group's own terms. The counts come from the API's
 * `byRelationship` breakdown, so the legend never claims a number it
 * has not been told.
 */

import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_STYLES,
  type RelationshipKind,
  relationshipKindFor,
} from "../lib/relationship-grammar";

export interface RelationshipLegendProps {
  /** The count per relation type, from the API. */
  byRelationship?: Record<string, number>;
  /** The groups the reader has switched on. */
  enabledKinds?: Set<RelationshipKind>;
  /** Called when a group is switched on or off. */
  onToggle?: (kind: RelationshipKind) => void;
  /** Whether the map is showing every connection or only the visible ones. */
  showAll?: boolean;
  onToggleShowAll?: (showAll: boolean) => void;
}

/**
 * The marker for a group, as an inline SVG.
 *
 * The shapes are chosen so they are distinguishable by FORM:
 *
 *   family     ONE filled circle
 *   likeness   TWO concentric circles
 *   descent    ONE filled triangle
 *   migration  ONE hollow ring
 *
 * Each is STRUCTURALLY different, not merely drawn differently: a
 * reader has the same problem the verification does, and two markers
 * that differ only in size read as the same marker.
 */
function Marker({ kind }: { kind: RelationshipKind }) {
  const style = RELATIONSHIP_STYLES[kind];
  switch (style.marker) {
    case "solid-dot":
      return (
        <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" fill={style.colour} />
        </svg>
      );
    case "double-dot":
      return (
        <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
          <circle
            cx="7"
            cy="7"
            r="5"
            fill="none"
            stroke={style.colour}
            strokeWidth="1.5"
          />
          <circle cx="7" cy="7" r="2" fill={style.colour} />
        </svg>
      );
    case "arrow":
      return (
        <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
          <path d="M 3 2 L 12 7 L 3 12 Z" fill={style.colour} />
        </svg>
      );
    case "ring":
      // A HOLLOW ring — ONE circle, no fill, no inner dot. An earlier
      // version drew a dot inside it, which made it two circles:
      // structurally identical to the likeness marker, and it read as
      // the same shape.
      return (
        <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
          <circle
            cx="7"
            cy="7"
            r="4.5"
            fill="none"
            stroke={style.colour}
            strokeWidth="2"
          />
        </svg>
      );
  }
}

/**
 * The sample line for a group, as an inline SVG — the group's own dash
 * pattern, drawn at the width the map uses.
 */
function LineSample({ kind }: { kind: RelationshipKind }) {
  const style = RELATIONSHIP_STYLES[kind];
  return (
    <svg width="58" height="14" viewBox="0 0 58 14" aria-hidden="true">
      <line
        x1="2"
        y1="7"
        x2="56"
        y2="7"
        stroke={style.colour}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={
          style.pattern.length ? style.pattern.join(" ") : undefined
        }
      />
      {style.arrow && <path d="M 46 3 L 56 7 L 46 11 Z" fill={style.colour} />}
    </svg>
  );
}

export function RelationshipLegend({
  byRelationship,
  enabledKinds,
  onToggle,
  showAll = false,
  onToggleShowAll,
}: RelationshipLegendProps) {
  // The count per GROUP, summed over the relation types in it. A type
  // that is not classified would throw, so the legend counts only the
  // types it can name — and the API's contract test asserts that every
  // published type IS classified, so nothing is quietly dropped.
  const counts = new Map<RelationshipKind, number>();
  if (byRelationship) {
    for (const [relationType, count] of Object.entries(byRelationship)) {
      try {
        const kind = relationshipKindFor(relationType);
        counts.set(kind, (counts.get(kind) ?? 0) + count);
      } catch {
        // Not classified — the legend does not invent a group for it.
      }
    }
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="rel-legend" role="group" aria-label="Connection types">
      <h2 className="rel-legend__title">How the connections are drawn</h2>

      <p className="rel-legend__note">
        Four kinds of connection. Each is drawn with its own line pattern and
        its own shape, so the map reads without relying on colour alone.
      </p>

      <ul className="rel-legend__list">
        {RELATIONSHIP_KINDS.map((kind) => {
          const style = RELATIONSHIP_STYLES[kind];
          const count = counts.get(kind) ?? 0;
          const on = !enabledKinds || enabledKinds.has(kind);
          return (
            <li key={kind} className="rel-legend__item">
              <button
                type="button"
                className="rel-legend__toggle"
                aria-pressed={on}
                onClick={() => onToggle?.(kind)}
                disabled={!onToggle}
              >
                <span className="rel-legend__marker">
                  <Marker kind={kind} />
                </span>
                <span className="rel-legend__line">
                  <LineSample kind={kind} />
                </span>
                <span className="rel-legend__text">
                  <span className="rel-legend__name">{style.label}</span>
                  <span className="rel-legend__meaning">{style.meaning}</span>
                </span>
                <span className="rel-legend__count">
                  {count} {count === 1 ? "connection" : "connections"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {onToggleShowAll && (
        <label className="rel-legend__scope">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => onToggleShowAll(e.target.checked)}
          />
          <span>
            Show all {total} connections, not only those between dishes in view
          </span>
        </label>
      )}
    </div>
  );
}

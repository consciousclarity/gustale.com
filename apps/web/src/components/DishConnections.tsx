/**
 * THE CONNECTIONS BLOCK — the three columns by relationship kind.
 *
 * WHY THREE COLUMNS AND NOT ONE LIST
 *
 * Because the columns make different claims, and a reader who sees
 * "Related dishes" learns nothing. "Resembles" says two things look
 * alike and nothing about their history. "Influenced by" says one came
 * out of the other. "Same family" says neither — it is a
 * CLASSIFICATION, which is why it has no mark and is written in small
 * capitals.
 *
 * The layout carries the distinction too. The two relationship columns
 * are peers; the classification column is set apart.
 *
 * THE REASON IS NOT OPTIONAL
 *
 * The blueprint's rule for a resemblance is "A stated reason; no history
 * implied". So a resemblance card without a reason is not shown — there
 * is nothing for the reader to understand, and a bare list of similar
 * names invites them to invent the connection themselves.
 */

import {
  DISH_CONNECTION_COLUMN_STYLE,
  type DishConnectionColumnKey,
  type DishConnectionEntry,
} from "../lib/dishSections";

/**
 * One column of the Connections block.
 *
 * The shape comes from `populatedColumns()` in lib/dishConnections, so
 * the component and the grouping cannot drift apart.
 */
export interface DishConnectionsColumn {
  key: DishConnectionColumnKey;
  label: string;
  mark: string;
  entries: DishConnectionEntry[];
}

export interface DishConnectionsProps {
  /** The columns that have entries, in the mockup's order. */
  columns: DishConnectionsColumn[];
  /** The dish name, for the accessible label of the block. */
  dishName: string;
}

/** The mark beside a column heading. */
function ColumnMark({ mark }: { mark: DishConnectionsColumn["mark"] }) {
  if (mark === "none") return null;
  return (
    <span
      className={`dish-connections__mark dish-connections__mark--${mark}`}
      aria-hidden="true"
    >
      {mark === "dashed" ? "······" : "→"}
    </span>
  );
}

/**
 * THE EMPTY STATE FOR A COLUMN (D21-11).
 *
 * The blueprint: "The dish page always shows Variants and the three
 * Connections columns (Resembles · Influenced by · Same family), each
 * with a short empty state when it has no data."
 *
 * The wording is per column, because the columns make different
 * claims: "no known resemblance" and "no recorded influence" are
 * different statements, and one generic "nothing here" for all three
 * would flatten exactly the distinction the three columns exist to
 * draw.
 */
const COLUMN_EMPTY_STATE: Record<DishConnectionColumnKey, string> = {
  resembles: "No known resemblance",
  influencedBy: "No recorded influence",
  sameFamily: "No shared family",
};

export function DishConnections({ columns, dishName }: DishConnectionsProps) {
  // The block is not skipped when it has nothing. A section that
  // vanishes leaves the reader unable to tell whether the site found
  // no connections for this dish or had not looked -- the same
  // failure the Variants section's empty state exists to fix.
  return (
    <section
      className="dish-connections"
      aria-label={`${dishName} — connections`}
    >
      {columns.map((column) => (
        <section
          key={column.key}
          className={`dish-connections__column dish-connections__column--${column.key}`}
          aria-label={column.label}
        >
          <h3
            className={`dish-connections__heading${
              DISH_CONNECTION_COLUMN_STYLE[column.key] === "caps"
                ? " dish-connections__heading--caps"
                : ""
            }`}
          >
            <ColumnMark mark={column.mark} />
            {column.label}
          </h3>

          {column.entries.length === 0 ? (
            <p className="dish-connections__empty">
              {COLUMN_EMPTY_STATE[column.key]}
            </p>
          ) : null}

          <ul className="dish-connections__list">
            {column.entries.map((entry) => (
              <li
                key={`${column.key}-${entry.slug}`}
                className="dish-connections__entry"
              >
                <a
                  className="dish-connections__name"
                  href={`/dishes/${entry.slug}`}
                >
                  {entry.name}
                </a>

                {entry.placeName ? (
                  <span className="dish-connections__place">
                    {entry.placeName}
                  </span>
                ) : null}

                {entry.reason ? (
                  <p className="dish-connections__reason">{entry.reason}</p>
                ) : null}

                {entry.description ? (
                  <p className="dish-connections__description">
                    {entry.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

export default DishConnections;

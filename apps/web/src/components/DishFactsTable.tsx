/**
 * THE FACTS TABLE — the dish page's overview table.
 *
 * WHY IT EXISTS
 *
 * The blueprint's dish-page mockup puts a two-column table directly
 * under the introduction: a label on the left, a value on the right.
 * It has NO heading of its own — it reads as part of the overview, not
 * as another section.
 *
 * The point of the table is that it answers the questions a reader
 * arrives with, in one place, without scrolling:
 *
 *     Associated with | Greece · established tradition · Unverified
 *     Family         | Casserole · form, not ancestry
 *     Served as      | Main course
 *     Technique      | Frying, baking
 *     Also called    | Mousakas; not the same dish as Musakka
 *
 * BEFORE THIS, those answers were scattered: the family was on the
 * card, the serving context was somewhere else, and the "also called"
 * names were not on the page at all. Putting them in one table is the
 * difference between a page a reader can use and a page they have to
 * read.
 *
 * A MISSING FACT IS NOT A ROW THAT DISAPPEARS
 *
 * A dish with no recorded serving context still shows the row, with
 * "No evidence". The difference matters: a missing row reads as "this
 * site has nothing to say about serving", while "No evidence" reads as
 * "we looked and there is no source yet". The first is silence; the
 * second is an honest state. A1 established that rule, and this table
 * follows it.
 */

import type { DishFactRow } from "../lib/dishSections";

export interface DishFactsTableProps {
  /** The rows, in the order they should read. */
  rows: DishFactRow[];
  /**
   * The dish name, for the accessible label of the table.
   *
   * The table has no visible heading, so a screen-reader user needs
   * the caption to know what the table is about.
   */
  dishName: string;
}

export function DishFactsTable({ rows, dishName }: DishFactsTableProps) {
  if (rows.length === 0) return null;

  return (
    <table className="dish-facts" aria-label={`${dishName} — facts`}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="dish-facts__row">
            <th scope="row" className="dish-facts__label">
              {row.label}
            </th>
            <td className="dish-facts__value">
              {row.href ? (
                <a className="dish-facts__link" href={row.href}>
                  {row.value}
                </a>
              ) : (
                <span className={row.note ? "dish-facts__note" : undefined}>
                  {row.value}
                </span>
              )}
              {row.evidence ? (
                <span className="dish-facts__evidence">{row.evidence}</span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default DishFactsTable;

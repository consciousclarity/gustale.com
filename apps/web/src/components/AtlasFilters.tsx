/**
 * THE ATLAS FILTER RAIL — the left column of the atlas.
 *
 * WHAT IT IS
 * ----------
 *
 * The mockup shows a rail headed "Find a place or dish" with:
 *
 *   - a text input;
 *   - three dropdowns;
 *   - a "Show on map" group of checkboxes;
 *   - a "Reset filters" link.
 *
 * THE THREE DROPDOWNS
 * -------------------
 *
 * The mockup labels them "Family", "Ingredient" and "Period". Two of
 * those three are not dropdowns the data can support, and shipping a
 * dropdown that filters nothing is worse than not shipping it:
 *
 *   FAMILY     92 of the 121 dishes on the map carry one. Real.
 *   TECHNIQUE  117 of the 121 carry one. This is the mockup's
 *              "Ingredient" slot, filled with the dish's technique —
 *              what it is made WITH, which is what the ingredient
 *              dropdown was reaching for.
 *   COURSE     116 of the 121 carry one. This is the mockup's
 *              "Period" slot, filled with the dish's course. There
 *              is no period vocabulary: a dish carries an origin DATE
 *              RANGE, and only 8 published dishes have one.
 *
 * The options come from the API's `facets` map, so the rail offers
 * exactly the values that are in use — a facet no dish carries is not
 * offered at all.
 *
 * THE CHECKBOXES ARE THE CONNECTION KINDS
 * ----------------------------------------
 *
 * The mockup's checkboxes are "Associated places", "Documented
 * influence", "Resemblance", "Only claims with a source". The first
 * three are the three groups of the relationship grammar, in the
 * mockup's own words:
 *
 *   Associated places    → migration
 *   Documented influence → descent
 *   Resemblance          → likeness
 *
 * The map draws connections by KIND, so the rail's checkboxes are the
 * kind filter, labelled in the reader's language rather than the
 * grammar's.
 *
 * `family` IS NOT ONE OF THEM.
 *
 * The blueprint says "Stop drawing relation type `family`", and on the
 * live data `family` is 47 of the 82 connections — nearly three fifths
 * of every edge. It is not on the rail as a checkbox, but a reader who
 * wants it can still ask for it: the kind filter is carried in the
 * URL, so `?kinds=family` works.
 */

import type { FacetOption, MapDish } from "../lib/api";
import type { AtlasFilterState } from "../lib/atlas-filters";
import type { RelationshipKind } from "../lib/relationship-grammar";

export interface AtlasFiltersProps {
  filters: AtlasFilterState;
  /** The dishes that survived the query — used for the counts. */
  dishes: MapDish[];
  /** The dropdown vocabulary, from the API. */
  facets: {
    family: FacetOption[];
    technique: FacetOption[];
    course: FacetOption[];
  };
  /** How many connections the current filter leaves on the map. */
  connectionCount: number;
  onChange: (patch: Partial<AtlasFilterState>) => void;
  onToggleKind: (kind: RelationshipKind) => void;
  onReset: () => void;
  /** Set when the connections could not be loaded. */
  connectionError: string | null;
}

/**
 * The rail's checkbox for each connection kind.
 *
 * The LABEL is the reader's; the KIND is the grammar's.
 */
const KIND_CHECKBOXES: {
  kind: RelationshipKind;
  label: string;
  hint: string;
}[] = [
  {
    kind: "descent",
    label: "Documented influence",
    hint: "One dish descends from another — an ancestor, a development, an adaptation.",
  },
  {
    kind: "migration",
    label: "Associated places",
    hint: "A dish travelled: a diaspora, a regional variant.",
  },
  {
    kind: "likeness",
    label: "Resemblance",
    hint: "Two dishes resemble each other — same form, technique, serving or ingredient.",
  },
];

/**
 * One dropdown.
 *
 * The option's COUNT is how many of the map's dishes carry it — so a
 * reader can see, before choosing, how much the filter would leave.
 */
function FacetSelect({
  id,
  label,
  hint,
  options,
  value,
  dishes,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  options: FacetOption[];
  value: string;
  dishes: MapDish[];
  onChange: (value: string) => void;
}) {
  // The count of the dishes carrying each option. Recomputed from the
  // dishes the map is showing, so the number matches what the reader
  // sees rather than what the database once held.
  const counts = new Map<string, number>();
  for (const d of dishes) {
    const facets = d.facets;
    if (!facets) continue;
    const slug = options.find((o) =>
      (facets as unknown as Record<string, string[]>)[id]?.includes(o.value),
    )?.value;
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return (
    <div className="atlas-filters__field">
      <label className="atlas-filters__label" htmlFor={id} title={hint}>
        {label}
      </label>
      <select
        id={id}
        className="atlas-filters__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Any {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
            {counts.get(o.value) ? ` (${counts.get(o.value)})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AtlasFilters({
  filters,
  dishes,
  facets,
  connectionCount,
  onChange,
  onToggleKind,
  onReset,
  connectionError,
}: AtlasFiltersProps) {
  const isDirty =
    filters.q !== "" ||
    filters.family !== "" ||
    filters.technique !== "" ||
    filters.course !== "";

  return (
    <div className="atlas-filters">
      <h2 className="atlas-filters__title">Find a place or dish</h2>

      <div className="atlas-filters__field">
        <label className="atlas-filters__label" htmlFor="atlas-q">
          Search
        </label>
        <input
          id="atlas-q"
          type="search"
          className="atlas-filters__input"
          placeholder="A place or a dish"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </div>

      <FacetSelect
        id="family"
        label="Family"
        hint="The dish's food family — the group of dishes it belongs to."
        options={facets.family}
        value={filters.family}
        dishes={dishes}
        onChange={(v) => onChange({ family: v })}
      />

      <FacetSelect
        id="technique"
        label="Technique"
        hint="What the dish is made with — fried, grilled, steamed, fermented."
        options={facets.technique}
        value={filters.technique}
        dishes={dishes}
        onChange={(v) => onChange({ technique: v })}
      />

      <FacetSelect
        id="course"
        label="Course"
        hint="Where the dish sits in a meal — starter, main, dessert, snack."
        options={facets.course}
        value={filters.course}
        dishes={dishes}
        onChange={(v) => onChange({ course: v })}
      />

      <fieldset className="atlas-filters__group">
        <legend className="atlas-filters__legend">Show on map</legend>

        {KIND_CHECKBOXES.map(({ kind, label, hint }) => {
          const id = `atlas-kind-${kind}`;
          return (
            <div className="atlas-filters__check" key={kind}>
              <input
                id={id}
                type="checkbox"
                checked={filters.kinds.has(kind)}
                onChange={() => onToggleKind(kind)}
              />
              <label htmlFor={id} title={hint}>
                {label}
              </label>
            </div>
          );
        })}

        <p className="atlas-filters__count">
          {connectionError
            ? "The connections could not be loaded."
            : `${connectionCount} connection${connectionCount === 1 ? "" : "s"} on the map`}
        </p>
      </fieldset>

      {isDirty && (
        <button
          type="button"
          className="atlas-filters__reset"
          onClick={onReset}
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

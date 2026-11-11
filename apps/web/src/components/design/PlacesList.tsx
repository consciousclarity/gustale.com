/**
 * The places list — a TEXT list, and the map's replacement.
 *
 * WHY A TEXT LIST
 * ---------------
 * The map was removed from the Startpage by decision. The fallback is
 * a text list of places, and this is it.
 *
 * A text list is not a lesser map. For a reader using a screen
 * reader, for a reader on a slow connection, for a reader who cannot
 * use WebGL at all, and for a search engine, a list of place names is
 * simply better than a canvas. The map cost about a megabyte of
 * JavaScript to deliver the same information the list carries in
 * text.
 *
 * Each place is a link, because a place has its own page.
 */

import { slugify } from "../../lib/slug";

interface PlaceLink {
  name: string;
  count: number;
  slug: string;
}

interface PlacesListProps {
  places: PlaceLink[];
  /** The total number of dishes with a location, when known. */
  locatedCount: number | null;
}

/**
 * Build the place list from the loaded dishes.
 *
 * The places are derived from the dishes that carry coordinates. A
 * place with no coordinates cannot be plotted and is not a place a
 * reader can visit on a map, so it is not in this list.
 */
export function buildPlaceList(
  dishes: { country: string | null; slug: string }[],
): PlaceLink[] {
  const counts = new Map<string, { count: number; slug: string }>();
  for (const dish of dishes) {
    const name = dish.country?.trim();
    if (!name) continue;
    const entry = counts.get(name);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(name, { count: 1, slug: slugify(name) });
    }
  }
  return Array.from(counts.entries())
    .map(([name, { count, slug }]) => ({ name, count, slug }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function PlacesList({ places, locatedCount }: PlacesListProps) {
  if (places.length === 0) {
    // An empty state WITH an action. No dash, and no bare zero.
    return (
      <section className="places" aria-labelledby="places-heading">
        <h2 id="places-heading" className="places-heading">
          Places
        </h2>
        <div className="places-empty">
          <p>No dish in the catalogue has a location yet.</p>
          <a className="places-empty-action" href="/dishes/">
            Browse all dishes instead
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="places" aria-labelledby="places-heading">
      <div className="places-head">
        <h2 id="places-heading" className="places-heading">
          Places
        </h2>
        {locatedCount !== null && locatedCount > 0 ? (
          <p className="places-note">
            {locatedCount.toLocaleString()}{" "}
            {locatedCount === 1 ? "dish is" : "dishes are"} mapped to{" "}
            {places.length === 1 ? "this place" : "these places"}.
          </p>
        ) : null}
      </div>

      <ul className="places-list">
        {places.map((place) => (
          <li key={place.slug} className="places-item">
            <a href={`/places/${place.slug}/`}>{place.name}</a>
            <span className="places-count">{place.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

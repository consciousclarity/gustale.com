/**
 * THE PLACE PANEL — the right column of the atlas.
 *
 * WHAT IT SHOWS
 * -------------
 *
 * The mockup's panel is headed "PLACE · COUNTRY" and reads:
 *
 *   > 16 dishes associated · 2 threads pass through
 *
 * with three tabs — Dishes, Regions, Threads — and an "Open <Place>"
 * button at the bottom.
 *
 * WHERE THE NUMBERS COME FROM
 * ---------------------------
 *
 * The dish count is the number of dishes the MAP is currently showing
 * for this place — not the place's total. That is deliberate: the panel
 * is describing the map, so when the reader filters the map down to one
 * place, the panel must say so. The place's full total is on the place's
 * own page, which the "Open <Place>" button leads to.
 *
 * The thread count comes from the API: the threads that pass through
 * the place, which is what the mockup's "2 threads pass through" means.
 * A thread passes through a place when a dish associated with that
 * place belongs to the thread.
 *
 * THE TABS
 * --------
 *
 * Dishes and Threads are live. Regions is not: the atlas's data has one
 * place per dish's origin, and there is no second-level region (a
 * province, a city) in the map's data to show. Rather than a dead tab,
 * the Regions tab is rendered as disabled with the reason — which is
 * what the blueprint wants: a reader is told what does not exist yet
 * instead of being shown an empty list.
 */

import { useEffect, useState } from "react";
import type { MapDish } from "../lib/api";
import { getPlace, type PlaceResponse } from "../lib/api";

export interface PlacePanelProps {
  /** The selected place, or null when nothing is selected. */
  place: string | null;
  /** The dishes the map is showing for the selected place. */
  dishes: MapDish[];
  /** How many dishes the map is showing in total. */
  totalDishes: number;
}

type Tab = "dishes" | "regions" | "threads";

export function PlacePanel({ place, dishes, totalDishes }: PlacePanelProps) {
  const [tab, setTab] = useState<Tab>("dishes");
  const [data, setData] = useState<PlaceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The place's own detail — its threads and its full dish count — is
  // fetched when a place is selected. It is a separate request from
  // the map's data because it is a different shape.
  useEffect(() => {
    if (!place) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setError(null);
    getPlace(slugFor(place))
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "the place could not be loaded",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [place]);

  if (!place) {
    return (
      <div className="place-panel place-panel--empty">
        <p className="place-panel__hint">
          Pick a place on the map to see its dishes and the threads that pass
          through it.
        </p>
        <p className="place-panel__hint">
          {totalDishes} dish{totalDishes === 1 ? "" : "es"} on the map.
        </p>
      </div>
    );
  }

  const threadCount = data?.counts.threads ?? 0;
  const placeName = data?.place.name ?? place;
  // The API is the authority on the slug. Until its detail has loaded,
  // the derived slug is the best guess — and it is the same derivation
  // the API uses, so it matches in practice.
  const placeSlug = data?.place.slug ?? slugFor(place);
  const entityType = data?.place.entityType ?? "place";
  // The heading reads "PLACE · COUNTRY" in the mockup — the place's name
  // and the kind of thing it is.
  const kindLabel =
    entityType === "country"
      ? "COUNTRY"
      : entityType === "region"
        ? "REGION"
        : entityType === "community"
          ? "COMMUNITY"
          : "PLACE";

  return (
    <div className="place-panel">
      <h2 className="place-panel__title">
        <span className="place-panel__kind">{kindLabel}</span>
        <span className="place-panel__name">{placeName}</span>
      </h2>

      <p className="place-panel__counts">
        {/*
          The count is the PLACE's count, not the map's count.
          //
          The mockup reads "16 dishes associated" for Indonesia, and
          Indonesia carries 193 dishes on the live data -- but only some
          of them are ON the map (only 121 dishes in the whole site
          have coordinates). So the two counts are different numbers
          and they answer different questions:
          //
          //   the map's count  how many of the place's dishes the map
          //                    is showing right now
          //   the place's count how many dishes are associated with
          //                    the place at all
          //
          The panel's headline is the PLACE's count -- it describes the
          place, and it is what the reader is about to open. The map's
          count is what the list below shows.
        */}
        {(data?.counts.dishes ?? dishes.length)} dish
        {(data?.counts.dishes ?? dishes.length) === 1 ? "" : "es"} associated
        {threadCount > 0 && (
          <>
            {" · "}
            {threadCount} thread{threadCount === 1 ? "" : "s"} pass through
          </>
        )}
      </p>

      <div className="place-panel__tabs" role="tablist" aria-label="Place detail">
        <button
          type="button"
          role="tab"
          className={tab === "dishes" ? "is-current" : undefined}
          aria-selected={tab === "dishes"}
          onClick={() => setTab("dishes")}
        >
          Dishes
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "regions" ? "is-current" : undefined}
          aria-selected={tab === "regions"}
          onClick={() => setTab("regions")}
        >
          Regions
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "threads" ? "is-current" : undefined}
          aria-selected={tab === "threads"}
          onClick={() => setTab("threads")}
        >
          Threads
        </button>
      </div>

      {tab === "dishes" && (
        <ul className="place-panel__list">
          {dishes.length === 0 && (
            <li className="place-panel__empty">
              No dishes are shown for this place under the current filters.
            </li>
          )}
          {dishes.map((d) => (
            <li key={d.slug} className="place-panel__dish">
              <a className="place-panel__dish-name" href={`/dishes/${d.slug}`}>
                {d.canonicalName}
              </a>
              {d.region?.name && (
                <span className="place-panel__dish-region">{d.region.name}</span>
              )}
              {d.shortDescription && (
                <p className="place-panel__dish-desc">{d.shortDescription}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "regions" && (
        <ul className="place-panel__list">
          <li className="place-panel__empty">
            The atlas does not yet carry sub-regions — a province, a city, a
            district. The place is the finest grain the map draws.
          </li>
        </ul>
      )}

      {tab === "threads" && (
        <ul className="place-panel__list">
          {error && <li className="place-panel__empty">{error}</li>}
          {!error && (data?.threads ?? []).length === 0 && (
            <li className="place-panel__empty">
              No recorded thread passes through this place yet.
            </li>
          )}
          {(data?.threads ?? []).map((t) => (
            <li key={t.slug} className="place-panel__thread">
              <a className="place-panel__thread-name" href={`/lineages/${t.slug}`}>
                {t.name}
              </a>
              <span className="place-panel__dish-region">
                {t.dishes} dish{t.dishes === 1 ? "" : "es"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <a className="place-panel__open" href={`/places/${placeSlug}`}>
        Open {placeName}
      </a>
    </div>
  );
}

/**
 * The slug for a place NAME.
 *
 * The API derives a place's slug from its name the same way — accents
 * folded, punctuation reduced to single hyphens — so the panel can
 * build the link without a second request. When the place's detail has
 * loaded, its own slug is used instead, because the API is the
 * authority on it.
 */
export function slugFor(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

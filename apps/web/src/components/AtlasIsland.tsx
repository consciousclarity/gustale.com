/**
 * THE ATLAS ISLAND — the whole atlas, as one client island.
 *
 * WHY ONE ISLAND AND NOT THREE
 * -----------------------------
 *
 * The mockup shows three pieces that must agree with each other: the
 * filter rail, the map, and the place panel. If they were three
 * islands, the filter's state would have to cross the island boundary
 * on every keystroke, and the map's own re-render would be a message
 * between siblings. One island keeps the state in one place — a
 * `useState` — and the three pieces are three views of it.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 *
 * The dishes are fetched on the CLIENT, not baked into the page. The
 * map is already an island that fetches its own connections, and the
 * atlas needs the dishes to answer a filter question. A static build
 * that baked 121 dishes into the page would also bake them into every
 * cached copy of it — and the atlas's whole point is that the filter
 * is live.
 *
 * So the page ships as a shell, and the island fills it. The shell has
 * a message for the reader until the island mounts, and the island
 * replaces it.
 *
 * THE URL IS THE STATE
 * --------------------
 *
 * The filter is in the query string: `?q=&family=&technique=&course=
 * &kinds=`. That makes a filtered atlas a LINK a reader can send to
 * someone else, and it makes the browser's back button work — both of
 * which a reader of an atlas expects without being told.
 *
 * The kinds are a COMMA-SEPARATED list, and the DEFAULT is the
 * three kinds the blueprint wants drawn. `family` is deliberately NOT
 * in the default: the blueprint says to stop drawing it, and it is 47
 * of the 82 live connections. A reader who wants it asks for it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAtlasConnections,
  getMapDishes,
  type FacetOption,
  type MapConnection,
  type MapDish,
} from "../lib/api";
import {
  RELATIONSHIP_KINDS,
  relationshipKindFor,
  type RelationshipKind,
} from "../lib/relationship-grammar";
import {
  DEFAULT_KINDS,
  NEVER_DRAWN,
  drawableKinds,
  readAtlasFilters,
  writeAtlasFilters,
  type AtlasFilterState,
} from "../lib/atlas-filters";
import { AtlasFilters } from "./AtlasFilters";
import { PlacePanel } from "./PlacePanel";
import { WorldMap } from "./WorldMap";

/**
 * The kinds the atlas draws.
 *
 * `family` is left out on purpose — the blueprint says "Stop drawing
 * relation type `family`". The other three are the whole grammar
 * minus that one.
 *
 * IT IS NEVER DRAWN, NOT MERELY OFF BY DEFAULT.
 *
 * `family` is 47 of the 82 connections on the live data — nearly
 * three fifths of every edge on the map — and it is a relationship
 * the grammar has since dissolved: "same family" said that two dishes
 * resemble each other, which is what `likeness` now says. Leaving a
 * way to switch it back on (through the URL, say) would keep drawing
 * the very thing the blueprint retires, one query string away.
 *
 * So the exclusion is applied to EVERY kind set, whatever produced
 * it: the default, the URL, and a reader's click. `FILTERED_KINDS` is
 * the only kind set the atlas ever uses.
 */
/** The atlas's three views. */
export type AtlasView = "map" | "list" | "timeline";

const EMPTY_FACETS: {
  family: FacetOption[];
  technique: FacetOption[];
  course: FacetOption[];
} = { family: [], technique: [], course: [] };

export interface AtlasIslandProps {
  /**
   * The dishes, baked in at BUILD time.
   *
   * They are the first paint, not the source of truth: the island
   * fetches the live list on hydration, because the filter is the point
   * of the page and a filter over a baked-in list would be a filter
   * over a stale copy.
   */
  initialDishes?: MapDish[];
}

export function AtlasIsland({ initialDishes = [] }: AtlasIslandProps = {}) {
  const [filters, setFilters] = useState<AtlasFilterState>(() =>
    readAtlasFilters(typeof window === "undefined" ? "" : window.location.search),
  );
  const [dishes, setDishes] = useState<MapDish[]>(initialDishes);
  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [connections, setConnections] = useState<MapConnection[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialDishes.length === 0);
  const [error, setError] = useState<string | null>(null);

  // ─── The data ───
  //
  // The dishes and the connections are two different endpoints with
  // two different shapes, so they are two fetches. They are started
  // together rather than in sequence: the connections are small and
  // the map shows its dishes as soon as they arrive.
  useEffect(() => {
    let cancelled = false;

    getMapDishes()
      .then((res) => {
        if (cancelled) return;
        setDishes(res.dishes);
        if (res.facets) setFacets(res.facets);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "the map could not be loaded",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    getAtlasConnections()
      .then((res) => {
        if (cancelled) return;
        setConnections(res.connections ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // The connections are NOT fatal. The map still shows the
        // dishes; only the edges are missing. Saying so is better than
        // showing an empty map as though the data were empty.
        setConnectionError(
          err instanceof Error ? err.message : "the connections could not be loaded",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ─── The filter, in the URL ───
  //
  // EVERY kind-set change passes through here, so this is where the
  // atlas's one hard rule is enforced: `family` is never drawn.
  //
  // A kind set that arrives here is filtered, not trusted. That covers
  // the URL, the rail's checkboxes and the map's own legend -- a
  // kind set that named `family` would come back without it.
  const update = useCallback((patch: Partial<AtlasFilterState>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (next.kinds) {
        next.kinds = drawableKinds(next.kinds);
      }
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", writeAtlasFilters(next));
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setFilters({
      q: "",
      family: "",
      technique: "",
      course: "",
      kinds: new Set(DEFAULT_KINDS),
    });
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", writeAtlasFilters(readAtlasFilters("")));
    }
  }, []);

  const toggleKind = useCallback(
    (kind: RelationshipKind) => {
      // `family` is never drawn, so it is never toggled on.
      if (kind === NEVER_DRAWN) return;
      setFilters((prev) => {
        const kinds = new Set(prev.kinds);
        if (kinds.has(kind)) kinds.delete(kind);
        else kinds.add(kind);
        const next = { ...prev, kinds };
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", writeAtlasFilters(next));
        }
        return next;
      });
    },
    [],
  );

  // ─── The filtered dishes ───
  //
  // The TEXT query matches the dish's name, its description, and the
  // place it belongs to — "Find a place or dish" is the rail's own
  // label, so a place name must find something.
  const visibleDishes = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return dishes.filter((d) => {
      if (filters.family && !(d.facets?.family ?? []).includes(filters.family)) {
        return false;
      }
      if (
        filters.technique &&
        !(d.facets?.technique ?? []).includes(filters.technique)
      ) {
        return false;
      }
      if (filters.course && !(d.facets?.course ?? []).includes(filters.course)) {
        return false;
      }
      if (!q) return true;
      return (
        d.canonicalName.toLowerCase().includes(q) ||
        (d.shortDescription ?? "").toLowerCase().includes(q) ||
        d.region.name.toLowerCase().includes(q)
      );
    });
  }, [dishes, filters]);

  // ─── The filtered connections ───
  //
  // A connection is drawn when BOTH of its dishes are still on the
  // map and its kind is enabled. A connection to a dish the filter
  // removed is not drawn, because the reader would see an edge
  // leading to nothing.
  const visibleConnections = useMemo(() => {
    const slugs = new Set(visibleDishes.map((d) => d.slug));
    return connections.filter((c) => {
      // The connection's `relationship` is the RELATION TYPE
      // ("similar_form", "family"), and the filter's kinds are the
      // grammar's GROUPS ("likeness", "family"). `relationshipKindFor`
      // is the mapping between them — it throws on an unmapped type
      // rather than guessing.
      const kind = relationshipKindFor(c.relationship);
      if (!filters.kinds.has(kind)) return false;
      if (!slugs.has(c.from.slug)) return false;
      if (!slugs.has(c.to.slug)) return false;
      return true;
    });
  }, [connections, visibleDishes, filters.kinds]);

  // ─── The panel's dishes ───
  //
  // The panel describes the MAP, so it counts the dishes the map is
  // showing for the selected place — not the place's full total.
  const panelDishes = useMemo(() => {
    if (!selectedPlace) return [];
    return visibleDishes.filter((d) => d.region.name === selectedPlace);
  }, [visibleDishes, selectedPlace]);

  if (error) {
    return (
      <div className="atlas__error">
        <p>
          The atlas could not be loaded: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="atlas">
      <div className="atlas__views" role="group" aria-label="Atlas view">
        <a className="atlas__view is-current" href="/atlas" aria-current="page">
          Map
        </a>
        <a className="atlas__view" href="/places">
          List
        </a>
        <span
          className="atlas__view is-disabled"
          title="The timeline is not built yet — the atlas's third view is still to come."
        >
          Timeline
        </span>
      </div>

      <div className="atlas__grid">
        <div className="atlas__rail">
          <AtlasFilters
            filters={filters}
            dishes={visibleDishes}
            facets={facets}
            connectionCount={visibleConnections.length}
            onChange={update}
            onToggleKind={toggleKind}
            onReset={reset}
            connectionError={connectionError}
          />
        </div>

        <div className="atlas__map">
          {loading ? (
            <p className="atlas__loading">Loading the atlas…</p>
          ) : (
            <WorldMap
              dishes={visibleDishes}
              showConnections
              connections={visibleConnections}
              enabledKinds={filters.kinds}
              onToggleKind={(kinds) => update({ kinds })}
              onSelectPlace={setSelectedPlace}
              selectedPlace={selectedPlace}
            />
          )}
          {/*
            The map's own footnote, from the mockup.

            It says what the map is showing and -- more usefully -- what
            it is NOT showing: an arrow is drawn only where a SOURCE
            documents the influence. A reader who sees a dish on the map
            with no edges should know that is because nothing has been
            documented, not because the dish stands alone.
          */}
          <p className="atlas__map-note">
            Numbers count dishes associated with a place. Arrows appear only
            where a source documents influence.
          </p>
        </div>

        <div className="atlas__panel">
          <PlacePanel
            place={selectedPlace}
            dishes={panelDishes}
            totalDishes={visibleDishes.length}
          />
        </div>
      </div>
    </div>
  );
}

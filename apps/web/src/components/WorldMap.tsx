// Type-only import for the bits we use in render and effect closures.
// This is erased at build time — no runtime cost.
import type {
  GeoJSONSource,
  MapMouseEvent,
  Map as MlMap,
  PointLike,
} from "maplibre-gl";
// IMPORTANT: maplibre-gl is dynamically imported inside the effect, not
// statically imported at the top. Static imports execute at module-eval
// time, which means even a `client:only` island would try to evaluate
// the WebGL helpers before any client code runs. Dynamic import keeps
// the initial module payload tiny and lets us defer the WebGL
// dependency until the user actually sees the map.
//
// The Web Worker URL is loaded via Vite's `?url` import so the built
// path is correct under Astro 7 (which otherwise does not copy
// `maplibre-gl/dist/maplibre-gl-worker.mjs` into `_astro/`). The same
// pattern is used in <DishMap> and <GustaleHomeIsland>.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  getAtlasConnections,
  getMapDishes,
  type MapConnection,
  type MapDish,
} from "../lib/api";
import {
  basemapTransformRequest,
  CARTO_VECTOR_STYLE_URL,
} from "../lib/basemap";
import {
  allShareSameCoordKey,
  coordKey,
  countCoincidentByCoord,
  dedupeDishesBySlug,
  expandToCoincidentStack,
} from "../lib/mapCoincident";
import {
  RELATIONSHIP_KINDS,
  type RelationshipKind,
} from "../lib/relationship-grammar";
import { RelationshipLayer } from "./RelationshipLayer";
import { RelationshipLegend } from "./RelationshipLegend";

export interface WorldMapProps {
  dishes: MapDish[];
  /**
   * Whether the connection layer is on.
   *
   * It is a PROP and not only internal state, because the map page
   * decides it from the URL — a reader who shares a link to "the map
   * with the connections on" gets that map.
   */
  showConnections?: boolean;
  /**
   * The connections to draw, when the caller already has them.
   *
   * THE ATLAS OWNS THE FILTER. The atlas island holds the connection
   * filter (which kinds, which places), so it fetches the connections
   * and hands over the ones that survived. When this prop is given, the
   * map does NOT fetch them itself — it draws exactly what it is given.
   *
   * When it is NOT given, the map fetches its own and filters by kind
   * alone, which is the older behaviour and is still what a map on a
   * page of its own does.
   */
  connections?: MapConnection[];
  /**
   * The relationship kinds to draw.
   *
   * Given by the caller when the caller owns the filter. When it is
   * NOT given, the map uses its own default — all four kinds — so a
   * standalone map still shows everything it used to.
   */
  enabledKinds?: Set<RelationshipKind>;
  /**
   * Called when the reader picks a place off the map.
   *
   * The atlas uses this to open the place panel on the right. A click
   * on a dot or a cluster reports the place the dishes belong to; a
   * click on empty map reports null, which closes the panel.
   */
  onSelectPlace?: (place: string | null) => void;
  /**
   * The place that is currently selected.
   *
   * The map marks it so the reader can see which place the panel is
   * about.
   */
  selectedPlace?: string | null;
  /**
   * Called when the reader toggles a relationship kind in the legend.
   *
   * Given by the caller when the caller owns the kind filter, so the
   * legend and the map never disagree about which kinds are on.
   */
  onToggleKind?: (kinds: Set<RelationshipKind>) => void;
}

/**
 * Count the connections by relation type.
 *
 * The API returns these counts, but when the CALLER supplies the
 * connections — the atlas does, because it filters them — the counts
 * have to be derived from the supplied set, or the legend would report
 * the API's numbers for a set the map is not drawing.
 */
function countByRelationship(
  connections: MapConnection[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of connections) {
    counts[c.relationship] = (counts[c.relationship] ?? 0) + 1;
  }
  return counts;
}

/**
 * Interactive globe + 2D-map of published dishes, powered by MapLibre GL.
 *
 * Coincident dishes (many national dishes share a country centroid) are a
 * permanent, expected state — never jittered. Stacked points show a count
 * affordance; click opens a disambiguation list of real links.
 *
 * IMPORTANT: This component must be mounted with `client:only="react"`,
 * NOT `client:load`. MapLibre imports `mapbox-gl`'s WebGL helpers at
 * module-load time, which crashes Astro SSR.
 */
type View = "globe" | "flat";

type TooltipState = {
  x: number;
  y: number;
  dishes: MapDish[];
};

type StackPopupState = {
  x: number;
  y: number;
  dishes: MapDish[];
};

/** Layers queried for hit-testing (single map-level handlers, not per-layer). */
const HIT_LAYERS = [
  "dishes-dot",
  "dishes-halo",
  "dishes-clusters",
  "dishes-coincident-count",
] as const;

/**
 * Keep clusters intact through city-scale zooms. Tuned against the
 * 121-dish distribution: 22 multi-dish centroids (Jakarta 8, Tokyo 7,
 * Beirut 7, Istanbul 3…). With clusterMaxZoom 5 those stacks dissolved
 * into unclickable piles by zoom 6; at 11 they stay one cluster until
 * very close, then the disambiguation popup (or coincident-only cluster
 * leaves) handles the remaining stacks.
 */
const CLUSTER_MAX_ZOOM = 11;

export function WorldMap({
  dishes,
  showConnections = true,
  connections: connectionsProp,
  enabledKinds: enabledKindsProp,
  onSelectPlace,
  selectedPlace = null,
  onToggleKind: onToggleKindProp,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupListRef = useRef<HTMLUListElement | null>(null);
  const stackPopupRef = useRef<HTMLDivElement | null>(null);
  const popupId = useId();
  // THE DEFAULT VIEW IS THE FLAT MAP.
  //
  // The blueprint's WP-C3 says "Flat map default". A globe is a good
  // thing to have — it is one click away — but it is the wrong FIRST
  // view for a reader who came to find a place: the globe hides most of
  // the world's dishes behind its curvature, and a reader looking for
  // "where is this dish from" wants a map they can read at a glance.
  // The globe stays available in the toggle.
  const [view, setView] = useState<View>("flat");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [stackPopup, setStackPopup] = useState<StackPopupState | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [effectiveDishes, setEffectiveDishes] = useState<MapDish[]>(dishes);
  const [isLoading, setIsLoading] = useState<boolean>(dishes.length === 0);

  // ─── The connections ───
  //
  // Fetched once, on the client. The map is an interactive island, so
  // the connections are fetched with it rather than server-rendered —
  // a static build cannot know which edges a reader will scroll to.
  //
  // WHEN THE CALLER SUPPLIES THEM, THE MAP DOES NOT FETCH.
  //
  // The atlas island owns the connection filter, so it fetches the
  // connections and hands over the ones that survived its filter. The
  // map then draws exactly what it was given. This is what keeps the
  // rail, the map and the panel telling the same story: there is one
  // list of connections in the atlas, and it is filtered once.
  const [fetchedConnections, setFetchedConnections] = useState<MapConnection[]>(
    [],
  );
  const [byRelationship, setByRelationship] = useState<Record<string, number>>(
    {},
  );
  const [internalKinds, setInternalKinds] = useState<Set<RelationshipKind>>(
    () => new Set(RELATIONSHIP_KINDS),
  );
  const [showAllConnections, setShowAllConnections] = useState(false);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  // The connections actually in play: the caller's when given, the
  // map's own fetch otherwise.
  const connections = connectionsProp ?? fetchedConnections;

  // The kinds in play: the caller's when given, the map's own toggle
  // otherwise. The legend's toggle calls `toggleKind`, which writes to
  // the internal set — so when the caller owns the filter, the legend
  // must not own it. `toggleKind` below routes to the caller instead.
  const enabledKinds = enabledKindsProp ?? internalKinds;

  const detectWebGL = (): boolean => {
    if (typeof document === "undefined") return false;
    try {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl2") ??
        canvas.getContext("webgl") ??
        canvas.getContext(
          "experimental-webgl",
        )) as unknown as WebGLRenderingContext | null;
      if (!gl) return false;
      gl.getParameter(gl.VERSION);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (dishes.length > 0) return;
    let cancelled = false;
    setIsLoading(true);
    getMapDishes({ limit: 2000 })
      .then((response) => {
        if (cancelled) return;
        setEffectiveDishes(response.dishes);
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[WorldMap] live fetch failed:", err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dishes.length]);

  // Close disambiguation popup on Escape / outside click.
  useEffect(() => {
    if (!stackPopup) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        setStackPopup(null);
      }
    };
    const onPointer = (e: MouseEvent): void => {
      const root = stackPopupRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setStackPopup(null);
      }
    };
    document.addEventListener("keydown", onKey);
    // Defer outside-click so the opening click does not immediately close.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointer);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [stackPopup]);

  // Focus the first dish link when the stack popup opens (keyboard path).
  useEffect(() => {
    if (!stackPopup) return;
    const first = popupListRef.current?.querySelector<HTMLAnchorElement>("a");
    first?.focus();
  }, [stackPopup]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;

    if (!detectWebGL()) {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.warn(
        "[WorldMap] WebGL not available — falling back to list view",
      );
      setMapError(
        "Your browser does not support WebGL, which is required for the interactive globe. Below is a list of dishes by region.",
      );
      setMapReady(true);
      return;
    }

    void import("maplibre-gl")
      .then((mod) => {
        if (cancelled) return;
        const maplibregl = mod.default ?? mod;
        // Point MapLibre at the worker bundle Astro/Vite emitted. The
        // `?url` import above resolves to a stable `/_astro/...mjs` path
        // at build time. Calling this before `new maplibregl.Map(...)`
        // is what prevents the `/_astro/maplibre-gl-worker.mjs` 404
        // we saw on gustale.com/map under Astro 7 + MapLibre 6.
        maplibregl.setWorkerUrl(maplibreWorkerUrl);
        const NavigationControl =
          mod.NavigationControl ?? maplibregl.NavigationControl;
        const ScaleControl = mod.ScaleControl ?? maplibregl.ScaleControl;

        // Boot the map as a globe. The basemap is CARTO's *vector* GL
        // style (see lib/basemap for why the raster endpoint was
        // abandoned), so the style is fetched by MapLibre and we cannot
        // bake `projection` into it the way the old inline raster style
        // allowed. Instead we call setProjection() from the `style.load`
        // handler below — MapLibre 6 rejects that call before the style
        // is ready, and it must run *after* `style.load` or the map
        // renders as a flat Mercator basemap. The toggle button
        // (line ~644) uses the same call for runtime globe↔flat
        // switching, which is safe because the style is fully loaded by
        // the time a user can click it.
        const style = CARTO_VECTOR_STYLE_URL;

        try {
          const el = containerRef.current;
          if (!el) return;
          map = new maplibregl.Map({
            container: el,
            style,
            center: [0, 20],
            zoom: 1.4,
            minZoom: 0.5,
            maxZoom: 14,
            attributionControl: { compact: true },
            transformRequest: basemapTransformRequest,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[WorldMap] MapLibre init failed:", err);
          setMapError(
            "The interactive globe could not be initialised in this browser. Below is a list of dishes by region.",
          );
          setMapReady(true);
          return;
        }

        const mapInstance = map;

        mapInstance.on("error", (e: { error?: Error }) => {
          // eslint-disable-next-line no-console
          console.warn("[WorldMap] MapLibre error:", e?.error?.message ?? e);
        });

        mapInstance.addControl(
          new NavigationControl({ visualizePitch: false }),
          "top-right",
        );
        mapInstance.addControl(
          new ScaleControl({ unit: "metric" }),
          "bottom-left",
        );

        // The basemap is a remote CARTO vector style, so `projection`
        // cannot be baked into it — it is applied in the `style.load`
        // handler below. The toggle button (further down) uses
        // `setProjection` for runtime globe↔flat switching, which is
        // safe because the style is fully loaded by the time a user
        // can click it.

        mapInstance.on("style.load", () => {
          // The basemap boots as a FLAT MAP, which is the atlas's default
          // view (WP-C3: "Flat map default"). The globe is one click
          // away in the toggle below.
          //
          // MapLibre 6 rejects setProjection() before the style has
          // finished loading, so this has to run from `style.load` —
          // calling it earlier throws "Style is not done loading" and
          // the map ends up rendering as a flat Mercator basemap.
          mapInstance.setProjection({ type: "flat" });

          // Set the sky. Only valid MapLibre 6 sky properties are used:
          // `sky-color`, `sky-horizon-blend`, `horizon-fog-blend`,
          // `fog-color`, `fog-ground-blend`. The Mapbox-only `space-color`
          // and `star-intensity` (which were present in the pre-6 code
          // and caused the two console errors on gustale.com/map) are
          // removed.
          //
          // Note: MapLibre 6 reports validation failures via
          // `map.fire('error', ...)` rather than `throw`-ing from
          // `setSky`, so a try/catch here would silently swallow
          // the very thing we want surfaced in dev. The runtime error
          // listener above (on "error") will log anything that goes
          // wrong; we don't add a catch.
          mapInstance.setSky({
            "sky-color": "#1992ff",
            "sky-horizon-blend": 0.7,
            "horizon-fog-blend": 0.7,
            "fog-color": "#e8e8e8",
            "fog-ground-blend": 0.5,
          });
        });

        mapRef.current = mapInstance;

        // Expose the instance for the verification script.
        //
        // The map's layers are the only way to check that the four
        // relationship kinds are really on the map and not merely
        // described in the legend — and the legend is React-rendered
        // HTML, which the script can read without this.
        (window as unknown as { __gustaleMap?: maplibregl.Map }).__gustaleMap =
          mapInstance;

        const coincidentByCoord = countCoincidentByCoord(effectiveDishes);
        const featureCollection: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: effectiveDishes.map((d) => {
            const key = coordKey(d.lat, d.lng);
            return {
              type: "Feature",
              geometry: { type: "Point", coordinates: [d.lng, d.lat] },
              properties: {
                slug: d.slug,
                canonicalName: d.canonicalName,
                shortDescription: d.shortDescription ?? "",
                regionName: d.region.name ?? "",
                regionIso: d.region.isoCode ?? "",
                coincidentCount: coincidentByCoord.get(key) ?? 1,
              },
            };
          }),
        };

        const mountLayers = (): void => {
          if (cancelled) return;
          if (mapInstance.getSource("dishes")) {
            mapInstance.resize();
            setMapReady(true);
            return;
          }

          mapInstance.addSource("dishes", {
            type: "geojson",
            data: featureCollection,
            cluster: true,
            clusterRadius: 28,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
            generateId: true,
          });

          mapInstance.addLayer({
            id: "dishes-halo",
            type: "circle",
            source: "dishes",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                [
                  "interpolate",
                  ["linear"],
                  ["get", "coincidentCount"],
                  1,
                  12,
                  4,
                  16,
                  8,
                  20,
                ],
                [
                  "interpolate",
                  ["linear"],
                  ["get", "coincidentCount"],
                  1,
                  8,
                  4,
                  11,
                  8,
                  14,
                ],
              ],
              "circle-color": "#10b981",
              "circle-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                0.35,
                0.18,
              ],
              "circle-radius-transition": { duration: 150 },
              "circle-opacity-transition": { duration: 150 },
            },
          });

          mapInstance.addLayer({
            id: "dishes-dot",
            type: "circle",
            source: "dishes",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                [
                  "interpolate",
                  ["linear"],
                  ["get", "coincidentCount"],
                  1,
                  6,
                  4,
                  8,
                  8,
                  10,
                ],
                [
                  "interpolate",
                  ["linear"],
                  ["get", "coincidentCount"],
                  1,
                  4,
                  4,
                  6,
                  8,
                  8,
                ],
              ],
              "circle-color": "#059669",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.2,
              "circle-radius-transition": { duration: 150 },
            },
          });

          mapInstance.addLayer({
            id: "dishes-coincident-count",
            type: "symbol",
            source: "dishes",
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              [">", ["get", "coincidentCount"], 1],
            ],
            layout: {
              "text-field": ["to-string", ["get", "coincidentCount"]],
              "text-size": 10,
              "text-font": ["Open Sans Regular"],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: { "text-color": "#ffffff" },
          });

          mapInstance.addLayer({
            id: "dishes-clusters",
            type: "circle",
            source: "dishes",
            filter: ["has", "point_count"],
            paint: {
              "circle-radius": [
                "step",
                ["get", "point_count"],
                14,
                10,
                18,
                50,
                22,
              ],
              "circle-color": "#059669",
              "circle-opacity": 0.85,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          mapInstance.addLayer({
            id: "dishes-cluster-count",
            type: "symbol",
            source: "dishes",
            filter: ["has", "point_count"],
            layout: {
              "text-field": "{point_count_abbreviated}",
              "text-size": 12,
              "text-font": ["Open Sans Regular"],
            },
            paint: { "text-color": "#ffffff" },
          });

          let hoveredId: number | string | null = null;
          const setHover = (id: number | string | null): void => {
            if (hoveredId != null) {
              mapInstance.setFeatureState(
                { source: "dishes", id: hoveredId },
                { hover: false },
              );
            }
            hoveredId = id;
            if (hoveredId != null) {
              mapInstance.setFeatureState(
                { source: "dishes", id: hoveredId },
                { hover: true },
              );
            }
          };

          const clearPointerUi = (): void => {
            setHover(null);
            setTooltip(null);
            mapInstance.getCanvas().style.cursor = "";
          };

          const hitFeatures = (
            point: PointLike,
          ): Array<{
            id?: string | number;
            properties?: Record<string, unknown> | null;
            geometry: GeoJSON.Geometry;
          }> => {
            const existing = HIT_LAYERS.filter((id) =>
              mapInstance.getLayer(id),
            );
            if (existing.length === 0) return [];
            return mapInstance.queryRenderedFeatures(point, {
              layers: [...existing],
            });
          };

          /**
           * Resolve dishes under the pointer. MapLibre often returns only the
           * topmost circle when several share a pixel, so expand any hit to
           * the full coincident stack via shared lat/lng.
           */
          const dishesFromFeatures = (
            features: Array<{
              properties?: Record<string, unknown> | null;
            }>,
          ): MapDish[] => {
            const hit: MapDish[] = [];
            for (const f of features) {
              if (f.properties?.point_count) continue;
              const slug = f.properties?.slug as string | undefined;
              if (!slug) continue;
              const dish = effectiveDishes.find((d) => d.slug === slug);
              if (dish) hit.push(dish);
            }
            return expandToCoincidentStack(hit, effectiveDishes);
          };

          const onMove = (e: MapMouseEvent): void => {
            const features = hitFeatures(e.point);
            if (features.length === 0) {
              clearPointerUi();
              return;
            }

            const cluster = features.find((f) => f.properties?.point_count);
            if (cluster) {
              setHover(cluster.id as number | string);
              mapInstance.getCanvas().style.cursor = "pointer";
              setTooltip(null);
              return;
            }

            const hitDishes = dishesFromFeatures(features);
            if (hitDishes.length === 0) {
              clearPointerUi();
              return;
            }

            const firstFeature = features.find((f) => f.properties?.slug);
            if (firstFeature?.id != null) {
              setHover(firstFeature.id as number | string);
            }
            mapInstance.getCanvas().style.cursor = "pointer";
            setTooltip({
              x: e.point.x,
              y: e.point.y,
              dishes: hitDishes,
            });
          };

          const onClick = (e: MapMouseEvent): void => {
            const features = hitFeatures(e.point);
            if (features.length === 0) return;

            const cluster = features.find((f) => f.properties?.cluster);
            if (cluster?.properties?.cluster) {
              const clusterId = cluster.properties.cluster_id as number;
              const source = mapInstance.getSource("dishes") as GeoJSONSource;
              // Pure coincident stacks never spatially separate — open the
              // disambiguation list once leaves all share one coordinate.
              source
                .getClusterLeaves(clusterId, 50, 0)
                .then((leaves) => {
                  const leafDishes = dedupeDishesBySlug(
                    leaves.flatMap((leaf) => {
                      const slug = leaf.properties?.slug as string | undefined;
                      if (!slug) return [];
                      const dish = effectiveDishes.find((d) => d.slug === slug);
                      return dish ? [dish] : [];
                    }),
                  );
                  if (
                    leafDishes.length > 1 &&
                    leafDishes.length === leaves.length &&
                    allShareSameCoordKey(leafDishes)
                  ) {
                    setTooltip(null);
                    setStackPopup({
                      x: e.point.x,
                      y: e.point.y,
                      dishes: leafDishes,
                    });
                    return;
                  }
                  return source
                    .getClusterExpansionZoom(clusterId)
                    .then((zoom) => {
                      mapInstance.easeTo({
                        center: (cluster.geometry as GeoJSON.Point)
                          .coordinates as [number, number],
                        zoom,
                        duration: 600,
                      });
                    });
                })
                .catch(() => undefined);
              return;
            }

            const hitDishes = dishesFromFeatures(features);
            if (hitDishes.length === 0) return;

            // IN THE ATLAS, A CLICK SELECTS THE PLACE.
            //
            // The atlas's panel is the reader's next step: pick a place,
            // see its dishes and its threads. So when the caller asked
            // for the selection, a click reports the place and does NOT
            // navigate. On a standalone map — with no `onSelectPlace` —
            // the click navigates to the dish, as it always has.
            if (onSelectPlace) {
              const place = hitDishes[0]?.region?.name ?? null;
              onSelectPlace(place);
              if (hitDishes.length === 1) return;
              setTooltip(null);
              setStackPopup({
                x: e.point.x,
                y: e.point.y,
                dishes: hitDishes,
              });
              return;
            }

            if (hitDishes.length === 1) {
              const only = hitDishes[0];
              if (only) window.location.href = `/dishes/${only.slug}/`;
              return;
            }

            setTooltip(null);
            setStackPopup({
              x: e.point.x,
              y: e.point.y,
              dishes: hitDishes,
            });
          };

          mapInstance.on("mousemove", onMove);
          mapInstance.on("mouseout", clearPointerUi);
          mapInstance.on("click", onClick);
          mapInstance.on("movestart", () => {
            setStackPopup(null);
            setTooltip(null);
          });

          mapInstance.resize();
          setMapReady(true);
        };

        if (mapInstance.loaded()) {
          mountLayers();
        } else {
          mapInstance.once("load", mountLayers);
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[WorldMap] failed to load maplibre-gl", err);
        setMapReady(true);
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [effectiveDishes]);

  const toggleView = useCallback((): void => {
    const map = mapRef.current;
    if (!map) return;
    const next: View = view === "globe" ? "flat" : "globe";
    setView(next);
    map.setProjection({ type: next });
    if (next === "globe") {
      map.setZoom(1.4);
    } else {
      map.setZoom(2);
    }
  }, [view]);

  // ─── The connections, fetched once ───
  //
  // The map is the only consumer, and it is an island, so the fetch
  // happens on the client. A failure is NOT fatal: the map still shows
  // the dishes, and the legend says why the connections are missing.
  //
  // WHEN THE CALLER SUPPLIES THE CONNECTIONS, THE MAP DOES NOT FETCH.
  // The atlas owns the filter, so it fetched them already; fetching
  // them here too would be a second, unfiltered copy — and the legend's
  // counts would then describe a different set from the one drawn.
  useEffect(() => {
    if (!showConnections) return;
    if (connectionsProp) {
      // The caller owns the connections. The legend's counts are
      // derived from what the caller passed, so the legend and the
      // edges agree.
      setByRelationship(countByRelationship(connectionsProp));
      return;
    }
    let cancelled = false;
    getAtlasConnections()
      .then((res) => {
        if (cancelled) return;
        setFetchedConnections(res.connections);
        setByRelationship(res.byRelationship);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setConnectionsError(
          err instanceof Error
            ? err.message
            : "the connections could not be loaded",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [showConnections, connectionsProp]);

  const toggleKind = useCallback(
    (kind: RelationshipKind) => {
      // When the caller owns the kind filter, the legend's toggle must
      // not write to the map's own set — the two would disagree and the
      // legend would show a filter the map is not applying.
      if (enabledKindsProp) {
        const next = new Set(enabledKindsProp);
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        onToggleKindProp?.(next);
        return;
      }
      setInternalKinds((prev: Set<RelationshipKind>) => {
        const next = new Set(prev);
        if (next.has(kind)) {
          next.delete(kind);
        } else {
          next.add(kind);
        }
        return next;
      });
    },
    [enabledKindsProp, onToggleKindProp],
  );

  const stackHeading =
    stackPopup &&
    `${stackPopup.dishes.length} dish${stackPopup.dishes.length === 1 ? "" : "es"} at this location`;

  return (
    <>
      {showConnections && (
        <RelationshipLegend
          byRelationship={byRelationship}
          enabledKinds={enabledKinds}
          onToggle={toggleKind}
          showAll={showAllConnections}
          onToggleShowAll={setShowAllConnections}
        />
      )}

      {showConnections && connectionsError && (
        <p className="rel-legend__error" role="status">
          The connections could not be loaded: {connectionsError}. The map still
          shows every published dish.
        </p>
      )}

      <div className="wm-frame">
        {!mapError && (
          <div className="wm-view-toggle">
            <button type="button" onClick={toggleView}>
              {view === "globe" ? "Globe" : "Flat map"}
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className={mapError ? "wm-canvas is-hidden" : "wm-canvas"}
          role="img"
          aria-label="Interactive globe showing published dishes by origin"
        />

        {showConnections && !mapError && mapReady && (
          <RelationshipLayer
            map={mapRef.current}
            connections={connections}
            enabledKinds={enabledKinds}
            showAll={showAllConnections}
          />
        )}

        {mapError && effectiveDishes.length > 0 && (
          <div className="wm-fallback">
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {mapError}
            </p>
            <ul className="space-y-4">
              {Object.entries(
                effectiveDishes.reduce<Record<string, MapDish[]>>((acc, d) => {
                  const key = d.region?.name ?? "Unknown region";
                  const bucket = acc[key] ?? [];
                  bucket.push(d);
                  acc[key] = bucket;
                  return acc;
                }, {}),
              )
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([region, regionDishes]) => (
                  <li key={region}>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {region}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {regionDishes.length}{" "}
                        {regionDishes.length === 1 ? "dish" : "dishes"}
                      </span>
                    </h3>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {regionDishes
                        .slice()
                        .sort((a, b) => b.viewCount - a.viewCount)
                        .map((d) => (
                          <li key={d.slug}>
                            <a
                              href={`/dishes/${d.slug}/`}
                              className="block rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-white hover:text-emerald-700"
                            >
                              {d.canonicalName}
                            </a>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {!mapReady && !isLoading && effectiveDishes.length > 0 && !mapError && (
          <div className="wm-status">
            <p>Loading globe…</p>
          </div>
        )}

        {isLoading && (
          <div className="wm-status">
            <p>Loading map…</p>
          </div>
        )}

        {!isLoading && effectiveDishes.length === 0 && !mapError && (
          <div className="wm-status">
            <p>
              No dishes with origin coordinates yet. Add a dish to see it on the
              map.
            </p>
          </div>
        )}

        {tooltip && tooltip.dishes.length > 0 && !stackPopup && (
          <div
            className="wm-tooltip"
            style={{
              position: "absolute",
              zIndex: 20,
              pointerEvents: "none",
              left: tooltip.x,
              top: tooltip.y - 12,
              transform: "translate(-50%, -100%)",
            }}
          >
            <TooltipBody dishes={tooltip.dishes} />
          </div>
        )}

        {stackPopup && (
          <div
            ref={stackPopupRef}
            id={popupId}
            role="dialog"
            aria-modal="true"
            aria-label={stackHeading ?? "Dishes at this location"}
            className="wm-stack-popup"
            style={{
              position: "absolute",
              zIndex: 30,
              ...clampPopupStyle(stackPopup.x, stackPopup.y),
            }}
          >
            <p className="wm-stack-popup__heading">{stackHeading}</p>
            <ul ref={popupListRef} className="wm-stack-popup__list">
              {stackPopup.dishes
                .slice()
                .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
                .map((d) => (
                  <li key={d.slug}>
                    <a
                      href={`/dishes/${d.slug}/`}
                      className="wm-stack-popup__link"
                    >
                      <span className="wm-stack-popup__name">
                        {d.canonicalName}
                      </span>
                      {d.region?.name && (
                        <span className="wm-stack-popup__region">
                          {d.region.name}
                        </span>
                      )}
                    </a>
                  </li>
                ))}
            </ul>
            <p className="wm-stack-popup__hint">Esc to close</p>
          </div>
        )}

        <noscript>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Enable JavaScript to see the interactive globe of dish origins.
          </p>
        </noscript>
      </div>
      <p className="text-sm text-slate-500" data-testid="worldmap-count">
        Showing {effectiveDishes.length} dish
        {effectiveDishes.length === 1 ? "" : "es"} with origin coordinates.
        <a
          href="/dishes"
          className="ml-2 font-medium text-emerald-700 hover:text-emerald-800"
        >
          View as list →
        </a>
      </p>
    </>
  );
}

function TooltipBody({ dishes }: { dishes: MapDish[] }) {
  if (dishes.length === 1) {
    const d = dishes[0];
    if (!d) return null;
    return (
      <>
        <div className="wm-tooltip__name">{d.canonicalName}</div>
        {d.region?.name && (
          <div className="wm-tooltip__region">{d.region.name}</div>
        )}
        {d.shortDescription && (
          <div className="wm-tooltip__desc">
            {truncateOnWord(d.shortDescription, 90)}
          </div>
        )}
      </>
    );
  }

  const region = dishes[0]?.region?.name ?? "This location";
  const names = dishes.slice(0, 3).map((d) => d.canonicalName);
  const more = dishes.length > 3 ? "…" : "";
  return (
    <div className="wm-tooltip__name">
      {region} — {dishes.length} dishes: {names.join(", ")}
      {more}
    </div>
  );
}

function truncateOnWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const i = cut.lastIndexOf(" ");
  const base = (i > Math.floor(max * 0.45) ? cut.slice(0, i) : cut).replace(
    /\s+$/,
    "",
  );
  return `${base}…`;
}

/** Keep the stack popup inside the map frame on narrow viewports. */
function clampPopupStyle(
  x: number,
  y: number,
): { left: string; top: string; transform: string; maxWidth: string } {
  return {
    left: `clamp(8px, ${x}px, calc(100% - 8px))`,
    top: `clamp(8px, ${y}px, calc(100% - 8px))`,
    transform: "translate(-50%, calc(-100% - 12px))",
    maxWidth: "min(300px, calc(100% - 16px))",
  };
}

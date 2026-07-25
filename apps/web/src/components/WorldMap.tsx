// Type-only import for the bits we use in render and effect closures.
// This is erased at build time — no runtime cost.
import type {
  GeoJSONSource,
  MapMouseEvent,
  Map as MlMap,
  PointLike,
  StyleSpecification,
} from "maplibre-gl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
// IMPORTANT: maplibre-gl is dynamically imported inside the effect, not
// statically imported at the top. Static imports execute at module-eval
// time, which means even a `client:only` island would try to evaluate
// this module's transitive imports (including WebGL helpers) before any
// client code runs. Dynamic import keeps the initial module payload tiny
// and lets us defer the WebGL dependency until the user actually sees
// the map.
import { getMapDishes, type MapDish } from "../lib/api";

export interface WorldMapProps {
  dishes: MapDish[];
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

export function WorldMap({ dishes }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupListRef = useRef<HTMLUListElement | null>(null);
  const stackPopupRef = useRef<HTMLDivElement | null>(null);
  const popupId = useId();
  const [view, setView] = useState<View>("globe");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [stackPopup, setStackPopup] = useState<StackPopupState | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [effectiveDishes, setEffectiveDishes] = useState<MapDish[]>(dishes);
  const [isLoading, setIsLoading] = useState<boolean>(dishes.length === 0);

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
        const NavigationControl =
          mod.NavigationControl ?? maplibregl.NavigationControl;
        const ScaleControl = mod.ScaleControl ?? maplibregl.ScaleControl;

        const style: StyleSpecification = {
          version: 8,
          glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          sources: {
            "carto-positron": {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            },
          },
          layers: [
            {
              id: "carto-positron-layer",
              type: "raster",
              source: "carto-positron",
            },
          ],
        };

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

        try {
          mapInstance.setProjection({ type: "globe" });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[WorldMap] globe projection unavailable:", err);
          setView("flat");
        }

        mapInstance.on("style.load", () => {
          try {
            mapInstance.setSky({
              "sky-color": "#1992ff",
              "sky-horizon-blend": 0.7,
              "horizon-fog-blend": 0.7,
              "fog-color": "#e8e8e8",
              "fog-ground-blend": 0.5,
              "space-color": "#000000",
              "star-intensity": 0.6,
            } as Parameters<MlMap["setSky"]>[0]);
          } catch {
            // Sky is optional; ignore if the style rejects it.
          }
        });

        mapRef.current = mapInstance;

        const coincidentByCoord = countCoincident(effectiveDishes);
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
            const bySlug = new Map<string, MapDish>();
            for (const f of features) {
              if (f.properties?.point_count) continue;
              const slug = f.properties?.slug as string | undefined;
              if (!slug || bySlug.has(slug)) continue;
              const dish = effectiveDishes.find((d) => d.slug === slug);
              if (dish) bySlug.set(slug, dish);
            }
            const hit = [...bySlug.values()];
            if (hit.length === 0) return hit;
            const sample = hit[0];
            if (!sample) return hit;
            const key = coordKey(sample.lat, sample.lng);
            const stack = effectiveDishes.filter(
              (d) => coordKey(d.lat, d.lng) === key,
            );
            return stack.length > 1 ? stack : hit;
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
                  const leafDishes: MapDish[] = [];
                  for (const leaf of leaves) {
                    const slug = leaf.properties?.slug as string | undefined;
                    if (!slug) continue;
                    const dish = effectiveDishes.find((d) => d.slug === slug);
                    if (dish) leafDishes.push(dish);
                  }
                  if (leafDishes.length > 1) {
                    const sample = leafDishes[0];
                    if (sample) {
                      const key0 = coordKey(sample.lat, sample.lng);
                      const allSame = leafDishes.every(
                        (d) => coordKey(d.lat, d.lng) === key0,
                      );
                      if (allSame && leafDishes.length === leaves.length) {
                        setTooltip(null);
                        setStackPopup({
                          x: e.point.x,
                          y: e.point.y,
                          dishes: leafDishes,
                        });
                        return;
                      }
                    }
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

  const stackHeading =
    stackPopup &&
    `${stackPopup.dishes.length} dish${stackPopup.dishes.length === 1 ? "" : "es"} at this location`;

  return (
    <>
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

function coordKey(lat: number, lng: number): string {
  // Match exact shared centroids as stored (API returns ~4 decimal places).
  return `${lng.toFixed(4)},${lat.toFixed(4)}`;
}

function countCoincident(dishes: MapDish[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dishes) {
    const k = coordKey(d.lat, d.lng);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
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

// IMPORTANT: maplibre-gl is dynamically imported inside the effect, NOT
// statically imported at the top. A static import executes at module-eval
// time, which means the component would try to evaluate MapLibre's WebGL
// helpers during Astro SSR and crash the build / blank the island. The
// dynamic import keeps the initial payload tiny and defers the WebGL
// dependency until the user actually sees the map. This mirrors the
// pattern already used by <WorldMap> and <DishMap>.
//
// Type-only imports below are erased at build time — no runtime cost, no
// module evaluation.
import type {
  GeoJSONSource,
  MapMouseEvent,
  Map as MlMap,
  PointLike,
  StyleSpecification,
} from "maplibre-gl";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MapDish } from "../../lib/api";
import { getMapDishes, listAllDishes } from "../../lib/api";
import { authoringHref } from "../../lib/domain";
import {
  allShareSameCoordKey,
  coordKey,
  countCoincidentByCoord,
  dedupeDishesBySlug,
  expandToCoincidentStack,
  parseCoord,
} from "../../lib/mapCoincident";
import type { DishSummary } from "../../types/dish";
import type { FoodRegionFeature } from "../../types/map";

type ViewMode = "atlas" | "index" | "gallery" | "feed";
type SortKey = "name" | "origin" | "family";

/**
 * One unified record per dish, merged from two API endpoints:
 *  - GET /api/dishes      → name, origin country, dish-type family, description
 *  - GET /api/dishes/map  → lat/lng + region (only dishes that have coords)
 *
 * Every view (Atlas map + sidebar, Index, Gallery, Feed) and the filter
 * controls all read from this single shape, so the map markers and the
 * lists always follow the exact same filtered dataset.
 */
interface AtlasDish {
  slug: string;
  name: string;
  /** Origin country/place. '' when unknown. */
  country: string;
  /** Primary dish-type category ("Noodle soup", "Stew"…). '' when unknown. */
  family: string;
  description: string;
  lat: number | null;
  lng: number | null;
  /** True when the dish has usable origin coordinates. */
  hasLocation: boolean;
}

function mergeDishes(list: DishSummary[], map: MapDish[]): AtlasDish[] {
  const mapBySlug = new Map(map.map((m) => [m.slug, m]));
  return list.map((d) => {
    const m = mapBySlug.get(d.slug);
    // parseCoord treats 0 as valid; strings from JSON are coerced.
    const lat = parseCoord(m?.lat);
    const lng = parseCoord(m?.lng);
    return {
      slug: d.slug,
      name: d.canonicalName,
      country: d.originName ?? m?.region?.name ?? "",
      family: d.familyName ?? "",
      description: d.shortDescription ?? "",
      lat,
      lng,
      hasLocation: lat !== null && lng !== null,
    };
  });
}

// Cheap synchronous WebGL probe — the same guard used by <WorldMap> /
// <DishMap>. If the browser can't get a WebGL context we never fetch the
// ~1MB maplibre-gl bundle; we render the sidebar list as the fallback.
function detectWebGL(): boolean {
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
}

// Carto positron-voyager raster basemap — same look as the standalone
// /map page and the per-dish mini-map. Free, no API key, OSM-derived.
const MAP_STYLE: StyleSpecification = {
  version: 8,
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

/** Keep clusters through city zooms (same rationale as WorldMap). */
const ATLAS_CLUSTER_MAX_ZOOM = 11;

const ATLAS_HIT_LAYERS = [
  "atlas-dot",
  "atlas-halo",
  "atlas-clusters",
  "atlas-coincident-count",
] as const;

function toFeatureCollection(dishes: AtlasDish[]): GeoJSON.FeatureCollection {
  const located = dishes.filter(
    (d): d is AtlasDish & { lat: number; lng: number } =>
      d.lat !== null && d.lng !== null,
  );
  const coincidentByCoord = countCoincidentByCoord(located);
  return {
    type: "FeatureCollection",
    features: located.map((d) => {
      const key = coordKey(d.lat, d.lng);
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [d.lng, d.lat],
        },
        properties: {
          slug: d.slug,
          name: d.name,
          country: d.country,
          family: d.family,
          coincidentCount: coincidentByCoord.get(key) ?? 1,
        },
      };
    }),
  };
}

function clampAtlasPopupStyle(
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

// Source/layer IDs we add on top of the basemap. Pulled out so cleanup
// paths can find them without re-implementing the lookup.
const REGION_SOURCE_ID = "food-regions";
const REGION_FILL_LAYER_ID = "food-regions-fill";

// ─── Atlas view ─────────────────────────────────────────────────────────────

interface AtlasViewProps {
  dishes: AtlasDish[];
  showRegions: boolean;
}

function AtlasView({ dishes, showRegions }: AtlasViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const plottedRef = useRef<AtlasDish[]>([]);
  const stackPopupRef = useRef<HTMLDivElement | null>(null);
  const popupListRef = useRef<HTMLUListElement | null>(null);
  const popupId = useId();
  // True once the GeoJSON source/layers exist — gates marker updates.
  const [styleLoaded, setStyleLoaded] = useState(false);
  // True once the dynamic import resolves (hides the loading hint).
  const [mapReady, setMapReady] = useState(false);
  // Set when the map can't render at all (no WebGL, init failure, bundle
  // load failure). Triggers the list-only fallback instead of a blank box.
  const [mapError, setMapError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [stackPopup, setStackPopup] = useState<{
    x: number;
    y: number;
    dishes: AtlasDish[];
  } | null>(null);

  // Dishes with usable coordinates — the only ones that can be plotted.
  const plotted = useMemo(() => dishes.filter((d) => d.hasLocation), [dishes]);
  plottedRef.current = plotted;

  // Sidebar: every filtered dish grouped by origin country (not just the
  // plotted ones — the list is useful even without coords).
  const byRegion = useMemo(() => {
    const groups = new Map<string, AtlasDish[]>();
    for (const d of dishes) {
      const key = d.country || "Unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([region, items]) => ({
        region,
        items: items.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [dishes]);

  // Initialise the map once on mount. Marker data is pushed separately by
  // the effect below whenever the filtered set changes.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;

    if (!detectWebGL()) {
      // eslint-disable-next-line no-console
      console.warn("[GustaleHome] WebGL unavailable — showing list fallback");
      setMapError(
        "Your browser does not support WebGL, which is required for the interactive map. Browse the list of dishes instead.",
      );
      setMapReady(true);
      return;
    }

    void import("maplibre-gl")
      .then((mod) => {
        if (cancelled) return;
        const maplibregl = mod.default ?? mod;

        const accent =
          (typeof document !== "undefined" &&
            getComputedStyle(document.documentElement)
              .getPropertyValue("--accent")
              .trim()) ||
          "#B8552F";

        try {
          map = new maplibregl.Map({
            container: containerRef.current!,
            style: MAP_STYLE,
            center: [20, 20],
            zoom: 1.4,
            minZoom: 0.5,
            maxZoom: 16,
            attributionControl: { compact: true },
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[GustaleHome] MapLibre init failed:", err);
          setMapError(
            "The interactive map could not be initialised in this browser. Browse the list of dishes instead.",
          );
          setMapReady(true);
          return;
        }

        const mapInstance = map;

        mapInstance.on("error", (e: { error?: Error }) => {
          // eslint-disable-next-line no-console
          console.warn("[GustaleHome] MapLibre error:", e?.error?.message ?? e);
        });

        mapInstance.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right",
        );

        mapRef.current = mapInstance;
        setMapReady(true);

        mapInstance.on("load", () => {
          if (cancelled) return;

          mapInstance.addSource("atlas", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            cluster: true,
            clusterRadius: 34,
            clusterMaxZoom: ATLAS_CLUSTER_MAX_ZOOM,
            generateId: true,
          });

          // Soft halo behind each individual dot (scales with stack size).
          mapInstance.addLayer({
            id: "atlas-halo",
            type: "circle",
            source: "atlas",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "coincidentCount"],
                1,
                11,
                4,
                14,
                8,
                18,
              ],
              "circle-color": accent,
              "circle-opacity": 0.2,
            },
          });

          // Solid dot.
          mapInstance.addLayer({
            id: "atlas-dot",
            type: "circle",
            source: "atlas",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["get", "coincidentCount"],
                1,
                5.5,
                4,
                7,
                8,
                9,
              ],
              "circle-color": accent,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });

          // Count label on coincident (unclustered) points.
          mapInstance.addLayer({
            id: "atlas-coincident-count",
            type: "symbol",
            source: "atlas",
            filter: [
              "all",
              ["!", ["has", "point_count"]],
              [">", ["get", "coincidentCount"], 1],
            ],
            layout: {
              "text-field": ["to-string", ["get", "coincidentCount"]],
              "text-size": 10,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: { "text-color": "#ffffff" },
          });

          // Cluster bubbles + counts.
          mapInstance.addLayer({
            id: "atlas-clusters",
            type: "circle",
            source: "atlas",
            filter: ["has", "point_count"],
            paint: {
              "circle-radius": [
                "step",
                ["get", "point_count"],
                15,
                10,
                20,
                25,
                26,
              ],
              "circle-color": accent,
              "circle-opacity": 0.85,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          mapInstance.addLayer({
            id: "atlas-cluster-count",
            type: "symbol",
            source: "atlas",
            filter: ["has", "point_count"],
            layout: {
              "text-field": "{point_count_abbreviated}",
              "text-size": 12,
            },
            paint: { "text-color": "#ffffff" },
          });

          const hitFeatures = (point: PointLike) => {
            const existing = ATLAS_HIT_LAYERS.filter((id) =>
              mapInstance.getLayer(id),
            );
            if (existing.length === 0) return [];
            return mapInstance.queryRenderedFeatures(point, {
              layers: [...existing],
            });
          };

          const dishesFromFeatures = (
            features: Array<{ properties?: Record<string, unknown> | null }>,
          ): AtlasDish[] => {
            const current = plottedRef.current;
            const located = current.filter(
              (d): d is AtlasDish & { lat: number; lng: number } =>
                d.lat !== null && d.lng !== null,
            );
            const hit: Array<AtlasDish & { lat: number; lng: number }> = [];
            for (const f of features) {
              if (f.properties?.point_count) continue;
              const slug = f.properties?.slug as string | undefined;
              if (!slug) continue;
              const dish = located.find((d) => d.slug === slug);
              if (dish) hit.push(dish);
            }
            return expandToCoincidentStack(hit, located);
          };

          const openDish = (slug: string): void => {
            window.location.href = `/dishes/${slug}`;
          };

          const onMapClick = (e: MapMouseEvent): void => {
            const features = hitFeatures(e.point);
            if (features.length === 0) {
              setStackPopup(null);
              return;
            }

            const cluster = features.find((f) => f.properties?.cluster);
            if (cluster?.properties?.cluster) {
              const clusterId = cluster.properties.cluster_id as number;
              const src = mapInstance.getSource("atlas") as GeoJSONSource;
              src
                .getClusterLeaves(clusterId, 80, 0)
                .then((leaves) => {
                  const current = plottedRef.current;
                  const leafDishes = dedupeDishesBySlug(
                    leaves.flatMap((leaf) => {
                      const slug = leaf.properties?.slug as string | undefined;
                      if (!slug) return [];
                      const dish = current.find((d) => d.slug === slug);
                      return dish ? [dish] : [];
                    }),
                  );
                  const locatedLeaves = leafDishes.filter(
                    (d): d is AtlasDish & { lat: number; lng: number } =>
                      d.lat !== null && d.lng !== null,
                  );
                  // Pure coincident cluster: zooming never separates markers.
                  if (
                    locatedLeaves.length > 1 &&
                    locatedLeaves.length === leafDishes.length &&
                    allShareSameCoordKey(locatedLeaves)
                  ) {
                    setStackPopup({
                      x: e.point.x,
                      y: e.point.y,
                      dishes: locatedLeaves,
                    });
                    return;
                  }
                  return src.getClusterExpansionZoom(clusterId).then((zoom) => {
                    const coords = (cluster.geometry as GeoJSON.Point)
                      .coordinates as [number, number];
                    mapInstance.easeTo({
                      center: coords,
                      zoom,
                      duration: 500,
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
              if (only?.slug) openDish(only.slug);
              return;
            }
            setStackPopup({
              x: e.point.x,
              y: e.point.y,
              dishes: hitDishes,
            });
          };

          mapInstance.on("click", onMapClick);
          mapInstance.on("movestart", () => setStackPopup(null));
          for (const layer of ATLAS_HIT_LAYERS) {
            mapInstance.on("mouseenter", layer, () => {
              mapInstance.getCanvas().style.cursor = "pointer";
            });
            mapInstance.on("mouseleave", layer, () => {
              mapInstance.getCanvas().style.cursor = "";
            });
          }

          // Promote the basemap to a 3D globe. setProjection() is the
          // MapLibre 5.x entry point — the constructor's `projection`
          // option isn't in the public types yet. Mirrors the pattern
          // already used by <WorldMap>.
          mapInstance.setProjection({ type: "globe" });
          // Atmospheric horizon glow. MapLibre 5.x replaced `setFog` with
          // `setSky`; the spec usesky-color / sky-horizon-blend / etc.
          // Bound on `style.load` (not `load`) so the paint properties
          // resolve against the loaded style. Errors are swallowed —
          // a globe without sky still works.
          try {
            mapInstance.on("style.load", () => {
              if (cancelled) return;
              try {
                mapInstance.setSky({
                  "sky-color": "#1992ff",
                  "sky-horizon-blend": 0.7,
                  "horizon-color": "#dde7e8",
                  "horizon-fog-blend": 0.8,
                  "fog-color": "#e8e0d6",
                  "fog-ground-blend": 0.6,
                  "atmosphere-blend": 0.9,
                } as Parameters<MlMap["setSky"]>[0]);
              } catch {
                // Atmosphere is decorative; absent sky is fine.
              }
            });
          } catch {
            // Atmosphere is decorative; absent sky is fine.
          }

          // Region overlay: load the sample Food Regions GeoJSON
          // fail-soft. If the fetch fails or the geometry is empty, the
          // map still works — we just never set the toggle to "on" by
          // default (the user can re-enable it).
          (async () => {
            try {
              const res = await fetch(
                "/data/regions/sample-food-regions.geojson",
              );
              if (!res.ok) throw new Error(`region fetch ${res.status}`);
              const data = (await res.json()) as GeoJSON.FeatureCollection<
                GeoJSON.Polygon | GeoJSON.MultiPolygon
              >;
              if (!data?.features?.length) return;
              // Validate against the canonical FoodRegionFeature type. We
              // only render polygons (the SchemaGIS workflow produces
              // these). Anything else is dropped silently.
              const features = (data.features as FoodRegionFeature[]).filter(
                (f): f is FoodRegionFeature =>
                  f.geometry?.type === "Polygon" ||
                  f.geometry?.type === "MultiPolygon",
              );
              if (!features.length) {
                setStyleLoaded(true);
                return;
              }
              const typed: GeoJSON.FeatureCollection<
                GeoJSON.Polygon | GeoJSON.MultiPolygon
              > = {
                type: "FeatureCollection",
                features,
              };
              mapInstance.addSource(REGION_SOURCE_ID, {
                type: "geojson",
                data: typed,
              });
              mapInstance.addLayer({
                id: REGION_FILL_LAYER_ID,
                type: "fill",
                source: REGION_SOURCE_ID,
                paint: {
                  "fill-color": accent,
                  "fill-opacity": 0.18,
                  "fill-outline-color": accent,
                },
                layout: {
                  visibility: showRegions ? "visible" : "none",
                },
              });
              setStyleLoaded(true);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn("[GustaleHome] region overlay skipped:", err);
              setStyleLoaded(true);
            }
          })();
        });
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("[GustaleHome] failed to load maplibre-gl", err);
        if (cancelled) return;
        setMapError(
          "The interactive map could not be loaded. Browse the list of dishes instead.",
        );
        setMapReady(true);
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      setStyleLoaded(false);
    };
    // showRegions participates in *layer* visibility only, not in the
    // map instance itself, so intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the current (filtered) dish set onto the map whenever it changes,
  // so the markers always match the lists/sidebar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const src = map.getSource("atlas") as GeoJSONSource | undefined;
    if (src) src.setData(toFeatureCollection(plotted));
  }, [plotted, styleLoaded]);

  // Toggle the region overlay layer's visibility when the user flips the
  // filter switch. No re-fetch, no re-add — we just flip the layout flag.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer(REGION_FILL_LAYER_ID)) return;
    map.setLayoutProperty(
      REGION_FILL_LAYER_ID,
      "visibility",
      showRegions ? "visible" : "none",
    );
  }, [showRegions]);

  // Close disambiguation popup on Escape / outside click.
  useEffect(() => {
    if (!stackPopup) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") setStackPopup(null);
    };
    const onPointer = (ev: MouseEvent): void => {
      const root = stackPopupRef.current;
      if (root && !root.contains(ev.target as Node)) {
        setStackPopup(null);
      }
    };
    document.addEventListener("keydown", onKey);
    // Defer so the opening click does not immediately dismiss.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointer);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [stackPopup]);

  useEffect(() => {
    if (!stackPopup) return;
    const first = popupListRef.current?.querySelector("a");
    first?.focus();
  }, [stackPopup]);

  const stackHeading =
    stackPopup &&
    `${stackPopup.dishes.length} dish${stackPopup.dishes.length === 1 ? "" : "es"} at this location`;

  return (
    <div className="atl-grid">
      <div className="atl-map">
        <div className="atl-mapbox">
          <div
            ref={containerRef}
            style={{
              width: "100%",
              height: "100%",
              display: mapError ? "none" : "block",
            }}
            aria-label="Interactive map of dish origins"
          />
          {!mapReady && !mapError && (
            <div className="atl-mapmsg">Loading map…</div>
          )}
          {mapError && (
            <div className="atl-mapmsg atl-mapmsg--err">{mapError}</div>
          )}
          {stackPopup && (
            <div
              ref={stackPopupRef}
              className="wm-stack-popup atl-stack-popup"
              role="dialog"
              aria-modal="true"
              aria-labelledby={popupId}
              style={{
                position: "absolute",
                zIndex: 2,
                ...clampAtlasPopupStyle(stackPopup.x, stackPopup.y),
              }}
            >
              <div className="wm-stack-popup__header">
                <p id={popupId} className="wm-stack-popup__heading">
                  {stackHeading}
                </p>
                <button
                  type="button"
                  className="wm-stack-popup__close"
                  aria-label="Close dish list"
                  onClick={() => setStackPopup(null)}
                >
                  Close
                </button>
              </div>
              <ul ref={popupListRef} className="wm-stack-popup__list">
                {stackPopup.dishes
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((d) => (
                    <li key={d.slug}>
                      <a
                        href={`/dishes/${d.slug}`}
                        className="wm-stack-popup__link"
                      >
                        <span className="wm-stack-popup__name">{d.name}</span>
                        {(d.family || d.country) && (
                          <span className="wm-stack-popup__region">
                            {[d.family, d.country].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
              </ul>
              <p className="wm-stack-popup__hint">Esc to close</p>
            </div>
          )}
        </div>
        <div className="atl-maplabel">
          <span>{plotted.length} dishes plotted</span>
          <span>© OpenStreetMap · CARTO</span>
        </div>
      </div>
      <div className="atl-list">
        {byRegion.map(({ region, items }) => (
          <div key={region}>
            <div className="atl-region-h">
              {region} — {items.length}
            </div>
            {items.map((d) => (
              <a
                key={d.slug}
                href={`/dishes/${d.slug}`}
                className="atl-item"
                data-active={active === d.slug ? "1" : "0"}
                onMouseEnter={() => setActive(d.slug)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="nm">{d.name}</span>
                <span className="co">{d.family}</span>
                <span className="cd">{region}</span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Index view ─────────────────────────────────────────────────────────────

function IndexView({ dishes }: { dishes: AtlasDish[] }) {
  const [sort, setSort] = useState<SortKey>("name");

  const sorted = useMemo(() => {
    return [...dishes].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "origin") return a.country.localeCompare(b.country);
      if (sort === "family") return a.family.localeCompare(b.family);
      return 0;
    });
  }, [dishes, sort]);

  return (
    <div className="idx-wrap">
      <div className="idx-head">
        <span onClick={() => setSort("name")}>
          Name {sort === "name" ? "↑" : ""}
        </span>
        <span onClick={() => setSort("origin")}>
          Origin {sort === "origin" ? "↑" : ""}
        </span>
        <span onClick={() => setSort("family")}>
          Family {sort === "family" ? "↑" : ""}
        </span>
        <span>Description</span>
      </div>
      {sorted.map((d) => (
        <a key={d.slug} href={`/dishes/${d.slug}`} className="idx-row">
          <span className="name">{d.name}</span>
          <span className="org">{d.country || "—"}</span>
          <span className="idx-tag">{d.family || "—"}</span>
          <span style={{ color: "var(--sub)", fontSize: "14px" }}>
            {d.description}
          </span>
        </a>
      ))}
    </div>
  );
}

// ─── Gallery view ────────────────────────────────────────────────────────────

function GalleryView({ dishes }: { dishes: AtlasDish[] }) {
  return (
    <div className="gal">
      {dishes.map((d) => (
        <a key={d.slug} href={`/dishes/${d.slug}`} className="gal-card">
          <div
            className="ph"
            style={{
              background: "var(--accent-soft)",
              height: "180px",
              borderRadius: "6px",
            }}
          />
          <h3>{d.name}</h3>
          <div className="place">{d.country || "—"}</div>
          <p className="note-long">{d.description}</p>
        </a>
      ))}
    </div>
  );
}

// ─── Feed view ──────────────────────────────────────────────────────────────

function FeedView({ dishes }: { dishes: AtlasDish[] }) {
  return (
    <div className="feed">
      {dishes.map((d, i) => (
        <a
          key={d.slug}
          href={`/dishes/${d.slug}`}
          className="feed-card"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div
            className="feed-img"
            style={{
              background: `hsl(${30 + i * 7}, 40%, 82%)`,
              minHeight: "280px",
              display: "block",
            }}
          />
          <div className="feed-txt">
            <div className="place">{d.country || "—"}</div>
            <h3>{d.name}</h3>
            <p>{d.description}</p>
            <div className="feed-meta">
              <span>
                Family <b>{d.family || "—"}</b>
              </span>
              <span>
                Origin <b>{d.country || "—"}</b>
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Main island ─────────────────────────────────────────────────────────────

export default function GustaleHomeIsland() {
  const [view, setView] = useState<ViewMode>("atlas");
  const [dishes, setDishes] = useState<AtlasDish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [family, setFamily] = useState("");
  const [exactOnly, setExactOnly] = useState(false);
  // Globe-only: show the cultural/regional polygon overlay. The layer
  // exists once the map style loads; flipping this just toggles the
  // layer's visibility, no re-fetch.
  const [showRegions, setShowRegions] = useState(false);

  // Load the full dataset once on hydration, merging the list + map
  // endpoints. A map-endpoint failure must NOT blank the homepage — we
  // fall back to the list data with no coordinates. Only a list-endpoint
  // failure surfaces an error (and even then the hero still renders).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      listAllDishes({ status: "published" }),
      getMapDishes({ limit: 2000 }),
    ])
      .then(([listRes, mapRes]) => {
        if (cancelled) return;
        if (listRes.status === "fulfilled") {
          const mapDishes =
            mapRes.status === "fulfilled" ? mapRes.value.dishes : [];
          setDishes(mergeDishes(listRes.value.dishes, mapDishes));
        } else {
          // eslint-disable-next-line no-console
          console.warn("[GustaleHome] dish list fetch failed:", listRes.reason);
          setError(
            listRes.reason instanceof Error
              ? listRes.reason.message
              : "Failed to load dishes",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dropdown options derived from the loaded data (not hardcoded).
  const countryOptions = useMemo(
    () =>
      Array.from(new Set(dishes.map((d) => d.country).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [dishes],
  );
  const familyOptions = useMemo(
    () =>
      Array.from(new Set(dishes.map((d) => d.family).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [dishes],
  );

  // The single filtered dataset every view + the map reads from.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes.filter((d) => {
      if (country && d.country !== country) return false;
      if (family && d.family !== family) return false;
      if (exactOnly && !d.hasLocation) return false;
      if (q) {
        const hay =
          `${d.name} ${d.country} ${d.family} ${d.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dishes, search, country, family, exactOnly]);

  const hasActiveFilters = Boolean(search || country || family || exactOnly);
  const resetFilters = useCallback(() => {
    setSearch("");
    setCountry("");
    setFamily("");
    setExactOnly(false);
  }, []);

  const total = dishes.length;
  const shown = filtered.length;
  const plottedCount = useMemo(
    () => dishes.filter((d) => d.hasLocation).length,
    [dishes],
  );

  return (
    <main className="gst">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="gst-hero wrap">
        <div className="hero-content">
          <p className="kicker">Browse the atlas · {total} dishes</p>
          <h1 className="hero-h1">
            Browse the atlas
            <br />
            <em>your way.</em>
          </h1>
          <p className="hero-lede">
            Every dish has a country, but first it has a form. Explore Gustale
            by map, by name, by family, or by story.
          </p>
          <div className="hero-search">
            <input
              type="search"
              placeholder="Search dishes — ramen, Japan, stew…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search dishes"
            />
            <button aria-label="Search">⌕</button>
          </div>
          <div className="hero-meta">
            <div>
              <b>{total}</b> dishes
            </div>
            <div>
              <b>{familyOptions.length}</b> families
            </div>
            <div>
              <b>{countryOptions.length}</b> origins
            </div>
          </div>
        </div>
        <div className="hero-frame">
          <div
            className="ph"
            style={{
              background:
                "repeating-conic-gradient(var(--accent-soft) 0% 25%, var(--card) 0% 50%) 0 0 / 40px 40px",
              borderRadius: "9px",
              height: "280px",
            }}
          />
          <div className="hero-coord">
            <span>0°N 0°E</span>
            <span>{plottedCount} dishes plotted</span>
          </div>
        </div>
      </section>

      {/* ── Workspace ────────────────────────────────────────────── */}
      <section className="workspace wrap">
        <div className="ws-head">
          <div>
            <h2>Explore</h2>
            <p>
              {loading
                ? "Loading…"
                : `${shown} of ${total} dish${total !== 1 ? "es" : ""}`}
            </p>
          </div>
          <span className="ws-count">
            {view === "atlas"
              ? "Map"
              : view === "index"
                ? "Table"
                : view === "gallery"
                  ? "Cards"
                  : "Stories"}{" "}
            view
          </span>
        </div>

        {/* Filter bar — stacks above the views on mobile, sits inline on
            desktop. Options are generated from the loaded data. */}
        <div className="ws-filters">
          <input
            className="filt-search"
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search dishes"
          />
          <select
            className="filt-select"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by region or country"
          >
            <option value="">All regions</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="filt-select"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {familyOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <label className="filt-toggle">
            <input
              type="checkbox"
              checked={exactOnly}
              onChange={(e) => setExactOnly(e.target.checked)}
            />
            Only exact locations
          </label>
          <label className="filt-toggle">
            <input
              type="checkbox"
              checked={showRegions}
              onChange={(e) => setShowRegions(e.target.checked)}
            />
            Show food regions
          </label>
          <button
            className="filt-reset"
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
          >
            Reset
          </button>
          <span className="filt-count">
            Showing {shown} dish{shown === 1 ? "" : "es"}
          </span>
        </div>

        {/* Toolbar */}
        <div className="ws-toolbar">
          <span className="tb-label">View</span>
          <div className="seg">
            <button
              data-on={view === "atlas" ? "1" : "0"}
              onClick={() => setView("atlas")}
            >
              <svg
                className="ic"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="8" cy="8" r="6" />
                <path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6" />
              </svg>
              Atlas
            </button>
            <button
              data-on={view === "index" ? "1" : "0"}
              onClick={() => setView("index")}
            >
              <svg
                className="ic"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
              Index
            </button>
            <button
              data-on={view === "gallery" ? "1" : "0"}
              onClick={() => setView("gallery")}
            >
              <svg
                className="ic"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <rect x="9" y="9" width="5" height="5" rx="1" />
              </svg>
              Gallery
            </button>
            <button
              data-on={view === "feed" ? "1" : "0"}
              onClick={() => setView("feed")}
            >
              <svg
                className="ic"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M2 3h12v2H2zM2 7h8v2H2zM2 11h10v2H2z" />
              </svg>
              Feed
            </button>
          </div>
          <span className="tb-spacer" />
          {error && (
            <div className="alert alert-warning" style={{ margin: 0 }}>
              {error}
            </div>
          )}
        </div>

        {/* View panels */}
        {loading ? (
          <div
            style={{
              padding: "60px 0",
              textAlign: "center",
              color: "var(--sub)",
              fontFamily: "var(--mono)",
              fontSize: "14px",
            }}
          >
            Loading dishes…
          </div>
        ) : error ? (
          <div
            style={{
              padding: "60px 0",
              textAlign: "center",
              color: "var(--sub)",
            }}
          >
            Couldn't load dishes right now. Please try again in a moment.
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: "60px 0",
              textAlign: "center",
              color: "var(--sub)",
            }}
          >
            No dishes match your filters.
            {hasActiveFilters && (
              <>
                {" "}
                <button
                  type="button"
                  className="filt-reset"
                  style={{ marginLeft: 8 }}
                  onClick={resetFilters}
                >
                  Reset filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {view === "atlas" && (
              <AtlasView dishes={filtered} showRegions={showRegions} />
            )}
            {view === "index" && <IndexView dishes={filtered} />}
            {view === "gallery" && <GalleryView dishes={filtered} />}
            {view === "feed" && <FeedView dishes={filtered} />}
          </>
        )}
      </section>

      {/* ── CTA band ──────────────────────────────────────────────── */}
      <div className="wrap" style={{ paddingBottom: "80px" }}>
        <div className="band">
          <div>
            <h2>
              Know a dish
              <br />
              we don't?
            </h2>
            <p>
              Gustale is built by people who cook, eat, and document. Every dish
              you add makes the atlas richer.
            </p>
          </div>
          <div className="band-cta">
            <button
              onClick={() => {
                window.location.href = authoringHref("/dishes/new");
              }}
            >
              Add a dish →
            </button>
            <small>Free forever. No account required to browse.</small>
          </div>
        </div>
      </div>
    </main>
  );
}

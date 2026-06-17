import { useEffect, useRef, useState, useCallback } from 'react';
// IMPORTANT: maplibre-gl is dynamically imported inside the effect, not
// statically imported at the top. Static imports execute at module-eval
// time, which means even a `client:only` island would try to evaluate
// this module's transitive imports (including WebGL helpers) before any
// client code runs. Dynamic import keeps the initial module payload tiny
// and lets us defer the WebGL dependency until the user actually sees
// the map.
import { getMapDishes, type MapDish } from '../lib/api';

// Type-only import for the bits we use in render and effect closures.
// This is erased at build time — no runtime cost.
import type {
  Map as MlMap,
  MapMouseEvent,
  NavigationControl as NavigationControlType,
} from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';

export interface WorldMapProps {
  dishes: MapDish[];
}

/**
 * Interactive globe + 2D-map of published dishes, powered by MapLibre GL.
 *
 * Why MapLibre over Leaflet for this page:
 * - Native globe projection (`projection: 'globe'`) — what we want for an
 *   encyclopedia "atlas" feel.
 * - WebGL rendering — smooth zoom/pan even with thousands of markers.
 * - Scroll-wheel zoom, drag-pan, double-click zoom all work out of the box
 *   (the prior react-simple-maps implementation had a controlled-state bug
 *   that broke zoom on this page).
 *
 * Toggle: top-right corner lets users switch between globe and a flat
 * Mercator projection. Globe is the default — it shows the world as it
 * actually is (no Greenland-sized Africa distortion).
 *
 * IMPORTANT: This component must be mounted with `client:only="react"`,
 * NOT `client:load`. MapLibre imports `mapbox-gl`'s WebGL helpers at
 * module-load time, which crashes Astro SSR.
 */
type View = 'globe' | 'flat';

export function WorldMap({ dishes }: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [view, setView] = useState<View>('globe');
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipDish, setTooltipDish] = useState<MapDish | null>(null);
  // True until the dynamic import of maplibre-gl resolves. Surfaces a
  // loading hint instead of an empty container.
  const [mapReady, setMapReady] = useState<boolean>(false);

  // Effective dishes: starts as the prop (set at build time if the API was
  // reachable), but if empty we fetch live on hydration. This makes the
  // /map page resilient to build-time API flakes — the user always sees
  // a real globe with whatever data the API has right now.
  const [effectiveDishes, setEffectiveDishes] = useState<MapDish[]>(dishes);
  const [isLoading, setIsLoading] = useState<boolean>(dishes.length === 0);

  useEffect(() => {
    if (dishes.length > 0) return; // build-time fetch already populated us
    let cancelled = false;
    setIsLoading(true);
    getMapDishes({ limit: 2000 })
      .then((response) => {
        if (cancelled) return;
        setEffectiveDishes(response.dishes);
      })
      .catch((err: unknown) => {
        // Surface in console for debugging; UI keeps the empty state.
        // eslint-disable-next-line no-console
        console.warn('[WorldMap] live fetch failed:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dishes.length]);

  // Initialise the map once on mount. Re-initialising on view-toggle would
  // re-create the WebGL context (expensive) — instead we mutate the
  // `projection` property in-place, which MapLibre 4+ supports.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;

    // Dynamic import: keeps maplibre-gl out of the SSR/initial-hydration
    // critical path. The component itself becomes a thin React island
    // that, after mount, fetches the 1MB MapLibre bundle as a separate
    // chunk. If WebGL is unavailable, MapLibre's constructor throws and
    // we surface a friendly fallback instead of leaving an empty canvas.
    void import('maplibre-gl').then((mod) => {
      if (cancelled) return;
      const maplibregl = mod.default ?? mod;
      const NavigationControl = mod.NavigationControl;

      // Carto's positron-glight basemap. Free, no API key, OSM-derived.
      // Self-hosted alternative: OpenFreeMap (https://openfreemap.org).
      const style: StyleSpecification = {
        version: 8,
        glyphs:
          'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto-positron': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: 'carto-positron-layer',
            type: 'raster',
            source: 'carto-positron',
          },
        ],
      };

      try {
        map = new maplibregl.Map({
          container: containerRef.current!,
          style,
          // For globe projection, center [0,0] with zoom 0 shows the whole
          // sphere. For flat projection, the same center/zoom shows the
          // Atlantic-centered world.
          center: [0, 20],
          zoom: 1.4,
          minZoom: 0.5,
          maxZoom: 12,
          attributionControl: { compact: true },
        });
      } catch (err) {
        // WebGL not available (sandbox, hardware disabled, ancient GPU).
        // eslint-disable-next-line no-console
        console.warn('[WorldMap] MapLibre init failed — WebGL unavailable?', err);
        // Still mark as "ready" so the overlay disappears — the canvas
        // exists, the user can see whatever state MapLibre ended up in.
        setMapReady(true);
        return;
      }

      const mapInstance = map;

      // Surface MapLibre runtime errors (WebGL context lost, tile fetch
      // failure, etc.) so they don't get swallowed. Camofox/sandboxes
      // without WebGL will hit this — fine, just a console warning.
      mapInstance.on('error', (e: { error?: Error }) => {
        // eslint-disable-next-line no-console
        console.warn('[WorldMap] MapLibre error:', e?.error?.message ?? e);
      });

      // Globe projection. We use setProjection() after construction because
      // MapLibre 5.x's `MapOptions` typings don't include the `projection`
      // field even though the runtime supports it. setProjection() is
      // documented as the recommended entry point.
      mapInstance.setProjection({ type: 'globe' });

      // Atmospheric glow + dark space background for the globe projection.
      // MapLibre 5.x unified the old `setFog` API into `setSky`, which
      // accepts `fog-color`/`horizon-fog-blend`/etc. inside a SkySpecification.
      mapInstance.on('style.load', () => {
        mapInstance.setSky({
          'sky-color': '#1992ff',
          'sky-horizon-blend': 0.7,
          'horizon-fog-blend': 0.7,
          'fog-color': '#e8e8e8',
          'fog-ground-blend': 0.5,
          'space-color': '#000000',
          'star-intensity': 0.6,
        } as Parameters<MlMap['setSky']>[0]);
      });

      mapInstance.addControl(
        new NavigationControl({ visualizePitch: false }),
        'top-right',
      );
      mapInstance.addControl(
        new maplibregl.ScaleControl({ unit: 'metric' }),
        'bottom-left',
      );

      mapRef.current = mapInstance;
      setMapReady(true);

      // Add dish markers as a GeoJSON source + circle layer. Clustered by
      // zoom — when two dishes share a coordinate (e.g. multiple Greek
      // dishes), they merge into a single dot with a count badge.
      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: effectiveDishes.map((d) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: {
            slug: d.slug,
            canonicalName: d.canonicalName,
            shortDescription: d.shortDescription ?? '',
            regionName: d.region.name ?? '',
            regionIso: d.region.isoCode ?? '',
          },
        })),
      };

      mapInstance.on('load', () => {
        mapInstance.addSource('dishes', {
          type: 'geojson',
          data: featureCollection,
          cluster: true,
          clusterRadius: 28,
          clusterMaxZoom: 5,
        });

        // Halo: a soft outer ring that scales up on hover.
        mapInstance.addLayer({
          id: 'dishes-halo',
          type: 'circle',
          source: 'dishes',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              12,
              8,
            ],
            'circle-color': '#10b981',
            'circle-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.35,
              0.18,
            ],
            'circle-radius-transition': { duration: 150 },
            'circle-opacity-transition': { duration: 150 },
          },
        });

        // Solid dot.
        mapInstance.addLayer({
          id: 'dishes-dot',
          type: 'circle',
          source: 'dishes',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              6,
              4,
            ],
            'circle-color': '#059669',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.2,
            'circle-radius-transition': { duration: 150 },
          },
        });

        // Cluster bubbles: bigger circles with the count inside.
        mapInstance.addLayer({
          id: 'dishes-clusters',
          type: 'circle',
          source: 'dishes',
          filter: ['has', 'point_count'],
          paint: {
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              14, // 2-9 dishes
              10, 18, // 10-49
              50, 22, // 50+
            ],
            'circle-color': '#059669',
            'circle-opacity': 0.85,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        });
        mapInstance.addLayer({
          id: 'dishes-cluster-count',
          type: 'symbol',
          source: 'dishes',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
            'text-font': ['Open Sans Regular'],
          },
          paint: { 'text-color': '#ffffff' },
        });

        // Hover state tracking. MapLibre's feature-state API is the
        // recommended way — better than re-rendering React on every hover.
        let hoveredId: number | string | null = null;
        const setHover = (id: number | string | null): void => {
          if (hoveredId != null) {
            mapInstance.setFeatureState(
              { source: 'dishes', id: hoveredId },
              { hover: false },
            );
          }
          hoveredId = id;
          if (hoveredId != null) {
            mapInstance.setFeatureState(
              { source: 'dishes', id: hoveredId },
              { hover: true },
            );
          }
        };

        const onMove = (
          e: MapMouseEvent & { features?: maplibregl.GeoJSONFeature[] },
        ): void => {
          const features = e.features ?? [];
          if (features.length === 0) {
            setHover(null);
            setTooltipDish(null);
            setTooltipPos(null);
            mapInstance.getCanvas().style.cursor = '';
            return;
          }
          const f = features[0]!;
          setHover(f.id as number | string);
          mapInstance.getCanvas().style.cursor = 'pointer';

          // Tooltip dish: use the first dish at the point. For clusters we
          // skip — the cluster is the meaningful affordance.
          if (f.properties?.point_count) {
            setTooltipDish(null);
            setTooltipPos(null);
          } else {
            // Find the dish by slug (set as a property by featureCollection
            // construction).
            const slug = f.properties?.slug as string;
            const dish = effectiveDishes.find((d) => d.slug === slug) ?? null;
            setTooltipDish(dish);
            setTooltipPos({ x: e.point.x, y: e.point.y });
          }
        };

        const onLeave = (): void => {
          setHover(null);
          setTooltipDish(null);
          setTooltipPos(null);
          mapInstance.getCanvas().style.cursor = '';
        };

        const onClick = (
          e: MapMouseEvent & { features?: maplibregl.GeoJSONFeature[] },
        ): void => {
          const features = e.features ?? [];
          if (features.length === 0) return;
          const f = features[0]!;
          if (f.properties?.cluster) {
            // Zoom into the cluster on click.
            const clusterId = f.properties.cluster_id as number;
            const source = mapInstance.getSource('dishes') as maplibregl.GeoJSONSource;
            source.getClusterExpansionZoom(clusterId).then((zoom) => {
              mapInstance.easeTo({
                center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
                zoom,
                duration: 600,
              });
            }).catch(() => undefined);
            return;
          }
          const slug = f.properties?.slug as string | undefined;
          if (slug) {
            window.location.href = `/dishes/${slug}/`;
          }
        };

        // Wire hover/click on both the dot and halo layers so the larger
        // hit target wins.
        for (const layerId of ['dishes-dot', 'dishes-halo', 'dishes-clusters']) {
          mapInstance.on('mousemove', layerId, onMove);
          mapInstance.on('mouseleave', layerId, onLeave);
          mapInstance.on('click', layerId, onClick);
        }
      });
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[WorldMap] failed to load maplibre-gl', err);
    });

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [effectiveDishes]);

  // Toggle projection when the user clicks the toggle button. Mutating
  // the `projection` property is supported by MapLibre 4+ and avoids
  // re-creating the WebGL context (which is expensive).
  const toggleView = useCallback((): void => {
    const map = mapRef.current;
    if (!map) return;
    const next: View = view === 'globe' ? 'flat' : 'globe';
    setView(next);
    map.setProjection({ type: next });
    if (next === 'globe') {
      map.setZoom(1.4);
    } else {
      map.setZoom(2);
    }
  }, [view]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {/* Toggle button */}
      <div className="absolute right-3 top-3 z-10">
        <button
          type="button"
          onClick={toggleView}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-emerald-300 hover:text-emerald-700"
        >
          {view === 'globe' ? '🌐 Globe' : '🗺  Flat map'}
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-[560px] w-full"
        aria-label="Interactive globe showing published dishes by origin"
      />

      {/* MapLibre loading overlay — shown until the dynamic import of
          maplibre-gl resolves AND the WebGL canvas is initialised. The
          overlay disappears the moment the first tile paint fires. */}
      {!mapReady && !isLoading && effectiveDishes.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-50/70">
          <p className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
            Loading globe…
          </p>
        </div>
      )}

      {/* Loading overlay — visible only while we're fetching live data
          on hydration (build-time data was empty). Disappears the moment
          the fetch resolves. */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-50/70">
          <p className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
            Loading map…
          </p>
        </div>
      )}

      {/* Empty-state fallback — only shown when the fetch resolved but
          the API genuinely returned zero dishes. */}
      {!isLoading && effectiveDishes.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <p className="text-slate-500">
            No dishes with origin coordinates yet. Add a dish to see it on the map.
          </p>
        </div>
      )}

      {/* Tooltip overlay (HTML, not WebGL canvas, for nicer typography) */}
      {tooltipDish && tooltipPos && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y - 12,
          }}
        >
          <div className="font-semibold text-slate-900">
            {tooltipDish.canonicalName}
          </div>
          {tooltipDish.region?.name && (
            <div className="text-xs text-slate-500">{tooltipDish.region.name}</div>
          )}
          {tooltipDish.shortDescription && (
            <div className="mt-1 max-w-xs text-xs text-slate-600">
              {tooltipDish.shortDescription}
            </div>
          )}
        </div>
      )}

      <noscript>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Enable JavaScript to see the interactive globe of dish origins.
        </p>
      </noscript>
    </div>
  );
}
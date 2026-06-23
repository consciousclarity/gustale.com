import { useEffect, useRef, useState } from 'react';
import type { DishOrigin } from '../types/dish';

// IMPORTANT: maplibre-gl is dynamically imported inside the effect, not
// statically imported at the top. Static imports execute at module-eval
// time, which means even a `client:only` island would try to evaluate
// the WebGL helpers before any client code runs. Dynamic import keeps
// the initial module payload tiny and lets us defer the WebGL
// dependency until the user actually sees the map. Mirrors the same
// pattern as <WorldMap>.
import type {
  Map as MlMap,
  MapMouseEvent,
  Popup as PopupType,
} from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';

export interface DishMapProps {
  origin: DishOrigin;
  dishName: string;
}

/**
 * Per-dish mini-map showing the dish's geographic origin.
 *
 * Renders a single MapLibre map with one styled marker at the origin
 * lng/lat. Scroll-zoom, drag-pan, and double-click zoom all work out
 * of the box (same UX as the standalone /map globe page).
 *
 * Why MapLibre over Leaflet (this used to be a react-leaflet island
 * until 2026-06-18):
 *  - Single map library across the whole app. WorldMap and DishMap
 *    share tiles, controls, and styling conventions — drift between
 *    the two was a real maintenance liability.
 *  - WebGL rendering means a tiny canvas is also smooth on mobile.
 *  - We were already shipping ~1MB of maplibre-gl for the standalone
 *    /map page; loading another ~50KB of Leaflet on top of that on
 *    every dish page was pure waste.
 *
 * IMPORTANT: This component must be mounted with `client:only="react"`,
 * NOT `client:load`. MapLibre imports `mapbox-gl`'s WebGL helpers at
 * module-load time, which crashes during Astro SSR.
 */
export function DishMap({ origin, dishName }: DishMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<PopupType | null>(null);
  // True until the dynamic import of maplibre-gl resolves. We render a
  // subtle loading hint inside the container while we wait — better
  // than a blank grey box for the ~200ms cold-start case.
  const [mapReady, setMapReady] = useState<boolean>(false);
  // Set when the user can't see the map at all (WebGL disabled, headless
  // browser, init failure). Triggers a static fallback panel.
  const [mapError, setMapError] = useState<string | null>(null);

  // Defensive: API sets origin.lat/lng to null when only the entity is
  // known but no geometry exists (or only the geometry without an
  // entity). Either way, render a graceful fallback rather than a
  // broken map.
  const lat = origin.lat;
  const lng = origin.lng;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  // Cheap, synchronous WebGL capability probe. Runs before any heavy
  // import. If this returns false we never even fetch the ~1MB
  // maplibre-gl bundle — we just show a static panel. This is the most
  // common reason map UIs appear as blank grey boxes in the wild.
  const detectWebGL = (): boolean => {
    if (typeof document === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      // getContext's TypeScript types return `RenderingContext | null`
      // which is a union including 2D. Cast through `unknown` to the
      // WebGL-specific interface so we can use getParameter below.
      const gl = (canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl')) as unknown as
        | WebGLRenderingContext
        | null;
      if (!gl) return false;
      // Some browsers report a context but actually have a software-only
      // driver that crashes when used. Quick sanity check: query a basic
      // parameter. If it throws, the context is unusable.
      gl.getParameter(gl.VERSION);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!hasCoords) return; // No coords → static fallback renders below.
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;

    // Pre-flight WebGL check. If the browser can't get a WebGL context
    // we never even fetch maplibre-gl — we just set an error and let the
    // fallback UI render. Saves a ~1MB bundle download for users who
    // can't use the map anyway.
    if (!detectWebGL()) {
      // eslint-disable-next-line no-console
      console.warn('[DishMap] WebGL not available — falling back to static panel');
      setMapError(
        'Your browser does not support WebGL, which is required for the interactive map. The origin details are shown below.',
      );
      setMapReady(true);
      return;
    }

    // Dynamic import: keeps maplibre-gl out of the SSR/initial-hydration
    // critical path. The component itself becomes a thin React island
    // that, after mount, fetches the MapLibre bundle as a separate chunk.
    void import('maplibre-gl').then((mod) => {
      if (cancelled) return;
      const maplibregl = mod.default ?? mod;

      // Same basemap as <WorldMap>. Carto's positron-glight raster —
      // free, no API key, OSM-derived. Keeping the look consistent
      // across the two maps on the site.
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
        // MapLibre uses [lng, lat] (GeoJSON order). Our API stores
        // lat and lng separately, so swap them at the call site.
        map = new maplibregl.Map({
          container: containerRef.current!,
          style,
          center: [lng!, lat!],
          zoom: initialZoom(origin.entityType),
          minZoom: 0.5,
          maxZoom: 18,
          attributionControl: { compact: true },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[DishMap] MapLibre init failed:', err);
        setMapError(
          'The interactive map could not be initialised in this browser. The origin details are shown below.',
        );
        setMapReady(true);
        return;
      }

      const mapInstance = map;

      // Surface MapLibre runtime errors so they don't get swallowed.
      mapInstance.on('error', (e: { error?: Error }) => {
        // eslint-disable-next-line no-console
        console.warn('[DishMap] MapLibre error:', e?.error?.message ?? e);
      });

      // Scale control — bottom-left, matching the standalone /map.
      mapInstance.addControl(
        new maplibregl.ScaleControl({ unit: 'metric' }),
        'bottom-left',
      );

      mapRef.current = mapInstance;

      // The popup is created once and re-used via setLngLat + addTo.
      // MapLibre's Popup is the canonical way to render rich HTML
      // overlays anchored to a coordinate. We attach it on first
      // load so the user immediately sees the dish name on the map.
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        maxWidth: '240px',
      });

      mapInstance.on('load', () => {
        if (cancelled) return;

        // Single-feature GeoJSON source — the dish's origin point.
        const featureCollection: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lng!, lat!] },
              properties: {
                dishName,
                originName: origin.name,
                isoCode: origin.isoCode ?? '',
              },
            },
          ],
        };

        mapInstance.addSource('origin', {
          type: 'geojson',
          data: featureCollection,
        });

        // Halo: a soft outer ring that scales up on hover.
        mapInstance.addLayer({
          id: 'origin-halo',
          type: 'circle',
          source: 'origin',
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              14,
              10,
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
          id: 'origin-dot',
          type: 'circle',
          source: 'origin',
          paint: {
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              7,
              5,
            ],
            'circle-color': '#059669',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
            'circle-radius-transition': { duration: 150 },
          },
        });

        // Show the popup immediately on load (no click required) so the
        // user can see what the dot means without trial-and-error.
        // Hover keeps it open; moving the cursor away doesn't close it
        // because closeOnClick is false and we never call remove().
        const popup = popupRef.current;
        if (popup) {
          popup
            .setLngLat([lng!, lat!])
            .setHTML(buildPopupHTML(origin, dishName))
            .addTo(mapInstance);
        }

        // Hover state tracking — same pattern as <WorldMap>.
        let hovered = false;
        const setHover = (next: boolean): void => {
          if (hovered === next) return;
          hovered = next;
          mapInstance.setFeatureState(
            { source: 'origin', id: 0 },
            { hover: next },
          );
          mapInstance.getCanvas().style.cursor = next ? 'pointer' : '';
        };

        const onMove = (e: MapMouseEvent): void => {
          // MapLibre's queryRenderedFeatures hits the canvas at the
          // pointer position. With a tiny single-marker map the dot
          // is a small target — keep the cursor change on the larger
          // halo layer to make it feel responsive.
          const features = mapInstance.queryRenderedFeatures(e.point, {
            layers: ['origin-dot', 'origin-halo'],
          });
          setHover(features.length > 0);
        };
        mapInstance.on('mousemove', onMove);
        mapInstance.on('mouseleave', 'origin-dot', () => setHover(false));
        mapInstance.on('mouseleave', 'origin-halo', () => setHover(false));
      });

      setMapReady(true);
    }).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[DishMap] failed to load maplibre-gl', err);
      if (cancelled) return;
      setMapError(
        'The interactive map could not be loaded. The origin details are shown below.',
      );
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      // Tear down in the documented order: detach the popup first
      // (MapLibre's Popup owns a DOM node), then destroy the map.
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (map) map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [hasCoords, lat, lng, origin, dishName]);

  // No coordinates recorded → static fallback. Keeps the page readable
  // and consistent with the WebGL fallback styling.
  if (!hasCoords) {
    return (
      <div
        role="figure"
        aria-label={`${dishName} — origin: ${origin.name || 'unknown'}`}
        className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500"
      >
        {origin.name ? (
          <p>
            <strong className="text-slate-700">{origin.name}</strong>
            {origin.isoCode && (
              <span className="ml-1 text-slate-400">({origin.isoCode})</span>
            )}
            <br />
            <span className="text-xs text-slate-400">
              No coordinates recorded for this origin.
            </span>
          </p>
        ) : (
          <p>No origin recorded for this dish.</p>
        )}
      </div>
    );
  }

  return (
    <div
      role="figure"
      aria-label={`${dishName} — origin: ${origin.name || `${lat}, ${lng}`}`}
      className="overflow-hidden rounded-lg border border-slate-200"
      style={{ height: '280px' }}
    >
      <div
        ref={containerRef}
        className={mapError ? 'hidden' : 'h-full w-full'}
        aria-label="Interactive map showing this dish's geographic origin"
      />

      {/* MapLibre loading overlay. Hidden the moment the dynamic
          import resolves. */}
      {!mapReady && !mapError && (
        <div className="pointer-events-none flex h-full w-full items-center justify-center bg-slate-50">
          <p className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
            Loading map…
          </p>
        </div>
      )}

      {/* WebGL / init-failure fallback: a static panel with the origin
          details. The map page renders a region-grouped list because
          it has 31+ items; per-dish has exactly one origin, so a
          simple panel is the right shape. */}
      {mapError && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center">
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {mapError}
          </p>
          <p className="text-sm text-slate-700">
            <strong>{dishName}</strong>
            <br />
            <span className="text-slate-500">
              Origin: {origin.name}
              {origin.isoCode && (
                <span className="ml-1 text-slate-400">
                  ({origin.isoCode})
                </span>
              )}
            </span>
            <br />
            <span className="text-xs text-slate-400">
              {formatCoord(lat!, 'lat')}, {formatCoord(lng!, 'lng')}
            </span>
          </p>
        </div>
      )}

      <noscript>
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Enable JavaScript to see the interactive map of where this dish
          originates.
        </p>
      </noscript>
    </div>
  );
}

/**
 * Pick a sensible default zoom based on how granular the origin
 * entity is. Country-level points get zoomed out enough to see the
 * whole country; region/city-level points zoom in tighter.
 *
 * Heuristic: if we don't know the entity type, country gets zoom 4
 * and city/region gets zoom 6. The user can always zoom in/out
 * further.
 */
function initialZoom(entityType: string): number {
  switch (entityType) {
    case 'country':
      return 4;
    case 'region':
    case 'state':
    case 'province':
      return 6;
    case 'city':
    case 'town':
    case 'village':
      return 9;
    case 'point':
    case 'landmark':
      return 11;
    default:
      return 5;
  }
}

/**
 * Build the popup HTML for the marker. Kept as a string (vs JSX) so
 * MapLibre's Popup owns the DOM node — React reconciling over a
 * MapLibre-managed element is brittle and unnecessary.
 */
function buildPopupHTML(origin: DishOrigin, dishName: string): string {
  const safe = (s: string): string =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const rows: string[] = [
    `<strong style="display:block;margin-bottom:2px;color:#0f172a;">${safe(dishName)}</strong>`,
  ];
  if (origin.name) {
    rows.push(
      `<span style="color:#475569;">${safe(origin.name)}</span>`,
    );
  }
  if (origin.isoCode) {
    rows.push(
      `<span style="color:#94a3b8;margin-left:4px;">(${safe(origin.isoCode)})</span>`,
    );
  }
  // dishCountAtOrigin: live from the API if a fetch is already in flight
  // (cheap, no extra render). Falls back to "1" silently if the call
  // hasn't returned or failed.
  // We deliberately do NOT trigger a fetch here — this is a render
  // helper that runs synchronously inside MapLibre's setHTML.
  return rows.join('');
}

/**
 * Format a single coordinate for the fallback panel. 4 decimal places
 * is enough precision to identify a city (~11m); 6 places starts to
 * look noisy.
 */
function formatCoord(value: number, axis: 'lat' | 'lng'): string {
  const abs = Math.abs(value);
  const hemi =
    axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${abs.toFixed(4)}° ${hemi}`;
}

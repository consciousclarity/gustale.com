import { useMemo } from 'react';
import type { DishOrigin } from '../types/dish';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Default Leaflet marker icons reference assets via webpack-style paths that
// Vite can't resolve by default. We point them at the CDN copy shipped on
// every Leaflet distribution. This avoids the well-known "missing marker icon"
// bug that bites every Leaflet-on-Vite project.
// See: https://github.com/PaulLeCam/react-leaflet/issues/453
const DEFAULT_MARKER_ICON_URL =
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const DEFAULT_MARKER_ICON_2X_URL =
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const DEFAULT_MARKER_SHADOW_URL =
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

// Configure the default L.icon globally once. Safe because DishMap is
// `client:only` — `L` is never executed in a Node context.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: DEFAULT_MARKER_ICON_2X_URL,
  iconUrl: DEFAULT_MARKER_ICON_URL,
  shadowUrl: DEFAULT_MARKER_SHADOW_URL,
});

export interface DishMapProps {
  origin: DishOrigin;
  dishName: string;
}

/**
 * Pick a sensible default zoom based on how granular the origin entity is.
 * Country-level points (Greece) get zoomed out enough to see the whole
 * country; region/city-level points zoom in tighter.
 *
 * Heuristic: if we don't know the entity type, country gets zoom 4 and
 * city/region gets zoom 6. The user can always zoom in/out further.
 */
function defaultZoom(entityType: string): number {
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
 * Per-dish mini-map showing the dish's geographic origin.
 *
 * Renders a single Leaflet map with one marker at the origin lat/lng.
 * Scroll-zoom, drag-pan, and double-click zoom all work out of the box
 * (unlike the prior react-simple-maps standalone page).
 *
 * IMPORTANT: This component must be mounted with `client:only="react"`,
 * NOT `client:load` — Leaflet touches `window` at import time, which
 * crashes during Astro SSR.
 */
export function DishMap({ origin, dishName }: DishMapProps) {
  const lat = origin.lat;
  const lng = origin.lng;

  // Defensive: API sets origin.lat/lng to null when only the entity is
  // known but no geometry exists (or only the geometry without an entity).
  // Either way, render a graceful fallback rather than a broken map.
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';

  const center = useMemo<[number, number]>(
    () => [hasCoords ? lat : 0, hasCoords ? lng : 0],
    [hasCoords, lat, lng],
  );

  const zoom = useMemo(() => defaultZoom(origin.entityType), [origin.entityType]);

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
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Marker position={center}>
          <Popup>
            <div style={{ fontSize: '0.875rem', lineHeight: 1.4 }}>
              <strong style={{ display: 'block', marginBottom: 2 }}>
                {dishName}
              </strong>
              {origin.name && (
                <span style={{ color: '#475569' }}>{origin.name}</span>
              )}
              {origin.isoCode && (
                <span style={{ color: '#94a3b8', marginLeft: 4 }}>
                  ({origin.isoCode})
                </span>
              )}
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
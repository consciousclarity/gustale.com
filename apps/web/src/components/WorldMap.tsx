import { useMemo, useState, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
// world-atlas ships countries-110m TopoJSON (~100KB). Imported as a static
// asset so Vite bundles it inline — no separate HTTP request at runtime,
// and the map has data on first render. Using countries (not just land) so
// country borders are visible — gives the map a proper "atlas" feel
// rather than blank continents.
import worldData from 'world-atlas/countries-110m.json';
import type { MapDish } from '../lib/api';

// `world-atlas` JSON modules export either `{ default: {...} }` (CJS interop)
// or the TopoJSON object directly depending on bundler config. Handle both.
const GEO_DATA: unknown =
  (worldData as { default?: unknown }).default ?? worldData;

// Equal Earth projection: a modern equal-area projection. Avoids the
// Mercator distortion that makes Greenland look the size of Africa,
// which matters because our dish origins span Greece → Indonesia
// (places that Mercator stretches in misleading ways).
const PROJECTION_CONFIG = {
  scale: 160,
  center: [15, 20] as [number, number],
};

export interface WorldMapProps {
  dishes: MapDish[];
}

/**
 * Interactive 2D world map of published dishes.
 *
 * Server-rendered outline + dish dots so the first paint has visual
 * content. Tooltip, hover scaling, and click-to-navigate hydrate
 * client-side.
 */
export function WorldMap({ dishes }: WorldMapProps) {
  const [hovered, setHovered] = useState<MapDish | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Group dishes by (lat, lng) so overlapping dots merge into one
  // with a count badge. Keeps the visual clean when 50+ Greek dishes
  // all land at the same point.
  const grouped = useMemo(() => {
    const map = new Map<string, MapDish[]>();
    for (const d of dishes) {
      const key = `${d.lat.toFixed(2)},${d.lng.toFixed(2)}`;
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      dishes: list,
      lat: list[0]!.lat,
      lng: list[0]!.lng,
    }));
  }, [dishes]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGGElement>, dish: MapDish) => {
      const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
      if (!rect) return;
      setHovered(dish);
      setTooltipPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setTooltipPos(null);
  }, []);

  const handleClick = useCallback((dish: MapDish) => {
    window.location.href = `/dishes/${dish.slug}`;
  }, []);

  if (dishes.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white">
        <p className="text-slate-500">
          No dishes with origin coordinates yet. Add a dish to see it on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <ComposableMap
        projectionConfig={PROJECTION_CONFIG}
        projection="geoEqualEarth"
        width={980}
        height={500}
        style={{ width: '100%', height: 'auto' }}
      >
        <ZoomableGroup center={[15, 20]} minZoom={1} maxZoom={8}>
          <Geographies geography={GEO_DATA as object}>
            {({ geographies }: { geographies: Array<{ rsmKey: string } & Record<string, unknown> > }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo as never}
                  fill="#e2e8f0"
                  stroke="#cbd5e1"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: '#cbd5e1', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {grouped.map(({ key, dishes: group, lat, lng }) => {
            const isCluster = group.length > 1;
            const representative = group[0]!;
            const isHovered =
              hovered != null &&
              group.some((d) => d.slug === hovered.slug);

            return (
              <Marker key={key} coordinates={[lng, lat]}>
                <g
                  onMouseEnter={(e) => handleMouseMove(e, representative)}
                  onMouseMove={(e) => handleMouseMove(e, representative)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleClick(representative)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Outer halo for hover state — scales up */}
                  <circle
                    r={isHovered ? 10 : 6}
                    fill="#10b981"
                    fillOpacity={isHovered ? 0.25 : 0.15}
                    style={{ transition: 'all 150ms ease-out' }}
                  />
                  {/* Solid dot */}
                  <circle
                    r={isHovered ? 5 : 3.5}
                    fill="#059669"
                    stroke="white"
                    strokeWidth={0.8}
                    style={{ transition: 'all 150ms ease-out' }}
                  />
                  {/* Cluster count label */}
                  {isCluster && (
                    <text
                      textAnchor="middle"
                      y={-10}
                      style={{
                        fontFamily: 'system-ui, sans-serif',
                        fontSize: 11,
                        fontWeight: 600,
                        fill: '#047857',
                        pointerEvents: 'none',
                      }}
                    >
                      ×{group.length}
                    </text>
                  )}
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip overlay (HTML, not SVG, for nicer typography) */}
      {hovered && tooltipPos && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y - 12,
          }}
        >
          <div className="font-semibold text-slate-900">
            {hovered.canonicalName}
          </div>
          {hovered.region?.name && (
            <div className="text-xs text-slate-500">{hovered.region.name}</div>
          )}
          {hovered.shortDescription && (
            <div className="mt-1 max-w-xs text-xs text-slate-600">
              {hovered.shortDescription}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
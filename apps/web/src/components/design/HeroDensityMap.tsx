import { useMemo, useState } from "react";

/**
 * Hero density map — a static, non-interactive world map showing where the
 * site's dishes come from.
 *
 * Why this is not a MapLibre map
 * ------------------------------
 * The homepage already renders a full interactive globe further down the
 * page (the "Explore" workspace). Putting a second WebGL map in the hero
 * would double the map cost on the most-visited page and make the hero a
 * second, redundant answer to the same question.
 *
 * The hero's job is atmosphere, not interaction: a quiet world map with a
 * dot for every dish origin, so a visitor sees the spread of the atlas
 * before they scroll. That renders as one inline <svg> plus a cached
 * outline asset — no WebGL, no worker, no tile requests.
 *
 * The land outline is Natural Earth 1:110m (public domain), pre-projected
 * to an equirectangular frame and committed as
 * apps/web/public/hero-world-land.svg. It is referenced with <use> so the
 * fill inherits the site's CSS variables and the file is cached separately
 * from the page bundle.
 *
 * Regenerate with:
 *   python3 scripts/hermes/gen-hero-density-map.py ne_110m_land.geojson \
 *     > apps/web/public/hero-world-land.svg
 */

const W = 1000;
const LAT_TOP = 84;
const LAT_BOTTOM = -56;
const H = (W * (LAT_TOP - LAT_BOTTOM)) / 360;

/** Project lon/lat into the same equirectangular frame as the land asset. */
function project(lon: number, lat: number): { x: number; y: number } {
  return {
    x: ((lon + 180) / 360) * W,
    y: ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H,
  };
}

export interface HeroMapDish {
  slug: string;
  name: string;
  country: string;
  lat: number | null;
  lng: number | null;
}

interface HeroDensityMapProps {
  dishes: HeroMapDish[];
  /** How many dishes have usable coordinates. */
  plottedCount: number;
}

export function HeroDensityMap({ dishes, plottedCount }: HeroDensityMapProps) {
  const [hovered, setHovered] = useState<HeroMapDish | null>(null);

  const points = useMemo(() => {
    const out: { dish: HeroMapDish; x: number; y: number }[] = [];
    for (const dish of dishes) {
      if (dish.lat === null || dish.lng === null) continue;
      // Guard against a bad coordinate dragging the dot off the frame.
      if (dish.lat < LAT_BOTTOM || dish.lat > LAT_TOP) continue;
      const { x, y } = project(dish.lng, dish.lat);
      out.push({ dish, x, y });
    }
    return out;
  }, [dishes]);

  const readout = hovered
    ? `${formatCoord(hovered.lat!, "lat")}, ${formatCoord(hovered.lng!, "lng")}`
    : `${plottedCount} ${plottedCount === 1 ? "dish" : "dishes"} plotted`;

  return (
    <div className="hero-map">
      <svg
        className="hero-map-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`World map showing the origins of ${plottedCount} dishes`}
      >
        {/* Coastlines. fill is inherited from CSS so the map follows the
            site's colour scheme without the asset being theme-specific. */}
        <use href="/hero-world-land.svg#land" className="hero-map-land" />

        {points.map(({ dish, x, y }) => (
          <circle
            key={dish.slug}
            cx={x}
            cy={y}
            r={dish.slug === hovered?.slug ? 5.5 : 3.2}
            className="hero-map-dot"
            onMouseEnter={() => setHovered(dish)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(dish)}
            onBlur={() => setHovered(null)}
          >
            <title>{dish.name}</title>
          </circle>
        ))}
      </svg>

      <div className="hero-coord">
        <span>{readout}</span>
        <span>
          {hovered ? hovered.country || hovered.name : "GUSTALE · ATLAS"}
        </span>
      </div>
    </div>
  );
}

/** Format a coordinate the way the rest of the site does: 12.34°N. */
function formatCoord(value: number, axis: "lat" | "lng"): string {
  const hemisphere =
    axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(2)}°${hemisphere}`;
}

import type { Map as MlMap, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

export type JourneyConfidence =
  | "documented"
  | "likely"
  | "possible"
  | "parallel";

export interface JourneyBeatSource {
  id: string;
  title: string | null;
  url: string | null;
  citationText: string | null;
  year: number | null;
  reliability: string | null;
}

export interface JourneyBeat {
  id: string;
  sequence: number;
  placeName: string;
  lat: number | null;
  lng: number | null;
  yearApprox: number | null;
  label: string;
  confidence: JourneyConfidence;
  source: JourneyBeatSource | null;
}

export interface JourneyLineageLink {
  slug: string;
  name: string;
}

export interface DishJourneyProps {
  dishName: string;
  beats: JourneyBeat[];
  lineages?: JourneyLineageLink[];
}

/**
 * Dish Journey — short timeline + MapLibre path for P1-1.
 * Renders nothing when `beats` is empty (no empty-state copy).
 */
export function DishJourney({
  dishName,
  beats,
  lineages = [],
}: DishJourneyProps) {
  if (!beats.length) return null;

  const sorted = [...beats].sort((a, b) => a.sequence - b.sequence);
  const primaryLineage = lineages[0] ?? null;

  return (
    <section className="dj" aria-labelledby="journey-heading">
      <div className="dj__intro">
        <p className="dj__eyebrow">How this dish moved</p>
        <h2 id="journey-heading">Journey</h2>
        <p className="dj__lede">
          Key beats in the story of {dishName} — places, approximate dates, and
          how confident we are in each claim.
        </p>
      </div>

      <ol className="dj__timeline">
        {sorted.map((beat) => (
          <li key={beat.id} className="dj__beat">
            <div className="dj__beat-num" aria-hidden="true">
              {beat.sequence}
            </div>
            <div className="dj__beat-body">
              <div className="dj__beat-meta">
                <span className="dj__place">{beat.placeName}</span>
                {beat.yearApprox != null && (
                  <span className="dj__year">
                    {formatYearApprox(beat.yearApprox)}
                  </span>
                )}
                <span
                  className={`ld-conf ld-conf--${confidenceClass(beat.confidence)}`}
                >
                  {beat.confidence}
                </span>
              </div>
              <p className="dj__label">{beat.label}</p>
              {beat.source && (
                <p className="dj__cite">
                  {beat.source.url ? (
                    <a
                      href={beat.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {beat.source.citationText ??
                        beat.source.title ??
                        "Source"}
                    </a>
                  ) : (
                    (beat.source.citationText ?? beat.source.title)
                  )}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <JourneyPathMap dishName={dishName} beats={sorted} />

      {primaryLineage && (
        <p className="dj__lineage">
          Part of the{" "}
          <a href={`/lineages/${primaryLineage.slug}`}>{primaryLineage.name}</a>{" "}
          lineage.
        </p>
      )}
    </section>
  );
}

function confidenceClass(c: JourneyConfidence): string {
  return c === "parallel" ? "parallel_evolution" : c;
}

function formatYearApprox(year: number): string {
  if (year < 0) return `c. ${Math.abs(year)} BCE`;
  if (year < 1000) return `c. ${year}`;
  return `c. ${year}`;
}

function JourneyPathMap({
  dishName,
  beats,
}: {
  dishName: string;
  beats: JourneyBeat[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const points = beats.filter(
    (b): b is JourneyBeat & { lat: number; lng: number } =>
      typeof b.lat === "number" && typeof b.lng === "number",
  );

  const pointsKey = points
    .map((p) => `${p.sequence}:${p.lat}:${p.lng}`)
    .join("|");

  useEffect(() => {
    if (points.length === 0) return;
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MlMap | null = null;

    if (!detectWebGL()) {
      setMapError("WebGL is required for the journey map.");
      setMapReady(true);
      return;
    }

    void import("maplibre-gl")
      .then((mod) => {
        if (cancelled || !containerRef.current) return;
        const maplibregl = mod.default ?? mod;

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

        const lngs = points.map((p) => p.lng);
        const lats = points.map((p) => p.lat);
        const center: [number, number] = [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2,
        ];

        try {
          map = new maplibregl.Map({
            container: containerRef.current,
            style,
            center,
            zoom: 2.5,
            minZoom: 0.5,
            maxZoom: 12,
            attributionControl: { compact: true },
          });
        } catch {
          setMapError("The journey map could not be initialised.");
          setMapReady(true);
          return;
        }

        const mapInstance = map;
        mapInstance.addControl(
          new maplibregl.ScaleControl({ unit: "metric" }),
          "bottom-left",
        );

        mapInstance.on("load", () => {
          if (cancelled) return;

          const lineCoords = points.map(
            (p) => [p.lng, p.lat] as [number, number],
          );
          mapInstance.addSource("journey-line", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: lineCoords },
            },
          });
          mapInstance.addLayer({
            id: "journey-line-layer",
            type: "line",
            source: "journey-line",
            paint: {
              "line-color": "#6e7f4e",
              "line-width": 2.5,
              "line-opacity": 0.85,
            },
          });

          for (const p of points) {
            const el = document.createElement("div");
            el.className = "dj__marker";
            el.textContent = String(p.sequence);
            el.title = p.placeName;
            new maplibregl.Marker({ element: el })
              .setLngLat([p.lng, p.lat])
              .addTo(mapInstance);
          }

          const first = lineCoords[0];
          if (!first) return;
          const bounds = new maplibregl.LngLatBounds(first, first);
          for (const c of lineCoords) bounds.extend(c);
          mapInstance.fitBounds(bounds, {
            padding: 48,
            maxZoom: 5,
            duration: 0,
          });
        });

        setMapReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMapError("The journey map could not be loaded.");
        setMapReady(true);
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [pointsKey, points]);

  if (points.length === 0) return null;

  return (
    <figure
      className="dj__map"
      aria-label={`Journey map for ${dishName}`}
    >
      <div
        ref={containerRef}
        className={mapError ? "hidden" : "dj__map-canvas"}
      />
      {!mapReady && !mapError && (
        <p className="dj__map-status">Loading journey map…</p>
      )}
      {mapError && <p className="dj__map-status">{mapError}</p>}
    </figure>
  );
}

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

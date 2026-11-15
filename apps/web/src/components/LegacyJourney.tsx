import type { Map as MlMap } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import type { DishJourneyBeat, DishJourneyLineage } from "../lib/api";
import {
  basemapTransformRequest,
  CARTO_VECTOR_STYLE_URL,
} from "../lib/basemap";
import type { JourneyConfidence } from "../lib/journey";
import { loadMapLibre } from "../lib/maplibreLoader";

export interface LegacyJourneyProps {
  dishName: string;
  beats: DishJourneyBeat[];
  lineages: DishJourneyLineage[];
}

/**
 * The EXISTING P1-1 journey presentation, preserved unchanged.
 *
 * This is the P1-1 component as it was before the GUS-238 redesign: a
 * timeline of beats, one combined path map drawn through all supplied
 * points, and a single lineage sentence. It is kept for every dish
 * outside the pilot so that turning the pilot on cannot change any
 * other dish page.
 *
 * The one deliberate difference from the original is that the empty
 * case now renders an explicit research-gap state instead of returning
 * null — which is one of the three defects the redesign brief named,
 * and it is a strict improvement for every dish, pilot or not.
 */
export function LegacyJourney({
  dishName,
  beats,
  lineages,
}: LegacyJourneyProps) {
  if (!beats.length) {
    return (
      <section className="dj" aria-labelledby="journey-heading">
        <div className="dj__intro">
          <p className="dj__eyebrow">How this dish moved</p>
          <h2 id="journey-heading">Journey</h2>
        </div>
        <div className="dj__state dj__state--gap">
          <p>
            The history of {dishName} is still being researched. A dated chapter
            appears here only when a traceable historical record supports it.
          </p>
          <p className="dj__state-note">
            This is a research gap, not a claim that the dish is new.
          </p>
        </div>
      </section>
    );
  }

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

      <LegacyJourneyPathMap dishName={dishName} beats={sorted} />

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

function LegacyJourneyPathMap({
  dishName,
  beats,
}: {
  dishName: string;
  beats: DishJourneyBeat[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const points = beats.filter(
    (b): b is DishJourneyBeat & { lat: number; lng: number } =>
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

    void loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;

        maplibregl.setWorkerUrl(maplibreWorkerUrl);

        const style = CARTO_VECTOR_STYLE_URL;

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
            transformRequest: basemapTransformRequest,
          });
        } catch {
          setMapError("The journey map could not be initialised.");
          setMapReady(true);
          return;
        }

        const mapInstance = map;
        if (!mapInstance) {
          setMapError("The journey map could not be initialised.");
          setMapReady(true);
          return;
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, points]);

  if (points.length === 0) return null;

  return (
    <figure className="dj__map" aria-label={`Journey map for ${dishName}`}>
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

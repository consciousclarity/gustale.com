// IMPORTANT: maplibre-gl is dynamically imported inside the effect, not
// statically imported at the top. Static imports execute at module-eval
// time, so the WebGL helpers would be evaluated before any client code
// runs. This mirrors <DishMap> and <WorldMap> exactly.
//
// The worker is loaded via Vite's `?url` import so the built path is
// correct under Astro 7. `setWorkerUrl` must be called BEFORE the first
// Map() is created.

import type { Map as MlMap } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import type { DishJourneyBeat, DishJourneyMovement } from "../lib/api";
import {
  basemapTransformRequest,
  CARTO_VECTOR_STYLE_URL,
} from "../lib/basemap";
import { frameForBeat, mapCaptionForBeat } from "../lib/journey";
import { loadMapLibre } from "../lib/maplibreLoader";

export interface JourneyMapCardProps {
  beat: DishJourneyBeat;
  /** Chapters that have coordinates — used to draw sourced movements. */
  coordinateBeats: DishJourneyBeat[];
  /** Source-supported movements only. Never inferred. */
  movements: DishJourneyMovement[];
  /** Chapter number shown in the marker. */
  markerNumber: number;
}

interface MovementLine {
  from: [number, number];
  to: [number, number];
  label: string;
}

/**
 * One historical chapter = one map card.
 *
 * The reference design shows SIX SEPARATE, COMPARABLE maps — one per
 * chapter — rather than one combined map of the whole journey. That is
 * the point: a reader compares "what this record is about" against
 * "where the record places it", and a single combined map destroys
 * that comparison by overlaying six periods on one canvas.
 *
 * The map is the real OSM-derived CARTO vector basemap the rest of the
 * site already uses (see lib/basemap), restyled toward the reference
 * palette: pale water, light land, restrained borders, olive numbered
 * markers. OSM attribution stays visible and linked.
 *
 * A movement between two chapters is drawn ONLY when a source supports
 * it. Chapter order and map proximity never produce a line.
 */
export function JourneyMapCard({
  beat,
  coordinateBeats,
  movements,
  markerNumber,
}: JourneyMapCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const hasPoint = typeof beat.lat === "number" && typeof beat.lng === "number";
  const hasBounds = (beat.bounds?.length ?? 0) === 4;
  const frame = frameForBeat(beat);

  // The movements this card can draw: sourced edges that touch this
  // chapter and whose other end also has coordinates.
  const lines = collectMovementLines(beat, coordinateBeats, movements);

  // Stable key: only the geometry that matters, so the map is not torn
  // down and rebuilt on every render.
  const geometryKey = [
    beat.id,
    beat.lat ?? "",
    beat.lng ?? "",
    (beat.bounds ?? []).join(","),
    lines.map((l) => `${l.label}:${l.to[0]}:${l.to[1]}`).join("|"),
  ].join("~");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: MlMap | null = null;

    if (!detectWebGL()) {
      setMapError("This map needs WebGL, which this browser has disabled.");
      return;
    }

    void loadMapLibre()
      .then((maplibregl) => {
        if (cancelled) return;

        // The worker URL must be set BEFORE the first Map() is created.
        maplibregl.setWorkerUrl(maplibreWorkerUrl);

        const instance = new maplibregl.Map({
          container,
          style: CARTO_VECTOR_STYLE_URL,
          center: frame.center,
          zoom: frame.zoom,
          minZoom: 0.5,
          maxZoom: 12,
          attributionControl: { compact: true },
          transformRequest: basemapTransformRequest,
          // The reference maps are calm and non-interactive in feel:
          // no spinning, no accidental zoom while the reader scrolls.
          scrollZoom: false,
          dragRotate: false,
          pitchWithRotate: false,
        });
        map = instance;

        instance.addControl(
          new maplibregl.ScaleControl({ unit: "metric" }),
          "bottom-left",
        );

        instance.on("load", () => {
          if (cancelled) return;

          applyReferencePalette(instance);

          if (lines.length > 0) {
            instance.addSource("journey-movement", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: lines.map((l) => ({
                  type: "Feature" as const,
                  properties: { label: l.label },
                  geometry: {
                    type: "LineString" as const,
                    coordinates: [l.from, l.to],
                  },
                })),
              },
            });
            instance.addLayer({
              id: "journey-movement-line",
              type: "line",
              source: "journey-movement",
              paint: {
                "line-color": "#b04e29",
                "line-width": 2,
                "line-opacity": 0.72,
                "line-dasharray": [3, 2],
              },
            });
          }

          if (hasPoint) {
            const el = document.createElement("div");
            el.className = "jmc__marker";
            el.textContent = String(markerNumber);
            el.setAttribute("aria-hidden", "true");
            new maplibregl.Marker({ element: el })
              .setLngLat([beat.lng as number, beat.lat as number])
              .addTo(instance);
          }

          // Other chapters, as small context dots: a quiet outline
          // marker, never a number, so a neighbouring chapter can never
          // be mistaken for this one.
          for (const b of coordinateBeats) {
            if (b.id === beat.id) continue;
            if (typeof b.lat !== "number" || typeof b.lng !== "number")
              continue;
            const el = document.createElement("div");
            el.className = "jmc__context-dot";
            el.setAttribute("aria-hidden", "true");
            new maplibregl.Marker({ element: el })
              .setLngLat([b.lng, b.lat])
              .addTo(instance);
          }

          if (hasPoint) {
            instance.jumpTo({
              center: [beat.lng as number, beat.lat as number],
              zoom: Math.max(frame.zoom, 5),
            });
          } else if (hasBounds) {
            const [w, s, e, n] = beat.bounds as [
              number,
              number,
              number,
              number,
            ];
            instance.fitBounds(
              [
                [w, s],
                [e, n],
              ],
              { padding: 40, duration: 0, maxZoom: 6 },
              // The third argument is the animation frame. The maplibre
              // types in this version require it.
              undefined as unknown as Parameters<typeof instance.fitBounds>[2],
            );
          }
        });

        instance.on("error", () => {
          // A tile error is not fatal — the basemap may still draw. Only
          // a hard init failure shows the fallback.
          if (!instance.loaded()) {
            setMapError("This map could not be loaded.");
          }
        });
      })
      .catch(() => {
        if (cancelled) return;
        setMapError("This map could not be loaded.");
      });

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryKey]);

  // Hide the decorative loading note as soon as the map's canvas is in
  // the DOM. This is deliberately DOM-driven rather than state-driven:
  // the MapLibre `load` event can fire before React has mounted this
  // island, and the resulting state update is then lost, leaving the
  // note sitting on top of a perfectly good map.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const note =
      container.parentElement?.querySelector<HTMLElement>("[data-map-loading]");
    if (!note) return;

    const hide = () => {
      if (container.querySelector("canvas")) {
        note.dataset.mapLoaded = "true";
      }
    };

    hide();
    const observer = new MutationObserver(hide);
    observer.observe(container, { childList: true, subtree: true });
    const timer = window.setInterval(hide, 400);
    const stop = window.setTimeout(() => {
      clearInterval(timer);
      observer.disconnect();
    }, 20000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      observer.disconnect();
    };
  }, [geometryKey]);

  const caption = mapCaptionForBeat(beat);

  return (
    <figure className="jmc">
      <div className="jmc__frame">
        <div
          ref={containerRef}
          className={
            mapError ? "jmc__canvas jmc__canvas--hidden" : "jmc__canvas"
          }
        />
        {/*
          The loading note is DECORATIVE. The map's readiness is observed
          from the DOM (the MapLibre canvas appears), not from React state,
          because the `load` event can fire before React has mounted this
          island and the state update can then be missed. A screen-reader
          user gets the map's own content; sighted users see the note only
          while the tiles are genuinely still loading.
        */}
        <p className="jmc__status" aria-hidden="true" data-map-loading>
          Preparing this map…
        </p>
        {mapError && (
          <div className="jmc__fallback">
            <p className="jmc__status">{mapError}</p>
            {/* The record's own words stay readable even when the map
                cannot be drawn. */}
            <p className="jmc__fallback-place">{beat.placeName}</p>
          </div>
        )}
      </div>
      <figcaption className="jmc__caption">{caption}</figcaption>
    </figure>
  );
}

/**
 * Collect the sourced movements that touch this chapter.
 *
 * A movement is drawable only when it carries a source AND both of its
 * endpoints have coordinates. An unsourced claim is never drawn.
 */
function collectMovementLines(
  beat: DishJourneyBeat,
  coordinateBeats: DishJourneyBeat[],
  movements: DishJourneyMovement[],
): MovementLine[] {
  const out: MovementLine[] = [];
  for (const m of movements) {
    if (!m.source) continue;
    const isFrom = m.fromBeatId === beat.id;
    const isTo = m.toBeatId === beat.id;
    if (!isFrom && !isTo) continue;

    const otherId = isFrom ? m.toBeatId : m.fromBeatId;
    const other = coordinateBeats.find((b) => b.id === otherId);
    if (!other) continue;
    if (typeof other.lat !== "number" || typeof other.lng !== "number")
      continue;
    if (typeof beat.lat !== "number" || typeof beat.lng !== "number") continue;

    const self: [number, number] = [beat.lng, beat.lat];
    const theirs: [number, number] = [other.lng, other.lat];
    out.push({
      from: isFrom ? self : theirs,
      to: isFrom ? theirs : self,
      label: m.label,
    });
  }
  return out;
}

/**
 * Restyle the site's existing CARTO vector basemap toward the
 * reference palette: pale blue-green water, warm light land, quiet
 * borders, recessive roads.
 *
 * This is a RESTYLE of the basemap the whole site already uses — the
 * same tiles, the same attribution, the same provider policy. No new
 * provider, no new account, no new library.
 *
 * The layer ids are the CARTO `voyager-gl-style` ones. The style's own
 * paint properties are EXPRESSIONS (zoom-dependent `stops`), so a flat
 * replacement is used only where it cannot hide another layer: the
 * land fills are left alone, because painting them opaquely would
 * cover the boundaries, roads and labels underneath.
 */
function applyReferencePalette(instance: MlMap): void {
  const setPaint = (layerId: string, props: Record<string, unknown>): void => {
    if (instance.getLayer(layerId)) {
      // The maplibre types in this version require the third
      // (previous-value) argument.
      instance.setPaintProperty(layerId, props as never, undefined as never);
    }
  };

  // Water: the reference's pale blue-green.
  setPaint("water", { "fill-color": "#d7e3e0" });
  setPaint("water_shadow", { "fill-color": "#cfdedb" });
  setPaint("waterway", { "line-color": "#c6d6d3" });

  // Boundaries: present but quiet.
  setPaint("boundary_county", { "line-color": "rgba(33,28,22,0.14)" });
  setPaint("boundary_state", { "line-color": "rgba(33,28,22,0.18)" });
  setPaint("boundary_country", { "line-color": "rgba(33,28,22,0.26)" });

  // The ground itself stays the basemap's own warm cream: the reference
  // shows light land, and the CARTO `background` is already that colour.
  setPaint("background", { "background-color": "#f6f1e7" });
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

/**
 * The map's relationship layer — the four kinds of connection, drawn.
 *
 * WHAT THIS DOES
 *
 * It draws the edges between dishes on the globe. Each edge's LOOK is
 * decided by its relationship group, and each group is distinguishable
 * WITHOUT colour:
 *
 *   family     a solid line, no arrow        — "these belong together"
 *   likeness   a short-dashed line, no arrow — "these resemble each other"
 *   descent    a long-dashed line WITH an arrow — "this came from that"
 *   migration  a dotted line WITH an arrow    — "this travelled there"
 *
 * The arrow is a triangle that is ALSO the group's marker shape, so it
 * survives being printed in one colour, and it is filled — not a thin
 * stroke — so it survives being small.
 *
 * WHY THE EDGES ARE CURVED
 *
 * Two dishes in the same city are two points a kilometre apart. A
 * straight line between them is invisible under the dish marker, so
 * the reader sees one dot and no connection. The curve bows each edge
 * away from the straight line by an amount proportional to the
 * distance, so two near-coincident endpoints separate into a visible
 * arc.
 *
 * WHY THE MAP FILTERS
 *
 * Eighty-two published connections across a globe is a hairball. The
 * default is to show the connections of the dishes that are actually
 * IN VIEW, which is what a reader of a map wants, plus a way to see
 * everything. The filter is visible and reversible — a reader must
 * always be able to see what they are not being shown.
 */

import type maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  RELATIONSHIP_KINDS,
  RELATIONSHIP_STYLES,
  type RelationshipKind,
  relationshipKindFor,
} from "../lib/relationship-grammar";

// ─── The connection shape ─────────────────────────────────────────────────

export interface MapConnection {
  id: string;
  relationship: string;
  relationshipName: string;
  isSymmetric: boolean;
  directionKnown: boolean;
  reason: string | null;
  strength: number;
  from: { slug: string; name: string; lat: number | null; lng: number | null };
  to: { slug: string; name: string; lat: number | null; lng: number | null };
}

export interface RelationshipLayerProps {
  /** The MapLibre map instance, once it exists. */
  map: maplibregl.Map | null;
  /** Every published connection. */
  connections: MapConnection[];
  /** The slugs currently visible, so the map can show only what is in view. */
  visibleSlugs?: Set<string>;
  /** Show every connection, not only the visible ones. */
  showAll?: boolean;
  /** The groups the reader has switched on. All of them by default. */
  enabledKinds?: Set<RelationshipKind>;
  /** Called when a reader picks an edge. */
  onSelect?: (connection: MapConnection) => void;
}

/**
 * The haversine distance in kilometres. Used to bow the edges — a
 * short edge needs a proportionally small bow, or it detaches from the
 * markers it connects.
 */
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A quadratic bezier, sampled into a polyline.
 *
 * The control point is offset PERPENDICULAR to the line, so the bow
 * is always to one side rather than always up or always down — which
 * would put every edge of a group in the same visual row.
 */
function curvePoints(
  from: [number, number],
  to: [number, number],
  bow: number,
): [number, number][] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // The perpendicular. Normalised so the bow is a real distance.
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  // The side is chosen deterministically from the endpoints, so the
  // same edge always bows the same way — an edge that flipped sides
  // on every re-render would be unreadable.
  const side = x1 + x2 + y1 + y2 >= 0 ? 1 : -1;
  const cx = mx + px * bow * side;
  const cy = my + py * bow * side;

  const points: [number, number][] = [];
  const STEPS = 24;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const it = 1 - t;
    points.push([
      it * it * x1 + 2 * it * t * cx + t * t * x2,
      it * it * y1 + 2 * it * t * cy + t * t * y2,
    ]);
  }
  return points;
}

/** The great-circle midpoint of an edge, used to place the arrow head. */
function curveMidpoint(
  from: [number, number],
  to: [number, number],
  bow: number,
): [number, number] {
  const pts = curvePoints(from, to, bow);
  return pts[Math.floor(pts.length / 2)];
}

/**
 * A triangle pointing along a bearing.
 *
 * The triangle is the arrow head AND the legend marker for the
 * directional groups, so it is FILLED and it has a visible outline:
 * a thin stroke disappears at small sizes and in one colour.
 *
 * The apex is at the given point; the base is `size` behind it,
 * perpendicular to the bearing.
 */
function triangleAt(
  apex: [number, number],
  bearingRad: number,
  size: number,
): [number, number][] {
  const [x, y] = apex;
  // The direction the arrow points, in map degrees.
  const dx = Math.cos(bearingRad);
  const dy = Math.sin(bearingRad);
  // A perpendicular to it.
  const px = -dy;
  const py = dx;
  const bx = x - dx * size;
  const by = y - dy * size;
  return [
    [x, y],
    [bx + px * size * 0.6, by + py * size * 0.6],
    [bx - px * size * 0.6, by - py * size * 0.6],
  ];
}

/**
 * The bearing of the curve at its midpoint, in radians.
 *
 * The curve's direction at the midpoint is what the arrow must follow
 * — an arrow along the straight chord would point off the arc.
 */
function midpointBearing(
  from: [number, number],
  to: [number, number],
  bow: number,
): number {
  const pts = curvePoints(from, to, bow);
  const i = Math.floor(pts.length / 2);
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/**
 * The bow distance for an edge.
 *
 * Short edges get a small absolute bow so they separate from the
 * markers; long edges get a bow proportional to their length so they
 * read as arcs rather than as straight lines across an ocean.
 */
function bowFor(from: [number, number], to: [number, number]): number {
  const km = distanceKm(
    { lat: from[1], lng: from[0] },
    { lat: to[1], lng: to[0] },
  );
  // A floor, so two dishes in the same city still separate.
  return Math.max(0.35, Math.min(6, km / 400));
}

export function RelationshipLayer({
  map,
  connections,
  visibleSlugs,
  showAll = false,
  enabledKinds,
  onSelect,
}: RelationshipLayerProps) {
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // The source data, rebuilt when the connections or the filter change.
  const features = useMemo(() => {
    const out: GeoJSON.Feature[] = [];

    for (const c of connections) {
      // An edge with an endpoint that has no coordinate cannot be drawn.
      if (c.from.lat === null || c.from.lng === null) continue;
      if (c.to.lat === null || c.to.lng === null) continue;

      // The group filter.
      let kind: RelationshipKind;
      try {
        kind = relationshipKindFor(c.relationship);
      } catch {
        // An unclassified relation type is skipped rather than crashing
        // the map. The legend's own count tells the reader what is
        // missing, and the API's contract test asserts that every
        // published type is classified — so this is a visible
        // omission, not a silent one.
        continue;
      }
      if (enabledKinds && !enabledKinds.has(kind)) continue;

      // The visibility filter: an edge is drawn when BOTH of its
      // endpoints are in view. An edge with one endpoint off-screen
      // would run off the edge of the globe and read as a ray.
      if (!showAll && visibleSlugs) {
        if (!visibleSlugs.has(c.from.slug) || !visibleSlugs.has(c.to.slug)) {
          continue;
        }
      }

      const from: [number, number] = [c.from.lng, c.from.lat];
      const to: [number, number] = [c.to.lng, c.to.lat];
      const bow = bowFor(from, to);
      const points = curvePoints(from, to, bow);

      out.push({
        type: "Feature",
        properties: {
          id: c.id,
          kind,
          relationship: c.relationship,
          relationshipName: c.relationshipName,
          directionKnown: c.directionKnown,
          // The direction the arrow points, as a bearing from the
          // source. FALSE means the direction is not established and
          // NO arrow may be drawn.
          arrowFrom: c.directionKnown ? "from" : "none",
          arrowTo: c.directionKnown ? "to" : "none",
          fromName: c.from.name,
          toName: c.to.name,
          reason: c.reason ?? "",
          strength: c.strength,
        },
        geometry: { type: "LineString", coordinates: points },
      });
    }

    return {
      type: "FeatureCollection" as const,
      features: out,
    };
  }, [connections, visibleSlugs, showAll, enabledKinds]);

  // The ARROW TRIANGLES.
  //
  // Computed from the same curves as the lines, so an arrow always
  // sits ON its edge, pointing along it.
  const arrowFeatures = useMemo(() => {
    const out: GeoJSON.Feature[] = [];

    for (const f of features.features) {
      const props = f.properties as {
        kind: RelationshipKind;
        arrowFrom: string;
        arrowTo: string;
        directionKnown: boolean;
        fromName: string;
        toName: string;
      };
      if (!props.directionKnown) continue;
      if (props.kind !== "descent" && props.kind !== "migration") continue;

      const coords = (f.geometry as GeoJSON.LineString).coordinates;
      if (coords.length < 2) continue;

      const mid = coords[Math.floor(coords.length / 2)];
      const prev = coords[Math.max(0, Math.floor(coords.length / 2) - 1)];
      const next =
        coords[Math.min(coords.length - 1, Math.floor(coords.length / 2) + 1)];
      const bearing = Math.atan2(next[1] - prev[1], next[0] - prev[0]);

      out.push({
        type: "Feature",
        properties: {
          kind: props.kind,
          colour: RELATIONSHIP_STYLES[props.kind].colour,
          order: RELATIONSHIP_STYLES[props.kind].order,
          label: props.kind === "descent" ? "descends from" : "travelled to",
        },
        geometry: {
          type: "Polygon",
          coordinates: [triangleAt([mid[0], mid[1]], bearing, 0.9)],
        },
      });
    }

    return { type: "FeatureCollection" as const, features: out };
  }, [features]);

  // Mount the layers once the map exists.
  useEffect(() => {
    if (!map) return;
    if (map.getSource("connections")) {
      setReady(true);
      return;
    }

    map.addSource("connections", {
      type: "geojson",
      data: features,
    });

    // One line layer per group, so each group can carry its OWN dash
    // pattern. A single layer cannot: the pattern is a paint
    // property, not a per-feature one.
    for (const kind of RELATIONSHIP_KINDS) {
      const style = RELATIONSHIP_STYLES[kind];
      // THE PATTERN IS OMITTED FOR A SOLID LINE — NEVER SET TO
      // `undefined`.
      //
      // MapLibre does not reject a paint property whose value is
      // `undefined`; it SILENTLY DROPS the whole layer. The symptom was
      // invisible and confusing: the "family" layer — the only kind with
      // an empty pattern, i.e. the only SOLID line — was simply absent
      // from the map, with no error anywhere. The other three kinds
      // have a pattern, so they were added.
      //
      // A solid line is MapLibre's default, so the property must be
      // ABSENT rather than undefined.
      const paint: Record<string, unknown> = {
        "line-color": style.colour,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.1, 6, 2.0],
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.95,
          0.6,
        ],
      };
      // THE PATTERN. This is the primary carrier of the group's
      // identity, and it survives the loss of colour entirely.
      if (style.pattern.length > 0) {
        paint["line-dasharray"] = [...style.pattern];
      }

      map.addLayer({
        id: `connections-${kind}`,
        type: "line",
        source: "connections",
        filter: ["==", ["get", "kind"], kind],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint,
      });
    }

    // The ARROW HEADS.
    //
    // The arrow is a TRIANGLE drawn as real geometry — a polygon
    // source — rather than a sprite symbol.
    //
    // A symbol layer would need an image in the MapLibre sprite, and
    // the sprite is the basemap's: the CARTO vector style does not
    // ship a triangle, and adding one means shipping an image
    // alongside the basemap for two shapes. Computing the triangle
    // ourselves keeps the arrow's SHAPE under our control — which is
    // the whole point, because the triangle IS the marker that
    // distinguishes the directional groups when colour is gone.
    map.addSource("connection-arrows", {
      type: "geojson",
      data: arrowFeatures,
    });

    map.addLayer({
      id: "connections-arrows",
      type: "fill",
      source: "connection-arrows",
      layout: {
        "fill-sort-key": ["get", "order"],
      },
      paint: {
        "fill-color": ["get", "colour"],
        // A thin dark outline so the triangle is visible against a
        // light ocean as well as a dark one.
        "fill-outline-color": "rgba(0,0,0,0.55)",
      },
    });

    setReady(true);
  }, [map, features, arrowFeatures]);

  // Update the data when it changes.
  useEffect(() => {
    if (!map || !ready) return;
    const source = map.getSource("connections") as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(features);
    const arrowSource = map.getSource("connection-arrows") as
      | maplibregl.GeoJSONSource
      | undefined;
    arrowSource?.setData(arrowFeatures);
  }, [map, ready, features, arrowFeatures]);

  // Hover state, so an edge brightens and its tooltip can find it.
  useEffect(() => {
    if (!map || !ready) return;

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const featuresUnder = map.queryRenderedFeatures(e.point, {
        layers: RELATIONSHIP_KINDS.map((k) => `connections-${k}`),
      });
      const first = featuresUnder[0];
      if (first?.id === undefined) {
        map.setFeatureState(
          { source: "connections" },
          { id: -1 },
          { hover: false },
        );
        return;
      }
      map.setFeatureState(
        { source: "connections", id: first.id },
        { hover: true },
      );
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
    };
  }, [map, ready]);

  // Clicking an edge selects it.
  useEffect(() => {
    if (!map || !ready) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const featuresUnder = map.queryRenderedFeatures(e.point, {
        layers: RELATIONSHIP_KINDS.map((k) => `connections-${k}`),
      });
      const first = featuresUnder[0];
      if (!first?.properties?.id) return;
      const id = String(first.properties.id);
      const found = connections.find((c) => c.id === id);
      if (found) onSelectRef.current?.(found);
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, ready, connections]);

  return null;
}

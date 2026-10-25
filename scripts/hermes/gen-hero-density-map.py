#!/usr/bin/env python3
"""
Generate the hero density-map SVG asset from Natural Earth land geometry.

Source: Natural Earth 1:110m Land (public domain)
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson

The output is a plain SVG path of world coastlines in an equirectangular
projection, cropped to the inhabited latitudes (84N .. 56S) so Antarctica
and the high Arctic do not eat the frame.

This runs at authoring time and its output is committed, so the site has
no build-time geo dependency and no runtime GeoJSON parsing.

Usage:
    python3 scripts/hermes/gen-hero-density-map.py <ne_110m_land.geojson> \
        > apps/web/public/hero-world-land.svg
"""
import json
import sys

# Frame: 1000 units wide. Latitude window excludes Antarctica.
W = 1000.0
LAT_TOP = 84.0
LAT_BOTTOM = -56.0
LAT_SPAN = LAT_TOP - LAT_BOTTOM
H = W * (LAT_SPAN / 360.0)


def project(lon, lat):
    """Equirectangular projection into the 1000 x H frame."""
    x = (lon + 180.0) / 360.0 * W
    y = (LAT_TOP - lat) / LAT_SPAN * H
    return x, y


def ring_to_path(ring):
    """One GeoJSON linear ring -> an SVG path fragment."""
    pts = [(project(lon, lat)) for lon, lat in ring]
    if len(pts) < 3:
        return None
    # A ring spanning nearly the whole globe in x would draw a spurious
    # band across the frame (it crosses the antimeridian). Natural Earth
    # splits those at the seam already, but be defensive.
    xs = [x for x, _ in pts]
    if max(xs) - min(xs) > W * 0.9:
        return None
    d = []
    for i, (x, y) in enumerate(pts):
        # Clip vertically to the frame so Antarctica / the Arctic do not
        # spill outside it.
        y = max(0.0, min(H, y))
        # Integer precision: at the rendered size (~550px wide for a
        # 1000-unit viewBox) one unit is well under a pixel, so rounding
        # is invisible and cuts the committed asset by a third.
        d.append(("M" if i == 0 else "L") + f"{round(x):g} {round(y):g}")
    return " ".join(d) + " Z"


def build_path(geojson):
    parts = []
    for feature in geojson.get("features", []):
        geom = feature.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        if gtype == "Polygon":
            polygons = [coords]
        elif gtype == "MultiPolygon":
            polygons = coords
        else:
            continue
        for polygon in polygons:
            for ring in polygon:
                frag = ring_to_path(ring)
                if frag:
                    parts.append(frag)
    return " ".join(parts)


def main():
    """Write the complete SVG asset to stdout.

    The path data is by far the largest part, and it is what the caller
    redirects into the asset file. The wrapper goes to stdout too so the
    documented one-liner produces a valid SVG.
    """
    geojson = json.load(open(sys.argv[1]))
    path = build_path(geojson)
    sys.stdout.write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" '
        f'preserveAspectRatio="xMidYMid meet">'
        f'<path id="land" d="{path}" fill-rule="evenodd"/>'
        f"</svg>\n"
    )


if __name__ == "__main__":
    main()
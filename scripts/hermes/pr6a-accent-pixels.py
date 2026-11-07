#!/usr/bin/env python3
"""Count the accent pixels in the header screenshots.

The evidence for PR 6a. Anti-aliased text blends the accent with its
background, so an exact match misses most of the pixels; a hue-based
bucket with a generous band is the honest measurement.

Terracotta #b04e29 = rgb(176, 78, 41)
Herb green  #327a2f = rgb(50, 122, 47)
"""
from __future__ import annotations

import collections
import pathlib
import struct
import sys
import zlib

DIR = pathlib.Path("/home/gustale/projects/gustale.com/docs/screenshots/pr6a")


def read_png(path: pathlib.Path) -> tuple[int, int, int, bytes]:
    data = path.read_bytes()
    pos = 8
    w = h = None
    ct = None
    idat = b""
    while pos < len(data):
        ln = struct.unpack(">I", data[pos : pos + 4])[0]
        typ = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + ln]
        if typ == b"IHDR":
            w, h, _bd, ct = struct.unpack(">IIBB", chunk[:10])
        elif typ == b"IDAT":
            idat += chunk
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    stride = w * ch
    out = bytearray(w * h * ch)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0
            b = prev[i]
            c = prev[i - ch] if i >= ch else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return w, h, ch, bytes(out)


def classify(r: int, g: int, b: int) -> str | None:
    """Bucket a pixel by accent hue.

    The EXACT accent colours are counted separately from the blended
    ones. Anti-aliased text blends the accent toward the cream
    background, so a hue bucket counts those blends as "accent-ish"
    and a hue test alone would over-count. The exact match is the
    honest measure of "how much of the accent is painted"; the blended
    count is reported alongside it so nothing is hidden.
    """
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 30:
        return None  # grey / cream / white — not an accent
    if g > r and g > b:
        return "green"
    if r > g and r > b:
        return "orange"
    return None


TERRACOTTA = (176, 78, 41)
HERB_GREEN = (50, 122, 47)


def main() -> int:
    if not DIR.is_dir():
        print(f"  no screenshot directory at {DIR}")
        return 1
    print("  the accent pixels in each header screenshot")
    print()
    print("    EXACT = the pure accent colour, painted by the accent token")
    print("    blended = anti-aliased edges, counted by hue")
    print()
    for f in sorted(DIR.glob("*header.png")):
        w, h, ch, px = read_png(f)
        counts: collections.Counter = collections.Counter()
        exact: collections.Counter = collections.Counter()
        for i in range(0, len(px), ch * 2):
            r, g, b = px[i], px[i + 1], px[i + 2]
            c = classify(r, g, b)
            if c:
                counts[c] += 1
            if (r, g, b) == TERRACOTTA:
                exact["terracotta"] += 1
            elif (r, g, b) == HERB_GREEN:
                exact["green"] += 1
        print(
            f"    {f.name:<30} EXACT terracotta={exact['terracotta']:<6} "
            f"EXACT green={exact['green']:<6} | blended terracotta={counts['orange']:<6} blended green={counts['green']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
